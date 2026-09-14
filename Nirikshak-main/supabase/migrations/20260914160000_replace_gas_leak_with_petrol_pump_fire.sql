set search_path = public, extensions;

-- Remove only the previously added Gas Leak/G01 records before replacing that incident slot.
delete from public.scenarios
where incident_id = (select id from public.incidents where external_id = 'INC-2402')
   or external_id in ('SCN-GAS-CONTAIN-BUILDING', 'SCN-GAS-CLOSE-R12', 'SCN-GAS-PROTECT-H1');

delete from public.infrastructure_dependencies
where source_asset_id = (select id from public.infrastructure_assets where external_id = 'G01')
   or target_asset_id = (select id from public.infrastructure_assets where external_id = 'G01');

delete from public.incidents
where external_id = 'INC-2402';

delete from public.infrastructure_assets
where external_id = 'G01';

alter table public.infrastructure_assets
  drop constraint infrastructure_assets_type_check;

alter table public.infrastructure_assets
  add constraint infrastructure_assets_type_check check (asset_type in (
    'building', 'road', 'hospital', 'fire_station', 'police_station',
    'transformer', 'water_pump', 'water_main', 'fuel_station',
    'emergency_centre', 'monitored_location'
  ));

insert into public.infrastructure_assets (
  external_id, name, asset_type, status, description, criticality, current_risk, location, metadata
)
values (
  'FP01', 'Indian Oil Domlur Fuel Station', 'fuel_station', 'at_risk',
  'Mapped Indian Oil fuel station on HAL Old Airport Road in Domlur, used as a fixed simulated incident location.',
  'high', 86, ST_SetSRID(ST_MakePoint(77.6457010, 12.9599052), 4326)::geography,
  '{"source": "OpenStreetMap", "osm_type": "way", "osm_id": 323104302, "address": "HAL Old Airport Road, Domlur, Bengaluru", "frontend_type": "FUEL STATION", "simulated_incident_location": true}'::jsonb
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
    (select id from public.infrastructure_assets where external_id = 'FP01'),
    (select id from public.infrastructure_assets where external_id = 'R12'),
    'emergency_access', 0.72, '{"description": "A fuel-station fire can restrict access along the response corridor during exclusion-zone operations."}'::jsonb
  ),
  (
    (select id from public.infrastructure_assets where external_id = 'FP01'),
    (select id from public.infrastructure_assets where external_id = 'T4'),
    'electrical_exposure', 0.64, '{"description": "The fuel-station hazard zone may expose nearby electrical infrastructure during fire response."}'::jsonb
  )
on conflict (source_asset_id, target_asset_id, dependency_type) do update set
  dependency_strength = excluded.dependency_strength,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.incidents (
  external_id, title, incident_type, severity, status, location_name, location,
  detected_at, started_at, confidence, current_impacts, predicted_impacts,
  cascade_summary, responsible_departments, metadata
)
values (
  'INC-2401', 'Petrol Pump Fire', 'industrial_accident', 'high', 'active', 'Indian Oil Domlur, HAL Old Airport Road',
  ST_SetSRID(ST_MakePoint(77.6457010, 12.9599052), 4326)::geography,
  '2026-09-12 13:40:00+05:30', '2026-09-12 13:38:00+05:30', 94,
  'A simulated fire at the Indian Oil Domlur fuel station has closed the facility and established an immediate hazard perimeter.',
  'Heat and fuel exposure may restrict access on the approach corridor, threaten nearby electrical infrastructure and delay emergency movements.',
  'Fuel-station fire creates a controlled hazard zone, constrains access and requires coordinated fire, traffic, police and medical readiness.',
  '["FIRE", "TRAFFIC", "POLICE", "MEDICAL"]'::jsonb,
  '{"frontend_type": "FUEL STATION FIRE", "escalation_probability": 81, "simulated_location": true, "source_asset_external_id": "FP01", "affected_external_ids": ["FP01", "R12", "T4", "H1"]}'::jsonb
);

insert into public.incident_impacts (
  incident_id, asset_id, impact_state, impact_type, severity, likelihood, description
)
select * from (values
  ((select id from public.incidents where external_id = 'INC-2401'), (select id from public.infrastructure_assets where external_id = 'FP01'), 'current', 'fuel_station_shutdown', 'critical', 94, 'Indian Oil Domlur Fuel Station is closed for simulated fire suppression and hazard control.'),
  ((select id from public.incidents where external_id = 'INC-2401'), (select id from public.infrastructure_assets where external_id = 'R12'), 'current', 'emergency_access_restriction', 'high', 78, 'The fuel-station exclusion zone constrains emergency access along the R12 response corridor.'),
  ((select id from public.incidents where external_id = 'INC-2401'), (select id from public.infrastructure_assets where external_id = 'T4'), 'predicted', 'thermal_electrical_exposure', 'high', 64, 'Heat and fuel exposure may require inspection or isolation of Transformer T4.'),
  ((select id from public.incidents where external_id = 'INC-2401'), (select id from public.infrastructure_assets where external_id = 'H1'), 'predicted', 'ambulance_response_delay', 'medium', 52, 'Access controls may increase ambulance travel time toward Hospital H1.')
) as petrol_impacts(incident_id, asset_id, impact_state, impact_type, severity, likelihood, description)
where not exists (
  select 1 from public.incident_impacts existing
  where existing.incident_id = petrol_impacts.incident_id
    and existing.asset_id = petrol_impacts.asset_id
    and existing.impact_state = petrol_impacts.impact_state
);

insert into public.response_actions (
  incident_id, department_id, resource_id, target_asset_id, action, status, priority, notes, metadata
)
select * from (values
  ((select id from public.incidents where external_id = 'INC-2401'), (select id from public.departments where code = 'FIRE'), (select id from public.resources where external_id = 'F03'), (select id from public.infrastructure_assets where external_id = 'FP01'), 'Dispatch Fire Unit F03 to the Domlur fuel station', 'approved', 'critical', 'Establish a fuel-hazard perimeter and coordinate suppression.', '{"demo_key": "INC-2401-dispatch-f03"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2401'), (select id from public.departments where code = 'TRAFFIC'), null, (select id from public.infrastructure_assets where external_id = 'R12'), 'Divert traffic away from the fuel-station hazard zone', 'recommended', 'high', 'Preserve a protected emergency approach.', '{"demo_key": "INC-2401-divert-r12"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2401'), (select id from public.departments where code = 'POLICE'), null, (select id from public.infrastructure_assets where external_id = 'FP01'), 'Secure the public exclusion zone around the fuel station', 'in_progress', 'high', 'Prevent public entry while the simulated fuel hazard is controlled.', '{"demo_key": "INC-2401-secure-fuel-zone"}'::jsonb)
) as petrol_actions(incident_id, department_id, resource_id, target_asset_id, action, status, priority, notes, metadata)
where not exists (
  select 1 from public.response_actions existing
  where existing.metadata ->> 'demo_key' = petrol_actions.metadata ->> 'demo_key'
);

insert into public.routes (
  external_id, incident_id, resource_id, origin_asset_id, destination_asset_id,
  origin, destination, distance_meters, eta_seconds, blockage_probability,
  hazard_score, congestion_score, route_risk, recommended, route_rank, route_geometry, route_metadata
)
select
  'ROUTE-2401-F03',
  i.id,
  r.id,
  origin_asset.id,
  target_asset.id,
  r.location,
  target_asset.location,
  5200, 540, 44, 76, 46, 'high', true, 1, null::geography,
  '{"label": "Domlur fuel-station response route", "source": "backend_demo_metadata", "reason": "Uses the stored F03 resource location and the fixed Indian Oil Domlur fuel-station location."}'::jsonb
from public.incidents i
join public.resources r on r.external_id = 'F03'
join public.infrastructure_assets origin_asset on origin_asset.id = r.base_asset_id
join public.infrastructure_assets target_asset on target_asset.external_id = 'FP01'
where i.external_id = 'INC-2401'
  and not exists (select 1 from public.routes existing where existing.external_id = 'ROUTE-2401-F03');

insert into public.scenarios (
  external_id, name, scenario_type, status, incident_id, focus_asset_id, description,
  assumptions, interventions, predicted_impacts, intervention_results, confidence, evaluated_at
)
select * from (values
  (
    'SCN-PETROL-CLOSE-R12', 'Close Road R12 around the fuel-station hazard zone', 'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2401'), (select id from public.infrastructure_assets where external_id = 'R12'),
    'Test whether a controlled R12 closure protects the public while the simulated petrol-pump fire is contained.',
    '{"simulation_effect": "close", "closure_duration_minutes": 30, "hospital_access_required": true, "alternate_route_available": true, "expected_outcome": "The closure strengthens the exclusion boundary but requires a staffed emergency diversion."}'::jsonb,
    '[{"action": "close_r12_for_fuel_hazard_control", "owner": "TRAFFIC", "target": "R12"}, {"action": "divert_emergency_traffic", "owner": "POLICE", "target": "R12"}]'::jsonb,
    '[{"asset": "R12", "impact": "emergency_access_restriction", "reason": "The controlled closure protects the fuel-station hazard boundary"}]'::jsonb,
    '{"public_exposure": "reduced", "emergency_corridor": "managed_diversion", "recommended": true}'::jsonb,
    88.00::numeric(5, 2), '2026-09-14 16:00:00+05:30'::timestamptz
  ),
  (
    'SCN-PETROL-ISOLATE-T4', 'Isolate Transformer T4 near the fuel station', 'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2401'), (select id from public.infrastructure_assets where external_id = 'T4'),
    'Test whether isolating T4 reduces electrical exposure while fire crews operate inside the fuel-station perimeter.',
    '{"simulation_effect": "isolate", "isolation_duration_minutes": 30, "expected_outcome": "Isolation reduces live-equipment exposure but requires continuity planning for connected services."}'::jsonb,
    '[{"action": "isolate_transformer_t4", "owner": "ELECTRICITY", "target": "T4"}, {"action": "verify_hospital_generator", "owner": "MEDICAL", "target": "H1"}]'::jsonb,
    '[{"asset": "T4", "impact": "thermal_electrical_exposure", "reason": "Isolation removes live equipment exposure from the fuel-fire response"}]'::jsonb,
    '{"electrical_exposure": "reduced", "service_continuity": "requires_backup", "recommended": true}'::jsonb,
    84.00::numeric(5, 2), '2026-09-14 16:01:00+05:30'::timestamptz
  ),
  (
    'SCN-PETROL-EXPAND-ZONE', 'Expand the fuel-station exclusion zone', 'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2401'), (select id from public.infrastructure_assets where external_id = 'FP01'),
    'Test whether expanding the exclusion zone around the petrol pump removes the primary facility impact from the operational cascade while increasing access constraints.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["FP01"], "expected_outcome": "A larger controlled perimeter protects the fuel facility response area while road and downstream access impacts remain visible."}'::jsonb,
    '[{"action": "expand_fuel_station_exclusion_zone", "owner": "FIRE", "target": "FP01"}, {"action": "secure_perimeter", "owner": "POLICE", "target": "FP01"}]'::jsonb,
    '[{"asset": "FP01", "impact": "fuel_station_shutdown", "reason": "The facility is fully isolated inside the controlled response zone"}]'::jsonb,
    '{"fuel_facility": "secured", "public_exposure": "reduced", "recommended": true}'::jsonb,
    86.00::numeric(5, 2), '2026-09-14 16:02:00+05:30'::timestamptz
  )
) as petrol_scenarios(external_id, name, scenario_type, status, incident_id, focus_asset_id, description, assumptions, interventions, predicted_impacts, intervention_results, confidence, evaluated_at);
