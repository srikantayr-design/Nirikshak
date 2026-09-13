import { analyzeRoutes } from "../engines/routingEngine.ts";
import type { CascadeAnalysisResult } from "../types/cascade.ts";
import type { RouteAnalysisResult, RoutingDataSource } from "../types/routing.ts";
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
  const analysis = analyzeRoutes({ incident, resource, cascade, assets, impacts, routes });
  return {
    incidentId: incident.externalId,
    resourceId: resource.externalId,
    origin: resource.location,
    destination: incident.location,
    ...analysis,
  };
}