import type {
  RoutePoint,
  RoutingAsset,
  RoutingDataSource,
  RoutingImpact,
  RoutingIncident,
  RoutingResource,
  RouteAssignment,
} from "../types/routing.ts";

type SupabaseQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  select(columns: string): SupabaseQuery;
  eq(column: string, value: string): SupabaseQuery;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
  order(column: string): SupabaseQuery;
};

type SupabaseClient = { from(table: string): SupabaseQuery };

type LocationRow = { type?: string; coordinates?: unknown } | string | null;
type IncidentRow = { id: string; external_id: string; severity: string; location: LocationRow };
type ResourceRow = { id: string; external_id: string; name: string; status: string; location: LocationRow };
type AssetRow = { id: string; external_id: string; name: string; asset_type: string; status: string; criticality: string; location: LocationRow };
type ImpactRow = { asset_id: string; impact_state: "current" | "predicted"; impact_type: string; severity: string | null; infrastructure_assets: AssetRow | null };
type RouteAssignmentRow = {
  id: string;
  external_id: string | null;
  incident_id: string;
  department_id: string | null;
  department: { code: string; name: string } | null;
  resource_id: string | null;
  origin_asset_id: string | null;
  destination_asset_id: string | null;
  route_purpose: string | null;
};

function parseLocation(value: LocationRow): RoutePoint | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    const ewkb = parseEwkbPoint(value);
    if (ewkb) return ewkb;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { coordinates?: unknown }).coordinates)) return null;
  const coordinates = (parsed as { coordinates: unknown[] }).coordinates;
  const longitude = coordinates[0];
  const latitude = coordinates[1];
  return typeof longitude === "number" && typeof latitude === "number" ? { latitude, longitude } : null;
}

function parseEwkbPoint(value: string): RoutePoint | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length < 42) return null;
  const bytes = new Uint8Array(value.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)));
  const view = new DataView(bytes.buffer);
  const littleEndian = view.getUint8(0) === 1;
  if (view.getUint8(0) !== 0 && view.getUint8(0) !== 1) return null;
  const type = view.getUint32(1, littleEndian);
  let offset = 5;
  if ((type & 0x20000000) !== 0) offset += 4;
  if ((type & 0xff) !== 1 || bytes.length < offset + 16) return null;
  const longitude = view.getFloat64(offset, littleEndian);
  const latitude = view.getFloat64(offset + 8, littleEndian);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function asset(row: AssetRow): RoutingAsset {
  return {
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    assetType: row.asset_type,
    status: row.status,
    criticality: row.criticality,
    location: parseLocation(row.location),
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createSupabaseRoutingRepository(client: SupabaseClient): RoutingDataSource {
  return {
    async findIncident(idOrExternalId: string): Promise<RoutingIncident | null> {
      const { data, error } = await client.from("incidents")
        .select("id, external_id, severity, location")
        .eq(isUuid(idOrExternalId) ? "id" : "external_id", idOrExternalId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as IncidentRow;
      return { id: row.id, externalId: row.external_id, severity: row.severity, location: parseLocation(row.location) };
    },

    async findResource(idOrExternalId: string): Promise<RoutingResource | null> {
      const { data, error } = await client.from("resources")
        .select("id, external_id, name, status, location")
        .eq(isUuid(idOrExternalId) ? "id" : "external_id", idOrExternalId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as ResourceRow;
      return { id: row.id, externalId: row.external_id, name: row.name, status: row.status, location: parseLocation(row.location) };
    },

    async findAssets(): Promise<RoutingAsset[]> {
      const { data, error } = await client.from("infrastructure_assets")
        .select("id, external_id, name, asset_type, status, criticality, location")
        .order("external_id");
      if (error) throw error;
      return (data as unknown as AssetRow[] ?? []).map(asset);
    },

    async findIncidentImpacts(incidentId: string): Promise<RoutingImpact[]> {
      const { data, error } = await client.from("incident_impacts")
        .select("asset_id, impact_state, impact_type, severity, infrastructure_assets (id, external_id, name, asset_type, status, criticality, location)")
        .eq("incident_id", incidentId);
      if (error) throw error;
      return (data as unknown as ImpactRow[] ?? []).map((row) => ({
        assetId: row.asset_id,
        impactState: row.impact_state,
        impactType: row.impact_type,
        severity: row.severity,
        asset: row.infrastructure_assets ? asset(row.infrastructure_assets) : null,
      }));
    },

    async listRouteAssignments(incidentId: string): Promise<RouteAssignment[]> {
      const { data, error } = await client.from("routes")
        .select("id, external_id, incident_id, department_id, route_purpose, resource_id, origin_asset_id, destination_asset_id, departments (code, name)")
        .eq("incident_id", incidentId)
        .order("route_rank");
      if (error) throw error;
      return (data as unknown as RouteAssignmentRow[] ?? [])
        .filter((row): row is RouteAssignmentRow & { external_id: string } => Boolean(row.external_id))
        .map((row) => ({
          id: row.id,
          externalId: row.external_id,
          incidentId: row.incident_id,
          departmentId: row.department_id,
          departmentCode: row.department?.code ?? null,
          departmentName: row.department?.name ?? null,
          resourceId: row.resource_id,
          originAssetId: row.origin_asset_id,
          destinationAssetId: row.destination_asset_id,
          routePurpose: row.route_purpose,
        }));
    },
  };
}