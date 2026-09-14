set search_path = public, extensions;

update public.routes r
set destination_asset_id = target.id,
    destination = target.location,
    route_metadata = jsonb_set(r.route_metadata, '{purpose}', '"medical_response_to_incident_zone"'::jsonb),
    updated_at = now()
from public.incidents i
join public.infrastructure_assets target on target.external_id = case i.external_id
  when 'INC-2401' then 'FP01'
  when 'INC-2403' then 'B-A'
  when 'INC-2404' then 'M7'
  when 'INC-2405' then 'R12'
  when 'INC-2406' then 'T4'
  when 'INC-2407' then 'B-A'
end
where r.incident_id = i.id
  and r.route_purpose = 'medical_response';
