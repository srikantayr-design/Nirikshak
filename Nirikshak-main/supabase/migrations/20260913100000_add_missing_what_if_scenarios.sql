insert into public.scenarios (
  external_id, name, scenario_type, status, incident_id, focus_asset_id, description,
  assumptions, interventions, predicted_impacts, intervention_results, confidence, evaluated_at
)
select * from (values
  (
    'SCN-ISOLATE-T4-FIRE',
    'Isolate Transformer T4',
    'what_if',
    'completed',
    (select id from public.incidents where external_id = 'INC-2407'),
    (select id from public.infrastructure_assets where external_id = 'T4'),
    'Assess the consequence of isolating T4 to prevent thermal damage during the fire response.',
    '{"isolation_duration_minutes": 45, "current_load_percent": 112, "water_pump_backup_available": true, "hospital_generator_fuel_hours": 6}'::jsonb,
    '[{"action": "isolate_transformer", "owner": "ELECTRICITY"}, {"action": "start_pump_backup", "owner": "WATER"}, {"action": "verify_hospital_generator", "owner": "MEDICAL"}]'::jsonb,
    '[{"asset": "W2", "impact": "pressure_zone_reduction", "risk_score": 61, "probability": 64}, {"asset": "H1", "impact": "backup_power_strain", "risk_score": 49, "probability": 51}]'::jsonb,
    '{"transformer_damage_avoided": true, "water_service_continuity": "maintained_with_backup", "hospital_continuity": "maintained", "recommended": true}'::jsonb,
    84.00::numeric(5, 2),
    '2026-09-12 14:20:00+05:30'::timestamptz
  ),
  (
    'SCN-CLOSE-R12-WATER',
    'Close Road R12',
    'what_if',
    'completed',
    (select id from public.incidents where external_id = 'INC-2404'),
    (select id from public.infrastructure_assets where external_id = 'R12'),
    'Assess emergency access and hospital response if R12 is closed while the water pressure fault is managed.',
    '{"closure_duration_minutes": 30, "hospital_access_required": true, "alternate_route_available": true}'::jsonb,
    '[{"action": "close_northbound_lane", "owner": "TRAFFIC"}, {"action": "divert_emergency_traffic", "owner": "POLICE"}, {"action": "protect_hospital_approach", "owner": "MEDICAL"}]'::jsonb,
    '[{"asset": "H1", "impact": "ambulance_response_delay", "risk_score": 58, "probability": 72}, {"asset": "E01", "impact": "coordination_access_impact", "risk_score": 44, "probability": 55}]'::jsonb,
    '{"traffic_delay_minutes": 9, "emergency_corridor_preserved": true, "recommended": true}'::jsonb,
    81.00::numeric(5, 2),
    '2026-09-12 14:12:00+05:30'::timestamptz
  )
) as missing_scenarios(external_id, name, scenario_type, status, incident_id, focus_asset_id, description, assumptions, interventions, predicted_impacts, intervention_results, confidence, evaluated_at)
where missing_scenarios.incident_id is not null
  and missing_scenarios.focus_asset_id is not null
  and not exists (
    select 1 from public.scenarios existing
    where existing.external_id = missing_scenarios.external_id
  );
