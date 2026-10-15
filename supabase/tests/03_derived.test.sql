begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create function pg_temp.sid(k text) returns uuid language sql immutable as $$
  select md5('vanshview:' || k)::uuid
$$;

create function pg_temp.sib(a text, b text) returns text language sql stable as $$
  select kind from public.siblings(pg_temp.sid(a)) where person_id = pg_temp.sid(b)
$$;

-- Ancestors / descendants -------------------------------------------------------------------
select is((select count(*)::int from public.ancestors(pg_temp.sid('arjun'))), 10, 'Arjun has 10 ancestors');
select is((select count(*)::int from public.ancestors(pg_temp.sid('arjun'), 1)), 2, 'depth 1 = parents');
select is(
  (select depth from public.ancestors(pg_temp.sid('arjun')) where person_id = pg_temp.sid('hari')), 3,
  'Hari Ram is three generations above Arjun');
select is((select count(*)::int from public.descendants(pg_temp.sid('mohan'), 2)), 9, 'Mohan: children and grandchildren');
select is((select count(*)::int from public.ancestors(pg_temp.sid('rohan'))), 2, 'placeholder parents count as ancestors');

-- Siblings: derived, never stored -----------------------------------------------------------
select is(pg_temp.sib('arjun', 'tanvi'), 'full', 'Arjun and Tanvi: full siblings');
select is(pg_temp.sib('rohan', 'kriti'), 'full', 'Rohan and Kriti: full siblings via placeholder parents');
select is(pg_temp.sib('kunal', 'aisha'), 'half', 'Kunal and Aisha: half (share Ashwin)');
select is(pg_temp.sib('dev', 'aisha'), 'half', 'Dev and Aisha: half (share Nisha)');
select is(pg_temp.sib('kunal', 'dev'), 'step', 'Kunal and Dev: step (Ashwin is married to Dev''s mother)');
select is(pg_temp.sib('dev', 'kunal'), 'step', 'step is symmetric');
select is((select count(*)::int from public.siblings(pg_temp.sid('simran'))), 0, 'Simran (adopted, only child) has no siblings');
select is((select count(*)::int from public.siblings(pg_temp.sid('rajiv'))), 2, 'Rajiv has two full siblings');

-- Neighborhood (focus view in one call) -----------------------------------------------------
create temp table nb as select public.neighborhood(pg_temp.sid('arjun'), 2, 1) as n;
select ok(
  (select n ? 'persons' and n ? 'parent_child' and n ? 'unions' and n ? 'union_members' from nb),
  'neighborhood returns persons, parent_child, unions and union_members');
select ok(
  (select bool_and(x) from (
    select exists (select 1 from nb, jsonb_array_elements(n -> 'persons') p where p ->> 'id' = pg_temp.sid(k)::text) as x
    from unnest(array['arjun', 'meera', 'tanvi', 'rajiv', 'mohan', 'satwant', 'kabir', 'ira', 'rohan']) k) q),
  'includes focus, partner, sibling, ancestors, children and partners of relatives');
select ok(
  not exists (select 1 from nb, jsonb_array_elements(n -> 'persons') p
              where p ->> 'id' = pg_temp.sid('hari')::text),
  'excludes people beyond the requested depth');
select ok(
  exists (select 1 from nb, jsonb_array_elements(n -> 'persons') p
          where p ->> 'id' = pg_temp.sid('ashwin')::text),
  'includes side branches: uncles and aunts (and their children)');
select ok(
  not exists (
    select 1 from nb, jsonb_array_elements(n -> 'parent_child') e
    where not exists (select 1 from jsonb_array_elements(n -> 'persons') p where p ->> 'id' = e ->> 'child_id')
       or not exists (select 1 from jsonb_array_elements(n -> 'persons') p where p ->> 'id' = e ->> 'parent_id')),
  'every returned edge connects two returned persons');

-- Dedup candidates -----------------------------------------------------------------------
select is(
  (select person_id from public.dedup_candidates(pg_temp.sid('space'), 'R', 'Mehra', '+447911123022') limit 1),
  pg_temp.sid('rohan'), 'exact phone match ranks first even when the name barely matches');
select ok(
  (select reasons @> array['same_phone'] from public.dedup_candidates(pg_temp.sid('space'), 'Rohan', 'Mehra', '+447911123022') limit 1),
  'match reasons explain the phone match');
select is(
  (select person_id from public.dedup_candidates(pg_temp.sid('space'), 'Kritika', 'Mehra', null, 'Mumbai', 1998) limit 1),
  pg_temp.sid('kriti'), 'Kritika Mehra (1998) finds Kriti Mehra (1997)');
select is(
  (select array_agg(person_id order by person_id) from public.dedup_candidates(pg_temp.sid('space'), 'Kamla', 'Devi', null, 'Amritsar', 1932)),
  (select array_agg(x order by x) from unnest(array[pg_temp.sid('kamla'), pg_temp.sid('kamla_dup')]) x),
  'both Kamla Devi records surface');

-- data_issues (soft warnings) ------------------------------------------------------------
select ok(
  exists (select 1 from public.data_issues where issue = 'likely_duplicate'
          and person_ids @> array[pg_temp.sid('kamla'), pg_temp.sid('kamla_dup')]),
  'near-duplicate Kamla Devi records are flagged');
select is(
  (select count(*)::int from public.data_issues where issue = 'likely_duplicate'), 1,
  'no false duplicates from shared surnames or siblings');
select ok(
  exists (select 1 from public.data_issues where issue = 'duplicate_phone'
          and person_ids @> array[pg_temp.sid('rajiv'), pg_temp.sid('neelam')]),
  'shared landline is a warning, not a block');

-- Crafted problems
insert into public.persons (id, space_id, given_name, birth_date, birth_precision, is_deceased)
values (pg_temp.sid('young_parent'), pg_temp.sid('space'), 'Young', '1985-01-01', 'year', true);
insert into public.person_places (space_id, person_id, place_id, kind)
values (pg_temp.sid('space'), pg_temp.sid('young_parent'), pg_temp.sid('place:pune'), 'death');
insert into public.parent_child (space_id, parent_id, child_id, kind)
values (pg_temp.sid('space'), pg_temp.sid('young_parent'), pg_temp.sid('pooja'), 'unknown');
insert into public.unions (id, space_id, kind, start_date, start_precision)
values (pg_temp.sid('union:early'), pg_temp.sid('space'), 'marriage', '1995-01-01', 'year');
insert into public.union_members (union_id, person_id, space_id)
values (pg_temp.sid('union:early'), pg_temp.sid('aisha'), pg_temp.sid('space')),
       (pg_temp.sid('union:early'), pg_temp.sid('jaspreet'), pg_temp.sid('space'));
insert into public.unions (id, space_id, kind)
values (pg_temp.sid('union:second'), pg_temp.sid('space'), 'marriage');
insert into public.union_members (union_id, person_id, space_id)
values (pg_temp.sid('union:second'), pg_temp.sid('rajiv'), pg_temp.sid('space')),
       (pg_temp.sid('union:second'), pg_temp.sid('rita'), pg_temp.sid('space'));

select ok(
  (select array_agg(distinct issue) from public.data_issues) @> array[
    'parent_too_young', 'union_member_too_young', 'overlapping_marriages', 'missing_phone', 'place_needs_geocoding'],
  'parent too young, union member too young, overlapping marriages, missing phone and ungeocoded places are reported');

insert into public.persons (id, space_id, given_name, birth_date, birth_precision, death_date, death_precision, is_deceased)
values (pg_temp.sid('old_parent'), pg_temp.sid('space'), 'Old', '1900-01-01', 'year', '1950-01-01', 'year', true);
insert into public.person_places (space_id, person_id, place_id, kind)
values (pg_temp.sid('space'), pg_temp.sid('old_parent'), pg_temp.sid('place:pune'), 'death');
insert into public.parent_child (space_id, parent_id, child_id, kind)
values (pg_temp.sid('space'), pg_temp.sid('old_parent'), pg_temp.sid('myra'), 'unknown');
select ok(
  exists (select 1 from public.data_issues where issue = 'born_after_parent_death'
          and person_ids = array[pg_temp.sid('old_parent'), pg_temp.sid('myra')]),
  'a child born more than a year after a parent''s death is reported');

select * from finish();
rollback;
