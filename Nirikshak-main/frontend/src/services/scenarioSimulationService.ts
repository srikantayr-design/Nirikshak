import { simulateScenario } from "../../../backend/services/scenarioSimulationService.ts";
import { createSupabaseCascadeRepository } from "../../../backend/utils/supabaseCascadeRepository.ts";
import { createSupabaseResponseRepository } from "../../../backend/utils/supabaseResponseRepository.ts";
import { createSupabaseRoutingRepository } from "../../../backend/utils/supabaseRoutingRepository.ts";
import { createSupabaseScenarioRepository } from "../../../backend/utils/supabaseScenarioRepository.ts";
import type { ScenarioComparison, ScenarioRecord } from "../../../backend/types/scenario.ts";
import { supabase } from "../lib/supabaseClient";

export async function getIncidentScenarios(incidentExternalId: string): Promise<ScenarioRecord[]> {
  if (!supabase) throw new Error("Supabase environment variables are not configured.");
  const { data: incident, error: incidentError } = await supabase
    .from("incidents")
    .select("id")
    .eq("external_id", incidentExternalId)
    .single();
  if (incidentError) throw incidentError;

  const { data, error } = await supabase
    .from("scenarios")
    .select("id, external_id, name, incident_id, focus_asset_id, description, assumptions, interventions, predicted_impacts")
    .eq("incident_id", incident.id);
  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string;
    external_id: string | null;
    name: string;
    incident_id: string | null;
    focus_asset_id: string | null;
    description: string | null;
    assumptions: unknown;
    interventions: unknown;
    predicted_impacts: unknown;
  }>).filter((row): row is typeof row & { external_id: string } => Boolean(row.external_id)).map((row) => ({
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    incidentId: row.incident_id,
    focusAssetId: row.focus_asset_id,
    description: row.description,
    assumptions: row.assumptions && typeof row.assumptions === "object" && !Array.isArray(row.assumptions) ? row.assumptions as Record<string, unknown> : {},
    interventions: Array.isArray(row.interventions) ? row.interventions : [],
    predictedImpacts: Array.isArray(row.predicted_impacts) ? row.predicted_impacts : [],
  }));
}

export async function runIncidentScenario(incidentId: string, scenarioId: string, signal?: AbortSignal): Promise<ScenarioComparison> {
  if (!supabase) throw new Error("Supabase environment variables are not configured.");
  const client = supabase as never;
  return simulateScenario(incidentId, scenarioId, {
    scenarios: createSupabaseScenarioRepository(client),
    cascade: createSupabaseCascadeRepository(client),
    response: createSupabaseResponseRepository(client),
    routing: createSupabaseRoutingRepository(client),
  }, signal);
}