create schema if not exists extensions;

create extension if not exists postgis with schema extensions;

set search_path = public, extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

create table public.departments (
	id uuid primary key default gen_random_uuid(),
	code text not null unique,
	name text not null unique,
	description text,
	incident_types jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint departments_code_not_blank check (btrim(code) <> ''),
	constraint departments_name_not_blank check (btrim(name) <> ''),
	constraint departments_incident_types_array check (jsonb_typeof(incident_types) = 'array')
);

create table public.infrastructure_assets (
	id uuid primary key default gen_random_uuid(),
	external_id text not null unique,
	name text not null,
	asset_type text not null,
	status text not null default 'operational',
	description text,
	criticality text not null default 'medium',
	current_risk numeric(5, 2) not null default 0,
	location geography(Point, 4326),
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint infrastructure_assets_external_id_not_blank check (btrim(external_id) <> ''),
	constraint infrastructure_assets_name_not_blank check (btrim(name) <> ''),
	constraint infrastructure_assets_type_check check (asset_type in (
		'building', 'road', 'hospital', 'fire_station', 'police_station',
		'transformer', 'water_pump', 'emergency_centre', 'monitored_location'
	)),
	constraint infrastructure_assets_status_check check (status in (
		'operational', 'at_risk', 'blocked', 'monitoring', 'safe', 'deployed',
		'ready', 'under_maintenance', 'offline', 'damaged'
	)),
	constraint infrastructure_assets_criticality_check check (criticality in ('low', 'medium', 'high', 'critical')),
	constraint infrastructure_assets_current_risk_check check (current_risk between 0 and 100),
	constraint infrastructure_assets_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.resources (
	id uuid primary key default gen_random_uuid(),
	external_id text not null unique,
	name text not null,
	resource_type text not null,
	status text not null default 'available',
	department_id uuid references public.departments(id) on delete set null,
	base_asset_id uuid references public.infrastructure_assets(id) on delete set null,
	location geography(Point, 4326),
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint resources_external_id_not_blank check (btrim(external_id) <> ''),
	constraint resources_name_not_blank check (btrim(name) <> ''),
	constraint resources_status_check check (status in ('available', 'busy', 'deployed', 'offline', 'maintenance')),
	constraint resources_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.infrastructure_dependencies (
	id uuid primary key default gen_random_uuid(),
	source_asset_id uuid not null references public.infrastructure_assets(id) on delete cascade,
	target_asset_id uuid not null references public.infrastructure_assets(id) on delete cascade,
	dependency_type text not null,
	dependency_strength numeric(5, 2) not null,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint infrastructure_dependencies_distinct_assets check (source_asset_id <> target_asset_id),
	constraint infrastructure_dependencies_type_not_blank check (btrim(dependency_type) <> ''),
	constraint infrastructure_dependencies_strength_check check (dependency_strength between 0 and 1),
	constraint infrastructure_dependencies_metadata_object check (jsonb_typeof(metadata) = 'object'),
	constraint infrastructure_dependencies_unique_edge unique (source_asset_id, target_asset_id, dependency_type)
);

create table public.incidents (
	id uuid primary key default gen_random_uuid(),
	external_id text not null unique,
	title text not null,
	incident_type text not null,
	severity text not null,
	status text not null default 'active',
	location_name text,
	location geography(Point, 4326),
	detected_at timestamptz,
	started_at timestamptz,
	resolved_at timestamptz,
	confidence numeric(5, 2),
	current_impacts text,
	predicted_impacts text,
	cascade_summary text,
	responsible_departments jsonb not null default '[]'::jsonb,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint incidents_external_id_not_blank check (btrim(external_id) <> ''),
	constraint incidents_title_not_blank check (btrim(title) <> ''),
	constraint incidents_type_check check (incident_type in (
		'fire', 'power_failure', 'road_obstruction', 'water_network',
		'flood', 'structural_damage', 'industrial_accident'
	)),
	constraint incidents_severity_check check (severity in ('low', 'medium', 'high', 'critical')),
	constraint incidents_status_check check (status in ('active', 'monitoring', 'contained', 'resolved')),
	constraint incidents_confidence_check check (confidence is null or confidence between 0 and 100),
	constraint incidents_resolved_after_started check (resolved_at is null or started_at is null or resolved_at >= started_at),
	constraint incidents_responsible_departments_array check (jsonb_typeof(responsible_departments) = 'array'),
	constraint incidents_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.incident_impacts (
	id uuid primary key default gen_random_uuid(),
	incident_id uuid not null references public.incidents(id) on delete cascade,
	asset_id uuid not null references public.infrastructure_assets(id) on delete restrict,
	impact_state text not null,
	impact_type text not null,
	severity text,
	likelihood numeric(5, 2),
	description text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint incident_impacts_state_check check (impact_state in ('current', 'predicted')),
	constraint incident_impacts_type_not_blank check (btrim(impact_type) <> ''),
	constraint incident_impacts_severity_check check (severity is null or severity in ('low', 'medium', 'high', 'critical')),
	constraint incident_impacts_likelihood_check check (likelihood is null or likelihood between 0 and 100),
	constraint incident_impacts_unique_asset_state unique (incident_id, asset_id, impact_state)
);

create table public.response_actions (
	id uuid primary key default gen_random_uuid(),
	incident_id uuid not null references public.incidents(id) on delete cascade,
	department_id uuid references public.departments(id) on delete set null,
	resource_id uuid references public.resources(id) on delete set null,
	target_asset_id uuid references public.infrastructure_assets(id) on delete set null,
	action text not null,
	status text not null default 'pending',
	priority text not null default 'medium',
	notes text,
	dispatched_at timestamptz,
	completed_at timestamptz,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint response_actions_action_not_blank check (btrim(action) <> ''),
	constraint response_actions_status_check check (status in ('pending', 'recommended', 'approved', 'dispatched', 'in_progress', 'completed', 'cancelled')),
	constraint response_actions_priority_check check (priority in ('low', 'medium', 'high', 'critical')),
	constraint response_actions_completed_after_dispatched check (completed_at is null or dispatched_at is null or completed_at >= dispatched_at),
	constraint response_actions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.routes (
	id uuid primary key default gen_random_uuid(),
	external_id text,
	incident_id uuid not null references public.incidents(id) on delete cascade,
	resource_id uuid references public.resources(id) on delete set null,
	origin_asset_id uuid references public.infrastructure_assets(id) on delete set null,
	destination_asset_id uuid references public.infrastructure_assets(id) on delete set null,
	origin geography(Point, 4326) not null,
	destination geography(Point, 4326) not null,
	distance_meters numeric(12, 2) not null,
	eta_seconds integer not null,
	blockage_probability numeric(5, 2) not null default 0,
	hazard_score numeric(5, 2) not null default 0,
	congestion_score numeric(5, 2) not null default 0,
	route_risk text not null,
	recommended boolean not null default false,
	route_rank integer,
	route_geometry geography(LineString, 4326),
	route_metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint routes_external_id_not_blank check (external_id is null or btrim(external_id) <> ''),
	constraint routes_distance_check check (distance_meters >= 0),
	constraint routes_eta_check check (eta_seconds >= 0),
	constraint routes_blockage_probability_check check (blockage_probability between 0 and 100),
	constraint routes_hazard_score_check check (hazard_score between 0 and 100),
	constraint routes_congestion_score_check check (congestion_score between 0 and 100),
	constraint routes_risk_check check (route_risk in ('low', 'medium', 'high', 'critical')),
	constraint routes_rank_check check (route_rank is null or route_rank > 0),
	constraint routes_metadata_object check (jsonb_typeof(route_metadata) = 'object')
);

create table public.scenarios (
	id uuid primary key default gen_random_uuid(),
	external_id text,
	name text not null,
	scenario_type text not null default 'what_if',
	status text not null default 'draft',
	incident_id uuid references public.incidents(id) on delete set null,
	focus_asset_id uuid references public.infrastructure_assets(id) on delete set null,
	description text,
	assumptions jsonb not null default '{}'::jsonb,
	interventions jsonb not null default '[]'::jsonb,
	predicted_impacts jsonb not null default '[]'::jsonb,
	intervention_results jsonb not null default '{}'::jsonb,
	confidence numeric(5, 2),
	evaluated_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint scenarios_external_id_not_blank check (external_id is null or btrim(external_id) <> ''),
	constraint scenarios_name_not_blank check (btrim(name) <> ''),
	constraint scenarios_type_check check (scenario_type in ('what_if', 'forecast', 'exercise')),
	constraint scenarios_status_check check (status in ('draft', 'running', 'completed', 'failed', 'archived')),
	constraint scenarios_confidence_check check (confidence is null or confidence between 0 and 100),
	constraint scenarios_assumptions_object check (jsonb_typeof(assumptions) = 'object'),
	constraint scenarios_interventions_array check (jsonb_typeof(interventions) = 'array'),
	constraint scenarios_predicted_impacts_array check (jsonb_typeof(predicted_impacts) = 'array'),
	constraint scenarios_intervention_results_object check (jsonb_typeof(intervention_results) = 'object')
);

create index infrastructure_assets_type_status_idx on public.infrastructure_assets (asset_type, status);
create index infrastructure_assets_criticality_idx on public.infrastructure_assets (criticality);
create index infrastructure_assets_location_idx on public.infrastructure_assets using gist (location);
create index resources_department_status_idx on public.resources (department_id, status);
create index resources_base_asset_idx on public.resources (base_asset_id);
create index resources_location_idx on public.resources using gist (location);
create index infrastructure_dependencies_source_idx on public.infrastructure_dependencies (source_asset_id);
create index infrastructure_dependencies_target_idx on public.infrastructure_dependencies (target_asset_id);
create index incidents_status_severity_idx on public.incidents (status, severity);
create index incidents_type_detected_at_idx on public.incidents (incident_type, detected_at desc);
create index incidents_location_idx on public.incidents using gist (location);
create index incident_impacts_incident_state_idx on public.incident_impacts (incident_id, impact_state);
create index incident_impacts_asset_idx on public.incident_impacts (asset_id);
create index response_actions_incident_status_idx on public.response_actions (incident_id, status);
create index response_actions_department_idx on public.response_actions (department_id);
create index response_actions_resource_idx on public.response_actions (resource_id);
create index response_actions_target_asset_idx on public.response_actions (target_asset_id);
create index routes_incident_recommended_idx on public.routes (incident_id, recommended);
create index routes_resource_idx on public.routes (resource_id);
create index routes_origin_asset_idx on public.routes (origin_asset_id);
create index routes_destination_asset_idx on public.routes (destination_asset_id);
create index routes_origin_destination_idx on public.routes using gist (origin, destination);
create index routes_geometry_idx on public.routes using gist (route_geometry);
create index scenarios_incident_idx on public.scenarios (incident_id);
create index scenarios_focus_asset_idx on public.scenarios (focus_asset_id);
create index scenarios_status_idx on public.scenarios (status);

create trigger departments_set_updated_at
before update on public.departments
for each row execute function public.set_updated_at();

create trigger resources_set_updated_at
before update on public.resources
for each row execute function public.set_updated_at();

create trigger infrastructure_assets_set_updated_at
before update on public.infrastructure_assets
for each row execute function public.set_updated_at();

create trigger infrastructure_dependencies_set_updated_at
before update on public.infrastructure_dependencies
for each row execute function public.set_updated_at();

create trigger incidents_set_updated_at
before update on public.incidents
for each row execute function public.set_updated_at();

create trigger incident_impacts_set_updated_at
before update on public.incident_impacts
for each row execute function public.set_updated_at();

create trigger response_actions_set_updated_at
before update on public.response_actions
for each row execute function public.set_updated_at();

create trigger routes_set_updated_at
before update on public.routes
for each row execute function public.set_updated_at();

create trigger scenarios_set_updated_at
before update on public.scenarios
for each row execute function public.set_updated_at();
