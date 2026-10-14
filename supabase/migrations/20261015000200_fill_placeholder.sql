-- Lets update_person turn an "Unknown father/mother" placeholder into a real person
-- (p ->> 'is_placeholder' = false), so a sibling add can be completed later.

create or replace function public.update_person(p_person_id uuid, p jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_space uuid := public.person_space(p_person_id);
  v_pp uuid;
  v_dead boolean;
begin
  update public.persons set
    is_placeholder = case when p ? 'is_placeholder' then (p ->> 'is_placeholder')::boolean else is_placeholder end,
    given_name = case when p ? 'given_name' then p ->> 'given_name' else given_name end,
    family_name = case when p ? 'family_name' then p ->> 'family_name' else family_name end,
    gender = case when p ? 'gender' then (p ->> 'gender')::public.gender else gender end,
    birth_date = case when p ? 'birth' then (p -> 'birth' ->> 'date')::date else birth_date end,
    birth_precision = case when p ? 'birth' then coalesce(p -> 'birth' ->> 'precision', 'unknown')::public.date_precision else birth_precision end,
    birth_qualifier = case when p ? 'birth' then coalesce(p -> 'birth' ->> 'qualifier', 'exact')::public.date_qualifier else birth_qualifier end,
    death_date = case when p ? 'death' then (p -> 'death' ->> 'date')::date else death_date end,
    death_precision = case when p ? 'death' then coalesce(p -> 'death' ->> 'precision', 'unknown')::public.date_precision else death_precision end,
    death_qualifier = case when p ? 'death' then coalesce(p -> 'death' ->> 'qualifier', 'exact')::public.date_qualifier else death_qualifier end,
    is_deceased = case when p ? 'is_deceased' then (p ->> 'is_deceased')::boolean else is_deceased end,
    minor_override = case when p ? 'minor_override' then (p ->> 'minor_override')::boolean else minor_override end,
    phone = case when p ? 'phone' then nullif(p ->> 'phone', '') else phone end,
    phone_status = case when p ? 'phone' or p ? 'phone_status' then
                     case when p ->> 'phone_status' = 'requested' then 'requested' else 'provided' end::public.phone_status
                   else phone_status end,
    email = case when p ? 'email' then nullif(p ->> 'email', '') else email end,
    biography = case when p ? 'biography' then nullif(p ->> 'biography', '') else biography end
  where id = p_person_id
  returning is_deceased into v_dead;

  if jsonb_typeof(p -> 'location') = 'object' and btrim(coalesce(p -> 'location' ->> 'label', '')) <> '' then
    select pp.id into v_pp from public.person_places pp
    where pp.person_id = p_person_id order by pp.created_at limit 1;
    if v_pp is null then
      insert into public.person_places (space_id, person_id, place_id, kind)
      values (v_space, p_person_id, public.find_or_create_place(v_space, p -> 'location' ->> 'label'),
              coalesce(p -> 'location' ->> 'kind', case when v_dead then 'death' else 'current' end)::public.place_kind);
    else
      update public.person_places
      set place_id = public.find_or_create_place(v_space, p -> 'location' ->> 'label'),
          kind = coalesce(p -> 'location' ->> 'kind', case when v_dead then 'death' else 'current' end)::public.place_kind
      where id = v_pp;
    end if;
  end if;
end
$$;
