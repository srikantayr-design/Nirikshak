import type { CascadeAnalysisResult } from "./cascade.ts";
import type { ResponseAnalysisResult } from "./response.ts";
import type { RouteAnalysisResult } from "./routing.ts";

export type ScenarioRecord = {
  id: string;
  externalId: string;
  name: string;
  incidentId: string | null;
  focusAssetId: string | null;
  description: string | null;
  assumptions: Record<string, unknown>;
  interventions: unknown[];
  predictedImpacts: unknown[];
};

export type ScenarioSnapshot = {
  cascade: CascadeAnalysisResult;
  response: ResponseAnalysisResult;
  route: RouteAnalysisResult | null;
  scenarioOnlyImpacts: ScenarioOnlyImpact[];
};

export type ScenarioOnlyImpact = {
  assetId: string;
  assetName: string;
  impactType: string;
  reason: string;
};

export type ScenarioComparison = {
  scenarioId: string;
  scenarioName: string;
  incidentId: string;
  baseline: ScenarioSnapshot;
  simulated: ScenarioSnapshot;
  changes: {
    newlyAffectedAssets: string[];
    noLongerAvailableRoutes: string[];
    etaChangeSeconds: number | null;
    riskChange: number;
    newlyRequiredDepartments: string[];
  };
  explanation: string;
};

export type ScenarioDataSource = {
  findScenario(idOrExternalId: string): Promise<ScenarioRecord | null>;
};