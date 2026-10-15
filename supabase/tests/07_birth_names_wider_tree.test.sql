begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

create function pg_temp.sid(k text) returns uuid language sql immutable as $$
  select md5('vanshview:' || k)::uuid
$$;
create function pg_temp.adult(given text, gender text default 'unknown') returns jsonb language sql immutable as $$
  select jsonb_build_object('given_name', given, 'family_name', 'Sharma', 'gender', gender, 'phone_status', 'requested',
                            'location', jsonb_build_object('label', 'Lucknow'))
$$;

insert into auth.users (id, phone, aud, role) values (pg_temp.sid('user:ankit'), '919800000201', 'authenticated', 'authenticated');
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.sid('user:ankit'), 'role', 'authenticated')::text, true);
set local role authenticated;

create temp table t (k text primary key, v uuid);
create function pg_temp.v(key text) returns uuid language sql stable as $$ select v from t where k = key $$;
insert into t values ('space', public.start_family('Sharma family',
  jsonb_build_object('given_name', 'Ankit', 'family_name', 'Sharma', 'phone', '+919800000201', 'location', jsonb_build_object('label', 'Bengaluru'))));
insert into t select 'me', person_id from public.space_members where user_id = auth.uid();

-- Family name at birth -------------------------------------------------------------------
insert into t values ('dad', public.add_parent(pg_temp.v('me'), pg_temp.adult('Rajesh', 'male')));
insert into t values ('aunt', public.add_sibling(pg_temp.v('dad'),
  pg_temp.adult('Meena', 'female') || '{"family_name": "Gupta", "birth_family_name": "Sharma"}'));
select is((select family from public.person_names where person_id = pg_temp.v('aunt') and kind = 'birth'), 'Sharma',
  'create_person stores the family name at birth');
select public.update_person(pg_temp.v('aunt'), '{"birth_family_name": "Sharmaa"}');
select is((select count(*)::int from public.person_names where person_id = pg_temp.v('aunt') and kind = 'birth'), 1,
  'updating it keeps one birth name');
select is((select family from public.person_names where person_id = pg_temp.v('aunt') and kind = 'birth'), 'Sharmaa',
  'and changes it');
select public.update_person(pg_temp.v('aunt'), '{"birth_family_name": ""}');
select is((select count(*)::int from public.person_names where person_id = pg_temp.v('aunt') and kind = 'birth'), 0,
  'an empty value clears it');
select is((select family_name from public.persons where id = pg_temp.v('aunt')), 'Gupta',
  'without touching the current family name');

-- Wider tree -----------------------------------------------------------------------------
insert into t values ('cousin', public.add_child(pg_temp.v('aunt'), pg_temp.adult('Kavya', 'female')));
insert into t values ('cousin_kid', public.add_child(pg_temp.v('cousin'), pg_temp.adult('Ved', 'male')));
create temp table nb as select public.neighborhood(pg_temp.v('me'), 3, 3) as n;
select ok((select bool_and(exists (select 1 from nb, jsonb_array_elements(n -> 'persons') p where p ->> 'id' = x::text))
           from unnest(array[pg_temp.v('aunt'), pg_temp.v('cousin')]) x),
  'the tree around Ankit includes his aunt and cousin');
select ok(exists (select 1 from nb, jsonb_array_elements(n -> 'persons') p where p ->> 'id' = pg_temp.v('cousin_kid')::text),
  'and the cousin''s child (one generation below Ankit)');

select * from finish();
rollback;
