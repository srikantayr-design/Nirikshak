import type { Asset, Severity } from "../data/incidents";
import { supabase } from "../lib/supabaseClient";
import type { Database } from "../types/database";

type InfrastructureRow = Database["public"]["Tables"]["infrastructure_assets"]["Row"];

type GeoPoint = {
  type: "Point";
  coordinates: [number, number];
};

export type InfrastructureAsset = InfrastructureRow & {
  coordinates: { lat: number; lng: number } | null;
};

const severityValues: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function toSeverity(value: string): Severity {
  const normalized = value.toUpperCase() as Severity;
  return severityValues.includes(normalized) ? normalized : "MEDIUM";
}

function parseLocation(location: unknown): { lat: number; lng: number } | null {
  if (location && typeof location === "object" && "coordinates" in location) {
    const coordinates = (location as GeoPoint).coordinates;
    if (Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every((value) => typeof value === "number")) {
      return { lat: coordinates[1], lng: coordinates[0] };
    }
  }

  if (typeof location === "string") {
    const point = location.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
    if (point) return { lat: Number(point[2]), lng: Number(point[1]) };

    if (/^[0-9a-f]+$/i.test(location) && location.length >= 42) {
      const hexBytes = location.match(/../g);
      if (hexBytes) {
        const bytes = Uint8Array.from(hexBytes, (byte) => Number.parseInt(byte, 16));
        const view = new DataView(bytes.buffer);
        const littleEndian = view.getUint8(0) === 1;
        const geometryType = view.getUint32(1, littleEndian);
        const hasSrid = (geometryType & 0x20000000) !== 0;
        const coordinateOffset = 5 + (hasSrid ? 4 : 0);
        return {
          lng: view.getFloat64(coordinateOffset, littleEndian),
          lat: view.getFloat64(coordinateOffset + 8, littleEndian),
        };
      }
    }
  }

  return null;
}

function mapType(assetType: string): string {
  const types: Record<string, string> = {
    building: "BUILDING",
    road: "ROAD",
    hospital: "HOSPITAL",
    fire_station: "FIRE STATION",
    police_station: "POLICE",
    transformer: "ELECTRICITY",
    water_pump: "WATER",
    water_main: "WATER MAIN",
    fuel_station: "FUEL STATION",
    emergency_centre: "EMERGENCY CENTRE",
    monitored_location: "MONITORED LOCATION",
  };
  return types[assetType] ?? assetType.toUpperCase();
}

function mapPosition(coordinates: { lat: number; lng: number } | null): { x: number; y: number } {
  if (!coordinates) return { x: 50, y: 50 };
  return {
    x: Math.max(8, Math.min(92, ((coordinates.lng - 77.635) / 0.012) * 84 + 8)),
    y: Math.max(8, Math.min(92, (1 - (coordinates.lat - 12.966) / 0.013) * 84 + 8)),
  };
}

function mapInfrastructureRow(row: InfrastructureRow): InfrastructureAsset {
  return { ...row, coordinates: parseLocation(row.location) };
}

export function infrastructureAssetToFrontendAsset(asset: InfrastructureAsset): Asset {
  const position = mapPosition(asset.coordinates);
  return {
    id: asset.external_id,
    name: asset.name,
    type: mapType(asset.asset_type),
    status: asset.status.toUpperCase().replaceAll("_", " "),
    detail: asset.description ?? "",
    x: position.x,
    y: position.y,
    lat: asset.coordinates?.lat,
    lng: asset.coordinates?.lng,
    criticality: toSeverity(asset.criticality),
    currentRisk: asset.current_risk,
  };
}

async function requireSupabase() {
  if (!supabase) throw new Error("Supabase environment variables are not configured.");
  return supabase;
}

export async function getInfrastructureAssets(): Promise<InfrastructureAsset[]> {
  const client = await requireSupabase();
  const { data, error } = await client.from("infrastructure_assets").select("*").order("name");
  if (error) throw error;
  return (data as InfrastructureRow[]).map(mapInfrastructureRow);
}

export async function getInfrastructureAssetById(id: string): Promise<InfrastructureAsset> {
  const client = await requireSupabase();
  const { data, error } = await client.from("infrastructure_assets").select("*").eq("id", id).single();
  if (error) throw error;
  return mapInfrastructureRow(data as InfrastructureRow);
}

export async function getInfrastructureAssetByExternalId(externalId: string): Promise<InfrastructureAsset> {
  const client = await requireSupabase();
  const { data, error } = await client.from("infrastructure_assets").select("*").eq("external_id", externalId).single();
  if (error) throw error;
  return mapInfrastructureRow(data as InfrastructureRow);
}
