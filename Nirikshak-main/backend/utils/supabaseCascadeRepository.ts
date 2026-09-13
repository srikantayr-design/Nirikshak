import type {
  CascadeAsset,
  CascadeDataSource,
  CascadeDependency,
  CascadeIncident,
  CascadeIncidentImpact,
} from "../types/cascade.ts";

type SupabaseQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  select(columns: string): SupabaseQuery;
  eq(column: string, value: string): SupabaseQuery;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
};

type SupabaseClient = {
  from(table: string): SupabaseQuery;
};

type AssetRow = {
  id: string;
  external_id: string;
  name: string;
  asset_type: string;
  criticality: string;
};

type ImpactRow = {
  asset_id: string;
  impact_state: "current" | "predicted";
  impact_type: string;
  severity: string | null;
  likelihood: number | null;
  description: string | null;
  infrastructure_assets: AssetRow | null;
};

type DependencyRow = {
  source_asset_id: string;
  target_asset_id: string;
  dependency_type: string;
  dependency_strength: number | null;
  infrastructure_assets: AssetRow | null;
};

function toAsset(row: AssetRow | null): CascadeAsset | null {
  return row ? {
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    assetType: row.asset_type,
    criticality: row.criticality,
  } : null;
}

export function createSupabaseCascadeRepository(client: SupabaseClient): CascadeDataSource {
  return {
    async findIncident(idOrExternalId: string): Promise<CascadeIncident | null> {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrExternalId);
      const { data, error } = await client
        .from("incidents")
        .select("id, external_id, severity")
        .eq(isUuid ? "id" : "external_id", idOrExternalId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as { id: string; external_id: string; severity: string };
      return { id: row.id, externalId: row.external_id, severity: row.severity };
    },

    async findIncidentImpacts(incidentId: string): Promise<CascadeIncidentImpact[]> {
      const { data, error } = await client
        .from("incident_impacts")
        .select("asset_id, impact_state, impact_type, severity, likelihood, description, infrastructure_assets (id, external_id, name, asset_type, criticality)")
        .eq("incident_id", incidentId);
      if (error) throw error;
      return (data as unknown as ImpactRow[] ?? []).map((row) => ({
        assetId: row.asset_id,
        impactState: row.impact_state,
        impactType: row.impact_type,
        severity: row.severity,
        likelihood: row.likelihood,
        description: row.description,
        asset: toAsset(row.infrastructure_assets),
      }));
    },

    async findDependenciesFromAsset(assetId: string): Promise<CascadeDependency[]> {
      const { data, error } = await client
        .from("infrastructure_dependencies")
        .select("source_asset_id, target_asset_id, dependency_type, dependency_strength, infrastructure_assets!infrastructure_dependencies_target_asset_id_fkey (id, external_id, name, asset_type, criticality)")
        .eq("source_asset_id", assetId);
      if (error) throw error;
      return (data as unknown as DependencyRow[] ?? []).map((row) => ({
        sourceAssetId: row.source_asset_id,
        targetAssetId: row.target_asset_id,
        dependencyType: row.dependency_type,
        dependencyStrength: row.dependency_strength,
        targetAsset: toAsset(row.infrastructure_assets),
      }));
    },
  };
}