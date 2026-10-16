-- Hardening from the Supabase advisors.
--
-- 1. RLS policies call auth.uid() once per query instead of once per row: wrapping it in a
--    sub-select lets Postgres evaluate it a single time. Same rules, faster on big families.
-- 2. public.health(): the one function anonymous callers may run, so an uptime monitor can
--    check the database (and keep a free project awake) without signing in. It reads nothing.

alter policy spaces_select on public.spaces
  using (public.is_member(id) or created_by = (select auth.uid()));
alter policy spaces_insert on public.spaces
  with check (created_by = (select auth.uid()));

alter policy space_members_delete on public.space_members
  using (
    user_id = (select auth.uid())
    or (public.has_role(space_id, 'admin') and (role <> 'owner' or public.has_role(space_id, 'owner')))
  );

alter policy claim_requests_select on public.claim_requests
  using (user_id = (select auth.uid()) or public.has_role(space_id, 'admin'));
alter policy claim_requests_insert on public.claim_requests
  with check (user_id = (select auth.uid()) and status = 'pending' and public.is_member(space_id));
alter policy claim_requests_delete on public.claim_requests
  using (user_id = (select auth.uid()) and status = 'pending');

alter policy suggestions_select on public.suggestions
  using (
    proposed_by = (select auth.uid())
    or public.has_role(space_id, 'admin')
    or exists (select 1 from public.space_members m
               where m.space_id = suggestions.space_id and m.person_id = suggestions.person_id
                 and m.user_id = (select auth.uid()))
  );
alter policy suggestions_insert on public.suggestions
  with check (proposed_by = (select auth.uid()) and status = 'pending' and public.has_role(space_id, 'editor'));
alter policy suggestions_update on public.suggestions
  using (
    public.has_role(space_id, 'admin')
    or exists (select 1 from public.space_members m
               where m.space_id = suggestions.space_id and m.person_id = suggestions.person_id
                 and m.user_id = (select auth.uid()))
  );

alter policy saved_views_own on public.saved_views
  using (user_id = (select auth.uid()) and public.is_member(space_id))
  with check (user_id = (select auth.uid()) and public.is_member(space_id));

alter policy submissions_select on public.submissions
  using (submitter_user_id = (select auth.uid()) or public.has_role(space_id, 'admin'));
alter policy submissions_insert on public.submissions
  with check (
    submitter_user_id = (select auth.uid())
    and form_link_id is null
    and (mode = 'self' or (mode = 'interview' and public.has_role(space_id, 'editor')))
    and public.is_member(space_id)
  );
alter policy submissions_update on public.submissions
  using (public.has_role(space_id, 'admin') or (submitter_user_id = (select auth.uid()) and status = 'draft'))
  with check (public.has_role(space_id, 'admin') or submitter_user_id = (select auth.uid()));
alter policy submissions_delete on public.submissions
  using (submitter_user_id = (select auth.uid()) and status = 'draft');

create function public.health()
returns boolean
language sql
stable
set search_path = ''
as $$ select true $$;

comment on function public.health() is 'Uptime check; reads no data. The only function anon may execute.';

revoke execute on function public.health() from public;
grant execute on function public.health() to anon, authenticated;

-- 3. Names are stored in one Unicode form (NFC), so "José" typed on a Mac (e + combining accent)
--    and on a phone (é) are the same name for search and duplicate checks. Otherwise unchanged.
create or replace function public.persons_normalise()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.identity_id is null then
    insert into public.identities default values returning id into new.identity_id;
  end if;

  new.given_name := normalize(nullif(btrim(new.given_name), ''), NFC);
  new.family_name := normalize(nullif(btrim(new.family_name), ''), NFC);
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
