import type { CascadeAnalysisResult } from "../types/cascade.ts";
import type {
  OsrmRoute,
  RouteCandidate,
  RouteEngineInput,
  RouteExposure,
  RouteGeometry,
  RouteStatus,
  RoutingAsset,
  RoutingImpact,
} from "../types/routing.ts";

const proximityMeters = 180;
const criticalityScore: Record<string, number> = { low: 5, medium: 10, high: 15, critical: 25 };

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function distanceToSegment(point: [number, number], start: [number, number], end: [number, number]): number {
  const latitudeScale = 111_000;
  const longitudeScale = 111_000 * Math.cos((point[1] * Math.PI) / 180);
  const pointX = (point[1] - start[1]) * longitudeScale;
  const pointY = (point[0] - start[0]) * latitudeScale;
  const segmentX = (end[1] - start[1]) * longitudeScale;
  const segmentY = (end[0] - start[0]) * latitudeScale;
  const lengthSquared = segmentX ** 2 + segmentY ** 2;
  const ratio = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, (pointX * segmentX + pointY * segmentY) / lengthSquared));
  return Math.hypot(pointX - ratio * segmentX, pointY - ratio * segmentY);
}

function distanceToGeometry(asset: RoutingAsset, geometry: RouteGeometry): number | null {
  if (!asset.location) return null;
  let closest: number | null = null;
  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    const distance = distanceToSegment(
      [asset.location.latitude, asset.location.longitude],
      [geometry.coordinates[index - 1][1], geometry.coordinates[index - 1][0]],
      [geometry.coordinates[index][1], geometry.coordinates[index][0]],
    );
    closest = closest === null ? distance : Math.min(closest, distance);
  }
  return closest;
}

function isExplicitlyBlocked(impact: RoutingImpact): boolean {
  const assetStatus = normalized(impact.asset?.status);
  const impactType = normalized(impact.impactType);
  return ["blocked", "offline", "damaged"].includes(assetStatus)
    || ["blockage", "blocked", "obstruction", "lane_blockage", "road_obstruction"].some((term) => impactType.includes(term));
}

function exposureReason(impact: RoutingImpact, distanceMeters: number, blocked: boolean): string {
  const state = impact.impactState === "current" ? "current" : "predicted";
  const condition = blocked ? "supports a blocked or unusable segment" : "supports caution but not a blocked classification";
  return `${impact.asset?.name ?? "Unknown asset"} is ${distanceMeters}m from the route; its ${state} ${impact.impactType} impact ${condition}.`;
}

function findExposures(route: OsrmRoute, impacts: RoutingImpact[]): RouteExposure[] {
  return impacts
    .filter((impact) => impact.asset !== null)
    .map((impact) => ({ impact, distanceMeters: distanceToGeometry(impact.asset!, route.geometry) }))
    .filter((item): item is { impact: RoutingImpact & { asset: RoutingAsset }; distanceMeters: number } => item.distanceMeters !== null && item.distanceMeters <= proximityMeters)
    .map(({ impact, distanceMeters }) => {
      const blocked = isExplicitlyBlocked(impact);
      return {
        assetId: impact.asset.id,
        assetExternalId: impact.asset.externalId,
        assetName: impact.asset.name,
        criticality: impact.asset.criticality,
        impactState: impact.impactState,
        impactType: impact.impactType,
        impactSeverity: impact.severity,
        distanceMeters: Math.round(distanceMeters),
        blocked,
        reason: exposureReason(impact, Math.round(distanceMeters), blocked),
      };
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters || left.assetExternalId.localeCompare(right.assetExternalId));
}

function scoreRoute(route: OsrmRoute, exposures: RouteExposure[], cascade: CascadeAnalysisResult): { score: number; status: RouteStatus } {
  const baseTravelCost = Math.min(40, route.durationSeconds / 60);
  const exposureCost = exposures.reduce((total, exposure) => {
    const stateCost = exposure.impactState === "current" ? 15 : 8;
    const criticalityCost = criticalityScore[normalized(exposure.criticality)] ?? 10;
    const blockedCost = exposure.blocked ? 45 : 0;
    return total + stateCost + criticalityCost + blockedCost;
  }, 0);
  const cascadeContextCost = cascade.cascadeRiskLevel === "CRITICAL" && exposures.length > 0 ? 10 : 0;
  const score = clamp(baseTravelCost + exposureCost + cascadeContextCost);
  const status: RouteStatus = exposures.some((exposure) => exposure.blocked)
    ? "BLOCKED"
    : exposures.length > 0
      ? "CAUTION"
      : "CLEAR";
  return { score, status };
}

function routeExplanation(route: OsrmRoute, exposures: RouteExposure[], score: number, status: RouteStatus): string {
  const etaMinutes = Math.ceil(route.durationSeconds / 60);
  if (exposures.length === 0) return `This route takes ${etaMinutes} minutes and has no affected infrastructure within ${proximityMeters}m; score ${score}/100 and status CLEAR.`;
  const exposureSummary = exposures.map((exposure) => `${exposure.assetName} (${exposure.distanceMeters}m, ${exposure.criticality} criticality)`).join(", ");
  return `This route takes ${etaMinutes} minutes and passes within ${proximityMeters}m of ${exposureSummary}; status ${status} because ${exposures.map((exposure) => exposure.reason).join(" ")} Score ${score}/100.`;
}

function candidateOrder(left: RouteCandidate, right: RouteCandidate): number {
  const statusRank: Record<RouteStatus, number> = { CLEAR: 0, CAUTION: 1, BLOCKED: 2 };
  return statusRank[left.status] - statusRank[right.status]
    || left.riskScore - right.riskScore
    || left.durationSeconds - right.durationSeconds
    || left.routeRank - right.routeRank;
}

function strongestAffectedAsset(cascade: CascadeAnalysisResult): string {
  return [...cascade.primaryImpacts, ...cascade.propagatedImpacts]
    .sort((left, right) => right.riskScore - left.riskScore)[0]?.assetName ?? "affected infrastructure";
}

export function analyzeRoutes(input: RouteEngineInput): { candidates: RouteCandidate[]; recommendedRouteId: string | null; explanation: string } {
  const candidates = input.routes.map((route, index) => {
    const exposures = findExposures(route, input.impacts);
    const scored = scoreRoute(route, exposures, input.cascade);
    return {
      routeId: `route-${index + 1}`,
      routeRank: index + 1,
      distanceMeters: Math.round(route.distanceMeters),
      durationSeconds: Math.round(route.durationSeconds),
      geometry: route.geometry,
      riskScore: scored.score,
      status: scored.status,
      exposures,
      explanation: routeExplanation(route, exposures, scored.score, scored.status),
      recommended: false,
    };
  });
  const ordered = [...candidates].sort(candidateOrder);
  const recommended = ordered[0];
  const finalCandidates = candidates.map((candidate) => ({ ...candidate, recommended: candidate.routeId === recommended?.routeId }));
  const blockedAlternatives = candidates.filter((candidate) => candidate.status === "BLOCKED").length;
  const explanation = recommended
    ? `${recommended.routeId} selected because it takes ${Math.ceil(recommended.durationSeconds / 60)} minutes, has ${recommended.exposures.length} affected infrastructure exposure${recommended.exposures.length === 1 ? "" : "s"}, and is ${recommended.status}. ${recommended.exposures.length > 0 ? `The main affected asset considered was ${strongestAffectedAsset(input.cascade)}.` : "It has no measured affected-infrastructure exposure."} ${blockedAlternatives === candidates.length ? "Every OSRM candidate is blocked by incident-supported exposure, so this is the least-risk available route rather than a clear route." : "Alternatives were ranked by route status, risk score, then travel time; no route was selected on distance alone."}`
    : "No OSRM route candidates were available.";
  return { candidates: finalCandidates, recommendedRouteId: recommended?.routeId ?? null, explanation };
}