import { supabase } from "../lib/supabaseClient";
import type { Database } from "../types/database";

type ImpactRow = Database["public"]["Tables"]["incident_impacts"]["Row"];

type AssetRow = Database["public"]["Tables"]["infrastructure_assets"]["Row"];

export type IncidentImpactDetail = Pick<ImpactRow, "id" | "incident_id" | "asset_id" | "impact_state" | "impact_type" | "severity" | "likelihood" | "description"> & {
  asset: AssetRow | null;
};

const impactSelect = `
  id, incident_id, asset_id, impact_state, impact_type, severity, likelihood, description,
  infrastructure_assets (*)
`;

async function requireSupabase() {
  if (!supabase) throw new Error("Supabase environment variables are not configured.");
  return supabase;
}

export async function getIncidentImpacts(incidentId: string): Promise<IncidentImpactDetail[]> {
  const client = await requireSupabase();
  const { data, error } = await client
    .from("incident_impacts")
    .select(impactSelect)
    .eq("incident_id", incidentId)
    .order("impact_state")
    .order("likelihood", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data as unknown as Array<ImpactRow & { infrastructure_assets: AssetRow | null }>).map(({ infrastructure_assets: asset, ...impact }) => ({
    ...impact,
    asset,
  }));
}

export async function getIncidentImpactDetails(incidentId: string): Promise<IncidentImpactDetail[]> {
  return getIncidentImpacts(incidentId);
}
