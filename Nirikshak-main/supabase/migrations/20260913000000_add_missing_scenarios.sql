set search_path = public, extensions;

insert into public.scenarios (
  external_id, name, scenario_type, status, incident_id, focus_asset_id, description,
  assumptions, interventions, predicted_impacts, intervention_results, confidence, evaluated_at
)
select * from (values
  (
    'SCN-ISOLATE-T4-FIRE',
    'Isolate Transformer T4 for Fire Containment',
    'what_if',
    'draft',
    (select id from public.incidents where external_id = 'INC-2407'),
    (select id from public.infrastructure_assets where external_id = 'T4'),
    'Assess the consequence of isolating Transformer T4 to contain thermal escalation from the Building A fire and protect downstream water and hospital dependencies.',
    '{"protect_downstream_dependencies": true}'::jsonb,
    '[{"action": "isolate_transformer", "owner": "ELECTRICITY"}]'::jsonb,
    '[]'::jsonb,
    '{}'::jsonb,
    null,
    null
  ),
  (
    'SCN-CLOSE-R12-WATER',
    'Close Road R12 for Pressure-Zone Recovery',
    'what_if',
    'draft',
    (select id from public.incidents where external_id = 'INC-2404'),
    (select id from public.infrastructure_assets where external_id = 'R12'),
    'Assess emergency access consequences if Road R12 is closed while Water Pump W2 pressure-zone recovery operations are underway.',
    '{"protect_recovery_operations": true}'::jsonb,
    '[{"action": "close_road_r12", "owner": "TRAFFIC"}]'::jsonb,
    '[]'::jsonb,
    '{}'::jsonb,
    null::numeric,
null::timestamptz
  )
) as missing_scenarios(external_id, name, scenario_type, status, incident_id, focus_asset_id, description, assumptions, interventions, predicted_impacts, intervention_results, confidence, evaluated_at)
where not exists (
  select 1 from public.scenarios existing where existing.external_id = missing_scenarios.external_id
);
