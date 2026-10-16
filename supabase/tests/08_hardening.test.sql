begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.sid(k text) returns uuid language sql immutable as $$
  select md5('vanshview:' || k)::uuid
$$;
create function pg_temp.adult(given text, family text) returns jsonb language sql immutable as $$
  select jsonb_build_object('given_name', given, 'family_name', family, 'phone_status', 'requested',
                            'location', jsonb_build_object('label', 'Goa'))
$$;

-- RLS policies evaluate auth.uid() once per query (Supabase advisor 0003) ----------------
select is(
  (select array_agg(policyname::text) from pg_policies
   where schemaname = 'public'
     and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), 'SELECT auth\.uid\(\) AS uid', '', 'g')
         ~ 'auth\.uid\(\)'),
  null, 'no RLS policy calls auth.uid() once per row');

-- Uptime check ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is(public.health(), true, 'anyone can run the uptime check');
select throws_ok($$select count(*) from public.persons$$, '42501', null, 'but still cannot read any data');
reset role;

-- Names from every family ----------------------------------------------------------------
insert into auth.users (id, phone, aud, role) values (pg_temp.sid('user:rose'), '919800000301', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.sid('user:rose'), 'role', 'authenticated')::text, true);
set local role authenticated;

create temp table t (k text primary key, v uuid);
create function pg_temp.v(key text) returns uuid language sql stable as $$ select v from t where k = key $$;
insert into t values ('space', public.start_family('D''Souza family',
  jsonb_build_object('given_name', 'Rose', 'family_name', 'D''Souza', 'phone', '+919800000301', 'location', jsonb_build_object('label', 'Goa'))));
insert into t select 'me', person_id from public.space_members where user_id = auth.uid();

insert into t values ('curly', public.add_sibling(pg_temp.v('me'), pg_temp.adult('Mary', 'D’Souza')));
insert into t values ('hindi', public.add_sibling(pg_temp.v('me'), pg_temp.adult('नीलम', 'मल्होत्रा')));
insert into t values ('urdu', public.add_sibling(pg_temp.v('me'), pg_temp.adult('زینب', 'خان')));
insert into t values ('emoji', public.add_child(pg_temp.v('me'), pg_temp.adult('Baby 🌸', null) || '{"minor_override": true}'));
insert into t values ('mac', public.add_sibling(pg_temp.v('me'), pg_temp.adult(E'José', 'Gonçalves')));

select is((select family_name from public.persons where id = pg_temp.v('me')), 'D''Souza', 'straight apostrophes are kept');
select is((select given_name || ' ' || family_name from public.persons where id = pg_temp.v('hindi')), 'नीलम मल्होत्रा', 'Devanagari is kept as typed');
select is((select given_name || ' ' || family_name from public.persons where id = pg_temp.v('urdu')), 'زینب خان', 'Urdu (right-to-left) is kept as typed');
select is((select given_name from public.persons where id = pg_temp.v('emoji')), 'Baby 🌸', 'emoji are kept');
select is((select given_name from public.persons where id = pg_temp.v('mac')), 'José', 'accents are stored in one form (NFC)');

-- The same filters the app's search sends: apostrophes become a one-character wildcard.
select set_eq(
  $$select id from public.persons where space_id = (select v from t where k = 'space') and not is_placeholder and family_name ilike '%D_Souza%'$$,
  $$select v from t where k in ('me', 'curly')$$,
  'searching D''Souza finds both apostrophe styles');
select set_eq(
  $$select id from public.persons where space_id = (select v from t where k = 'space') and not is_placeholder and family_name ilike '%मल्होत्रा%'$$,
  $$select v from t where k = 'hindi'$$,
  'searching in Devanagari works');
select ok(
  exists (select 1 from public.dedup_candidates(pg_temp.v('space'), 'Mary', 'D''Souza') d where d.person_id = pg_temp.v('curly')),
  'adding "Mary D''Souza" again offers the existing Mary D’Souza');

select * from finish();
rollback;
