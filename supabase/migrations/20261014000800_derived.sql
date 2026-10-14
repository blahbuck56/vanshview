-- Derived queries. All are SECURITY INVOKER, so RLS applies to whoever calls them.
-- "Live" persons are those that are neither soft-deleted nor merged into someone else.

create function public.ancestors(p_person_id uuid, p_max_depth integer default 50)
returns table (person_id uuid, depth integer)
language sql stable
set search_path = ''
as $$
  with recursive walk(person_id, depth) as (
    select pc.parent_id, 1 from public.parent_child pc where pc.child_id = p_person_id
    union
    select pc.parent_id, w.depth + 1
    from public.parent_child pc join walk w on pc.child_id = w.person_id
    where w.depth < p_max_depth
  )
  select w.person_id, min(w.depth)::integer
  from walk w
  join public.persons p on p.id = w.person_id and p.deleted_at is null and p.merged_into is null
  where p_max_depth >= 1
  group by w.person_id
$$;

create function public.descendants(p_person_id uuid, p_max_depth integer default 50)
returns table (person_id uuid, depth integer)
language sql stable
set search_path = ''
as $$
  with recursive walk(person_id, depth) as (
    select pc.child_id, 1 from public.parent_child pc where pc.parent_id = p_person_id
    union
    select pc.child_id, w.depth + 1
    from public.parent_child pc join walk w on pc.parent_id = w.person_id
    where w.depth < p_max_depth
  )
  select w.person_id, min(w.depth)::integer
  from walk w
  join public.persons p on p.id = w.person_id and p.deleted_at is null and p.merged_into is null
  where p_max_depth >= 1
  group by w.person_id
$$;

-- Siblings derived from shared parents and unions. Never stored.
--   full: exactly the same two (or more) parents, counting biological, adoptive and unknown
--   half: at least one shared parent, not full
--   step: no shared parent, but a parent of one is in a union with a parent of the other
create function public.siblings(p_person_id uuid)
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
        when cardinality(s.parent_ids) >= 2
         and cardinality(s.parent_ids) = (select count(*) from my_parents)
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

-- Everything the focus view needs in one call: persons within `up` generations above and
-- `down` below the focus, the focus's siblings, everyone's partners, and the edges among them.
create function public.neighborhood(p_focus_id uuid, p_up integer default 3, p_down integer default 3)
returns jsonb
language sql stable
set search_path = ''
as $$
  with core as (
    select p_focus_id as person_id
    union select a.person_id from public.ancestors(p_focus_id, p_up) a
    union select d.person_id from public.descendants(p_focus_id, p_down) d
    union
    select sib.child_id
    from public.parent_child mine
    join public.parent_child sib on sib.parent_id = mine.parent_id
    where mine.child_id = p_focus_id and p_up >= 1
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

-- Duplicate candidates for "link an existing person" and the review queue.
-- Exact phone match always ranks first; then name similarity (main and alternate names),
-- same place, birth year within 3 years, and shared relatives as a boost.
create function public.dedup_candidates(
  p_space_id uuid,
  p_given text,
  p_family text default null,
  p_phone text default null,
  p_location text default null,
  p_birth_year integer default null,
  p_related_person_ids uuid[] default null,
  p_exclude_person_id uuid default null,
  p_limit integer default 10
)
returns table (person_id uuid, score numeric, reasons text[])
language sql stable
set search_path = ''
as $$
  with q as (
    select lower(btrim(coalesce(p_given, '') || ' ' || coalesce(p_family, ''))) as name
  ),
  cand as (
    select p.id, p.birth_date, p.birth_precision, p.phone,
      greatest(
        extensions.similarity(lower(coalesce(p.given_name, '') || ' ' || coalesce(p.family_name, '')), q.name),
        coalesce((
          select max(extensions.similarity(lower(coalesce(n.given, '') || ' ' || coalesce(n.family, '')), q.name))
          from public.person_names n where n.person_id = p.id), 0)
      ) as name_sim
    from public.persons p cross join q
    where p.space_id = p_space_id
      and p.deleted_at is null and p.merged_into is null and not p.is_placeholder
      and p.id is distinct from p_exclude_person_id
  ),
  scored as (
    select c.id, c.name_sim,
      (p_phone is not null and c.phone = p_phone) as phone_match,
      (p_location is not null and exists (
        select 1 from public.person_places pp
        join public.places pl on pl.id = pp.place_id
        where pp.person_id = c.id
          and extensions.similarity(lower(pl.label), lower(p_location)) > 0.45)) as place_match,
      case
        when p_birth_year is null or c.birth_date is null or c.birth_precision in ('unknown', 'decade') then null
        else abs(extract(year from c.birth_date)::integer - p_birth_year)
      end as year_gap,
      (p_related_person_ids is not null and (
        exists (select 1 from public.parent_child pc
                where (pc.parent_id = c.id and pc.child_id = any (p_related_person_ids))
                   or (pc.child_id = c.id and pc.parent_id = any (p_related_person_ids)))
        or exists (select 1 from public.union_members a
                   join public.union_members b on a.union_id = b.union_id and a.person_id <> b.person_id
                   where a.person_id = c.id and b.person_id = any (p_related_person_ids)))) as related
    from cand c
  ),
  ranked as (
  select s.id, s.phone_match,
    round((
      case when s.phone_match then 100 else 0 end
      + s.name_sim * 50
      + case when s.place_match then 15 else 0 end
      + case when s.year_gap is null then 0 when s.year_gap <= 3 then 15 - s.year_gap * 2 else -20 end
      + case when s.related then 10 else 0 end
    )::numeric, 1) as score,
    array_remove(array[
      case when s.phone_match then 'same_phone' end,
      case when s.name_sim >= 0.5 then 'similar_name' end,
      case when s.place_match then 'same_place' end,
      case when s.year_gap <= 3 then 'birth_year_close' end,
      case when s.related then 'shared_relatives' end
    ], null) as reasons
  from scored s
  where s.phone_match or s.name_sim >= 0.3
  )
  -- A shared surname alone (score below 25) is not worth showing.
  select r.id, r.score, r.reasons
  from ranked r
  where r.phone_match or r.score >= 25
  order by r.phone_match desc, r.score desc, r.id
  limit p_limit
$$;

-- Soft warnings. Never blocking; surfaced in the UI for review.
create view public.data_issues
with (security_invoker = true)
as
with live as (
  select * from public.persons where deleted_at is null and merged_into is null
)
-- Parent younger than 12 at the child's birth.
select c.space_id, 'parent_too_young'::text as issue, array[p.id, c.id] as person_ids,
  jsonb_build_object('parent_birth', p.birth_date, 'child_birth', c.birth_date) as details
from public.parent_child pc
join live p on p.id = pc.parent_id
join live c on c.id = pc.child_id
where pc.kind in ('biological', 'unknown')
  and p.birth_precision <> 'unknown' and c.birth_precision <> 'unknown'
  and public.fuzzy_date_end(c.birth_date, c.birth_precision) < p.birth_date + interval '12 years'

union all
-- Child born more than a year after a parent's death.
select c.space_id, 'born_after_parent_death', array[p.id, c.id],
  jsonb_build_object('parent_death', p.death_date, 'child_birth', c.birth_date)
from public.parent_child pc
join live p on p.id = pc.parent_id
join live c on c.id = pc.child_id
where pc.kind in ('biological', 'unknown')
  and p.death_precision <> 'unknown' and c.birth_precision <> 'unknown'
  and c.birth_date > public.fuzzy_date_end(p.death_date, p.death_precision) + interval '1 year'

union all
-- Union member younger than 16 at the union's start.
select p.space_id, 'union_member_too_young', array[p.id],
  jsonb_build_object('union_id', u.id, 'union_start', u.start_date, 'birth', p.birth_date)
from public.unions u
join public.union_members um on um.union_id = u.id
join live p on p.id = um.person_id
where u.deleted_at is null
  and u.start_precision <> 'unknown' and p.birth_precision <> 'unknown'
  and public.fuzzy_date_end(u.start_date, u.start_precision) < p.birth_date + interval '16 years'

union all
-- Lifespan over 120 years, or a living person born over 120 years ago.
select p.space_id, 'implausible_age', array[p.id],
  jsonb_build_object('birth', p.birth_date, 'death', p.death_date, 'is_deceased', p.is_deceased)
from live p
where p.birth_precision <> 'unknown'
  and coalesce(
        case when p.death_precision <> 'unknown' then p.death_date end,
        case when not p.is_deceased then current_date end
      ) > public.fuzzy_date_end(p.birth_date, p.birth_precision) + interval '120 years'

union all
-- Fuzzy dates that put death before birth (exact conflicts are blocked outright).
select p.space_id, 'death_before_birth', array[p.id],
  jsonb_build_object('birth', p.birth_date, 'death', p.death_date)
from live p
where p.birth_precision <> 'unknown' and p.death_precision <> 'unknown'
  and public.fuzzy_date_end(p.death_date, p.death_precision) < p.birth_date

union all
-- Likely duplicates: similar full AND given names, compatible birth years, and not already
-- connected as parent/child, siblings or partners (a shared surname alone is not a signal).
select a.space_id, 'likely_duplicate', array[a.id, b.id],
  jsonb_build_object('name_similarity', round(extensions.similarity(
    lower(coalesce(a.given_name, '') || ' ' || coalesce(a.family_name, '')),
    lower(coalesce(b.given_name, '') || ' ' || coalesce(b.family_name, '')))::numeric, 2))
from live a
join live b on b.space_id = a.space_id and a.id < b.id
where not a.is_placeholder and not b.is_placeholder
  and extensions.similarity(
        lower(coalesce(a.given_name, '') || ' ' || coalesce(a.family_name, '')),
        lower(coalesce(b.given_name, '') || ' ' || coalesce(b.family_name, ''))) >= 0.5
  and (a.birth_precision in ('unknown', 'decade') or b.birth_precision in ('unknown', 'decade')
       or abs(extract(year from a.birth_date) - extract(year from b.birth_date)) <= 3)
  and extensions.similarity(lower(coalesce(a.given_name, '')), lower(coalesce(b.given_name, ''))) >= 0.5
  and not exists (select 1 from public.parent_child pc
                  where (pc.parent_id = a.id and pc.child_id = b.id) or (pc.parent_id = b.id and pc.child_id = a.id))
  and not exists (select 1 from public.parent_child x
                  join public.parent_child y on y.parent_id = x.parent_id
                  where x.child_id = a.id and y.child_id = b.id)
  and not exists (select 1 from public.union_members x
                  join public.union_members y on y.union_id = x.union_id
                  where x.person_id = a.id and y.person_id = b.id)

union all
-- Same phone number on two people (shared landlines exist, so this is only a warning).
select a.space_id, 'duplicate_phone', array[a.id, b.id], jsonb_build_object('phone', a.phone)
from live a
join live b on b.space_id = a.space_id and a.id < b.id and a.phone = b.phone

union all
-- Living adults whose phone was skipped with "ask later".
select p.space_id, 'missing_phone', array[p.id], '{}'::jsonb
from live p
where p.phone_status = 'requested'

union all
-- Two marriages for the same person that overlap in time.
select p.space_id, 'overlapping_marriages', array[p.id],
  jsonb_build_object('union_ids', array[u1.id, u2.id])
from live p
join public.union_members m1 on m1.person_id = p.id
join public.union_members m2 on m2.person_id = p.id and m1.union_id < m2.union_id
join public.unions u1 on u1.id = m1.union_id and u1.kind = 'marriage' and u1.deleted_at is null
join public.unions u2 on u2.id = m2.union_id and u2.kind = 'marriage' and u2.deleted_at is null
where (
    u1.end_date is null and u1.end_reason is null and u2.end_date is null and u2.end_reason is null
  ) or (
    u1.start_date is not null and u2.start_date is not null
    and u1.start_date < coalesce(public.fuzzy_date_end(u2.end_date, u2.end_precision), 'infinity'::date)
    and u2.start_date < coalesce(public.fuzzy_date_end(u1.end_date, u1.end_precision), 'infinity'::date)
  )

union all
-- Places saved as free text, waiting for geocoding.
select pl.space_id, 'place_needs_geocoding',
  coalesce((select array_agg(distinct pp.person_id) from public.person_places pp where pp.place_id = pl.id), array[]::uuid[]),
  jsonb_build_object('place_id', pl.id, 'label', pl.label)
from public.places pl
where pl.needs_geocoding;

-- Daily job: people cross the 18 threshold without anyone editing them. A new adult without
-- a phone is moved to "ask later" (surfaced in data_issues) rather than failing the update.
create function public.refresh_minor_flags()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.persons p
  set is_minor = public.compute_is_minor(p.birth_date, p.birth_precision, p.minor_override, p.is_deceased, current_date),
      phone_status = case
        when p.phone is null and not p.is_deceased and not p.is_placeholder
         and not public.compute_is_minor(p.birth_date, p.birth_precision, p.minor_override, p.is_deceased, current_date)
        then 'requested'::public.phone_status
        else p.phone_status
      end
  where p.is_minor is distinct from
        public.compute_is_minor(p.birth_date, p.birth_precision, p.minor_override, p.is_deceased, current_date);
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- Schedule it where pg_cron is available (hosted Supabase and the Supabase CLI stack).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('vanshview-refresh-minor-flags', '7 0 * * *', 'select public.refresh_minor_flags()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end
$$;

-- Function privileges: nothing is callable by anon; members get the read helpers.
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
grant execute on function
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
grant select on public.data_issues to authenticated;
revoke all on public.data_issues from anon;
