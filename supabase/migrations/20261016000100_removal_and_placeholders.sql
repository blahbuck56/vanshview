-- Fixes found while testing real-family flows:
--
-- 1. Removing someone left their parent/partner links in place. A wrongly added father still
--    counted towards the two-biological-parent limit (so the right one could not be added),
--    and siblings and ancestors were still derived through him. Removal now deletes the
--    person's links too (the change log keeps the before-state, so it stays reversible).
-- 2. Adding a real mother or father after a sibling add had created "Unknown mother/father"
--    placeholders failed on the two-parent limit. The placeholder is now replaced by the real
--    person, keeping every sibling attached.
-- 3. update_person / remove_person silently did nothing for viewers (RLS filtered the row).
--    They now raise a clear permission error.
-- 4. Siblings who share the same known parents are full siblings, even with one parent known.
-- 5. "This is me" on a profile without a phone used to fail; it now uses the sign-in phone.
-- 6. list_members: who is in a family, with phone numbers for admins (so they can tell who
--    joined through a shared link).

------------------------------------------------------------------------------------------
-- Placeholder replacement
------------------------------------------------------------------------------------------

-- If p_child has an "Unknown mother/father" placeholder that p_parent should replace, moves the
-- placeholder's links (to the child, its siblings and the other parent) onto p_parent, removes
-- the placeholder and returns its id. Returns null when there is nothing to replace, or when it
-- is ambiguous (p_parent has no gender and both parents are placeholders).
create function public.replace_placeholder_parent(p_child uuid, p_parent uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_gender public.gender;
  v_is_placeholder boolean;
  v_count integer;
  v_ph uuid;
  v_ph_gender public.gender;
begin
  select p.gender, p.is_placeholder into v_gender, v_is_placeholder from public.persons p where p.id = p_parent;
  if v_is_placeholder then
    return null;
  end if;

  select count(*) into v_count
  from public.parent_child pc
  join public.persons ph on ph.id = pc.parent_id
  where pc.child_id = p_child and pc.parent_id <> p_parent
    and pc.kind in ('biological', 'unknown')
    and ph.is_placeholder and ph.deleted_at is null
    and (v_gender = 'unknown' or ph.gender in (v_gender, 'unknown'));
  if v_count = 0 or (v_gender = 'unknown' and v_count > 1) then
    return null;
  end if;

  select ph.id, ph.gender into v_ph, v_ph_gender
  from public.parent_child pc
  join public.persons ph on ph.id = pc.parent_id
  where pc.child_id = p_child and pc.parent_id <> p_parent
    and pc.kind in ('biological', 'unknown')
    and ph.is_placeholder and ph.deleted_at is null
    and (v_gender = 'unknown' or ph.gender in (v_gender, 'unknown'))
  order by (ph.gender = v_gender) desc, ph.created_at
  limit 1;

  -- Children already linked to p_parent keep that link; the placeholder's duplicate goes.
  delete from public.parent_child pc
  where pc.parent_id = v_ph
    and exists (select 1 from public.parent_child x where x.parent_id = p_parent and x.child_id = pc.child_id);
  update public.parent_child set parent_id = p_parent where parent_id = v_ph;

  update public.union_members um set person_id = p_parent
  where um.person_id = v_ph
    and not exists (select 1 from public.union_members x where x.union_id = um.union_id and x.person_id = p_parent);
  delete from public.union_members where person_id = v_ph;

  if v_gender = 'unknown' and v_ph_gender <> 'unknown' then
    update public.persons set gender = v_ph_gender where id = p_parent;
  end if;
  update public.persons set deleted_at = now() where id = v_ph;
  return v_ph;
end
$$;

create or replace function public.add_parent(
  p_child_id uuid,
  p_new jsonb default null,
  p_existing uuid default null,
  p_kind public.parent_child_kind default 'biological',
  p_link_partner boolean default true,
  p_union_kind public.union_kind default 'marriage'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_space uuid := public.person_space(p_child_id);
  v_parent uuid := public.resolve_person(v_space, p_new, p_existing);
  v_others uuid[];
  v_union uuid;
begin
  if p_kind in ('biological', 'unknown')
     and public.replace_placeholder_parent(p_child_id, v_parent) is not null then
    return v_parent;
  end if;

  select array_agg(pc.parent_id) into v_others
  from public.parent_child pc
  where pc.child_id = p_child_id and pc.kind in ('biological', 'adoptive', 'unknown') and pc.parent_id <> v_parent;

  if p_link_partner and p_kind in ('biological', 'adoptive', 'unknown') and cardinality(v_others) = 1 then
    v_union := public.ensure_union(v_space, v_others[1], v_parent, p_union_kind);
    update public.parent_child set union_id = v_union
    where child_id = p_child_id and parent_id = v_others[1] and union_id is null;
  end if;

  insert into public.parent_child (space_id, parent_id, child_id, kind, union_id)
  values (v_space, v_parent, p_child_id, p_kind, v_union);
  return v_parent;
end
$$;

------------------------------------------------------------------------------------------
-- Removal
------------------------------------------------------------------------------------------

-- Drops a removed person's links: parent/child edges and partnerships. A partnership left with
-- one person is closed, and that person's children are no longer tied to it.
create function public.detach_person(p_person_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_union uuid;
begin
  delete from public.parent_child where parent_id = p_person_id or child_id = p_person_id;
  for v_union in select um.union_id from public.union_members um where um.person_id = p_person_id loop
    delete from public.union_members where union_id = v_union and person_id = p_person_id;
    if (select count(*) from public.union_members um where um.union_id = v_union) < 2 then
      update public.parent_child set union_id = null where union_id = v_union;
      update public.unions set deleted_at = now() where id = v_union and deleted_at is null;
    end if;
  end loop;
end
$$;

create or replace function public.remove_person(p_person_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_space uuid := public.person_space(p_person_id);
begin
  if not public.has_role(v_space, 'editor') then
    raise exception 'Only editors can remove people' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.space_members m where m.space_id = v_space and m.person_id = p_person_id) then
    raise exception 'This person has claimed their profile and cannot be removed' using errcode = 'check_violation';
  end if;
  perform public.detach_person(p_person_id);
  update public.persons set deleted_at = now() where id = p_person_id;
end
$$;

-- People removed before this fix still have their links: detach them now.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select p.id from public.persons p
    where p.deleted_at is not null
      and (exists (select 1 from public.parent_child pc where pc.parent_id = p.id or pc.child_id = p.id)
           or exists (select 1 from public.union_members um where um.person_id = p.id))
  loop
    perform public.detach_person(v_id);
  end loop;
end
$$;

------------------------------------------------------------------------------------------
-- Editing: explicit permission check (RLS alone made a viewer's edit a silent no-op)
------------------------------------------------------------------------------------------

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
-- Wizard commit: replace placeholders before linking anything
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
-- Siblings: the same known parents means full siblings, even when only one parent is known.
-- (Two children of a lone mother showed as "half" before; half now means the known parents
-- differ.)
------------------------------------------------------------------------------------------

create or replace function public.siblings(p_person_id uuid)
returns table (person_id uuid, kind text, shared_parent_ids uuid[])
language sql stable
set search_path = ''
as $$
  with my_parents as (
    select pc.parent_id from public.parent_child pc
    where pc.child_id = p_person_id and pc.kind in ('biological', 'adoptive', 'unknown')
  ),
  shared as (
    select pc.child_id as person_id, array_agg(pc.parent_id order by pc.parent_id) as parent_ids
    from public.parent_child pc
    where pc.parent_id in (select parent_id from my_parents)
      and pc.kind in ('biological', 'adoptive', 'unknown')
      and pc.child_id <> p_person_id
    group by pc.child_id
  ),
  blood as (
    select s.person_id,
      case
        when cardinality(s.parent_ids) = (select count(*) from my_parents)
         and cardinality(s.parent_ids) = (
           select count(*) from public.parent_child x
           where x.child_id = s.person_id and x.kind in ('biological', 'adoptive', 'unknown'))
        then 'full' else 'half'
      end as kind,
      s.parent_ids
    from shared s
  ),
  my_parent_partners as (
    select distinct um2.person_id
    from my_parents mp
    join public.union_members um1 on um1.person_id = mp.parent_id
    join public.unions u on u.id = um1.union_id and u.deleted_at is null
    join public.union_members um2 on um2.union_id = um1.union_id and um2.person_id <> mp.parent_id
    where um2.person_id not in (select parent_id from my_parents)
  ),
  step as (
    select distinct pc.child_id as person_id, 'step'::text as kind, array[]::uuid[] as parent_ids
    from public.parent_child pc
    where pc.parent_id in (select person_id from my_parent_partners)
      and pc.kind in ('biological', 'adoptive', 'unknown')
      and pc.child_id <> p_person_id
      and pc.child_id not in (select b.person_id from blood b)
  )
  select r.person_id, r.kind, r.parent_ids
  from (select * from blood union all select * from step) r
  join public.persons p on p.id = r.person_id and p.deleted_at is null and p.merged_into is null
$$;

------------------------------------------------------------------------------------------
-- Claiming yourself: a profile added with "Ask later" has no phone, and the claim guard
-- requires one. Use the number the person just signed in with.
------------------------------------------------------------------------------------------

create or replace function public.claim_self(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid := public.person_space(p_person_id);
  v_phone text;
begin
  if not public.is_member(v_space) then
    raise exception 'Join this family first' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.space_members m
             where m.space_id = v_space and m.user_id = auth.uid() and m.person_id is not null) then
    raise exception 'You have already claimed a profile in this family' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from public.space_members m where m.space_id = v_space and m.person_id = p_person_id) then
    raise exception 'Someone else has already said this is them' using errcode = 'unique_violation';
  end if;

  select nullif('+' || ltrim(coalesce(u.phone, ''), '+'), '+') into v_phone from auth.users u where u.id = auth.uid();
  update public.persons set phone = v_phone, phone_status = 'provided'
  where id = p_person_id and phone is null and v_phone is not null;

  update public.space_members set person_id = p_person_id
  where space_id = v_space and user_id = auth.uid();
end
$$;

------------------------------------------------------------------------------------------
-- Members list
------------------------------------------------------------------------------------------

-- Everyone in a family. Phone numbers (from sign-in) are shown to admins, and to each member
-- for their own row. Definer, because auth.users is not readable through the API.
create function public.list_members(p_space_id uuid)
returns table (user_id uuid, role public.member_role, person_id uuid, joined_at timestamptz, phone text)
language sql stable security definer
set search_path = ''
as $$
  select m.user_id, m.role, m.person_id, m.joined_at,
         case when m.user_id = auth.uid() or public.has_role(p_space_id, 'admin')
              then nullif('+' || ltrim(coalesce(u.phone, ''), '+'), '+') end
  from public.space_members m
  join auth.users u on u.id = m.user_id
  where m.space_id = p_space_id and public.is_member(p_space_id)
  order by m.joined_at
$$;

-- New functions start callable by everyone; keep to the allow-list (20261015000300).
revoke execute on function
  public.replace_placeholder_parent(uuid, uuid),
  public.detach_person(uuid),
  public.list_members(uuid)
from public, anon;
grant execute on function
  public.replace_placeholder_parent(uuid, uuid),
  public.detach_person(uuid),
  public.list_members(uuid)
to authenticated;
