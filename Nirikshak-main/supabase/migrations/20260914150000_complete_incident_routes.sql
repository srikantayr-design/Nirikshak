set search_path = public, extensions;

insert into public.resources (
  external_id, name, resource_type, status, department_id, base_asset_id, location, metadata
)
values
  (
    'E12', 'Grid Crew E12', 'electricity_crew', 'available',
    (select id from public.departments where code = 'ELECTRICITY'),
    (select id from public.infrastructure_assets where external_id = 'E01'),
    ST_SetSRID(ST_MakePoint(77.6421, 12.9667), 4326)::geography,
    '{"capabilities": ["feeder_isolation", "transformer_inspection"], "frontend_status": "AVAILABLE"}'::jsonb
  ),
  (
    'W07', 'Water Crew W07', 'water_crew', 'available',
    (select id from public.departments where code = 'WATER'),
    (select id from public.infrastructure_assets where external_id = 'E01'),
    ST_SetSRID(ST_MakePoint(77.6421, 12.9667), 4326)::geography,
    '{"capabilities": ["water_main_repair", "pressure_zone_isolation"], "frontend_status": "AVAILABLE"}'::jsonb
  )
on conflict (external_id) do update set
  name = excluded.name,
  resource_type = excluded.resource_type,
  status = excluded.status,
  department_id = excluded.department_id,
  base_asset_id = excluded.base_asset_id,
  location = excluded.location,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.incident_impacts (
  incident_id, asset_id, impact_state, impact_type, severity, likelihood, description
)
values (
  (select id from public.incidents where external_id = 'INC-2407'),
  (select id from public.infrastructure_assets where external_id = 'B-A'),
  'current', 'fire_origin', 'critical', 94,
  'Building A is the recorded origin asset for the structural fire incident.'
)
on conflict (incident_id, asset_id, impact_state) do update set
  impact_type = excluded.impact_type,
  severity = excluded.severity,
  likelihood = excluded.likelihood,
  description = excluded.description,
  updated_at = now();

insert into public.routes (
  external_id, incident_id, resource_id, origin_asset_id, destination_asset_id,
  origin, destination, distance_meters, eta_seconds, blockage_probability,
  hazard_score, congestion_score, route_risk, recommended, route_rank, route_geometry, route_metadata
)
select
  'ROUTE-2406-E12',
  i.id,
  r.id,
  origin_asset.id,
  target_asset.id,
  r.location,
  target_asset.location,
  3600, 600, 18, 64, 38, 'high', true, 1, null::geography,
  '{"label": "Transformer service route", "source": "backend_demo_metadata", "reason": "Uses the stored E12 resource location and T4 destination location."}'::jsonb
from public.incidents i
join public.resources r on r.external_id = 'E12'
join public.infrastructure_assets origin_asset on origin_asset.id = r.base_asset_id
join public.infrastructure_assets target_asset on target_asset.external_id = 'T4'
where i.external_id = 'INC-2406'
  and not exists (select 1 from public.routes existing where existing.external_id = 'ROUTE-2406-E12');

insert into public.routes (
  external_id, incident_id, resource_id, origin_asset_id, destination_asset_id,
  origin, destination, distance_meters, eta_seconds, blockage_probability,
  hazard_score, congestion_score, route_risk, recommended, route_rank, route_geometry, route_metadata
)
select
  'ROUTE-2404-W07',
  i.id,
  r.id,
  origin_asset.id,
  target_asset.id,
  r.location,
  target_asset.location,
  4200, 660, 28, 22, 36, 'medium', true, 1, null::geography,
  '{"label": "Domlur water-main service route", "source": "backend_demo_metadata", "reason": "Uses the stored W07 resource location and M7 destination location."}'::jsonb
from public.incidents i
join public.resources r on r.external_id = 'W07'
join public.infrastructure_assets origin_asset on origin_asset.id = r.base_asset_id
join public.infrastructure_assets target_asset on target_asset.external_id = 'M7'
where i.external_id = 'INC-2404'
  and not exists (select 1 from public.routes existing where existing.external_id = 'ROUTE-2404-W07');
