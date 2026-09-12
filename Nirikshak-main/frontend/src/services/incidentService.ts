import type { Incident as FrontendIncident, Asset, Severity } from "../data/incidents";
import { supabase } from "../lib/supabaseClient";
import type { Json } from "../types/database";

type ImpactRow = {
  id: string;
  impact_state: "current" | "predicted";
  impact_type: string;
  severity: string | null;
  likelihood: number | null;
  description: string | null;
  infrastructure_assets: {
    external_id: string;
    name: string;
    asset_type: string;
    status: string;
    description: string | null;
    criticality: string;
    current_risk: number;
  } | null;
};

type ActionRow = {
  action: string;
  status: string;
  priority: string;
};

type IncidentRow = {
  id: string;
  external_id: string;
  title: string;
  incident_type: string;
  severity: string;
  status: string;
  location_name: string | null;
  detected_at: string | null;
  confidence: number | null;
  current_impacts: string | null;
  predicted_impacts: string | null;
  cascade_summary: string | null;
  responsible_departments: Json;
  incident_impacts: ImpactRow[];
  response_actions: ActionRow[];
};

const severityValues: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function toSeverity(value: string): Severity {
  const normalized = value.toUpperCase() as Severity;
  return severityValues.includes(normalized) ? normalized : "MEDIUM";
}

function formatDetectedAt(value: string | null): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toAsset(impact: ImpactRow): Asset | null {
  const asset = impact.infrastructure_assets;
  if (!asset) return null;
  return {
    id: asset.external_id,
    name: asset.name,
    type: asset.asset_type.toUpperCase(),
    status: asset.status.toUpperCase().replaceAll("_", " "),
    detail: asset.description ?? impact.description ?? "",
    x: 50,
    y: 50,
    criticality: toSeverity(asset.criticality),
    currentRisk: asset.current_risk,
  };
}

function jsonStringArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapIncident(row: IncidentRow): FrontendIncident {
  const impacts = row.incident_impacts ?? [];
  const assets = impacts.map(toAsset).filter((asset): asset is Asset => asset !== null);
  const uniqueAssets = Array.from(new Map(assets.map((asset) => [asset.id, asset])).values());
  const currentImpacts = row.current_impacts ?? impacts.filter((impact) => impact.impact_state === "current").map((impact) => impact.description).filter(Boolean).join(" ");
  const predictedImpacts = row.predicted_impacts ?? impacts.filter((impact) => impact.impact_state === "predicted").map((impact) => impact.description).filter(Boolean).join(" ");
  const primaryAsset = uniqueAssets[0];
  const branchNodes = uniqueAssets.map((asset) => ({
    name: asset.name,
    type: asset.type,
    detail: asset.detail,
    risk: asset.currentRisk ?? 0,
    onset: "Database impact",
  }));

  return {
    id: row.external_id,
    title: row.title,
    type: row.incident_type.toUpperCase().replaceAll("_", " "),
    severity: toSeverity(row.severity),
    status: row.status.toUpperCase(),
    location: row.location_name ?? "Bengaluru Urban",
    time: formatDetectedAt(row.detected_at),
    detectionTime: formatDetectedAt(row.detected_at),
    confidence: row.confidence ?? 0,
    affectedInfrastructure: uniqueAssets.map((asset) => asset.name),
    currentImpacts,
    predictedImpacts,
    impactDetails: impacts.map((impact) => ({
      assetName: impact.infrastructure_assets?.name ?? "Unknown asset",
      impactState: impact.impact_state,
      impactType: impact.impact_type,
      severity: impact.severity,
      likelihood: impact.likelihood,
      description: impact.description ?? "No impact description available.",
    })),
    cascadeSummary: row.cascade_summary ?? "",
    recommendedActions: (row.response_actions ?? []).map((action) => ({
      text: action.action,
      meta: `${action.status.replaceAll("_", " ")} · ${action.priority}`,
    })),
    responsibleDepartments: jsonStringArray(row.responsible_departments),
    assets: uniqueAssets,
    cascade: {
      primaryEvent: row.incident_type.toUpperCase().replaceAll("_", " "),
      escalationProbability: 0,
      highestRiskAsset: primaryAsset?.name ?? "No affected asset",
      branches: [{
        label: "DATABASE IMPACTS",
        nodes: branchNodes.length ? branchNodes : [{ name: row.title, type: row.incident_type, detail: row.title, risk: row.confidence ?? 0, onset: "Current" }],
      }],
    },
  };
}

const incidentSelect = `
  id, external_id, title, incident_type, severity, status, location_name,
  detected_at, confidence, current_impacts, predicted_impacts,
  cascade_summary, responsible_departments,
  incident_impacts (
    id, impact_state, impact_type, severity, likelihood, description,
    infrastructure_assets (external_id, name, asset_type, status, description, criticality, current_risk)
  ),
  response_actions (action, status, priority)
`;

async function queryIncidents(query: ReturnType<NonNullable<typeof supabase>["from"]>) {
  const { data, error } = await query.select(incidentSelect).order("detected_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as IncidentRow[]).map(mapIncident);
}

export async function getIncidents(): Promise<FrontendIncident[]> {
  if (!supabase) throw new Error("Supabase environment variables are not configured.");
  return queryIncidents(supabase.from("incidents"));
}

export async function getIncidentById(id: string): Promise<FrontendIncident> {
  if (!supabase) throw new Error("Supabase environment variables are not configured.");
  const { data, error } = await supabase.from("incidents").select(incidentSelect).eq("id", id).single();
  if (error) throw error;
  return mapIncident(data as unknown as IncidentRow);
}

export async function getIncidentByExternalId(externalId: string): Promise<FrontendIncident> {
  if (!supabase) throw new Error("Supabase environment variables are not configured.");
  const { data, error } = await supabase.from("incidents").select(incidentSelect).eq("external_id", externalId).single();
  if (error) throw error;
  return mapIncident(data as unknown as IncidentRow);
}
