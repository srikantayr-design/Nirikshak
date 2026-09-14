set search_path = public, extensions;

insert into public.resources (
  external_id, name, resource_type, status, department_id, base_asset_id, location, metadata
)
values (
  'R21', 'Structural Rescue Team R21', 'rescue_team', 'available',
  (select id from public.departments where code = 'INFRA'),
  (select id from public.infrastructure_assets where external_id = 'E01'),
  ST_SetSRID(ST_MakePoint(77.6421, 12.9667), 4326)::geography,
  '{"capabilities": ["structural_search_and_rescue", "debris_clearance"], "frontend_status": "AVAILABLE"}'::jsonb
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
    (select id from public.infrastructure_assets where external_id = 'B-A'),
    (select id from public.infrastructure_assets where external_id = 'R12'),
    'emergency_access', 0.88, '{"description": "A damaged or hazardous Building A can constrain the adjacent east response corridor."}'::jsonb
  ),
  (
    (select id from public.infrastructure_assets where external_id = 'B-A'),
    (select id from public.infrastructure_assets where external_id = 'T4'),
    'hazard_exposure', 0.72, '{"description": "Building A incidents can expose the nearby electrical feeder to heat, debris or hazardous vapour."}'::jsonb
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
    'INC-2403', 'Building Structural Collapse', 'structural_damage', 'critical', 'active', 'Indiranagar, Sector 4',
    ST_SetSRID(ST_MakePoint(77.6412, 12.9718), 4326)::geography,
    '2026-09-12 13:48:00+05:30', '2026-09-12 13:46:00+05:30', 96,
    'A section of Building A has collapsed, creating a debris field and restricting the adjacent response corridor.',
    'Further movement could extend debris onto Road R12, expose Transformer T4 and delay access to Hospital H1.',
    'Structural debris constrains emergency access and can propagate risk to nearby utilities and medical access.',
    '["INFRA", "FIRE", "TRAFFIC", "MEDICAL"]'::jsonb,
    '{"frontend_type": "STRUCTURAL COLLAPSE", "escalation_probability": 84, "affected_external_ids": ["B-A", "R12", "T4", "H1"]}'::jsonb
  ),
  (
    'INC-2402', 'Gas Leak', 'industrial_accident', 'high', 'active', 'Indiranagar, Sector 4',
    ST_SetSRID(ST_MakePoint(77.6412, 12.9718), 4326)::geography,
    '2026-09-12 13:40:00+05:30', '2026-09-12 13:38:00+05:30', 93,
    'A gas leak has created a hazardous exclusion zone around Building A; ignition sources and public access are being controlled.',
    'Uncontained vapour could force a wider Road R12 closure, threaten nearby electrical equipment and increase hospital readiness demand.',
    'A hazardous gas release expands the exclusion zone, constrains access and creates a utility and medical preparedness risk.',
    '["FIRE", "POLICE", "TRAFFIC", "MEDICAL", "INFRA"]'::jsonb,
    '{"frontend_type": "INDUSTRIAL ACCIDENT", "escalation_probability": 73, "affected_external_ids": ["B-A", "R12", "T4", "H1"]}'::jsonb
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
select * from (values
  ((select id from public.incidents where external_id = 'INC-2403'), (select id from public.infrastructure_assets where external_id = 'B-A'), 'current', 'structural_failure', 'critical', 96, 'Building A has a collapsed section and requires structural search and rescue.'),
  ((select id from public.incidents where external_id = 'INC-2403'), (select id from public.infrastructure_assets where external_id = 'R12'), 'current', 'debris_blockage', 'high', 84, 'Debris and the exclusion zone constrain the adjacent Road R12 response corridor.'),
  ((select id from public.incidents where external_id = 'INC-2403'), (select id from public.infrastructure_assets where external_id = 'T4'), 'predicted', 'debris_utility_exposure', 'high', 62, 'Further structural movement may expose Transformer T4 to debris and isolation risk.'),
  ((select id from public.incidents where external_id = 'INC-2403'), (select id from public.infrastructure_assets where external_id = 'H1'), 'predicted', 'rescue_access_delay', 'medium', 58, 'Restricted access may delay ambulance movements to Hospital H1.'),
  ((select id from public.incidents where external_id = 'INC-2402'), (select id from public.infrastructure_assets where external_id = 'B-A'), 'current', 'hazardous_release', 'high', 93, 'Gas vapour is present around Building A and requires an ignition-controlled exclusion zone.'),
  ((select id from public.incidents where external_id = 'INC-2402'), (select id from public.infrastructure_assets where external_id = 'R12'), 'current', 'hazard_access_closure', 'high', 78, 'Road R12 access is constrained while the gas exclusion zone is established.'),
  ((select id from public.incidents where external_id = 'INC-2402'), (select id from public.infrastructure_assets where external_id = 'T4'), 'predicted', 'ignition_exposure', 'high', 61, 'Uncontained vapour could expose nearby electrical equipment to ignition risk.'),
  ((select id from public.incidents where external_id = 'INC-2402'), (select id from public.infrastructure_assets where external_id = 'H1'), 'predicted', 'medical_readiness_demand', 'medium', 55, 'A wider exclusion zone may increase hospital preparedness and ambulance coordination demand.')
) as new_impacts(incident_id, asset_id, impact_state, impact_type, severity, likelihood, description)
where not exists (
  select 1 from public.incident_impacts existing
  where existing.incident_id = new_impacts.incident_id
    and existing.asset_id = new_impacts.asset_id
    and existing.impact_state = new_impacts.impact_state
);

insert into public.response_actions (
  incident_id, department_id, resource_id, target_asset_id, action, status, priority, notes, metadata
)
select * from (values
  ((select id from public.incidents where external_id = 'INC-2403'), (select id from public.departments where code = 'INFRA'), (select id from public.resources where external_id = 'R21'), (select id from public.infrastructure_assets where external_id = 'B-A'), 'Dispatch Structural Rescue Team R21 to Building A', 'approved', 'critical', 'Establish a safe search grid before debris entry.', '{"demo_key": "INC-2403-dispatch-r21"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2403'), (select id from public.departments where code = 'TRAFFIC'), null, (select id from public.infrastructure_assets where external_id = 'R12'), 'Secure and divert traffic from the debris corridor', 'recommended', 'high', 'Keep a protected rescue approach toward Building A.', '{"demo_key": "INC-2403-secure-r12"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2403'), (select id from public.departments where code = 'FIRE'), (select id from public.resources where external_id = 'F03'), (select id from public.infrastructure_assets where external_id = 'B-A'), 'Stage fire rescue support at the collapse perimeter', 'recommended', 'high', 'Coordinate victim search and utility isolation with Infrastructure.', '{"demo_key": "INC-2403-fire-support"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2402'), (select id from public.departments where code = 'FIRE'), (select id from public.resources where external_id = 'F03'), (select id from public.infrastructure_assets where external_id = 'B-A'), 'Dispatch hazardous-material response to contain the gas leak', 'approved', 'critical', 'Use ignition-safe equipment and establish a hot zone.', '{"demo_key": "INC-2402-dispatch-fire"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2402'), (select id from public.departments where code = 'POLICE'), null, (select id from public.infrastructure_assets where external_id = 'R12'), 'Establish a public exclusion zone around the leak', 'in_progress', 'high', 'Prevent entry and coordinate controlled evacuation.', '{"demo_key": "INC-2402-exclusion-zone"}'::jsonb),
  ((select id from public.incidents where external_id = 'INC-2402'), (select id from public.departments where code = 'MEDICAL'), (select id from public.resources where external_id = 'A12'), (select id from public.infrastructure_assets where external_id = 'H1'), 'Alert Hospital H1 for potential inhalation exposure', 'recommended', 'high', 'Confirm ambulance receiving capacity and decontamination readiness.', '{"demo_key": "INC-2402-alert-h1"}'::jsonb)
) as new_actions(incident_id, department_id, resource_id, target_asset_id, action, status, priority, notes, metadata)
where not exists (
  select 1 from public.response_actions existing
  where existing.metadata ->> 'demo_key' = new_actions.metadata ->> 'demo_key'
);

insert into public.routes (
  external_id, incident_id, resource_id, origin_asset_id, destination_asset_id,
  origin, destination, distance_meters, eta_seconds, blockage_probability,
  hazard_score, congestion_score, route_risk, recommended, route_rank, route_geometry, route_metadata
)
select * from (values
  (
    'ROUTE-2403-R21',
    (select id from public.incidents where external_id = 'INC-2403'),
    (select id from public.resources where external_id = 'R21'),
    (select id from public.infrastructure_assets where external_id = 'E01'),
    (select id from public.infrastructure_assets where external_id = 'B-A'),
    ST_SetSRID(ST_MakePoint(77.6421, 12.9667), 4326)::geography,
    ST_SetSRID(ST_MakePoint(77.6412, 12.9718), 4326)::geography,
    3500, 540, 34, 58, 42, 'high', true, 1, null::geography,
    '{"label": "Rescue access route", "source": "backend_demo_metadata", "reason": "Approaches Building A from the emergency centre while avoiding the primary debris corridor where possible."}'::jsonb
  ),
  (
    'ROUTE-2402-F03',
    (select id from public.incidents where external_id = 'INC-2402'),
    (select id from public.resources where external_id = 'F03'),
    (select id from public.infrastructure_assets where external_id = 'F02'),
    (select id from public.infrastructure_assets where external_id = 'B-A'),
    ST_SetSRID(ST_MakePoint(77.6369, 12.9684), 4326)::geography,
    ST_SetSRID(ST_MakePoint(77.6412, 12.9718), 4326)::geography,
    4800, 480, 48, 72, 44, 'high', true, 1, null::geography,
    '{"label": "Hazmat response route", "source": "backend_demo_metadata", "reason": "Keeps the response unit on the east approach while the gas exclusion zone is active."}'::jsonb
  )
) as new_routes(external_id, incident_id, resource_id, origin_asset_id, destination_asset_id, origin, destination, distance_meters, eta_seconds, blockage_probability, hazard_score, congestion_score, route_risk, recommended, route_rank, route_geometry, route_metadata)
where not exists (
  select 1 from public.routes existing where existing.external_id = new_routes.external_id
);

insert into public.scenarios (
  external_id, name, scenario_type, status, incident_id, focus_asset_id, description,
  assumptions, interventions, predicted_impacts, intervention_results, confidence, evaluated_at
)
select * from (values
  (
    'SCN-COLLAPSE-SECURE-BUILDING', 'Stabilize Building A before rescue entry', 'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2403'), (select id from public.infrastructure_assets where external_id = 'B-A'),
    'Test whether structural stabilization removes the primary collapse impact before search and rescue teams enter the building.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["B-A"], "expected_outcome": "Stabilization reduces the direct structural failure risk while corridor and downstream access impacts remain visible."}'::jsonb,
    '[{"action": "stabilize_building_a", "owner": "INFRA", "target": "B-A"}, {"action": "clear_safe_search_grid", "owner": "FIRE", "target": "B-A"}]'::jsonb,
    '[{"asset": "B-A", "impact": "structural_failure", "reason": "Stabilization makes the primary structure safe for controlled entry"}]'::jsonb,
    '{"rescue_entry": "approved_after_stabilization", "collapse_risk": "reduced", "recommended": true}'::jsonb,
    90.00::numeric(5, 2), '2026-09-14 13:00:00+05:30'::timestamptz
  ),
  (
    'SCN-COLLAPSE-CLEAR-R12', 'Clear debris from Road R12', 'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2403'), (select id from public.infrastructure_assets where external_id = 'R12'),
    'Test whether a dedicated debris-clearance operation restores the rescue and hospital approach without changing the building condition.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["R12"], "expected_outcome": "Clearing R12 improves emergency access while the unstable building and utility exposure remain active risks."}'::jsonb,
    '[{"action": "clear_debris_from_r12", "owner": "INFRA", "target": "R12"}, {"action": "protect_emergency_corridor", "owner": "TRAFFIC", "target": "R12"}]'::jsonb,
    '[{"asset": "R12", "impact": "debris_blockage", "reason": "Debris clearance restores the response corridor"}]'::jsonb,
    '{"rescue_access": "improved", "hospital_access": "improved", "building_stability": "still_under_assessment", "recommended": true}'::jsonb,
    87.00::numeric(5, 2), '2026-09-14 13:01:00+05:30'::timestamptz
  ),
  (
    'SCN-COLLAPSE-ISOLATE-T4', 'Isolate Transformer T4 near the collapse zone', 'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2403'), (select id from public.infrastructure_assets where external_id = 'T4'),
    'Test whether isolating the nearby transformer removes the predicted utility exposure while rescue operations continue.',
    '{"simulation_effect": "isolate", "isolation_duration_minutes": 30, "expected_outcome": "Isolation removes the transformer exposure but introduces an electrical service interruption that must be managed by downstream teams."}'::jsonb,
    '[{"action": "isolate_transformer_t4", "owner": "ELECTRICITY", "target": "T4"}, {"action": "verify_hospital_generator", "owner": "MEDICAL", "target": "H1"}]'::jsonb,
    '[{"asset": "T4", "impact": "debris_utility_exposure", "reason": "Isolation removes live equipment exposure during debris operations"}]'::jsonb,
    '{"utility_exposure": "removed", "power_continuity": "requires_backup", "recommended": true}'::jsonb,
    83.00::numeric(5, 2), '2026-09-14 13:02:00+05:30'::timestamptz
  ),
  (
    'SCN-GAS-CONTAIN-BUILDING', 'Contain the Gas Leak at Building A', 'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2402'), (select id from public.infrastructure_assets where external_id = 'B-A'),
    'Test whether hazardous-material crews can contain the leak at Building A and reduce the primary vapour release.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["B-A"], "expected_outcome": "Source containment reduces the vapour hazard while access restrictions and hospital readiness remain visible."}'::jsonb,
    '[{"action": "isolate_gas_source", "owner": "FIRE", "target": "B-A"}, {"action": "monitor_atmosphere", "owner": "INFRA", "target": "B-A"}]'::jsonb,
    '[{"asset": "B-A", "impact": "hazardous_release", "reason": "Source isolation removes the active vapour release"}]'::jsonb,
    '{"gas_release": "contained", "ignition_risk": "reduced", "recommended": true}'::jsonb,
    91.00::numeric(5, 2), '2026-09-14 13:03:00+05:30'::timestamptz
  ),
  (
    'SCN-GAS-CLOSE-R12', 'Close Road R12 for gas dispersion control', 'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2402'), (select id from public.infrastructure_assets where external_id = 'R12'),
    'Test whether a controlled Road R12 closure improves public safety while the gas plume is assessed.',
    '{"simulation_effect": "close", "closure_duration_minutes": 25, "hospital_access_required": true, "alternate_route_available": true, "expected_outcome": "Closure increases travel friction but protects the public exclusion zone and preserves a managed emergency approach."}'::jsonb,
    '[{"action": "close_r12_for_gas_control", "owner": "TRAFFIC", "target": "R12"}, {"action": "divert_public_traffic", "owner": "POLICE", "target": "R12"}]'::jsonb,
    '[{"asset": "R12", "impact": "hazard_access_closure", "reason": "The controlled closure makes the exclusion boundary explicit"}]'::jsonb,
    '{"public_exposure": "reduced", "hospital_corridor": "managed_diversion", "recommended": true}'::jsonb,
    85.00::numeric(5, 2), '2026-09-14 13:04:00+05:30'::timestamptz
  ),
  (
    'SCN-GAS-PROTECT-H1', 'Protect Hospital H1 from gas exposure', 'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2402'), (select id from public.infrastructure_assets where external_id = 'H1'),
    'Test whether hospital readiness and a protected ambulance approach remove the predicted medical preparedness impact.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["H1"], "expected_outcome": "Hospital protection reduces medical readiness risk while the gas source and public exclusion zone remain active concerns."}'::jsonb,
    '[{"action": "activate_hospital_gas_protocol", "owner": "MEDICAL", "target": "H1"}, {"action": "stage_ambulance_a12", "owner": "MEDICAL", "resource": "A12", "target": "H1"}]'::jsonb,
    '[{"asset": "H1", "impact": "medical_readiness_demand", "reason": "Hospital readiness protects the receiving point from the predicted response impact"}]'::jsonb,
    '{"hospital_readiness": "protected", "ambulance_access": "staged", "gas_source": "still_under_control", "recommended": true}'::jsonb,
    88.00::numeric(5, 2), '2026-09-14 13:05:00+05:30'::timestamptz
  )
) as new_scenarios(external_id, name, scenario_type, status, incident_id, focus_asset_id, description, assumptions, interventions, predicted_impacts, intervention_results, confidence, evaluated_at)
where new_scenarios.incident_id is not null
  and new_scenarios.focus_asset_id is not null
  and not exists (
    select 1 from public.scenarios existing where existing.external_id = new_scenarios.external_id
  );

create unique index if not exists scenarios_external_id_unique_idx
on public.scenarios (external_id)
where external_id is not null;
