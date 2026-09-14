set search_path = public, extensions;

alter table public.infrastructure_assets
  drop constraint infrastructure_assets_type_check;

alter table public.infrastructure_assets
  add constraint infrastructure_assets_type_check check (asset_type in (
    'building', 'road', 'hospital', 'fire_station', 'police_station',
    'transformer', 'water_pump', 'water_main', 'gas_facility',
    'emergency_centre', 'monitored_location'
  ));

insert into public.infrastructure_assets (
  external_id, name, asset_type, status, description, criticality, current_risk, location, metadata
)
values
  (
    'G01', 'Gas Service Manifold G01', 'gas_facility', 'at_risk',
    'Gas service manifold serving Building A and the adjacent east-sector block.',
    'high', 79, ST_SetSRID(ST_MakePoint(77.6415, 12.9715), 4326)::geography,
    '{"service_area": "Building A east block", "frontend_type": "GAS FACILITY"}'::jsonb
  ),
  (
    'M7', 'Water Main M7', 'water_main', 'at_risk',
    'Eastern distribution main serving the Domlur pressure zone and connected hydrants.',
    'high', 74, ST_SetSRID(ST_MakePoint(77.6439, 12.9696), 4326)::geography,
    '{"service_zone": "East pressure zone", "frontend_type": "WATER MAIN"}'::jsonb
  )
on conflict (external_id) do update set
  name = excluded.name,
  asset_type = excluded.asset_type,
  status = excluded.status,
  description = excluded.description,
  criticality = excluded.criticality,
  current_risk = excluded.current_risk,
  location = excluded.location,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.infrastructure_dependencies (
  source_asset_id, target_asset_id, dependency_type, dependency_strength, metadata
)
values
  (
    (select id from public.infrastructure_assets where external_id = 'G01'),
    (select id from public.infrastructure_assets where external_id = 'B-A'),
    'gas_service', 0.86, '{"description": "Building A receives gas service through manifold G01."}'::jsonb
  ),
  (
    (select id from public.infrastructure_assets where external_id = 'G01'),
    (select id from public.infrastructure_assets where external_id = 'R12'),
    'hazard_access', 0.74, '{"description": "A G01 release can require controlled access on the adjacent R12 corridor."}'::jsonb
  ),
  (
    (select id from public.infrastructure_assets where external_id = 'M7'),
    (select id from public.infrastructure_assets where external_id = 'W2'),
    'water_supply', 0.88, '{"description": "M7 supplies the W2 pressure-zone pump and connected distribution network."}'::jsonb
  )
on conflict (source_asset_id, target_asset_id, dependency_type) do update set
  dependency_strength = excluded.dependency_strength,
  metadata = excluded.metadata,
  updated_at = now();

update public.incidents
set location_name = 'Building A gas service manifold',
    location = (select location from public.infrastructure_assets where external_id = 'G01'),
    metadata = jsonb_set(metadata, '{affected_external_ids}', '["G01", "B-A", "R12", "T4", "H1"]'::jsonb),
    updated_at = now()
where external_id = 'INC-2402';

update public.incidents
set location_name = 'Domlur Junction water main M7',
    location = (select location from public.infrastructure_assets where external_id = 'M7'),
    metadata = jsonb_set(metadata, '{affected_external_ids}', '["M7", "W2", "H1", "R12"]'::jsonb),
    updated_at = now()
where external_id = 'INC-2404';

insert into public.incident_impacts (
  incident_id, asset_id, impact_state, impact_type, severity, likelihood, description
)
values
  (
    (select id from public.incidents where external_id = 'INC-2402'),
    (select id from public.infrastructure_assets where external_id = 'G01'),
    'current', 'gas_release', 'high', 94,
    'Gas Service Manifold G01 is the recorded source asset for the current release.'
  ),
  (
    (select id from public.incidents where external_id = 'INC-2404'),
    (select id from public.infrastructure_assets where external_id = 'M7'),
    'current', 'pressure_loss', 'medium', 91,
    'Water Main M7 is the recorded source asset for the eastern pressure drop.'
  )
on conflict (incident_id, asset_id, impact_state) do update set
  impact_type = excluded.impact_type,
  severity = excluded.severity,
  likelihood = excluded.likelihood,
  description = excluded.description,
  updated_at = now();

update public.response_actions
set target_asset_id = (select id from public.infrastructure_assets where external_id = 'G01'),
    updated_at = now()
where metadata ->> 'demo_key' = 'INC-2402-dispatch-fire';

update public.routes
set destination_asset_id = (select id from public.infrastructure_assets where external_id = 'G01'),
    destination = (select location from public.infrastructure_assets where external_id = 'G01'),
    updated_at = now()
where external_id = 'ROUTE-2402-F03';

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

update public.scenarios
set focus_asset_id = (select id from public.infrastructure_assets where external_id = 'G01'),
    assumptions = jsonb_set(assumptions, '{mitigated_asset_external_ids}', '["G01"]'::jsonb),
    updated_at = now()
where external_id = 'SCN-GAS-CONTAIN-BUILDING';

update public.scenarios
set focus_asset_id = (select id from public.infrastructure_assets where external_id = 'M7'),
    updated_at = now()
where external_id = 'SCN-WATER-REPAIR-W2';
