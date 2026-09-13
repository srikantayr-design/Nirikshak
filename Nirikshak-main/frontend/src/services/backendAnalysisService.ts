import { analyzeIncidentCascade } from "../../../backend/services/cascadeAnalysisService.ts";
import { analyzeIncidentResponse } from "../../../backend/services/responseIntelligenceService.ts";
import { analyzeIncidentRoute } from "../../../backend/services/routingAnalysisService.ts";
import { createSupabaseCascadeRepository } from "../../../backend/utils/supabaseCascadeRepository.ts";
import { createSupabaseResponseRepository } from "../../../backend/utils/supabaseResponseRepository.ts";
import { createSupabaseRoutingRepository } from "../../../backend/utils/supabaseRoutingRepository.ts";
import type { CascadeAnalysisResult } from "../../../backend/types/cascade.ts";
import type { ResponseAnalysisResult } from "../../../backend/types/response.ts";
import type { RouteAnalysisResult } from "../../../backend/types/routing.ts";
import { supabase } from "../lib/supabaseClient";

export type BackendIncidentAnalysis = {
  cascade: CascadeAnalysisResult;
  response: ResponseAnalysisResult;
  route: RouteAnalysisResult | null;
};

export async function loadBackendIncidentAnalysis(incidentId: string, signal?: AbortSignal): Promise<BackendIncidentAnalysis> {
  if (!supabase) throw new Error("Supabase environment variables are not configured.");

  const cascadeRepository = createSupabaseCascadeRepository(supabase as never);
  const responseRepository = createSupabaseResponseRepository(supabase as never);
  const routingRepository = createSupabaseRoutingRepository(supabase as never);
  const cascade = await analyzeIncidentCascade(incidentId, cascadeRepository);
  const response = await analyzeIncidentResponse(incidentId, cascade, responseRepository);
  const selectedResource = response.resourceRecommendations[0];
  const route = selectedResource
    ? await analyzeIncidentRoute(incidentId, selectedResource.resourceExternalId, cascade, routingRepository, signal)
    : null;

  return { cascade, response, route };
}