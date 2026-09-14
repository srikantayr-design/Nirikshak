import { analyzeIncidentCascade } from "../../../backend/services/cascadeAnalysisService.ts";
import { analyzeIncidentResponse } from "../../../backend/services/responseIntelligenceService.ts";
import { analyzeIncidentRoutes } from "../../../backend/services/routingAnalysisService.ts";
import { createSupabaseCascadeRepository } from "../../../backend/utils/supabaseCascadeRepository.ts";
import { createSupabaseResponseRepository } from "../../../backend/utils/supabaseResponseRepository.ts";
import { createSupabaseRoutingRepository } from "../../../backend/utils/supabaseRoutingRepository.ts";
import type { CascadeAnalysisResult } from "../../../backend/types/cascade.ts";
import type { ResponseAnalysisResult } from "../../../backend/types/response.ts";
import type {
  RouteAnalysisResult,
  RouteCalculationFailure,
} from "../../../backend/types/routing.ts";
import { supabase } from "../lib/supabaseClient";
import type { Severity } from "../data/incidents";

export type BackendIncidentAnalysis = {
  cascade: CascadeAnalysisResult;
  response: ResponseAnalysisResult;
  routes: RouteAnalysisResult[];
  routeFailures: RouteCalculationFailure[];
};

export async function loadBackendIncidentAnalysis(
  incidentId: string,
  runtimeSeverity?: Severity,
  signal?: AbortSignal
): Promise<BackendIncidentAnalysis> {
  if (!supabase) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const cascadeRepository = createSupabaseCascadeRepository(
    supabase as never
  );

  const responseRepository = createSupabaseResponseRepository(
    supabase as never
  );

  const routingRepository = createSupabaseRoutingRepository(
    supabase as never
  );

  const cascade = await analyzeIncidentCascade(
    incidentId,
    cascadeRepository,
    runtimeSeverity?.toLowerCase()
  );

  const response = await analyzeIncidentResponse(
    incidentId,
    cascade,
    responseRepository,
    runtimeSeverity?.toLowerCase()
  );

  const { routes, failures: routeFailures } = await analyzeIncidentRoutes(
    incidentId,
    cascade,
    routingRepository,
    signal
  );

  console.log(
    "NIRIKSHAK BACKEND ROUTES:",
    JSON.stringify(
      routes.map((route) => ({
        department: route.departmentName,
        resource: route.resourceId,
        originAsset: route.originAssetId,
        destinationAsset: route.destinationAssetId,
        routePurpose: route.routePurpose,
        candidates: route.candidates.length,
      })),
      null,
      2
    )
  );

  return {
    cascade,
    response,
    routes,
    routeFailures,
  };
}