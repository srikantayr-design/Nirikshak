export type CascadeSeverity = "low" | "medium" | "high" | "critical";
export type CascadeRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type CascadeIncident = {
  id: string;
  externalId: string;
  severity: string;
};

export type CascadeAsset = {
  id: string;
  externalId: string;
  name: string;
  assetType: string;
  criticality: string;
};

export type CascadeIncidentImpact = {
  assetId: string;
  impactState: "current" | "predicted";
  impactType: string;
  severity: string | null;
  likelihood: number | null;
  description: string | null;
  asset: CascadeAsset | null;
};

export type CascadeDependency = {
  sourceAssetId: string;
  targetAssetId: string;
  dependencyType: string;
  dependencyStrength: number | null;
  targetAsset: CascadeAsset | null;
};

export type CascadeImpact = {
  assetId: string;
  assetName: string;
  assetType: string;
  impactLevel: number;
  dependencyPath: string[];
  dependencyType: string | null;
  dependencyStrength: number | null;
  riskScore: number;
  reason: string;
};

export type CascadeAnalysisResult = {
  incidentId: string;
  primaryImpacts: CascadeImpact[];
  propagatedImpacts: CascadeImpact[];
  totalAffectedAssets: number;
  cascadeRiskScore: number;
  cascadeRiskLevel: CascadeRiskLevel;
  explanation: string;
};

export type CascadeDataSource = {
  findIncident(idOrExternalId: string): Promise<CascadeIncident | null>;
  findIncidentImpacts(incidentId: string): Promise<CascadeIncidentImpact[]>;
  findDependenciesFromAsset(assetId: string): Promise<CascadeDependency[]>;
};