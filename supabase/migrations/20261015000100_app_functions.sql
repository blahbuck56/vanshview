-- Phase 1: the functions the app calls. Every multi-step change (onboarding, each add-relative
-- flow, the wizard commit) is ONE function = one transaction, so a failure anywhere writes
-- nothing. All are SECURITY INVOKER (RLS and every integrity trigger apply as the caller),
-- except the two invite functions, which look up a token the caller cannot read yet.

-- Open invite links (shared in a family WhatsApp group) carry no email or phone.
alter table public.invites drop constraint if exists invites_check;

------------------------------------------------------------------------------------------
-- Building blocks
------------------------------------------------------------------------------------------

create function public.find_or_create_place(p_space_id uuid, p_label text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_id uuid;
begin
  if v_label = '' then
    raise exception 'A location is required' using errcode = 'check_violation';
  end if;
  select pl.id into v_id from public.places pl
  where pl.space_id = p_space_id and lower(pl.label) = lower(v_label)
  order by pl.created_at limit 1;
  if v_id is null then
    insert into public.places (space_id, label) values (p_space_id, v_label) returning id into v_id;
  end if;
  return v_id;
end
$$;

-- Creates a person from the SubmissionPayload person shape (lib/schemas/person.ts).
create function public.create_person(p_space_id uuid, p jsonb)
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

  return v_id;
end
$$;

-- Either links an existing live person in the space or creates a new one.
create function public.resolve_person(p_space_id uuid, p_new jsonb, p_existing uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
begin
  if p_existing is not null then
    if not exists (
      select 1 from public.persons p
      where p.id = p_existing and p.space_id = p_space_id and p.deleted_at is null and p.merged_into is null
    ) then
      raise exception 'That person is not in this family' using errcode = 'foreign_key_violation';
    end if;
    return p_existing;
  end if;
  if p_new is null then
    raise exception 'Choose an existing person or enter a new one' using errcode = 'null_value_not_allowed';
  end if;
  return public.create_person(p_space_id, p_new);
end
$$;

-- The live union between two people, created if missing.
create function public.ensure_union(p_space_id uuid, p_a uuid, p_b uuid, p_kind public.union_kind)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select a.union_id into v_id
  from public.union_members a
  join public.union_members b on b.union_id = a.union_id
  join public.unions u on u.id = a.union_id and u.deleted_at is null
  where a.person_id = p_a and b.person_id = p_b
  order by u.created_at desc limit 1;
  if v_id is null then
    insert into public.unions (space_id, kind) values (p_space_id, p_kind) returning id into v_id;
    insert into public.union_members (union_id, person_id, space_id)
    values (v_id, p_a, p_space_id), (v_id, p_b, p_space_id);
  end if;
  return v_id;
end
$$;

create function public.person_space(p_person_id uuid)
returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select p.space_id into v_space from public.persons p
  where p.id = p_person_id and p.deleted_at is null and p.merged_into is null;
  if v_space is null then
    raise exception 'Person not found' using errcode = 'no_data_found';
  end if;
  return v_space;
end
$$;

------------------------------------------------------------------------------------------
-- Onboarding
------------------------------------------------------------------------------------------

-- Creates a family space, makes the caller its owner, adds them as a person and claims it.
create function public.start_family(p_name text, p_self jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_space uuid;
  v_me uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  insert into public.spaces (name) values (p_name) returning id into v_space;
  v_me := public.create_person(v_space, p_self);
  update public.space_members set person_id = v_me where space_id = v_space and user_id = auth.uid();
  return v_space;
end
$$;

------------------------------------------------------------------------------------------
-- Add-relative flows (spec section 5). Each returns the relative's person id.
------------------------------------------------------------------------------------------

-- Adds a parent. If the child already has exactly one parent, the two parents are joined in a
-- union (unless p_link_partner is false) and both edges point at it.
create function public.add_parent(
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

-- Adds a child, optionally with the other parent (one of the parent's partners, or anyone).
create function public.add_child(
  p_parent_id uuid,
  p_new jsonb default null,
  p_existing uuid default null,
  p_other_parent_id uuid default null,
  p_kind public.parent_child_kind default 'biological'
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_space uuid := public.person_space(p_parent_id);
  v_child uuid := public.resolve_person(v_space, p_new, p_existing);
  v_union uuid;
begin
  if p_other_parent_id is not null then
    v_union := public.ensure_union(v_space, p_parent_id, p_other_parent_id, 'marriage');
    insert into public.parent_child (space_id, parent_id, child_id, kind, union_id)
    values (v_space, p_other_parent_id, v_child, p_kind, v_union);
  end if;
  insert into public.parent_child (space_id, parent_id, child_id, kind, union_id)
  values (v_space, p_parent_id, v_child, p_kind, v_union);
  return v_child;
end
$$;

-- Adds a partner as a new union. Several unions per person are allowed (remarriage).
create function public.add_partner(
  p_person_id uuid,
  p_new jsonb default null,
  p_existing uuid default null,
  p_kind public.union_kind default 'marriage',
  p_start jsonb default null,
  p_end_reason public.union_end_reason default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_space uuid := public.person_space(p_person_id);
  v_partner uuid := public.resolve_person(v_space, p_new, p_existing);
  v_union uuid;
begin
  if v_partner = p_person_id then
    raise exception 'Someone cannot be their own partner' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.union_members a
    join public.union_members b on b.union_id = a.union_id
    join public.unions u on u.id = a.union_id and u.deleted_at is null
    where a.person_id = p_person_id and b.person_id = v_partner
  ) then
    raise exception 'These two are already partners' using errcode = 'unique_violation';
  end if;

  insert into public.unions (space_id, kind, start_date, start_precision, start_qualifier, end_reason)
  values (
    v_space, p_kind,
    (p_start ->> 'date')::date,
    coalesce(p_start ->> 'precision', 'unknown')::public.date_precision,
    coalesce(p_start ->> 'qualifier', 'exact')::public.date_qualifier,
    p_end_reason
  )
  returning id into v_union;
  insert into public.union_members (union_id, person_id, space_id)
  values (v_union, p_person_id, v_space), (v_union, v_partner, v_space);
  return v_partner;
end
$$;

-- Adds a sibling. Siblings are never stored: the new person is attached to the shared parents.
-- With no parents known, two placeholder parents ("Unknown father/mother") are created first.
-- p_parent_ids picks which parents are shared (a half sibling shares one); default = all.
create function public.add_sibling(
  p_person_id uuid,
  p_new jsonb default null,
  p_existing uuid default null,
  p_parent_ids uuid[] default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_space uuid := public.person_space(p_person_id);
  v_sibling uuid;
  v_parents uuid[];
  v_shared uuid[];
  v_father uuid;
  v_mother uuid;
  v_union uuid;
  v_parent uuid;
begin
  select array_agg(pc.parent_id order by pc.parent_id) into v_parents
  from public.parent_child pc
  where pc.child_id = p_person_id and pc.kind in ('biological', 'adoptive', 'unknown');

  if v_parents is null then
    insert into public.persons (space_id, family_name, gender, is_placeholder)
    select v_space, p.family_name, 'male', true from public.persons p where p.id = p_person_id
    returning id into v_father;
    insert into public.persons (space_id, gender, is_placeholder)
    values (v_space, 'female', true) returning id into v_mother;
    v_union := public.ensure_union(v_space, v_father, v_mother, 'unknown');
    insert into public.parent_child (space_id, parent_id, child_id, kind, union_id)
    values (v_space, v_father, p_person_id, 'biological', v_union),
           (v_space, v_mother, p_person_id, 'biological', v_union);
    v_parents := array[v_father, v_mother];
  end if;

  v_shared := coalesce(p_parent_ids, v_parents);
  if cardinality(v_shared) = 0 or not (v_shared <@ v_parents) then
    raise exception 'A sibling must share at least one of this person''s parents' using errcode = 'check_violation';
  end if;

  v_sibling := public.resolve_person(v_space, p_new, p_existing);
  foreach v_parent in array v_shared loop
    insert into public.parent_child (space_id, parent_id, child_id, kind, union_id)
    select v_space, v_parent, v_sibling, pc.kind,
           case when cardinality(v_shared) >= 2 then pc.union_id end
    from public.parent_child pc
    where pc.child_id = p_person_id and pc.parent_id = v_parent;
  end loop;
  return v_sibling;
end
$$;

------------------------------------------------------------------------------------------
-- Editing
------------------------------------------------------------------------------------------

-- Updates the fields present in p (same shape as create_person). A new location replaces the
-- person's main place.
create function public.update_person(p_person_id uuid, p jsonb)
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

-- Soft delete (reversible from the change log). Claimed profiles cannot be removed.
create function public.remove_person(p_person_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_space uuid := public.person_space(p_person_id);
begin
  if exists (select 1 from public.space_members m where m.space_id = v_space and m.person_id = p_person_id) then
    raise exception 'This person has claimed their profile and cannot be removed' using errcode = 'check_violation';
  end if;
  update public.persons set deleted_at = now() where id = p_person_id;
end
$$;

------------------------------------------------------------------------------------------
-- Guided wizard: commits a whole SubmissionPayload in one transaction
------------------------------------------------------------------------------------------

-- Used by editors through the in-app wizard. Records the submission (approved), how each
-- person was resolved, and tags every change with the submission id so it can be reverted
-- as one unit. Returns {temp_id: person_id}.
create function public.commit_payload(
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
-- Invite links
------------------------------------------------------------------------------------------

-- What the join page shows before accepting. Needs only a signed-in user and the token.
create function public.get_invite(p_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'space_id', i.space_id,
    'space_name', s.name,
    'role', i.role,
    'valid', i.status = 'pending' and i.expires_at > now(),
    'already_member', exists (select 1 from public.space_members m where m.space_id = i.space_id and m.user_id = auth.uid())
  )
  from public.invites i join public.spaces s on s.id = i.space_id
  where i.token = p_token
$$;

-- Joins the caller to the invite's space. Open links (no person) can be used by many people
-- until they expire; a link for a specific person is single-use and also claims that person.
create function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invites;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  select * into v_inv from public.invites where token = p_token for update;
  if v_inv.id is null or v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'This invite link is no longer valid' using errcode = 'check_violation';
  end if;

  insert into public.space_members (space_id, user_id, role)
  values (v_inv.space_id, auth.uid(), v_inv.role)
  on conflict (space_id, user_id) do nothing;

  if v_inv.person_id is not null then
    update public.space_members set person_id = v_inv.person_id
    where space_id = v_inv.space_id and user_id = auth.uid() and person_id is null;
    update public.invites set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = v_inv.id;
  end if;
  return v_inv.space_id;
end
$$;

-- Claims an unclaimed person as "me" in a space the caller already belongs to. Definer,
-- because members cannot update membership rows under RLS; it only ever touches the
-- caller's own row, and the claim guard trigger still checks the profile (phone, not
-- deceased, not a placeholder) and the unique index stops two people claiming one person.
create function public.claim_self(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space uuid := public.person_space(p_person_id);
begin
  if not public.is_member(v_space) then
    raise exception 'Join this family first' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.space_members m
             where m.space_id = v_space and m.user_id = auth.uid() and m.person_id is not null) then
    raise exception 'You have already claimed a profile in this family' using errcode = 'unique_violation';
  end if;
  update public.space_members set person_id = p_person_id
  where space_id = v_space and user_id = auth.uid();
end
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.start_family(text, jsonb),
  public.add_parent(uuid, jsonb, uuid, public.parent_child_kind, boolean, public.union_kind),
  public.add_child(uuid, jsonb, uuid, uuid, public.parent_child_kind),
  public.add_partner(uuid, jsonb, uuid, public.union_kind, jsonb, public.union_end_reason),
  public.add_sibling(uuid, jsonb, uuid, uuid[]),
  public.update_person(uuid, jsonb),
  public.remove_person(uuid),
  public.commit_payload(uuid, jsonb, public.submission_mode, uuid),
  public.get_invite(text),
  public.accept_invite(text),
  public.claim_self(uuid)
to authenticated;
-- Helpers called inside the functions above run as the caller, so the caller needs them too
-- (RLS still applies to everything they touch). Plus the read helpers, which the blanket
-- revoke above also removed.
grant execute on function
  public.find_or_create_place(uuid, text),
  public.create_person(uuid, jsonb),
  public.resolve_person(uuid, jsonb, uuid),
  public.ensure_union(uuid, uuid, uuid, public.union_kind),
  public.person_space(uuid),
  public.has_role(uuid, public.member_role),
  public.is_member(uuid),
  public.fuzzy_date_is_normalised(date, public.date_precision),
  public.fuzzy_date_end(date, public.date_precision),
  public.compute_is_minor(date, public.date_precision, boolean, boolean, date),
  public.ancestors(uuid, integer),
  public.descendants(uuid, integer),
  public.siblings(uuid),
  public.neighborhood(uuid, integer, integer),
  public.dedup_candidates(uuid, text, text, text, text, integer, uuid[], uuid, integer)
to authenticated;
