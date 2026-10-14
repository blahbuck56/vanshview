-- Hard integrity rules. Everything here is a block, not a warning; soft warnings live in
-- the data_issues view. Graph writes are serialised per space with an advisory lock so two
-- concurrent transactions cannot jointly create a cycle or a third biological parent.

------------------------------------------------------------------------------------------
-- Access helpers (used by triggers here and by RLS policies in the next migration).
------------------------------------------------------------------------------------------

create function public.has_role(p_space_id uuid, p_min public.member_role)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space_id and m.user_id = auth.uid() and m.role >= p_min
  )
$$;

create function public.is_member(p_space_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.has_role(p_space_id, 'viewer')
$$;

------------------------------------------------------------------------------------------
-- Rows never move between spaces.
------------------------------------------------------------------------------------------

create function public.prevent_space_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.space_id is distinct from old.space_id then
    raise exception 'space_id cannot be changed on %', tg_table_name using errcode = 'check_violation';
  end if;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'persons', 'person_names', 'places', 'person_places', 'person_links', 'unions', 'union_members',
    'parent_child', 'branches', 'media', 'media_people', 'invites', 'claim_requests', 'suggestions',
    'saved_views', 'form_links', 'submissions', 'submission_resolutions'
  ] loop
    execute format(
      'create trigger %I before update of space_id on public.%I
         for each row execute function public.prevent_space_change()',
      t || '_space_immutable', t
    );
  end loop;
end
$$;

------------------------------------------------------------------------------------------
-- Persons: identity, minor status, phone rules (spec 3a).
------------------------------------------------------------------------------------------

-- Minor status: from the birth date when it is at least year-precise (using the END of the
-- period, so "born 2008" stays a minor until the end of 2026: privacy errs on the safe side),
-- otherwise from the explicit "under 18" override.
create function public.compute_is_minor(
  p_birth_date date,
  p_birth_precision public.date_precision,
  p_minor_override boolean,
  p_is_deceased boolean,
  p_ref date
)
returns boolean
language sql immutable parallel safe
set search_path = ''
as $$
  select case
    when p_is_deceased then false
    when p_birth_precision in ('day', 'month', 'year') and p_birth_date is not null
      then public.fuzzy_date_end(p_birth_date, p_birth_precision) + interval '18 years' > p_ref
    else coalesce(p_minor_override, false)
  end
$$;

create function public.persons_normalise()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.identity_id is null then
    insert into public.identities default values returning id into new.identity_id;
  end if;

  new.given_name := nullif(btrim(new.given_name), '');
  new.family_name := nullif(btrim(new.family_name), '');
  new.email := nullif(lower(btrim(new.email)), '');

  -- Deceased: phone is never collected.
  if new.is_deceased then
    new.phone := null;
  end if;

  new.is_minor := public.compute_is_minor(
    new.birth_date, new.birth_precision, new.minor_override, new.is_deceased, current_date
  );

  if new.phone is not null then
    new.phone_status := 'provided';
  elsif new.is_deceased or new.is_minor or new.is_placeholder then
    new.phone_status := 'not_applicable';
  elsif new.phone_status is distinct from 'requested' then
    raise exception 'A phone number is required for living adults (or mark it "ask later")'
      using errcode = 'check_violation', constraint = 'persons_phone_required';
  -- Users skipping a claimed profile's phone is blocked; the system (no end-user context,
  -- e.g. refresh_minor_flags when a claimed minor turns 18) may set "ask later".
  elsif auth.uid() is not null and exists (
    select 1 from public.space_members m where m.space_id = new.space_id and m.person_id = new.id
  ) then
    raise exception 'A claimed profile must have a phone number'
      using errcode = 'check_violation', constraint = 'persons_phone_required';
  end if;

  return new;
end
$$;

create trigger persons_00_normalise before insert or update on public.persons
  for each row execute function public.persons_normalise();

-- Claimed profiles: only the claiming user and admins edit directly; others use suggestions.
-- Skipped when there is no end-user context (migrations, seed, service role).
create function public.persons_guard_claimed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimer uuid;
begin
  if auth.uid() is null then
    return new;
  end if;
  select m.user_id into v_claimer
  from public.space_members m
  where m.space_id = old.space_id and m.person_id = old.id;

  if v_claimer is not null and v_claimer <> auth.uid() and not public.has_role(old.space_id, 'admin') then
    raise exception 'This profile is claimed. Submit a suggestion instead.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger persons_10_guard_claimed before update on public.persons
  for each row execute function public.persons_guard_claimed();

-- Every non-placeholder person needs at least one place. Deferred to commit so a person and
-- their first place can be inserted in either order within one transaction.
create function public.assert_person_has_place(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.persons p
    where p.id = p_person_id
      and not p.is_placeholder and p.deleted_at is null and p.merged_into is null
      and not exists (select 1 from public.person_places pp where pp.person_id = p.id)
  ) then
    raise exception 'Every person needs at least one location'
      using errcode = 'check_violation', constraint = 'persons_location_required';
  end if;
end
$$;

create function public.persons_check_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_person_has_place(new.id);
  return null;
end
$$;

create function public.person_places_check_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_person_has_place(old.person_id);
  return null;
end
$$;

create constraint trigger persons_location_required
  after insert or update on public.persons
  deferrable initially deferred
  for each row execute function public.persons_check_place();

create constraint trigger person_places_location_required
  after update of person_id or delete on public.person_places
  deferrable initially deferred
  for each row execute function public.person_places_check_place();

------------------------------------------------------------------------------------------
-- Graph edges.
------------------------------------------------------------------------------------------

create function public.lock_space_graph(p_space_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('vanshview:graph:' || p_space_id::text, 0))
$$;

create function public.parent_child_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_space_graph(new.space_id);

  -- No cycles: the child must not already be an ancestor of the parent.
  if exists (
    with recursive anc(person_id) as (
      select pc.parent_id from public.parent_child pc
      where pc.child_id = new.parent_id and pc.id is distinct from new.id
      union
      select pc.parent_id from public.parent_child pc
      join anc on pc.child_id = anc.person_id
      where pc.id is distinct from new.id
    )
    select 1 from anc where anc.person_id = new.child_id
  ) then
    raise exception 'This would make someone their own ancestor'
      using errcode = 'check_violation', constraint = 'parent_child_no_cycle';
  end if;

  if new.kind = 'biological' and (
    select count(*) from public.parent_child pc
    where pc.child_id = new.child_id and pc.kind = 'biological' and pc.id is distinct from new.id
  ) >= 2 then
    raise exception 'A person can have at most two biological parents'
      using errcode = 'check_violation', constraint = 'parent_child_max_two_biological';
  end if;

  return new;
end
$$;

create trigger parent_child_00_guard before insert or update of parent_id, child_id, kind
  on public.parent_child
  for each row execute function public.parent_child_guard();

-- A parent-child edge that names a union must come from one of that union's members.
create function public.parent_child_check_union()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.union_id is not null and not exists (
    select 1 from public.union_members um
    where um.union_id = new.union_id and um.person_id = new.parent_id
  ) then
    raise exception 'Parent is not a member of the union this child is linked to'
      using errcode = 'check_violation', constraint = 'parent_child_union_member';
  end if;
  return null;
end
$$;

create function public.union_members_check_children()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.parent_child pc
    where pc.union_id = old.union_id and pc.parent_id = old.person_id
  ) then
    raise exception 'Cannot remove a union member who has children linked through that union'
      using errcode = 'check_violation', constraint = 'parent_child_union_member';
  end if;
  return null;
end
$$;

create constraint trigger parent_child_union_member
  after insert or update of union_id, parent_id on public.parent_child
  deferrable initially deferred
  for each row execute function public.parent_child_check_union();

create constraint trigger union_members_children_linked
  after delete on public.union_members
  deferrable initially deferred
  for each row execute function public.union_members_check_children();

create function public.union_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_space_graph(new.space_id);
  if (select count(*) from public.union_members um
      where um.union_id = new.union_id and um.person_id <> new.person_id) >= 2 then
    raise exception 'A union has at most two members'
      using errcode = 'check_violation', constraint = 'union_members_max_two';
  end if;
  return new;
end
$$;

create trigger union_members_00_guard before insert on public.union_members
  for each row execute function public.union_members_guard();

------------------------------------------------------------------------------------------
-- Membership.
------------------------------------------------------------------------------------------

create function public.spaces_add_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.space_members (space_id, user_id, role) values (new.id, new.created_by, 'owner');
  end if;
  return null;
end
$$;

create trigger spaces_add_owner after insert on public.spaces
  for each row execute function public.spaces_add_owner();

create function public.space_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.persons;
begin
  -- A space always keeps at least one owner (unless the space itself is being deleted).
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.spaces s where s.id = old.space_id)
     and not exists (
       select 1 from public.space_members m
       where m.space_id = old.space_id and m.role = 'owner' and m.user_id <> old.user_id
     ) then
    raise exception 'A family space needs at least one owner'
      using errcode = 'check_violation', constraint = 'space_members_last_owner';
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.person_id is not null
     and (tg_op = 'INSERT' or new.person_id is distinct from old.person_id) then
    select * into v_person from public.persons p where p.id = new.person_id;
    if v_person.is_placeholder or v_person.is_deceased or v_person.deleted_at is not null
       or v_person.merged_into is not null then
      raise exception 'This person cannot be claimed'
        using errcode = 'check_violation', constraint = 'space_members_claimable';
    end if;
    if v_person.phone is null and not v_person.is_minor then
      raise exception 'Add a phone number to this profile before claiming it'
        using errcode = 'check_violation', constraint = 'persons_phone_required';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger space_members_00_guard before insert or update or delete on public.space_members
  for each row execute function public.space_members_guard();
