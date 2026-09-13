import type {
  CascadeAnalysisResult,
  CascadeAsset,
  CascadeDependency,
  CascadeIncident,
  CascadeIncidentImpact,
  CascadeImpact,
  CascadeRiskLevel,
} from "../types/cascade.ts";

const severityScore: Record<string, number> = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 100,
};

function scoreFor(value: string | null | undefined, fallback: number): number {
  return severityScore[value?.toLowerCase() ?? ""] ?? fallback;
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(clamp(value));
}

function riskLevel(score: number, criticalCascade: boolean): CascadeRiskLevel {
  if (score >= 80 && criticalCascade) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 35) return "MEDIUM";
  return "LOW";
}

function assetLabel(asset: CascadeAsset): string {
  return `${asset.externalId} (${asset.name})`;
}

function sortImpacts(left: CascadeImpact, right: CascadeImpact): number {
  return left.impactLevel - right.impactLevel || left.assetId.localeCompare(right.assetId);
}

function calculateImpactRisk(
  incident: CascadeIncident,
  asset: CascadeAsset,
  impactLevel: number,
  dependencyStrength: number | null,
  downstreamAssetCount: number,
): number {
  const incidentSeverity = scoreFor(incident.severity, 50);
  const assetCriticality = scoreFor(asset.criticality, 50);
  const strength = clamp((dependencyStrength ?? 0.5) * 100);
  const depthFactor = clamp((impactLevel / 3) * 100);
  const breadthFactor = clamp((downstreamAssetCount / 4) * 100);

  return round(
    incidentSeverity * 0.3
      + assetCriticality * 0.3
      + strength * 0.2
      + depthFactor * 0.1
      + breadthFactor * 0.1,
  );
}

function primaryImpact(incident: CascadeIncident, impact: CascadeIncidentImpact, downstreamAssetCount: number): CascadeImpact | null {
  if (!impact.asset) return null;
  const riskScore = calculateImpactRisk(incident, impact.asset, 0, null, downstreamAssetCount);
  return {
    assetId: impact.asset.id,
    assetName: impact.asset.name,
    assetType: impact.asset.assetType,
    impactLevel: 0,
    dependencyPath: [impact.asset.externalId],
    dependencyType: null,
    dependencyStrength: null,
    riskScore,
    reason: `${assetLabel(impact.asset)} is directly affected by incident ${incident.externalId} (${impact.impactType}).`,
  };
}

function propagatedImpact(
  incident: CascadeIncident,
  dependency: CascadeDependency,
  path: string[],
  impactLevel: number,
  downstreamAssetCount: number,
): CascadeImpact | null {
  if (!dependency.targetAsset) return null;
  const asset = dependency.targetAsset;
  const riskScore = calculateImpactRisk(
    incident,
    asset,
    impactLevel,
    dependency.dependencyStrength,
    downstreamAssetCount,
  );
  const source = path[path.length - 1];

  return {
    assetId: asset.id,
    assetName: asset.name,
    assetType: asset.assetType,
    impactLevel,
    dependencyPath: [...path, asset.externalId],
    dependencyType: dependency.dependencyType,
    dependencyStrength: dependency.dependencyStrength,
    riskScore,
    reason: `${assetLabel(asset)} is a level ${impactLevel} impact because it depends on ${source} via ${dependency.dependencyType}${dependency.dependencyStrength === null ? "" : ` (strength ${dependency.dependencyStrength}).`}`,
  };
}

export async function analyzeCascade(
  incident: CascadeIncident,
  impacts: CascadeIncidentImpact[],
  findDependencies: (assetId: string) => Promise<CascadeDependency[]>,
): Promise<CascadeAnalysisResult> {
  const primaryCandidates = impacts.filter((impact) => impact.impactState === "current" && impact.asset !== null);
  const primaryIds = new Set(primaryCandidates.map((impact) => impact.asset!.id));
  const queue: Array<{ asset: CascadeAsset; path: string[]; level: number }> = primaryCandidates.map((impact) => ({
    asset: impact.asset!,
    path: [impact.asset!.externalId],
    level: 0,
  }));
  const visited = new Set(primaryIds);
  const propagatedImpacts: CascadeImpact[] = [];
  const downstreamAssetIds = new Set<string>();
  let maximumDepth = 0;
  let strongestDependency = 0;
  let criticalAssetReachedThroughStrongCascade = false;
  let highestCriticality = primaryCandidates.reduce(
    (highest, impact) => Math.max(highest, scoreFor(impact.asset?.criticality, 50)),
    0,
  );

  while (queue.length > 0) {
    const current = queue.shift()!;
    const dependencies = [...await findDependencies(current.asset.id)].sort((left, right) =>
      left.targetAsset?.externalId.localeCompare(right.targetAsset?.externalId ?? "")
        || left.dependencyType.localeCompare(right.dependencyType),
    );

    for (const dependency of dependencies) {
      if (!dependency.targetAsset || visited.has(dependency.targetAsset.id)) continue;
      visited.add(dependency.targetAsset.id);
      downstreamAssetIds.add(dependency.targetAsset.id);
      highestCriticality = Math.max(highestCriticality, scoreFor(dependency.targetAsset.criticality, 50));
      const nextLevel = current.level + 1;
      maximumDepth = Math.max(maximumDepth, nextLevel);
      strongestDependency = Math.max(strongestDependency, dependency.dependencyStrength ?? 0);
      if (
        scoreFor(dependency.targetAsset.criticality, 50) >= 100
        && nextLevel >= 2
        && (dependency.dependencyStrength ?? 0) >= 0.75
      ) {
        criticalAssetReachedThroughStrongCascade = true;
      }
      const impact = propagatedImpact(incident, dependency, current.path, nextLevel, downstreamAssetIds.size);
      if (impact) propagatedImpacts.push(impact);
      queue.push({
        asset: dependency.targetAsset,
        path: [...current.path, dependency.targetAsset.externalId],
        level: nextLevel,
      });
    }
  }

  const primaryImpacts = primaryCandidates
    .map((impact) => primaryImpact(incident, impact, downstreamAssetIds.size))
    .filter((impact): impact is CascadeImpact => impact !== null)
    .sort(sortImpacts);
  propagatedImpacts.sort(sortImpacts);

  const allImpacts = [...primaryImpacts, ...propagatedImpacts];
  const severity = scoreFor(incident.severity, 50);
  const depth = clamp((maximumDepth / 3) * 100);
  const breadth = clamp((downstreamAssetIds.size / 4) * 100);
  const cascadeRiskScore = allImpacts.length === 0
    ? 0
    : round(
        severity * 0.3
          + highestCriticality * 0.3
          + strongestDependency * 100 * 0.2
          + depth * 0.1
          + breadth * 0.1,
      );
  const criticalCascade = criticalAssetReachedThroughStrongCascade;
  const cascadeRiskLevel = riskLevel(cascadeRiskScore, criticalCascade);
  const explanation = allImpacts.length === 0
    ? `Incident ${incident.externalId} has no current infrastructure impact with a resolvable asset.`
    : [
        `${incident.externalId} directly affects ${primaryImpacts.map((impact) => impact.assetName).join(", ")}.`,
        ...propagatedImpacts.map((impact) => impact.reason),
        `The cascade score is ${cascadeRiskScore}/100 (${cascadeRiskLevel}): severity contributes 30% (${severity}/100), highest reached criticality 30% (${highestCriticality}/100), strongest dependency 20% (${Math.round(strongestDependency * 100)}/100), maximum depth 10% (${maximumDepth}), and downstream breadth 10% (${downstreamAssetIds.size} asset${downstreamAssetIds.size === 1 ? "" : "s"}).`,
        criticalCascade
          ? "CRITICAL is justified because a critical asset is reached at depth 2 or greater through a dependency of at least 0.75 strength."
          : "CRITICAL is not triggered because the cascade does not meet the strong multi-level critical-asset rule.",
      ].join(" ");

  return {
    incidentId: incident.externalId,
    primaryImpacts,
    propagatedImpacts,
    totalAffectedAssets: new Set(allImpacts.map((impact) => impact.assetId)).size,
    cascadeRiskScore,
    cascadeRiskLevel,
    explanation,
  };
}