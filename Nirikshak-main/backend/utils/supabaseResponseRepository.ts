import type {
  ResponseDataSource,
  ResponseAsset,
  ResponseDepartment,
  ResponseIncident,
  ResponseResource,
} from "../types/response.ts";

type SupabaseQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  select(columns: string): SupabaseQuery;
  eq(column: string, value: string): SupabaseQuery;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
  order(column: string): SupabaseQuery;
};

type SupabaseClient = {
  from(table: string): SupabaseQuery;
};

type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  incident_types: unknown;
};

type ResourceRow = {
  id: string;
  external_id: string;
  name: string;
  resource_type: string;
  status: string;
  department_id: string | null;
  base_asset_id: string | null;
};

type AssetRow = {
  id: string;
  criticality: string;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function createSupabaseResponseRepository(client: SupabaseClient): ResponseDataSource {
  return {
    async findIncident(idOrExternalId: string): Promise<ResponseIncident | null> {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrExternalId);
      const { data, error } = await client
        .from("incidents")
        .select("id, external_id, incident_type, severity")
        .eq(isUuid ? "id" : "external_id", idOrExternalId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as { id: string; external_id: string; incident_type: string; severity: string };
      return { id: row.id, externalId: row.external_id, incidentType: row.incident_type, severity: row.severity };
    },

    async listAssets(): Promise<ResponseAsset[]> {
      const { data, error } = await client
        .from("infrastructure_assets")
        .select("id, criticality")
        .order("id");
      if (error) throw error;
      return (data as unknown as AssetRow[] ?? []).map((row) => ({
        id: row.id,
        criticality: row.criticality,
      }));
    },

    async listDepartments(): Promise<ResponseDepartment[]> {
      const { data, error } = await client
        .from("departments")
        .select("id, code, name, incident_types")
        .order("code");
      if (error) throw error;
      return (data as unknown as DepartmentRow[] ?? []).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        incidentTypes: stringArray(row.incident_types),
      }));
    },

    async listResources(): Promise<ResponseResource[]> {
      const { data, error } = await client
        .from("resources")
        .select("id, external_id, name, resource_type, status, department_id, base_asset_id")
        .order("external_id");
      if (error) throw error;
      return (data as unknown as ResourceRow[] ?? []).map((row) => ({
        id: row.id,
        externalId: row.external_id,
        name: row.name,
        resourceType: row.resource_type,
        status: row.status,
        departmentId: row.department_id,
        baseAssetId: row.base_asset_id,
      }));
    },
  };
}