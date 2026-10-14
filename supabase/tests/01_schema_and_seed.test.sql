begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function pg_temp.sid(k text) returns uuid language sql immutable as $$
  select md5('vanshview:' || k)::uuid
$$;

-- Structure -------------------------------------------------------------------------------
select has_extension('pg_trgm', 'pg_trgm is installed');

select is(
  (select count(*)::int from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS is enabled on every public table');

select is(
  (select count(*)::int from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'),
  0, 'anon has no privileges on any public table');

select is(
  (select count(*)::int from information_schema.columns col
   join pg_class c on c.relname = col.table_name and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
   where col.table_schema = 'public' and col.column_name = 'space_id'
     and col.table_name not in ('change_log', 'saved_views')
     and not exists (select 1 from pg_trigger t
                     where t.tgrelid = c.oid and t.tgname = col.table_name || '_change_log')),
  0, 'every space-owned table (except saved_views) writes to change_log');

select is(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  0, 'anon cannot execute any public function');

select ok(
  not has_function_privilege('authenticated', 'public.refresh_minor_flags()', 'execute')
  and not has_function_privilege('authenticated', 'public.log_change()', 'execute')
  and has_function_privilege('authenticated', 'public.add_parent(uuid, jsonb, uuid, public.parent_child_kind, boolean, public.union_kind)', 'execute'),
  'signed-in users can call app functions but not internal ones (trigger functions, scheduled jobs)');

select ok(
  (select count(*) from public.persons p
   where not exists (select 1 from public.identities i where i.id = p.identity_id)) = 0,
  'every person has an identity (cross-space linking hook)');

-- Seed shape ------------------------------------------------------------------------------
select is((select count(*)::int from public.persons where space_id = pg_temp.sid('space')), 60, '60 persons');
select is((select max(depth) from public.descendants(pg_temp.sid('hari'))) + 1, 5, '5 generations from Hari Ram');
select is((select count(*)::int from public.persons where is_minor), 3, 'three living minors');
select is((select count(*)::int from public.persons where is_placeholder), 2, 'two placeholder parents');
select is(
  (select array_agg(distinct pl.country_code order by pl.country_code)
   from public.person_places pp join public.places pl on pl.id = pp.place_id where pp.kind = 'current'),
  array['AE', 'GB', 'IN', 'US'], 'living relatives across India, UK, US and UAE');
select is(
  (select array_agg(distinct script order by script) from public.person_names where script <> 'Latn'),
  array['Deva', 'Guru', 'Taml'], 'names in Devanagari, Gurmukhi and Tamil');
select is(
  (select count(*)::int from public.union_members um join public.unions u on u.id = um.union_id
   where um.person_id = pg_temp.sid('ashwin') and u.kind = 'marriage'),
  2, 'Ashwin married twice (divorce, then remarriage)');
select ok(
  exists (select 1 from public.parent_child where child_id = pg_temp.sid('simran') and kind = 'adoptive')
  and exists (select 1 from public.parent_child where child_id = pg_temp.sid('dev') and kind = 'step'),
  'an adoption and a step-child are present');
select is(
  (select count(*)::int from public.submissions where status = 'pending' and mode = 'public'),
  2, 'two pending public-form submissions');
select ok(
  (select count(*) from public.persons
   where (birth_qualifier = 'about' or death_qualifier = 'about') and is_deceased) >= 3
  and (select count(*) from public.persons where birth_precision = 'year' and is_deceased) >= 3,
  'deceased ancestors have year-only and "about" dates');

select * from finish();
rollback;
