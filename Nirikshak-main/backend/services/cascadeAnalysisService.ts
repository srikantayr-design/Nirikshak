import { analyzeCascade } from "../engines/cascadeEngine.ts";
import type { CascadeAnalysisResult, CascadeDataSource } from "../types/cascade.ts";

export async function analyzeIncidentCascade(
  incidentId: string,
  dataSource: CascadeDataSource,
  runtimeSeverity?: string,
): Promise<CascadeAnalysisResult> {
  const incident = await dataSource.findIncident(incidentId);
  if (!incident) throw new Error(`Incident not found: ${incidentId}`);
  if (runtimeSeverity) incident.severity = runtimeSeverity;

  const impacts = await dataSource.findIncidentImpacts(incident.id);
  return analyzeCascade(incident, impacts, dataSource.findDependenciesFromAsset.bind(dataSource));
}