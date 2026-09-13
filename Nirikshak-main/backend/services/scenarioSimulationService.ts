import { analyzeCascade } from "../engines/cascadeEngine.ts";
import { recommendResponse } from "../engines/responseEngine.ts";
import { analyzeRouteInput } from "./routingAnalysisService.ts";
import { fetchOsrmRoutes } from "../utils/osrmRoutingClient.ts";
import type { CascadeAsset, CascadeDataSource, CascadeIncidentImpact } from "../types/cascade.ts";
import type { ResponseDataSource } from "../types/response.ts";
import type { RoutingDataSource, RoutingImpact } from "../types/routing.ts";
import type { ScenarioComparison, ScenarioDataSource, ScenarioOnlyImpact, ScenarioRecord, ScenarioSnapshot } from "../types/scenario.ts";

type SimulationDependencies = {
  scenarios: ScenarioDataSource;
  cascade: CascadeDataSource;
  response: ResponseDataSource;
  routing: RoutingDataSource;
};

function isClosureScenario(scenario: ScenarioRecord): boolean {
  return scenario.externalId === "SCN-CLOSE-R12"
    || scenario.interventions.some((item) => JSON.stringify(item).toLowerCase().includes("close"));
}

function isIsolationScenario(scenario: ScenarioRecord): boolean {
  return scenario.externalId === "SCN-ISOLATE-T4"
    || scenario.interventions.some((item) => JSON.stringify(item).toLowerCase().includes("isolate"));
}

function applyScenarioToRoutingImpacts(
  scenario: ScenarioRecord,
  assets: Awaited<ReturnType<RoutingDataSource["findAssets"]>>,
  impacts: RoutingImpact[],
): { assets: typeof assets; impacts: RoutingImpact[] } {
  if (!scenario.focusAssetId) return { assets, impacts };
  const closure = isClosureScenario(scenario);
  const isolation = isIsolationScenario(scenario);
  if (!closure && !isolation) return { assets, impacts };

  const status = closure ? "blocked" : "offline";
  const impactType = closure ? "scenario_road_closure" : "scenario_isolation";
  const simulatedAssets = assets.map((asset) => asset.id === scenario.focusAssetId ? { ...asset, status } : asset);
  const focusAsset = simulatedAssets.find((asset) => asset.id === scenario.focusAssetId);
  if (!focusAsset) return { assets: simulatedAssets, impacts };
  const simulatedImpacts = impacts.map((impact) => impact.assetId === scenario.focusAssetId
    ? { ...impact, impactType, asset: focusAsset }
    : impact);
  if (!simulatedImpacts.some((impact) => impact.assetId === scenario.focusAssetId)) {
    simulatedImpacts.push({
      assetId: focusAsset.id,
      impactState: "current",
      impactType,
      severity: "high",
      asset: focusAsset,
    });
  }
  return { assets: simulatedAssets, impacts: simulatedImpacts };
}

function scenarioImpactType(scenario: ScenarioRecord): string | null {
  if (isClosureScenario(scenario)) return "scenario_road_closure";
  if (isIsolationScenario(scenario)) return "scenario_isolation";
  return null;
}

function applyScenarioToCascadeImpacts(
  scenario: ScenarioRecord,
  impacts: CascadeIncidentImpact[],
  assets: Awaited<ReturnType<RoutingDataSource["findAssets"]>>,
): { impacts: CascadeIncidentImpact[]; scenarioOnlyImpacts: ScenarioOnlyImpact[] } {
  const impactType = scenarioImpactType(scenario);
  if (!scenario.focusAssetId || !impactType) return { impacts, scenarioOnlyImpacts: [] };
  const focusImpact = impacts.find((impact) => impact.assetId === scenario.focusAssetId && impact.impactState === "current");
  const focusAsset = focusImpact?.asset ?? assets.find((asset) => asset.id === scenario.focusAssetId);
  if (!focusAsset) return { impacts, scenarioOnlyImpacts: [] };
  const scenarioOnly: ScenarioOnlyImpact = {
    assetId: focusAsset.id,
    assetName: focusAsset.name,
    impactType,
    reason: `${focusAsset.name} is temporarily treated as ${isClosureScenario(scenario) ? "closed" : "isolated"} for this scenario only; real database impacts remain unchanged.`,
  };
  if (focusImpact) {
    return {
      impacts: impacts.map((impact) => impact === focusImpact ? { ...impact, impactType, scenarioOnly: true } : impact),
      scenarioOnlyImpacts: [scenarioOnly],
    };
  }
  const predictedFocus = impacts.find((impact) => impact.assetId === scenario.focusAssetId);
  const cascadeAsset: CascadeAsset = {
    id: focusAsset.id,
    externalId: focusAsset.externalId,
    name: focusAsset.name,
    assetType: focusAsset.assetType,
    criticality: focusAsset.criticality,
  };
  const injectedImpact: CascadeIncidentImpact = {
    ...(predictedFocus ?? {
      assetId: focusAsset.id,
      impactState: "current" as const,
      severity: "high",
      likelihood: null,
      description: null,
      asset: cascadeAsset,
    }),
    assetId: focusAsset.id,
    impactState: "current",
    impactType,
    asset: cascadeAsset,
    scenarioOnly: true,
  };
  return {
    impacts: [...impacts.filter((impact) => impact.assetId !== scenario.focusAssetId), injectedImpact],
    scenarioOnlyImpacts: [scenarioOnly],
  };
}

function changedAssets(before: ScenarioSnapshot, after: ScenarioSnapshot): string[] {
  const baseline = new Set([...before.cascade.primaryImpacts, ...before.cascade.propagatedImpacts].map((impact) => impact.assetId));
  return [...new Set([...after.cascade.primaryImpacts, ...after.cascade.propagatedImpacts]
    .filter((impact) => !baseline.has(impact.assetId))
    .map((impact) => impact.assetName))];
}

function unavailableRoutes(before: ScenarioSnapshot, after: ScenarioSnapshot): string[] {
  const baselineStatuses = new Map((before.route?.candidates ?? []).map((route) => [route.routeId, route.status]));
  return (after.route?.candidates ?? [])
    .filter((route) => route.status === "BLOCKED" && baselineStatuses.get(route.routeId) !== "BLOCKED")
    .map((route) => route.routeId);
}

function routeEtaChange(before: ScenarioSnapshot, after: ScenarioSnapshot): number | null {
  const baseline = before.route ? before.route.candidates.find((route) => route.routeId === before.route?.recommendedRouteId) : null;
  const simulated = after.route ? after.route.candidates.find((route) => route.routeId === after.route?.recommendedRouteId) : null;
  return baseline && simulated ? simulated.durationSeconds - baseline.durationSeconds : null;
}

export async function simulateScenario(
  incidentId: string,
  scenarioId: string,
  dependencies: SimulationDependencies,
  signal?: AbortSignal,
): Promise<ScenarioComparison> {
  const scenario = await dependencies.scenarios.findScenario(scenarioId);
  if (!scenario) throw new Error(`Scenario not found: ${scenarioId}`);
  const cascadeIncident = await dependencies.cascade.findIncident(incidentId);
  if (!cascadeIncident) throw new Error(`Incident not found: ${incidentId}`);
  if (scenario.incidentId && scenario.incidentId !== cascadeIncident.id) {
    throw new Error(`Scenario ${scenario.externalId} is not linked to incident ${incidentId}`);
  }

  const baselineCascade = await (async () => {
    const impacts = await dependencies.cascade.findIncidentImpacts(cascadeIncident.id);
    return analyzeCascade(cascadeIncident, impacts, dependencies.cascade.findDependenciesFromAsset.bind(dependencies.cascade));
  })();
  const baselineResponse = await (async () => {
    const incident = await dependencies.response.findIncident(incidentId);
    if (!incident) throw new Error(`Incident not found: ${incidentId}`);
    const [assets, departments, resources] = await Promise.all([
      dependencies.response.listAssets(),
      dependencies.response.listDepartments(),
      dependencies.response.listResources(),
    ]);
    return recommendResponse({ incident, cascade: baselineCascade, assets, departments, resources });
  })();
  const selectedResourceId = baselineResponse.resourceRecommendations[0]?.resourceExternalId ?? null;
  const routingIncident = await dependencies.routing.findIncident(incidentId);
  const routingAssets = await dependencies.routing.findAssets();
  const routingImpacts = await dependencies.routing.findIncidentImpacts(routingIncident?.id ?? incidentId);
  const baselineResource = selectedResourceId ? await dependencies.routing.findResource(selectedResourceId) : null;
  const baselineRoute = routingIncident && baselineResource?.location && routingIncident.location
    ? analyzeRouteInput({
        incident: routingIncident,
        resource: baselineResource,
        cascade: baselineCascade,
        assets: routingAssets,
        impacts: routingImpacts,
        routes: await fetchOsrmRoutes(baselineResource.location, routingIncident.location, signal),
      })
    : null;
  const baselineSnapshot: ScenarioSnapshot = { cascade: baselineCascade, response: baselineResponse, route: baselineRoute ? { incidentId: routingIncident!.externalId, resourceId: baselineResource!.externalId, origin: baselineResource!.location!, destination: routingIncident!.location!, ...baselineRoute } : null, scenarioOnlyImpacts: [] };

  const scenarioCascade = applyScenarioToCascadeImpacts(scenario, await dependencies.cascade.findIncidentImpacts(cascadeIncident.id), routingAssets);
  const simulatedCascade = await analyzeCascade(cascadeIncident, scenarioCascade.impacts, dependencies.cascade.findDependenciesFromAsset.bind(dependencies.cascade));
  const scenarioResponseIncident = await dependencies.response.findIncident(incidentId);
  if (!scenarioResponseIncident) throw new Error(`Incident not found: ${incidentId}`);
  const [responseAssets, responseDepartments, responseResources] = await Promise.all([
    dependencies.response.listAssets(),
    dependencies.response.listDepartments(),
    dependencies.response.listResources(),
  ]);
  const simulatedResponse = recommendResponse({ incident: scenarioResponseIncident, cascade: simulatedCascade, assets: responseAssets, departments: responseDepartments, resources: responseResources });
  const simulatedRouting = applyScenarioToRoutingImpacts(scenario, routingAssets, routingImpacts);
  const simulatedRoute = routingIncident && baselineResource?.location && routingIncident.location
    ? analyzeRouteInput({
        incident: routingIncident,
        resource: baselineResource,
        cascade: simulatedCascade,
        assets: simulatedRouting.assets,
        impacts: simulatedRouting.impacts,
        routes: await fetchOsrmRoutes(baselineResource.location, routingIncident.location, signal),
      })
    : null;
  const simulatedSnapshot: ScenarioSnapshot = { cascade: simulatedCascade, response: simulatedResponse, route: simulatedRoute ? { incidentId: routingIncident!.externalId, resourceId: baselineResource!.externalId, origin: baselineResource!.location!, destination: routingIncident!.location!, ...simulatedRoute } : null, scenarioOnlyImpacts: scenarioCascade.scenarioOnlyImpacts };
  const etaChangeSeconds = routeEtaChange(baselineSnapshot, simulatedSnapshot);
  const newlyRequiredDepartments = simulatedResponse.departments
    .filter((department) => !baselineResponse.departments.some((before) => before.departmentId === department.departmentId))
    .map((department) => department.departmentName);
  const riskChange = simulatedCascade.cascadeRiskScore - baselineCascade.cascadeRiskScore;
  const scenarioImpactExplanation = scenarioCascade.scenarioOnlyImpacts.map((impact) => impact.reason).join(" ");
  const cascadeDeltaExplanation = riskChange === 0
    ? `${scenarioCascade.scenarioOnlyImpacts[0]?.assetName ?? "The focus asset"} was already represented in the baseline dependency reachability, so no newly affected assets were added.`
    : `Cascade risk changed by ${riskChange}.`;
  const explanation = `${scenario.name} was simulated in memory only. ${scenarioImpactExplanation} Cascade risk changed from ${baselineCascade.cascadeRiskScore} (${baselineCascade.cascadeRiskLevel}) to ${simulatedCascade.cascadeRiskScore} (${simulatedCascade.cascadeRiskLevel}); response priority changed from ${baselineResponse.priority} to ${simulatedResponse.priority}. ${cascadeDeltaExplanation} ${etaChangeSeconds === null ? "No route ETA comparison was available." : `The selected-route ETA changed by ${etaChangeSeconds} seconds.`} ${unavailableRoutes(baselineSnapshot, simulatedSnapshot).length ? `Routes newly unavailable: ${unavailableRoutes(baselineSnapshot, simulatedSnapshot).join(", ")}.` : "No previously available route became newly blocked."} No database rows were written.`;

  return {
    scenarioId: scenario.externalId,
    scenarioName: scenario.name,
    incidentId,
    baseline: baselineSnapshot,
    simulated: simulatedSnapshot,
    changes: {
      newlyAffectedAssets: changedAssets(baselineSnapshot, simulatedSnapshot),
      noLongerAvailableRoutes: unavailableRoutes(baselineSnapshot, simulatedSnapshot),
      etaChangeSeconds,
      riskChange,
      newlyRequiredDepartments,
    },
    explanation,
  };
}