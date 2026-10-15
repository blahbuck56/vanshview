-- From entering a 6-generation family by hand:
--
-- 1. Family name at birth (maiden name). Meena was born a Sharma and is now a Gupta; her birth
--    family is the Sharma side. Stored as a person_names row of kind 'birth' (one per person),
--    set through create_person / update_person with the key `birth_family_name` (null or ''
--    clears it). The dedup search already matches these names.
-- 2. The wizard can now record when a couple married (unions[].start in the payload).
-- 3. The tree showed only the focus person's direct line and siblings, so aunts, uncles and
--    cousins never appeared. neighborhood() now also includes, for each ancestor at depth d,
--    their descendants down to the focus person's generation + 1 (aunts and uncles, cousins,
--    cousins' children; great-aunts and their lines further up).

------------------------------------------------------------------------------------------
-- Family name at birth
------------------------------------------------------------------------------------------

create function public.set_birth_family_name(p_person_id uuid, p_name text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_space uuid;
begin
  select p.space_id into v_space from public.persons p where p.id = p_person_id;
  if v_name is null then
    delete from public.person_names where person_id = p_person_id and kind = 'birth';
  elsif exists (select 1 from public.person_names where person_id = p_person_id and kind = 'birth') then
    update public.person_names set family = v_name, given = null
    where person_id = p_person_id and kind = 'birth';
  else
    insert into public.person_names (space_id, person_id, kind, family)
    values (v_space, p_person_id, 'birth', v_name);
  end if;
end
$$;

create or replace function public.create_person(p_space_id uuid, p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_dead boolean := coalesce((p ->> 'is_deceased')::boolean, false);
  v_loc jsonb := p -> 'location';
  v_name jsonb;
begin
  insert into public.persons (
    space_id, given_name, family_name, gender,
    birth_date, birth_precision, birth_qualifier,
    death_date, death_precision, death_qualifier,
    is_deceased, is_placeholder, minor_override,
    phone, phone_status, email, biography
  ) values (
    p_space_id, p ->> 'given_name', p ->> 'family_name', coalesce(p ->> 'gender', 'unknown')::public.gender,
    (p -> 'birth' ->> 'date')::date,
    coalesce(p -> 'birth' ->> 'precision', 'unknown')::public.date_precision,
    coalesce(p -> 'birth' ->> 'qualifier', 'exact')::public.date_qualifier,
    (p -> 'death' ->> 'date')::date,
    coalesce(p -> 'death' ->> 'precision', 'unknown')::public.date_precision,
    coalesce(p -> 'death' ->> 'qualifier', 'exact')::public.date_qualifier,
    v_dead, coalesce((p ->> 'is_placeholder')::boolean, false), (p ->> 'minor_override')::boolean,
    nullif(p ->> 'phone', ''),
    case when p ->> 'phone_status' = 'requested' then 'requested' else 'provided' end::public.phone_status,
    nullif(p ->> 'email', ''), nullif(p ->> 'biography', '')
  )
  returning id into v_id;

  if jsonb_typeof(v_loc) = 'object' and btrim(coalesce(v_loc ->> 'label', '')) <> '' then
    insert into public.person_places (space_id, person_id, place_id, kind)
    values (
      p_space_id, v_id, public.find_or_create_place(p_space_id, v_loc ->> 'label'),
      coalesce(v_loc ->> 'kind', case when v_dead then 'death' else 'current' end)::public.place_kind
    );
  end if;

  for v_name in select value from jsonb_array_elements(coalesce(p -> 'other_names', '[]'::jsonb)) loop
    insert into public.person_names (space_id, person_id, kind, given, family, script)
    values (p_space_id, v_id, (v_name ->> 'kind')::public.name_kind, v_name ->> 'given', v_name ->> 'family',
            v_name ->> 'script');
  end loop;

  if p ? 'birth_family_name' then
    perform public.set_birth_family_name(v_id, p ->> 'birth_family_name');
  end if;

  return v_id;
end
$$;

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
  if not public.has_role(v_space, 'editor') then
    raise exception 'Only editors can change people' using errcode = 'insufficient_privilege';
  end if;

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

  if p ? 'birth_family_name' then
    perform public.set_birth_family_name(p_person_id, p ->> 'birth_family_name');
  end if;

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

------------------------------------------------------------------------------------------
-- Wizard: marriage year
------------------------------------------------------------------------------------------

create or replace function public.commit_payload(
  p_space_id uuid,
  p_payload jsonb,
  p_mode public.submission_mode default 'self',
  p_anchor_person_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_sub uuid;
  v_map jsonb := '{}'::jsonb;
  v_p jsonb;
  v_id uuid;
  v_u jsonb;
  v_e jsonb;
  v_union uuid;
  v_parent uuid;
  v_child uuid;
  v_ph uuid;
  v_submitter_name text;
begin
  if not public.has_role(p_space_id, 'editor') then
    raise exception 'Only editors can add family members directly' using errcode = 'insufficient_privilege';
  end if;

  v_submitter_name := coalesce(
    nullif(btrim(concat_ws(' ', p_payload -> 'submitter' ->> 'given_name', p_payload -> 'submitter' ->> 'family_name')), ''),
    (select nullif(btrim(concat_ws(' ', p.given_name, p.family_name)), '') from public.persons p
     where p.id = (p_payload -> 'submitter' ->> 'existing_person_id')::uuid),
    'Family member');

  insert into public.submissions (
    space_id, mode, anchor_person_id, submitter_name, submitter_user_id, payload,
    status, consent_given_at, reviewed_by, reviewed_at
  ) values (
    p_space_id, p_mode, p_anchor_person_id, v_submitter_name, auth.uid(), p_payload,
    'approved', now(), auth.uid(), now()
  ) returning id into v_sub;
  perform set_config('vanshview.submission_id', v_sub::text, true);

  for v_p in
    select p_payload -> 'submitter'
    union all
    select value from jsonb_array_elements(coalesce(p_payload -> 'persons', '[]'::jsonb))
  loop
    v_id := public.resolve_person(p_space_id, case when v_p ? 'existing_person_id' then null else v_p end,
                                  (v_p ->> 'existing_person_id')::uuid);
    insert into public.submission_resolutions (space_id, submission_id, temp_person_id, action, person_id)
    values (p_space_id, v_sub, v_p ->> 'temp_id',
            case when v_p ? 'existing_person_id' then 'link_existing' else 'create' end::public.resolution_action, v_id);
    v_map := v_map || jsonb_build_object(v_p ->> 'temp_id', v_id);
  end loop;

  -- A new birth parent for someone with an "Unknown mother/father" takes the placeholder's place.
  for v_e in select value from jsonb_array_elements(coalesce(p_payload -> 'parent_child', '[]'::jsonb)) loop
    if coalesce(v_e ->> 'kind', 'biological') in ('biological', 'unknown') then
      v_ph := public.replace_placeholder_parent(
        (v_map ->> (v_e ->> 'child_temp_id'))::uuid, (v_map ->> (v_e ->> 'parent_temp_id'))::uuid);
      if v_ph is not null then
        select coalesce(jsonb_object_agg(key, case when value = to_jsonb(v_ph::text)
                                                    then v_map -> (v_e ->> 'parent_temp_id') else value end), '{}'::jsonb)
        into v_map from jsonb_each(v_map);
      end if;
    end if;
  end loop;

  for v_u in select value from jsonb_array_elements(coalesce(p_payload -> 'unions', '[]'::jsonb)) loop
    v_union := public.ensure_union(
      p_space_id,
      (v_map ->> (v_u -> 'member_temp_ids' ->> 0))::uuid,
      (v_map ->> (v_u -> 'member_temp_ids' ->> 1))::uuid,
      coalesce(v_u ->> 'kind', 'marriage')::public.union_kind);
    if v_u ? 'end_reason' then
      update public.unions set end_reason = (v_u ->> 'end_reason')::public.union_end_reason where id = v_union;
    end if;
    if jsonb_typeof(v_u -> 'start') = 'object' and v_u -> 'start' ->> 'date' is not null then
      update public.unions set
        start_date = (v_u -> 'start' ->> 'date')::date,
        start_precision = coalesce(v_u -> 'start' ->> 'precision', 'year')::public.date_precision,
        start_qualifier = coalesce(v_u -> 'start' ->> 'qualifier', 'exact')::public.date_qualifier
      where id = v_union;
    end if;
  end loop;

  for v_e in select value from jsonb_array_elements(coalesce(p_payload -> 'parent_child', '[]'::jsonb)) loop
    v_parent := (v_map ->> (v_e ->> 'parent_temp_id'))::uuid;
    v_child := (v_map ->> (v_e ->> 'child_temp_id'))::uuid;
    if exists (select 1 from public.parent_child pc where pc.parent_id = v_parent and pc.child_id = v_child) then
      continue;
    end if;
    -- The union this child came from: one shared with another of the child's parents in the payload.
    select a.union_id into v_union
    from public.union_members a
    join public.union_members b on b.union_id = a.union_id and b.person_id <> a.person_id
    join public.unions u on u.id = a.union_id and u.deleted_at is null
    where a.person_id = v_parent
      and b.person_id in (
        select (v_map ->> (x.value ->> 'parent_temp_id'))::uuid
        from jsonb_array_elements(p_payload -> 'parent_child') x
        where x.value ->> 'child_temp_id' = v_e ->> 'child_temp_id')
    limit 1;
    insert into public.parent_child (space_id, parent_id, child_id, kind, union_id)
    values (p_space_id, v_parent, v_child, coalesce(v_e ->> 'kind', 'biological')::public.parent_child_kind, v_union);
    v_union := null;
  end loop;

  return v_map;
end
$$;

------------------------------------------------------------------------------------------
-- Wider tree: aunts, uncles and cousins around the focus person
------------------------------------------------------------------------------------------

create or replace function public.neighborhood(p_focus_id uuid, p_up integer default 3, p_down integer default 3)
returns jsonb
language sql stable
set search_path = ''
as $$
  with anc as (
    select a.person_id, a.depth from public.ancestors(p_focus_id, p_up) a
  ),
  core as (
    select p_focus_id as person_id
    union select person_id from anc
    union select d.person_id from public.descendants(p_focus_id, p_down) d
    -- each ancestor's other lines, down to one generation below the focus person
    union select d.person_id from anc cross join lateral public.descendants(anc.person_id, anc.depth + 1) d
  ),
  partners as (
    select um2.person_id
    from core c
    join public.union_members um1 on um1.person_id = c.person_id
    join public.unions u on u.id = um1.union_id and u.deleted_at is null
    join public.union_members um2 on um2.union_id = um1.union_id and um2.person_id <> c.person_id
  ),
  ids as (
    select person_id from core union select person_id from partners
  ),
  live as (
    select p.* from public.persons p
    join ids on ids.person_id = p.id
    where p.deleted_at is null and p.merged_into is null
  ),
  live_unions as (
    select u.* from public.unions u
    where u.deleted_at is null
      and exists (select 1 from public.union_members um
                  where um.union_id = u.id and um.person_id in (select id from live))
  )
  select jsonb_build_object(
    'focus_id', p_focus_id,
    'persons', coalesce((select jsonb_agg(to_jsonb(l) order by l.birth_date nulls last, l.id) from live l), '[]'::jsonb),
    'parent_child', coalesce((
      select jsonb_agg(to_jsonb(pc) order by pc.id) from public.parent_child pc
      where pc.parent_id in (select id from live) and pc.child_id in (select id from live)), '[]'::jsonb),
    'unions', coalesce((select jsonb_agg(to_jsonb(u) order by u.id) from live_unions u), '[]'::jsonb),
    'union_members', coalesce((
      select jsonb_agg(to_jsonb(um) order by um.union_id, um.person_id) from public.union_members um
      where um.union_id in (select id from live_unions) and um.person_id in (select id from live)), '[]'::jsonb)
  )
$$;

revoke execute on function public.set_birth_family_name(uuid, text) from public, anon;
grant execute on function public.set_birth_family_name(uuid, text) to authenticated;
