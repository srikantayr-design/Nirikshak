import { recommendResponse } from "../engines/responseEngine.ts";
import type { CascadeAnalysisResult } from "../types/cascade.ts";
import type { ResponseAnalysisResult, ResponseDataSource } from "../types/response.ts";

export async function analyzeIncidentResponse(
  incidentId: string,
  cascade: CascadeAnalysisResult,
  dataSource: ResponseDataSource,
  runtimeSeverity?: string,
): Promise<ResponseAnalysisResult> {
  const incident = await dataSource.findIncident(incidentId);
  if (!incident) throw new Error(`Incident not found: ${incidentId}`);
  if (runtimeSeverity) incident.severity = runtimeSeverity;

  const [assets, departments, resources] = await Promise.all([
    dataSource.listAssets(),
    dataSource.listDepartments(),
    dataSource.listResources(),
  ]);
  return recommendResponse({ incident, cascade, assets, departments, resources });
}