import { analyzeRoutes } from "../engines/routingEngine.ts";
import type { CascadeAnalysisResult } from "../types/cascade.ts";
import type { RouteAnalysisInput, RouteAnalysisResult, RouteCalculationFailure, RoutePoint, RoutingDataSource, RouteAssignment } from "../types/routing.ts";
import { fetchOsrmRoutes } from "../utils/osrmRoutingClient.ts";

export async function analyzeIncidentRoute(
  incidentId: string,
  resourceId: string,
  cascade: CascadeAnalysisResult,
  dataSource: RoutingDataSource,
  signal?: AbortSignal,
): Promise<RouteAnalysisResult> {
  const [incident, resource, assets] = await Promise.all([
    dataSource.findIncident(incidentId),
    dataSource.findResource(resourceId),
    dataSource.findAssets(),
  ]);
  if (!incident) throw new Error(`Incident not found: ${incidentId}`);
  if (!resource) throw new Error(`Resource not found: ${resourceId}`);
  if (!incident.location) throw new Error(`Incident has no route destination: ${incident.externalId}`);
  if (!resource.location) throw new Error(`Resource has no route origin: ${resource.externalId}`);

  const impacts = await dataSource.findIncidentImpacts(incident.id);
  const routes = await fetchOsrmRoutes(resource.location, incident.location, signal);
  const analysis = analyzeRouteInput({ incident, resource, cascade, assets, impacts, routes });
  return {
    incidentId: incident.externalId,
    resourceId: resource.externalId,
    origin: resource.location,
    destination: incident.location,
    ...analysis,
  };
}

export async function analyzeIncidentRoutes(
  incidentId: string,
  cascade: CascadeAnalysisResult,
  dataSource: RoutingDataSource,
  signal?: AbortSignal,
): Promise<{ routes: RouteAnalysisResult[]; failures: RouteCalculationFailure[] }> {
 const [incident, assets] = await Promise.all([
  dataSource.findIncident(incidentId),
  dataSource.findAssets(),
]);

if (!incident) throw new Error(`Incident not found: ${incidentId}`);

const assignments = (
  await dataSource.listRouteAssignments(incident.id)
).filter(
  (assignment: RouteAssignment) =>
    assignment.externalId !== "ROUTE-2401-TRAFFIC"
);

console.log(
  "NIRIKSHAK RAW ROUTE ASSIGNMENTS:",
  JSON.stringify(assignments, null, 2)
);
  if (!incident) throw new Error(`Incident not found: ${incidentId}`);
  const impacts = await dataSource.findIncidentImpacts(incident.id);
  const settled = await Promise.allSettled(assignments.map(async (assignment: RouteAssignment) => {
    let resource: Awaited<ReturnType<RoutingDataSource["findResource"]>> = null;
    let origin: RoutePoint | null = null;
    let destination: RoutePoint | null = null;
    try {
      resource = assignment.resourceId ? await dataSource.findResource(assignment.resourceId) : null;
      origin = resource?.location ?? null;
      const destinationAsset = assets.find((asset) => asset.id === assignment.destinationAssetId);
      destination = destinationAsset?.location ?? incident.location ?? null;
      if (!resource) throw new Error(`Response resource not found: ${assignment.resourceId ?? "none"}`);
      if (!origin) throw new Error(`Response resource ${resource.externalId} has no coordinates`);
      if (!destination) throw new Error(`Route destination has no coordinates`);
      const routes = await fetchOsrmRoutes(origin, destination, signal);
      const analysis = analyzeRouteInput({ incident, resource, cascade, assets, impacts, routes });
      return {
        incidentId: incident.externalId,
        resourceId: resource.externalId,
        origin,
        destination,
        departmentId: assignment.departmentId,
        departmentCode: assignment.departmentCode,
        departmentName: assignment.departmentName,
        routePurpose: assignment.routePurpose,
        originAssetId: assignment.originAssetId,
        destinationAssetId: assignment.destinationAssetId,
        ...analysis,
      } satisfies RouteAnalysisResult;
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      throw { error, resourceExternalId: resource?.externalId ?? null, origin, destination };
    }
  }));
  const routes: RouteAnalysisResult[] = [];
  const failures: RouteCalculationFailure[] = [];
  settled.forEach((result, index) => {
    const assignment = assignments[index];
    if (result.status === "fulfilled") {
      routes.push(result.value);
      return;
    }
    const rejection = result.reason as { error?: unknown; resourceExternalId?: string | null; origin?: RouteAnalysisResult["origin"] | null; destination?: RouteAnalysisResult["destination"] | null };
    const reason = rejection.error instanceof Error ? rejection.error.message : String(rejection.error ?? result.reason);
    failures.push({
      assignmentId: assignment.id,
      incidentId: incident.externalId,
      departmentId: assignment.departmentId,
      departmentCode: assignment.departmentCode,
      departmentName: assignment.departmentName,
      routePurpose: assignment.routePurpose,
      resourceId: assignment.resourceId,
      resourceExternalId: rejection.resourceExternalId ?? null,
      origin: rejection.origin ?? null,
      destination: rejection.destination ?? null,
      message: reason,
    });
  });
  return { routes, failures };
}

export function analyzeRouteInput(input: RouteAnalysisInput): Omit<RouteAnalysisResult, "incidentId" | "resourceId" | "origin" | "destination"> {
  return analyzeRoutes(input);
}