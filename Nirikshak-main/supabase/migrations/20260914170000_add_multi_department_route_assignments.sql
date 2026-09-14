set search_path = public, extensions;

alter table public.routes add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.routes add column if not exists route_purpose text;

update public.routes set
  department_id = case
    when external_id in ('ROUTE-2407-F03', 'ROUTE-2401-F03', 'ROUTE-2402-F03') then (select id from public.departments where code = 'FIRE')
    when external_id = 'ROUTE-2403-R21' then (select id from public.departments where code = 'INFRA')
    when external_id = 'ROUTE-2405-T02' then (select id from public.departments where code = 'TRAFFIC')
    when external_id = 'ROUTE-2406-E12' then (select id from public.departments where code = 'ELECTRICITY')
    when external_id = 'ROUTE-2404-W07' then (select id from public.departments where code = 'WATER')
    else department_id
  end,
  route_purpose = case
    when external_id in ('ROUTE-2407-F03', 'ROUTE-2401-F03', 'ROUTE-2402-F03') then 'emergency_response'
    when external_id = 'ROUTE-2403-R21' then 'structural_rescue'
    when external_id = 'ROUTE-2405-T02' then 'traffic_management'
    when external_id = 'ROUTE-2406-E12' then 'electrical_response'
    when external_id = 'ROUTE-2404-W07' then 'water_response'
    else route_purpose
  end;

insert into public.routes (
  external_id, incident_id, department_id, resource_id, origin_asset_id, destination_asset_id,
  origin, destination, distance_meters, eta_seconds, blockage_probability,
  hazard_score, congestion_score, route_risk, recommended, route_rank, route_geometry, route_metadata, route_purpose
)
select
  assignments.external_id,
  i.id,
  d.id,
  r.id,
  origin_asset.id,
  destination_asset.id,
  r.location,
  destination_asset.location,
  assignments.distance_meters,
  assignments.eta_seconds,
  assignments.blockage_probability,
  assignments.hazard_score,
  assignments.congestion_score,
  assignments.route_risk,
  true,
  1,
  null::geography,
  jsonb_build_object('label', assignments.route_label, 'source', 'backend_route_assignment', 'purpose', assignments.route_purpose),
  assignments.route_purpose
from (values
  ('ROUTE-2407-MEDICAL', 'INC-2407', 'MEDICAL', 'A12', 'H1', 'medical_response', 'Hospital response route', 2600, 420, 12, 18, 26, 'medium'),
  ('ROUTE-2407-TRAFFIC', 'INC-2407', 'TRAFFIC', 'T02', 'R12', 'traffic_management', 'Road R12 traffic-management route', 2700, 360, 54, 32, 78, 'high'),
  ('ROUTE-2401-MEDICAL', 'INC-2401', 'MEDICAL', 'A12', 'H1', 'medical_response', 'Hospital response route', 7200, 900, 44, 44, 52, 'high'),
  ('ROUTE-2401-TRAFFIC', 'INC-2401', 'TRAFFIC', 'T02', 'R12', 'traffic_management', 'Fuel-zone traffic-management route', 5600, 720, 66, 48, 68, 'high'),
  ('ROUTE-2403-MEDICAL', 'INC-2403', 'MEDICAL', 'A12', 'H1', 'medical_response', 'Hospital response route', 6200, 840, 38, 42, 46, 'high'),
  ('ROUTE-2403-TRAFFIC', 'INC-2403', 'TRAFFIC', 'T02', 'R12', 'traffic_management', 'Collapse-zone traffic-management route', 4300, 600, 72, 54, 76, 'high'),
  ('ROUTE-2405-MEDICAL', 'INC-2405', 'MEDICAL', 'A12', 'H1', 'medical_response', 'Medical access route', 5200, 780, 54, 26, 82, 'high'),
  ('ROUTE-2404-MEDICAL', 'INC-2404', 'MEDICAL', 'A12', 'H1', 'medical_response', 'Water-service medical access route', 5800, 840, 28, 20, 48, 'medium'),
  ('ROUTE-2404-TRAFFIC', 'INC-2404', 'TRAFFIC', 'T02', 'R12', 'traffic_management', 'Water-main traffic-management route', 6200, 900, 35, 18, 54, 'medium'),
  ('ROUTE-2406-MEDICAL', 'INC-2406', 'MEDICAL', 'A12', 'H1', 'medical_response', 'Hospital continuity route', 6100, 840, 18, 20, 38, 'medium')
) as assignments(external_id, incident_external_id, department_code, resource_external_id, destination_external_id, route_purpose, route_label, distance_meters, eta_seconds, blockage_probability, hazard_score, congestion_score, route_risk)
join public.incidents i on i.external_id = assignments.incident_external_id
join public.departments d on d.code = assignments.department_code
join public.resources r on r.external_id = assignments.resource_external_id
join public.infrastructure_assets origin_asset on origin_asset.id = r.base_asset_id
join public.infrastructure_assets destination_asset on destination_asset.external_id = assignments.destination_external_id
where not exists (select 1 from public.routes existing where existing.external_id = assignments.external_id);

alter table public.routes add constraint routes_purpose_check check (route_purpose is null or route_purpose in ('emergency_response', 'medical_response', 'traffic_management', 'structural_rescue', 'electrical_response', 'water_response'));
create index if not exists routes_incident_department_idx on public.routes (incident_id, department_id);
create index if not exists routes_department_idx on public.routes (department_id);
