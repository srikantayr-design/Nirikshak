import type {
  CascadeAnalysisResult,
  CascadeImpact,
} from "../types/cascade.ts";
import type {
  DepartmentRecommendation,
  ResponseAnalysisResult,
  ResponseDepartment,
  ResponseEngineInput,
  ResponseIncident,
  ResponseAsset,
  ResponsePriority,
  ResponseResource,
  ResourceAvailability,
  ResourceRecommendation,
} from "../types/response.ts";

const assetDepartmentCodes: Record<string, string> = {
  building: "FIRE",
  road: "TRAFFIC",
  hospital: "MEDICAL",
  fire_station: "FIRE",
  police_station: "POLICE",
  transformer: "ELECTRICITY",
  water_pump: "WATER",
  emergency_centre: "INFRA",
};

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function allImpacts(cascade: CascadeAnalysisResult): CascadeImpact[] {
  return [...cascade.primaryImpacts, ...cascade.propagatedImpacts];
}

function departmentAssetIds(department: ResponseDepartment, impacts: CascadeImpact[]): string[] {
  return uniqueSorted(
    impacts
      .filter((impact) => assetDepartmentCodes[normalized(impact.assetType)] === department.code)
      .map((impact) => impact.assetId),
  );
}

function departmentIsRelevant(
  department: ResponseDepartment,
  incident: ResponseIncident,
  impacts: CascadeImpact[],
): boolean {
  const incidentMatch = department.incidentTypes.some((type) => normalized(type) === normalized(incident.incidentType));
  return incidentMatch || departmentAssetIds(department, impacts).length > 0;
}

const factorScore: Record<string, number> = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 100,
};

function scoreFor(value: string | null | undefined, fallback = 50): number {
  return factorScore[value?.toLowerCase() ?? ""] ?? fallback;
}

function priorityFor(score: number): ResponsePriority {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 35) return "MEDIUM";
  return "LOW";
}

function strongestDepartmentImpact(
  department: ResponseDepartment,
  impacts: CascadeImpact[],
): CascadeImpact | null {
  return impacts
    .filter((impact) => assetDepartmentCodes[normalized(impact.assetType)] === department.code)
    .sort((left, right) => right.riskScore - left.riskScore || left.impactLevel - right.impactLevel || left.assetId.localeCompare(right.assetId))[0] ?? null;
}

function departmentPriority(
  department: ResponseDepartment,
  incident: ResponseIncident,
  impacts: CascadeImpact[],
  assets: Map<string, ResponseAsset>,
): { priority: ResponsePriority; score: number; impact: CascadeImpact | null } {
  const impact = strongestDepartmentImpact(department, impacts);
  const incidentSeverity = scoreFor(incident.severity);
  if (!impact) {
    const score = Math.round(incidentSeverity * 0.4);
    return { priority: priorityFor(score), score, impact: null };
  }

  const criticality = scoreFor(assets.get(impact.assetId)?.criticality);
  const depth = Math.min(100, (impact.impactLevel / 3) * 100);
  const ownership = impact.impactLevel === 0 ? 100 : 0;
  const score = Math.round(
    incidentSeverity * 0.2
      + criticality * 0.35
      + impact.riskScore * 0.25
      + depth * 0.15
      + ownership * 0.05,
  );
  return { priority: priorityFor(score), score, impact };
}

function resourceRank(resource: ResponseResource, impactedAssetIds: Set<string>): number {
  return resource.baseAssetId && impactedAssetIds.has(resource.baseAssetId) ? 0 : 1;
}

function resourceReason(
  resource: ResponseResource,
  department: ResponseDepartment,
  impactedAssetIds: Set<string>,
): string {
  const baseMatch = resource.baseAssetId !== null && impactedAssetIds.has(resource.baseAssetId);
  return baseMatch
    ? `${resource.name} is recommended because it is available, belongs to ${department.name}, and is based at an affected asset.`
    : `${resource.name} is recommended because it is available and belongs to ${department.name}, which is relevant to this cascade.`;
}

function availabilityFor(
  department: ResponseDepartment,
  resources: ResponseResource[],
): ResourceAvailability {
  const departmentResources = resources.filter((resource) => resource.departmentId === department.id);
  const available = departmentResources.filter((resource) => normalized(resource.status) === "available");
  return {
    departmentId: department.id,
    departmentName: department.name,
    availableResourceIds: available.map((resource) => resource.id).sort(),
    availableResourceNames: available.map((resource) => resource.name).sort(),
    unavailableResourceCount: departmentResources.length - available.length,
  };
}

function selectResources(
  departments: ResponseDepartment[],
  resources: ResponseResource[],
  impacts: CascadeImpact[],
): ResourceRecommendation[] {
  const impactedAssetIds = new Set(impacts.map((impact) => impact.assetId));
  const recommendations = departments.flatMap((department) => resources
    .filter((resource) => resource.departmentId === department.id && normalized(resource.status) === "available")
    .map((resource) => ({ resource, department })));

  return recommendations
    .sort((left, right) => resourceRank(left.resource, impactedAssetIds) - resourceRank(right.resource, impactedAssetIds)
      || left.department.code.localeCompare(right.department.code)
      || left.resource.externalId.localeCompare(right.resource.externalId))
    .map(({ resource, department }, index) => ({
      resourceId: resource.id,
      resourceName: resource.name,
      resourceExternalId: resource.externalId,
      resourceType: resource.resourceType,
      departmentId: department.id,
      departmentName: department.name,
      reason: resourceReason(resource, department, impactedAssetIds),
      priorityRank: index + 1,
    }));
}

function departmentReason(
  department: ResponseDepartment,
  incident: ResponseIncident,
  impacts: CascadeImpact[],
  priority: ResponsePriority,
  priorityScore: number,
  assets: Map<string, ResponseAsset>,
): string {
  const affectedAssetIds = departmentAssetIds(department, impacts);
  const names = impacts.filter((impact) => affectedAssetIds.includes(impact.assetId)).map((impact) => impact.assetName);
  const incidentMatch = department.incidentTypes.some((type) => normalized(type) === normalized(incident.incidentType));
  const reasons: string[] = [];
  if (incidentMatch) reasons.push(`the incident type is ${incident.incidentType}`);
  if (names.length > 0) reasons.push(`affected infrastructure includes ${names.join(", ")}`);
  const strongestImpact = strongestDepartmentImpact(department, impacts);
  if (strongestImpact) {
    const criticality = assets.get(strongestImpact.assetId)?.criticality ?? "unknown";
    reasons.push(`${strongestImpact.assetName} is ${criticality} criticality at cascade level ${strongestImpact.impactLevel}`);
  }
  return `${department.name} is ${priority} priority (score ${priorityScore}/100) because ${reasons.join(" and ")}.`;
}

export function recommendResponse(input: ResponseEngineInput): ResponseAnalysisResult {
  const impacts = allImpacts(input.cascade);
  const assetCriticalities = new Map(input.assets.map((asset) => [asset.id, asset]));
  const relevantDepartments = input.departments
    .filter((department) => departmentIsRelevant(department, input.incident, impacts))
    .sort((left, right) => left.code.localeCompare(right.code));
  const resourceRecommendations = selectResources(relevantDepartments, input.resources, impacts);
  const resourceAvailability = relevantDepartments.map((department) => availabilityFor(department, input.resources));
  const departments: DepartmentRecommendation[] = relevantDepartments.map((department) => {
    const availableResourceCount = resourceAvailability.find((item) => item.departmentId === department.id)?.availableResourceIds.length ?? 0;
    const operational = departmentPriority(department, input.incident, impacts, assetCriticalities);
    return {
      departmentId: department.id,
      departmentCode: department.code,
      departmentName: department.name,
      priority: operational.priority,
      reason: departmentReason(department, input.incident, impacts, operational.priority, operational.score, assetCriticalities),
      affectedAssetIds: departmentAssetIds(department, impacts),
      availableResourceCount,
    };
  });
  const priority = departments
    .map((department) => department.priority)
    .sort((left, right) => ["LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf(right) - ["LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf(left))[0] ?? "LOW";
  const resourceSummary = resourceRecommendations.length === 0
    ? "No eligible available resources were found; recommendations remain departmental only."
    : `${resourceRecommendations.length} available resource${resourceRecommendations.length === 1 ? "" : "s"} recommended without dispatching. `;

  return {
    incidentId: input.incident.externalId,
    priority,
    departments,
    resourceRecommendations,
    resourceAvailability,
    explanation: `${priority} response priority is the highest department priority derived from incident severity, affected asset criticality, impact risk, cascade depth, and primary-asset ownership. Cascade context is ${input.cascade.cascadeRiskScore}/100 (${input.cascade.cascadeRiskLevel}). ${departments.map((department) => department.reason).join(" ")} ${resourceSummary} This is a recommendation only; no resource is autonomously dispatched.`,
  };
}