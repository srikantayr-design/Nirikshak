set search_path = public, extensions;

insert into public.departments (code, name, description, incident_types)
values
  ('FIRE', 'Fire Department', 'Fire suppression, rescue and hazardous incident response.', '["fire", "industrial_accident", "structural_damage"]'::jsonb),
  ('TRAFFIC', 'Traffic Department', 'Traffic control, diversion and emergency corridor management.', '["road_obstruction", "flood", "fire"]'::jsonb),
  ('POLICE', 'Police Department', 'Perimeter control, evacuation support and public safety.', '["fire", "road_obstruction", "industrial_accident"]'::jsonb),
  ('MEDICAL', 'Medical Department', 'Hospital readiness, ambulance coordination and patient continuity.', '["fire", "power_failure", "flood", "structural_damage"]'::jsonb),
  ('ELECTRICITY', 'Electricity Department', 'Grid operations, isolation and electrical infrastructure response.', '["power_failure", "fire"]'::jsonb),
  ('WATER', 'Water Department', 'Water network, pumping and pressure-zone response.', '["water_network", "flood", "power_failure"]'::jsonb),
  ('INFRA', 'Infrastructure Department', 'Structural assessment and critical infrastructure coordination.', '["structural_damage", "flood", "road_obstruction"]'::jsonb)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  incident_types = excluded.incident_types,
  updated_at = now();

insert into public.infrastructure_assets (
  external_id, name, asset_type, status, description, criticality, current_risk, location, metadata
)
values
  ('B-A', 'Building A', 'building', 'at_risk', 'Commercial high-rise in Indiranagar Sector 4; fire origin reported on floor 3.', 'high', 82, ST_SetSRID(ST_MakePoint(77.6412, 12.9718), 4326)::geography, '{"area": "Indiranagar Sector 4", "floors": 8, "frontend_type": "BUILDING"}'::jsonb),
  ('R12', 'Road R12', 'road', 'blocked', 'Primary east-west response corridor near 100 Feet Road; northbound lane is obstructed.', 'high', 71, ST_SetSRID(ST_MakePoint(77.6384, 12.9728), 4326)::geography, '{"corridor": "100 Feet Road East", "frontend_type": "ROAD"}'::jsonb),
  ('H1', 'Hospital H1', 'hospital', 'safe', 'St. Martha Emergency Hospital and ambulance receiving point.', 'critical', 36, ST_SetSRID(ST_MakePoint(77.6358, 12.9761), 4326)::geography, '{"service": "emergency hospital", "frontend_type": "HOSPITAL"}'::jsonb),
  ('F02', 'Fire Station F02', 'fire_station', 'operational', 'East-sector fire station and primary base for the demonstration fire units.', 'high', 44, ST_SetSRID(ST_MakePoint(77.6369, 12.9684), 4326)::geography, '{"coverage": "Indiranagar and Domlur east", "frontend_reference": "F03"}'::jsonb),
  ('P01', 'Police Station P01', 'police_station', 'operational', 'East division police station coordinating traffic control and perimeter management.', 'medium', 28, ST_SetSRID(ST_MakePoint(77.6394, 12.9778), 4326)::geography, '{"division": "East Bengaluru", "frontend_reference": "P02"}'::jsonb),
  ('T4', 'Transformer T4', 'transformer', 'at_risk', '11 kV distribution transformer serving the eastern Bengaluru sector.', 'high', 72, ST_SetSRID(ST_MakePoint(77.6444, 12.9744), 4326)::geography, '{"rated_voltage": "11 kV", "frontend_type": "ELECTRICITY"}'::jsonb),
  ('W2', 'Water Pump W2', 'water_pump', 'monitoring', 'Booster pump supplying the eastern pressure zone.', 'high', 58, ST_SetSRID(ST_MakePoint(77.6448, 12.9683), 4326)::geography, '{"service_zone": "East pressure zone", "frontend_type": "WATER"}'::jsonb),
  ('E01', 'Emergency Centre E01', 'emergency_centre', 'ready', 'Multi-agency emergency coordination centre for east-sector incidents.', 'high', 32, ST_SetSRID(ST_MakePoint(77.6421, 12.9667), 4326)::geography, '{"coordination": "multi-agency", "frontend_reference": "ER1"}'::jsonb),
  ('LOC-A', 'Industrial Zone A', 'monitored_location', 'monitoring', 'High-density industrial monitoring zone near the east response corridor.', 'high', 82, ST_SetSRID(ST_MakePoint(77.6418, 12.9726), 4326)::geography, '{"risk_score": 82, "density": "very_high", "frontend_type": "INDUSTRIAL AREA"}'::jsonb),
  ('LOC-B', 'Commercial District B', 'monitored_location', 'monitoring', 'Dense commercial district with constrained hospital access.', 'medium', 61, ST_SetSRID(ST_MakePoint(77.6375, 12.9760), 4326)::geography, '{"risk_score": 61, "density": "high", "frontend_type": "COMMERCIAL DISTRICT"}'::jsonb),
  ('LOC-C', 'Transport Corridor C', 'monitored_location', 'monitoring', 'High-volume transport corridor with limited alternate emergency routes.', 'high', 75, ST_SetSRID(ST_MakePoint(77.6388, 12.9688), 4326)::geography, '{"risk_score": 75, "density": "high", "frontend_type": "TRANSPORT CORRIDOR"}'::jsonb)
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

insert into public.resources (
  external_id, name, resource_type, status, department_id, base_asset_id, location, metadata
)
values
  (
    'F03', 'Fire Unit F03', 'fire_unit', 'available',
    (select id from public.departments where code = 'FIRE'),
    (select id from public.infrastructure_assets where external_id = 'F02'),
    ST_SetSRID(ST_MakePoint(77.6369, 12.9684), 4326)::geography,
    '{"capabilities": ["urban_fire_suppression", "rescue"], "frontend_status": "AVAILABLE"}'::jsonb
  ),
  (
    'F04', 'Fire Unit F04', 'fire_unit', 'busy',
    (select id from public.departments where code = 'FIRE'),
    (select id from public.infrastructure_assets where external_id = 'F02'),
    ST_SetSRID(ST_MakePoint(77.6372, 12.9687), 4326)::geography,
    '{"capabilities": ["urban_fire_suppression", "water_tanker_support"], "frontend_status": "BUSY"}'::jsonb
  ),
  (
    'A12', 'Ambulance A12', 'ambulance', 'available',
    (select id from public.departments where code = 'MEDICAL'),
    (select id from public.infrastructure_assets where external_id = 'H1'),
    ST_SetSRID(ST_MakePoint(77.6358, 12.9761), 4326)::geography,
    '{"capabilities": ["advanced_life_support", "patient_transport"], "frontend_status": "AVAILABLE"}'::jsonb
  ),
  (
    'T02', 'Traffic Unit T02', 'traffic_unit', 'available',
    (select id from public.departments where code = 'TRAFFIC'),
    (select id from public.infrastructure_assets where external_id = 'P01'),
    ST_SetSRID(ST_MakePoint(77.6394, 12.9778), 4326)::geography,
    '{"capabilities": ["lane_closure", "diversion_control", "recovery_coordination"], "frontend_status": "AVAILABLE"}'::jsonb
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

insert into public.infrastructure_dependencies (
  source_asset_id, target_asset_id, dependency_type, dependency_strength, metadata
)
values
  (
    (select id from public.infrastructure_assets where external_id = 'T4'),
    (select id from public.infrastructure_assets where external_id = 'W2'),
    'power_supply', 0.90, '{"description": "W2 depends on the eastern 11 kV feeder supplied through T4."}'::jsonb
  ),
  (
    (select id from public.infrastructure_assets where external_id = 'W2'),
    (select id from public.infrastructure_assets where external_id = 'H1'),
    'water_service', 0.78, '{"description": "Pump pressure supports hospital water continuity and hydrant readiness."}'::jsonb
  ),
  (
    (select id from public.infrastructure_assets where external_id = 'R12'),
    (select id from public.infrastructure_assets where external_id = 'H1'),
    'emergency_access', 0.86, '{"description": "R12 is a primary ambulance approach to H1."}'::jsonb
  ),
  (
    (select id from public.infrastructure_assets where external_id = 'F02'),
    (select id from public.infrastructure_assets where external_id = 'R12'),
    'response_access', 0.82, '{"description": "F02 dispatches through the R12 east-west corridor."}'::jsonb
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
values
  (
    'INC-2407', 'Building A Fire', 'fire', 'critical', 'active', 'Indiranagar, Sector 4',
    ST_SetSRID(ST_MakePoint(77.6412, 12.9718), 4326)::geography,
    '2026-09-12 14:30:00+05:30', '2026-09-12 14:28:00+05:30', 94,
    'Smoke plume affects a 400 m radius; adjacent structures are exposed and 36 people have been evacuated.',
    'Heat may reach Transformer T4 within 18 minutes and delay ambulance arrivals by 8 to 14 minutes.',
    'Fire blocks Road R12, increasing congestion and degrading emergency access.',
    '["FIRE", "TRAFFIC", "ELECTRICITY", "MEDICAL"]'::jsonb,
    '{"frontend_type": "STRUCTURAL FIRE", "escalation_probability": 78, "affected_external_ids": ["B-A", "R12", "T4", "H1"]}'::jsonb
  ),
  (
    'INC-2406', 'Transformer T4 Overload', 'power_failure', 'high', 'monitoring', 'HAL 2nd Stage',
    ST_SetSRID(ST_MakePoint(77.6444, 12.9744), 4326)::geography,
    '2026-09-12 14:14:00+05:30', '2026-09-12 14:12:00+05:30', 87,
    'T4 is operating above its safe thermal threshold and feeder voltage is fluctuating across the eastern grid.',
    'A protective trip could interrupt water pumping and put hospital backup generation under strain within 22 minutes.',
    'Overload may trip the transformer, disrupt pumps and create a hospital continuity risk.',
    '["ELECTRICITY", "WATER", "MEDICAL"]'::jsonb,
    '{"frontend_type": "POWER GRID", "escalation_probability": 61, "affected_external_ids": ["T4", "W2", "H1"]}'::jsonb
  ),
  (
    'INC-2405', 'R12 Traffic Obstruction', 'road_obstruction', 'high', 'active', '100 Feet Road, East',
    ST_SetSRID(ST_MakePoint(77.6384, 12.9728), 4326)::geography,
    '2026-09-12 14:01:00+05:30', '2026-09-12 13:58:00+05:30', 98,
    'A disabled freight vehicle blocks the northbound lane, causing queues across the east junction and constraining emergency access.',
    'Congestion may spread to three junctions and add 17 minutes to emergency travel times during the next 20 minutes.',
    'Road obstruction diverts traffic, overloads nearby junctions and delays emergency vehicles.',
    '["TRAFFIC", "POLICE", "FIRE", "MEDICAL"]'::jsonb,
    '{"frontend_type": "TRANSPORT", "escalation_probability": 69, "affected_external_ids": ["R12", "H1", "E01"]}'::jsonb
  ),
  (
    'INC-2404', 'Water Main Pressure Drop', 'water_network', 'medium', 'monitoring', 'Domlur Junction',
    ST_SetSRID(ST_MakePoint(77.6448, 12.9683), 4326)::geography,
    '2026-09-12 13:32:00+05:30', '2026-09-12 13:28:00+05:30', 91,
    'A pressure drop in the eastern distribution zone is reducing supply; no contamination is detected.',
    'If the valve fault persists, hospital service connections and hydrants may lose reliable pressure within 45 minutes.',
    'Pressure loss reduces local supply, weakens hydrants and affects public health readiness.',
    '["WATER", "MEDICAL", "FIRE", "INFRA"]'::jsonb,
    '{"frontend_type": "WATER NETWORK", "escalation_probability": 38, "affected_external_ids": ["W2", "H1"]}'::jsonb
  )
on conflict (external_id) do update set
  title = excluded.title,
  incident_type = excluded.incident_type,
  severity = excluded.severity,
  status = excluded.status,
  location_name = excluded.location_name,
  location = excluded.location,
  detected_at = excluded.detected_at,
  started_at = excluded.started_at,
  confidence = excluded.confidence,
  current_impacts = excluded.current_impacts,
  predicted_impacts = excluded.predicted_impacts,
  cascade_summary = excluded.cascade_summary,
  responsible_departments = excluded.responsible_departments,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.incident_impacts (
  incident_id, asset_id, impact_state, impact_type, severity, likelihood, description
)
values
  ((select id from public.incidents where external_id = 'INC-2407'), (select id from public.infrastructure_assets where external_id = 'R12'), 'current', 'blockage_risk', 'high', 96, 'Risk score 71/100. Northbound lane is blocked by the emergency cordon.'),
  ((select id from public.incidents where external_id = 'INC-2407'), (select id from public.infrastructure_assets where external_id = 'T4'), 'predicted', 'thermal_exposure', 'high', 78, 'Risk score 78/100. Heat exposure may reach the transformer boundary within 18 minutes.'),
  ((select id from public.incidents where external_id = 'INC-2407'), (select id from public.infrastructure_assets where external_id = 'H1'), 'predicted', 'response_delay', 'medium', 64, 'Risk score 42/100. Ambulance arrivals may be delayed by 8 to 14 minutes.'),
  ((select id from public.incidents where external_id = 'INC-2406'), (select id from public.infrastructure_assets where external_id = 'T4'), 'current', 'operational_overload', 'high', 94, 'Risk score 87/100. Transformer load is above the safe thermal threshold.'),
  ((select id from public.incidents where external_id = 'INC-2406'), (select id from public.infrastructure_assets where external_id = 'W2'), 'predicted', 'power_supply_loss', 'high', 72, 'Risk score 61/100. A protective trip could stop booster pumping.'),
  ((select id from public.incidents where external_id = 'INC-2406'), (select id from public.infrastructure_assets where external_id = 'H1'), 'predicted', 'backup_power_strain', 'medium', 58, 'Risk score 43/100. Critical care may rely on backup generation if the feeder trips.'),
  ((select id from public.incidents where external_id = 'INC-2405'), (select id from public.infrastructure_assets where external_id = 'R12'), 'current', 'lane_blockage', 'high', 98, 'Risk score 98/100. Disabled freight vehicle blocks the northbound lane.'),
  ((select id from public.incidents where external_id = 'INC-2405'), (select id from public.infrastructure_assets where external_id = 'H1'), 'predicted', 'ambulance_response_delay', 'medium', 68, 'Risk score 45/100. Hospital access remains open but turnaround time is increasing.'),
  ((select id from public.incidents where external_id = 'INC-2405'), (select id from public.infrastructure_assets where external_id = 'E01'), 'predicted', 'coordination_access_impact', 'medium', 52, 'Risk score 38/100. Diversions may constrain access for multi-agency coordination.'),
  ((select id from public.incidents where external_id = 'INC-2404'), (select id from public.infrastructure_assets where external_id = 'W2'), 'current', 'pressure_loss', 'medium', 91, 'Risk score 52/100. Pump compensation is active while the eastern zone pressure remains low.'),
  ((select id from public.incidents where external_id = 'INC-2404'), (select id from public.infrastructure_assets where external_id = 'H1'), 'predicted', 'water_service_risk', 'medium', 48, 'Risk score 36/100. Hospital service connections and hydrants may lose reliable pressure.'),
  ((select id from public.incidents where external_id = 'INC-2404'), (select id from public.infrastructure_assets where external_id = 'R12'), 'predicted', 'hydrant_access_risk', 'low', 35, 'Risk score 28/100. Reduced hydrant pressure may constrain fire response near the corridor.')
on conflict (incident_id, asset_id, impact_state) do update set
  impact_type = excluded.impact_type,
  severity = excluded.severity,
  likelihood = excluded.likelihood,
  description = excluded.description,
  updated_at = now();

insert into public.response_actions (
  incident_id, department_id, resource_id, target_asset_id, action, status, priority, notes, metadata
)
select * from (values
  ((select id from public.incidents where external_id = 'INC-2407'), (select id from public.departments where code = 'FIRE'), (select id from public.resources where external_id = 'F03'), (select id from public.infrastructure_assets where external_id = 'B-A'), 'Dispatch Fire Unit F03 to Building A', 'approved', 'critical', 'Use the F02 base and protect the east approach.', '{"demo_key": "INC-2407-dispatch-f03"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2407'), (select id from public.departments where code = 'TRAFFIC'), null, (select id from public.infrastructure_assets where external_id = 'R12'), 'Prepare traffic diversion around Road R12', 'recommended', 'high', 'Keep an emergency corridor open toward Hospital H1.', '{"demo_key": "INC-2407-diversion-r12"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2407'), (select id from public.departments where code = 'ELECTRICITY'), null, (select id from public.infrastructure_assets where external_id = 'T4'), 'Inspect Transformer T4 for heat exposure', 'recommended', 'high', 'Pre-isolate only if thermal readings continue to rise.', '{"demo_key": "INC-2407-inspect-t4"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2407'), (select id from public.departments where code = 'MEDICAL'), (select id from public.resources where external_id = 'A12'), (select id from public.infrastructure_assets where external_id = 'H1'), 'Alert Hospital H1 and stage Ambulance A12', 'approved', 'high', 'Confirm ambulance receiving capacity and alternate approach.', '{"demo_key": "INC-2407-alert-h1"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2406'), (select id from public.departments where code = 'ELECTRICITY'), null, (select id from public.infrastructure_assets where external_id = 'T4'), 'Dispatch an electricity inspection crew to T4', 'recommended', 'high', 'No dedicated electricity resource is in this compact demo dataset.', '{"demo_key": "INC-2406-dispatch-electricity"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2406'), (select id from public.departments where code = 'ELECTRICITY'), null, (select id from public.infrastructure_assets where external_id = 'T4'), 'Inspect T4 thermal load and prepare feeder transfer', 'approved', 'high', 'Protect hospital and water-pump continuity before isolation.', '{"demo_key": "INC-2406-inspect-t4"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2406'), (select id from public.departments where code = 'WATER'), null, (select id from public.infrastructure_assets where external_id = 'W2'), 'Prepare backup power and operating plan for W2', 'recommended', 'high', 'Maintain eastern pressure-zone service if T4 trips.', '{"demo_key": "INC-2406-prepare-w2"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2405'), (select id from public.departments where code = 'TRAFFIC'), (select id from public.resources where external_id = 'T02'), (select id from public.infrastructure_assets where external_id = 'R12'), 'Dispatch Traffic Unit T02 to Road R12', 'approved', 'high', 'Coordinate lane recovery with Police Department.', '{"demo_key": "INC-2405-dispatch-t02"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2405'), (select id from public.departments where code = 'TRAFFIC'), null, (select id from public.infrastructure_assets where external_id = 'R12'), 'Close the affected northbound lane', 'in_progress', 'high', 'Place barriers and preserve a protected emergency lane.', '{"demo_key": "INC-2405-close-lane"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2405'), (select id from public.departments where code = 'POLICE'), null, (select id from public.infrastructure_assets where external_id = 'R12'), 'Divert emergency traffic around the obstruction', 'recommended', 'high', 'Use the P01 side of the corridor for controlled diversion.', '{"demo_key": "INC-2405-divert-traffic"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2404'), (select id from public.departments where code = 'WATER'), null, (select id from public.infrastructure_assets where external_id = 'W2'), 'Inspect Water Pump W2 and the eastern pressure zone', 'approved', 'high', 'Check the M7 valve and pump inlet pressure.', '{"demo_key": "INC-2404-inspect-w2"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2404'), (select id from public.departments where code = 'MEDICAL'), (select id from public.resources where external_id = 'A12'), (select id from public.infrastructure_assets where external_id = 'H1'), 'Alert Hospital H1 about potential water-service reduction', 'recommended', 'medium', 'Verify stored water and hydrant readiness.', '{"demo_key": "INC-2404-alert-h1"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2404'), (select id from public.departments where code = 'WATER'), null, (select id from public.infrastructure_assets where external_id = 'W2'), 'Dispatch a water maintenance team to the pump zone', 'recommended', 'medium', 'Use the next available civic maintenance crew.', '{"demo_key": "INC-2404-dispatch-water"}'::jsonb)
) as demo_actions(incident_id, department_id, resource_id, target_asset_id, action, status, priority, notes, metadata)
where not exists (
  select 1 from public.response_actions existing
  where existing.metadata ->> 'demo_key' = demo_actions.metadata ->> 'demo_key'
);

insert into public.routes (
  external_id, incident_id, resource_id, origin_asset_id, destination_asset_id,
  origin, destination, distance_meters, eta_seconds, blockage_probability,
  hazard_score, congestion_score, route_risk, recommended, route_rank, route_geometry, route_metadata
)
select * from (values
  (
    'ROUTE-2407-F03',
    (select id from public.incidents where external_id = 'INC-2407'),
    (select id from public.resources where external_id = 'F03'),
    (select id from public.infrastructure_assets where external_id = 'F02'),
    (select id from public.infrastructure_assets where external_id = 'B-A'),
    ST_SetSRID(ST_MakePoint(77.6369, 12.9684), 4326)::geography,
    ST_SetSRID(ST_MakePoint(77.6412, 12.9718), 4326)::geography,
    4800, 420, 12, 28, 38, 'medium', true, 1, null::geography,
    '{"label": "Route B", "source": "frontend_demo_metadata", "geometry_pending": true, "reason": "Avoids the highest blockage exposure on R12."}'::jsonb
  ),
  (
    'ROUTE-2405-T02',
    (select id from public.incidents where external_id = 'INC-2405'),
    (select id from public.resources where external_id = 'T02'),
    (select id from public.infrastructure_assets where external_id = 'P01'),
    (select id from public.infrastructure_assets where external_id = 'R12'),
    ST_SetSRID(ST_MakePoint(77.6394, 12.9778), 4326)::geography,
    ST_SetSRID(ST_MakePoint(77.6384, 12.9728), 4326)::geography,
    2700, 360, 54, 32, 78, 'high', true, 1, null::geography,
    '{"label": "East Junction Approach", "source": "frontend_demo_metadata", "geometry_pending": true, "reason": "Uses the police-station side of the corridor."}'::jsonb
  )
) as demo_routes(external_id, incident_id, resource_id, origin_asset_id, destination_asset_id, origin, destination, distance_meters, eta_seconds, blockage_probability, hazard_score, congestion_score, route_risk, recommended, route_rank, route_geometry, route_metadata)
where not exists (
  select 1 from public.routes existing where existing.external_id = demo_routes.external_id
);

insert into public.scenarios (
  external_id, name, scenario_type, status, incident_id, focus_asset_id, description,
  assumptions, interventions, predicted_impacts, intervention_results, confidence, evaluated_at
)
select * from (values
  (
    'SCN-CLOSE-R12',
    'Close Road R12',
    'what_if',
    'completed',
    (select id from public.incidents where external_id = 'INC-2405'),
    (select id from public.infrastructure_assets where external_id = 'R12'),
    'Assess emergency access and hospital response if R12 is fully closed for recovery operations.',
    '{"closure_duration_minutes": 30, "baseline_congestion_percent": 42, "hospital_access_required": true, "alternate_route_available": true}'::jsonb,
    '[{"action": "close_northbound_lane", "owner": "TRAFFIC"}, {"action": "divert_emergency_traffic", "owner": "POLICE"}, {"action": "protect_hospital_approach", "owner": "MEDICAL"}]'::jsonb,
    '[{"asset": "H1", "impact": "ambulance_response_delay", "risk_score": 58, "probability": 72}, {"asset": "E01", "impact": "coordination_access_impact", "risk_score": 44, "probability": 55}]'::jsonb,
    '{"traffic_delay_minutes": 9, "emergency_corridor_preserved": true, "recommended": true, "result_summary": "Full closure is operationally acceptable when the diversion and emergency corridor are staffed."}'::jsonb,
    81,
    '2026-09-12 14:12:00+05:30'::timestamptz
  ),
  (
    'SCN-ISOLATE-T4',
    'Isolate Transformer T4',
    'what_if',
    'completed',
    (select id from public.incidents where external_id = 'INC-2406'),
    (select id from public.infrastructure_assets where external_id = 'T4'),
    'Assess the consequence of isolating T4 to prevent thermal damage during the overload event.',
    '{"isolation_duration_minutes": 45, "current_load_percent": 112, "water_pump_backup_available": true, "hospital_generator_fuel_hours": 6}'::jsonb,
    '[{"action": "isolate_transformer", "owner": "ELECTRICITY"}, {"action": "start_pump_backup", "owner": "WATER"}, {"action": "verify_hospital_generator", "owner": "MEDICAL"}]'::jsonb,
    '[{"asset": "W2", "impact": "pressure_zone_reduction", "risk_score": 61, "probability": 64}, {"asset": "H1", "impact": "backup_power_strain", "risk_score": 49, "probability": 51}]'::jsonb,
    '{"transformer_damage_avoided": true, "water_service_continuity": "maintained_with_backup", "hospital_continuity": "maintained", "recommended": true, "result_summary": "Isolation is preferred if W2 backup power and H1 generator checks complete first."}'::jsonb,
    84,
    '2026-09-12 14:20:00+05:30'::timestamptz
  )
) as demo_scenarios(external_id, name, scenario_type, status, incident_id, focus_asset_id, description, assumptions, interventions, predicted_impacts, intervention_results, confidence, evaluated_at)
where not exists (
  select 1 from public.scenarios existing where existing.external_id = demo_scenarios.external_id
);
