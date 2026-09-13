import type { ScenarioDataSource, ScenarioRecord } from "../types/scenario.ts";

type SupabaseQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  select(columns: string): SupabaseQuery;
  eq(column: string, value: string): SupabaseQuery;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
};

type SupabaseClient = { from(table: string): SupabaseQuery };

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createSupabaseScenarioRepository(client: SupabaseClient): ScenarioDataSource {
  return {
    async findScenario(idOrExternalId: string): Promise<ScenarioRecord | null> {
      const { data, error } = await client.from("scenarios")
        .select("id, external_id, name, incident_id, focus_asset_id, description, assumptions, interventions, predicted_impacts")
        .eq(isUuid(idOrExternalId) ? "id" : "external_id", idOrExternalId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as {
        id: string; external_id: string; name: string; incident_id: string | null;
        focus_asset_id: string | null; description: string | null; assumptions: unknown;
        interventions: unknown; predicted_impacts: unknown;
      };
      return {
        id: row.id,
        externalId: row.external_id,
        name: row.name,
        incidentId: row.incident_id,
        focusAssetId: row.focus_asset_id,
        description: row.description,
        assumptions: jsonObject(row.assumptions),
        interventions: jsonArray(row.interventions),
        predictedImpacts: jsonArray(row.predicted_impacts),
      };
    },
  };
}