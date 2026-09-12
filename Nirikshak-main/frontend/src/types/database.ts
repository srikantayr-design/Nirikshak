export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = {
  created_at: string;
  updated_at: string;
};

type Department = Timestamps & {
  id: string;
  code: string;
  name: string;
  description: string | null;
  incident_types: Json;
};

type InfrastructureAsset = Timestamps & {
  id: string;
  external_id: string;
  name: string;
  asset_type: string;
  status: string;
  description: string | null;
  criticality: string;
  current_risk: number;
  location: unknown;
  metadata: Json;
};

type Resource = Timestamps & {
  id: string;
  external_id: string;
  name: string;
  resource_type: string;
  status: string;
  department_id: string | null;
  base_asset_id: string | null;
  location: unknown;
  metadata: Json;
};

type Incident = Timestamps & {
  id: string;
  external_id: string;
  title: string;
  incident_type: string;
  severity: string;
  status: string;
  location_name: string | null;
  location: unknown;
  detected_at: string | null;
  started_at: string | null;
  resolved_at: string | null;
  confidence: number | null;
  current_impacts: string | null;
  predicted_impacts: string | null;
  cascade_summary: string | null;
  responsible_departments: Json;
  metadata: Json;
};

type IncidentImpact = Timestamps & {
  id: string;
  incident_id: string;
  asset_id: string;
  impact_state: "current" | "predicted";
  impact_type: string;
  severity: string | null;
  likelihood: number | null;
  description: string | null;
  infrastructure_assets: InfrastructureAsset | null;
};

type ResponseAction = Timestamps & {
  id: string;
  incident_id: string;
  department_id: string | null;
  resource_id: string | null;
  target_asset_id: string | null;
  action: string;
  status: string;
  priority: string;
  notes: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  metadata: Json;
};

export type Database = {
  public: {
    Tables: {
      departments: { Row: Department; Insert: Partial<Department>; Update: Partial<Department>; Relationships: [] };
      infrastructure_assets: { Row: InfrastructureAsset; Insert: Partial<InfrastructureAsset>; Update: Partial<InfrastructureAsset>; Relationships: [] };
      resources: { Row: Resource; Insert: Partial<Resource>; Update: Partial<Resource>; Relationships: [] };
      incidents: { Row: Incident; Insert: Partial<Incident>; Update: Partial<Incident>; Relationships: [] };
      incident_impacts: { Row: IncidentImpact; Insert: Partial<IncidentImpact>; Update: Partial<IncidentImpact>; Relationships: [] };
      response_actions: { Row: ResponseAction; Insert: Partial<ResponseAction>; Update: Partial<ResponseAction>; Relationships: [] };
      infrastructure_dependencies: { Row: Timestamps & { id: string; source_asset_id: string; target_asset_id: string; dependency_type: string; dependency_strength: number; metadata: Json }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] };
      routes: { Row: Timestamps & { id: string; external_id: string | null; incident_id: string; resource_id: string | null; origin_asset_id: string | null; destination_asset_id: string | null; origin: unknown; destination: unknown; distance_meters: number; eta_seconds: number; blockage_probability: number; hazard_score: number; congestion_score: number; route_risk: string; recommended: boolean; route_rank: number | null; route_geometry: unknown; route_metadata: Json }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] };
      scenarios: { Row: Timestamps & { id: string; external_id: string | null; name: string; scenario_type: string; status: string; incident_id: string | null; focus_asset_id: string | null; description: string | null; assumptions: Json; interventions: Json; predicted_impacts: Json; intervention_results: Json; confidence: number | null; evaluated_at: string | null }; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
