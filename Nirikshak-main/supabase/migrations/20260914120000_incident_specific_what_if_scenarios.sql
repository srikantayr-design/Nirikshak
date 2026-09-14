set search_path = public, extensions;

-- Keep the demo scenario catalog deterministic: exactly three What-if actions per incident.
delete from public.scenarios
where incident_id in (
  select id from public.incidents
  where external_id in ('INC-2407', 'INC-2406', 'INC-2405', 'INC-2404')
);

insert into public.scenarios (
  external_id, name, scenario_type, status, incident_id, focus_asset_id, description,
  assumptions, interventions, predicted_impacts, intervention_results, confidence, evaluated_at
)
select * from (values
  (
    'SCN-FIRE-DISPATCH-F03',
    'Dispatch Fire Unit F03 to contain Building A',
    'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2407'),
    (select id from public.infrastructure_assets where external_id = 'B-A'),
    'Test whether committing the available fire unit to Building A limits heat exposure to the connected transformer and keeps hospital access manageable.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["T4", "H1"], "expected_outcome": "Suppressing the fire is expected to remove the predicted heat and ambulance-delay impacts while the existing R12 blockage remains."}'::jsonb,
    '[{"action": "dispatch_fire_unit_f03", "owner": "FIRE", "resource": "F03", "target": "B-A"}]'::jsonb,
    '[{"asset": "T4", "impact": "thermal_exposure", "reason": "Fire suppression limits heat spread toward T4"}, {"asset": "H1", "impact": "response_delay", "reason": "Earlier containment limits ambulance delay"}]'::jsonb,
    '{"fire_containment": "improved", "transformer_exposure": "removed_from_simulation", "hospital_access": "maintained_with_existing_road_constraint", "recommended": true}'::jsonb,
    86.00::numeric(5, 2), '2026-09-14 12:00:00+05:30'::timestamptz
  ),
  (
    'SCN-FIRE-SHIELD-T4',
    'Establish a thermal watch around Transformer T4',
    'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2407'),
    (select id from public.infrastructure_assets where external_id = 'T4'),
    'Test a dedicated electricity response that protects the nearby transformer from the fire without isolating the live feeder.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["T4"], "expected_outcome": "A thermal watch is expected to remove T4 from the fire cascade while preserving its current service state."}'::jsonb,
    '[{"action": "establish_transformer_thermal_watch", "owner": "ELECTRICITY", "target": "T4"}, {"action": "keep_feeder_live_pending_readings", "owner": "ELECTRICITY"}]'::jsonb,
    '[{"asset": "T4", "impact": "thermal_exposure", "reason": "Continuous monitoring protects the transformer boundary"}]'::jsonb,
    '{"transformer_service": "maintained", "thermal_exposure": "reduced", "recommended": true}'::jsonb,
    82.00::numeric(5, 2), '2026-09-14 12:01:00+05:30'::timestamptz
  ),
  (
    'SCN-FIRE-PROTECT-HOSPITAL-CORRIDOR',
    'Reserve an emergency corridor to Hospital H1',
    'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2407'),
    (select id from public.infrastructure_assets where external_id = 'R12'),
    'Test whether traffic control can clear the fire cordon route so ambulances can reach Hospital H1 during the Building A response.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["R12"], "expected_outcome": "A protected emergency corridor is expected to clear the simulated R12 access impact and shorten the recommended response route."}'::jsonb,
    '[{"action": "reserve_hospital_emergency_corridor", "owner": "TRAFFIC", "target": "R12"}, {"action": "stage_ambulance_a12_at_h1", "owner": "MEDICAL", "resource": "A12", "target": "H1"}]'::jsonb,
    '[{"asset": "R12", "impact": "blockage_risk", "reason": "Traffic control preserves an emergency lane"}]'::jsonb,
    '{"ambulance_access": "improved", "fire_cordon": "maintained", "recommended": true}'::jsonb,
    89.00::numeric(5, 2), '2026-09-14 12:02:00+05:30'::timestamptz
  ),
  (
    'SCN-ISOLATE-T4',
    'Isolate Transformer T4',
    'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2406'),
    (select id from public.infrastructure_assets where external_id = 'T4'),
    'Assess the consequence of isolating T4 to prevent thermal damage during the overload event.',
    '{"simulation_effect": "isolate", "isolation_duration_minutes": 45, "current_load_percent": 112, "water_pump_backup_available": true, "hospital_generator_fuel_hours": 6, "expected_outcome": "Isolation avoids transformer damage but increases pressure on water-pump and hospital continuity dependencies."}'::jsonb,
    '[{"action": "isolate_transformer", "owner": "ELECTRICITY", "target": "T4"}, {"action": "start_pump_backup", "owner": "WATER", "target": "W2"}, {"action": "verify_hospital_generator", "owner": "MEDICAL", "target": "H1"}]'::jsonb,
    '[{"asset": "W2", "impact": "pressure_zone_reduction", "risk_score": 61, "probability": 64}, {"asset": "H1", "impact": "backup_power_strain", "risk_score": 49, "probability": 51}]'::jsonb,
    '{"transformer_damage_avoided": true, "water_service_continuity": "maintained_with_backup", "hospital_continuity": "maintained", "recommended": true}'::jsonb,
    84.00::numeric(5, 2), '2026-09-14 12:03:00+05:30'::timestamptz
  ),
  (
    'SCN-GRID-TRANSFER-T4',
    'Transfer T4 load to the adjacent feeder',
    'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2406'),
    (select id from public.infrastructure_assets where external_id = 'T4'),
    'Test a controlled load transfer before T4 reaches a protective-trip condition.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["T4"], "expected_outcome": "Moving load away from T4 is expected to remove the overload cascade while preserving downstream water and hospital services."}'::jsonb,
    '[{"action": "transfer_eastern_feeder_load", "owner": "ELECTRICITY", "target": "T4"}, {"action": "verify_feeder_stability", "owner": "ELECTRICITY"}]'::jsonb,
    '[{"asset": "T4", "impact": "operational_overload", "reason": "Load transfer removes the active overload condition"}]'::jsonb,
    '{"transformer_overload": "reduced", "water_pumping": "protected", "hospital_continuity": "protected", "recommended": true}'::jsonb,
    88.00::numeric(5, 2), '2026-09-14 12:04:00+05:30'::timestamptz
  ),
  (
    'SCN-GRID-GENERATOR-H1',
    'Start Hospital H1 generator readiness protocol',
    'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2406'),
    (select id from public.infrastructure_assets where external_id = 'H1'),
    'Test whether preparing hospital backup generation limits the medical consequence of a T4 feeder trip.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["H1"], "expected_outcome": "Generator readiness is expected to remove the hospital continuity impact while the electrical and water risks remain visible."}'::jsonb,
    '[{"action": "start_hospital_generator_readiness", "owner": "MEDICAL", "target": "H1"}, {"action": "confirm_six_hour_fuel_reserve", "owner": "MEDICAL", "target": "H1"}]'::jsonb,
    '[{"asset": "H1", "impact": "backup_power_strain", "reason": "Generator readiness protects critical care continuity"}]'::jsonb,
    '{"hospital_continuity": "protected", "water_pump_risk": "still_present", "recommended": true}'::jsonb,
    85.00::numeric(5, 2), '2026-09-14 12:06:00+05:30'::timestamptz
  ),
  (
    'SCN-CLOSE-R12',
    'Close Road R12 for recovery operations',
    'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2405'),
    (select id from public.infrastructure_assets where external_id = 'R12'),
    'Assess emergency access and hospital response if R12 is fully closed while the disabled freight vehicle is recovered.',
    '{"simulation_effect": "close", "closure_duration_minutes": 30, "hospital_access_required": true, "alternate_route_available": true, "expected_outcome": "Full closure worsens travel access, but a staffed diversion keeps an emergency corridor available."}'::jsonb,
    '[{"action": "close_r12_for_freight_recovery", "owner": "TRAFFIC", "target": "R12"}, {"action": "divert_emergency_traffic", "owner": "POLICE", "target": "R12"}]'::jsonb,
    '[{"asset": "H1", "impact": "ambulance_response_delay", "risk_score": 58, "probability": 72}, {"asset": "E01", "impact": "coordination_access_impact", "risk_score": 44, "probability": 55}]'::jsonb,
    '{"traffic_delay_minutes": 9, "emergency_corridor_preserved": true, "recommended": true}'::jsonb,
    81.00::numeric(5, 2), '2026-09-14 12:07:00+05:30'::timestamptz
  ),
  (
    'SCN-R12-RECOVER-FREIGHT',
    'Dispatch Traffic Unit T02 to recover the freight vehicle',
    'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2405'),
    (select id from public.infrastructure_assets where external_id = 'R12'),
    'Test whether deploying the available traffic unit to the obstruction restores the blocked lane without a full road closure.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["R12"], "expected_outcome": "Freight recovery is expected to remove the active R12 blockage and improve fire-station and hospital access."}'::jsonb,
    '[{"action": "dispatch_traffic_unit_t02_for_freight_recovery", "owner": "TRAFFIC", "resource": "T02", "target": "R12"}, {"action": "coordinate_recovery_with_police", "owner": "POLICE", "target": "R12"}]'::jsonb,
    '[{"asset": "R12", "impact": "lane_blockage", "reason": "Recovery clears the disabled freight vehicle"}]'::jsonb,
    '{"lane_status": "restored", "fire_station_access": "improved", "hospital_access": "improved", "recommended": true}'::jsonb,
    90.00::numeric(5, 2), '2026-09-14 12:08:00+05:30'::timestamptz
  ),
  (
    'SCN-R12-POLICE-INTERSECTION',
    'Activate police control at the East Junction',
    'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2405'),
    (select id from public.infrastructure_assets where external_id = 'E01'),
    'Test whether police-managed signal control protects Emergency Centre E01 access while the R12 obstruction is cleared.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["E01"], "expected_outcome": "Manual junction control is expected to remove the coordination-centre access impact without claiming that R12 itself is clear."}'::jsonb,
    '[{"action": "activate_police_intersection_control", "owner": "POLICE", "target": "E01"}, {"action": "prioritize_emergency_movements", "owner": "TRAFFIC", "target": "E01"}]'::jsonb,
    '[{"asset": "E01", "impact": "coordination_access_impact", "reason": "Manual control protects emergency-centre access"}]'::jsonb,
    '{"coordination_access": "protected", "road_obstruction": "still_present", "recommended": true}'::jsonb,
    84.00::numeric(5, 2), '2026-09-14 12:10:00+05:30'::timestamptz
  ),
  (
    'SCN-WATER-REPAIR-W2',
    'Dispatch a water maintenance team to Pump W2',
    'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2404'),
    (select id from public.infrastructure_assets where external_id = 'W2'),
    'Test whether repairing the pump-zone fault restores pressure before the hospital connection and hydrant readiness degrade.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["W2"], "expected_outcome": "Maintenance at W2 is expected to remove the active pressure-loss impact and stabilize the connected water service."}'::jsonb,
    '[{"action": "dispatch_water_maintenance_team_to_w2", "owner": "WATER", "target": "W2"}, {"action": "inspect_eastern_pressure_zone", "owner": "WATER", "target": "W2"}]'::jsonb,
    '[{"asset": "W2", "impact": "pressure_loss", "reason": "Pump-zone repair restores pressure compensation"}]'::jsonb,
    '{"pressure_zone": "stabilized", "hospital_water_service": "protected", "hydrant_readiness": "improved", "recommended": true}'::jsonb,
    91.00::numeric(5, 2), '2026-09-14 12:11:00+05:30'::timestamptz
  ),
  (
    'SCN-WATER-RESERVE-H1',
    'Allocate stored water reserve to Hospital H1',
    'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2404'),
    (select id from public.infrastructure_assets where external_id = 'H1'),
    'Test whether a hospital reserve allocation protects H1 while Water Department crews locate the pressure fault.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["H1"], "expected_outcome": "Stored water is expected to remove the hospital service risk while the wider eastern pressure zone remains under repair."}'::jsonb,
    '[{"action": "allocate_stored_water_reserve", "owner": "MEDICAL", "target": "H1"}, {"action": "confirm_hospital_hydrant_reserve", "owner": "FIRE", "target": "H1"}]'::jsonb,
    '[{"asset": "H1", "impact": "water_service_risk", "reason": "Stored reserve protects hospital service continuity"}]'::jsonb,
    '{"hospital_water_service": "protected", "eastern_zone_pressure": "still_monitored", "recommended": true}'::jsonb,
    88.00::numeric(5, 2), '2026-09-14 12:12:00+05:30'::timestamptz
  ),
  (
    'SCN-WATER-PRIORITIZE-R12-HYDRANTS',
    'Prioritize hydrant pressure near Road R12',
    'what_if', 'completed',
    (select id from public.incidents where external_id = 'INC-2404'),
    (select id from public.infrastructure_assets where external_id = 'R12'),
    'Test whether Water Department pressure prioritization keeps the fire-response hydrant network usable during the main fault.',
    '{"simulation_effect": "mitigate", "mitigated_asset_external_ids": ["R12"], "expected_outcome": "Hydrant prioritization is expected to remove the predicted hydrant-access impact while the pump and hospital risks remain separately visible."}'::jsonb,
    '[{"action": "prioritize_r12_hydrant_pressure", "owner": "WATER", "target": "R12"}, {"action": "verify_fire_service_hydrants", "owner": "FIRE", "target": "R12"}]'::jsonb,
    '[{"asset": "R12", "impact": "hydrant_access_risk", "reason": "Pressure prioritization protects the fire-response corridor"}]'::jsonb,
    '{"hydrant_readiness": "protected", "water_main_fault": "still_under_repair", "recommended": true}'::jsonb,
    86.00::numeric(5, 2), '2026-09-14 12:13:00+05:30'::timestamptz
  )
) as incident_scenarios(external_id, name, scenario_type, status, incident_id, focus_asset_id, description, assumptions, interventions, predicted_impacts, intervention_results, confidence, evaluated_at);

create unique index if not exists scenarios_external_id_unique_idx
on public.scenarios (external_id)
where external_id is not null;
