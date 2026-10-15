begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

create function pg_temp.sid(k text) returns uuid language sql immutable as $$
  select md5('vanshview:' || k)::uuid
$$;
create function pg_temp.act_as(k text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.sid('user:' || k), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.adult(given text, gender text default 'unknown') returns jsonb language sql immutable as $$
  select jsonb_build_object('given_name', given, 'family_name', 'Rao', 'gender', gender, 'phone_status', 'requested',
                            'location', jsonb_build_object('label', 'Pune'))
$$;
create function pg_temp.parents_of(child uuid) returns uuid[] language sql stable as $$
  select coalesce(array_agg(parent_id order by parent_id), '{}') from public.parent_child where child_id = child
$$;

insert into auth.users (id, phone, aud, role) values
  (pg_temp.sid('user:meera'), '919800000101', 'authenticated', 'authenticated'),
  (pg_temp.sid('user:kabir'), '919800000102', 'authenticated', 'authenticated');

create temp table t (k text primary key, v uuid);
grant all on t to authenticated;
create function pg_temp.v(key text) returns uuid language sql stable as $$ select v from t where k = key $$;

select pg_temp.act_as('meera');
set local role authenticated;
insert into t values ('space', public.start_family('Rao family',
  jsonb_build_object('given_name', 'Meera', 'family_name', 'Rao', 'phone', '+919800000101',
                     'location', jsonb_build_object('label', 'Pune'))));
insert into t select 'me', person_id from public.space_members where user_id = auth.uid();

-- Removing a wrongly added parent frees the slot -----------------------------------------
insert into t values ('mum', public.add_parent(pg_temp.v('me'), pg_temp.adult('Lata', 'female')));
insert into t values ('wrong_dad', public.add_parent(pg_temp.v('me'), pg_temp.adult('Wrong', 'male')));
insert into t values ('sis', public.add_sibling(pg_temp.v('me'), pg_temp.adult('Tara', 'female')));
insert into t select 'wrong_union', union_id from public.union_members where person_id = pg_temp.v('wrong_dad');
select public.remove_person(pg_temp.v('wrong_dad'));

select is((select count(*)::int from public.parent_child where parent_id = pg_temp.v('wrong_dad') or child_id = pg_temp.v('wrong_dad')),
  0, 'removing a person deletes their parent and child links');
select is((select count(*)::int from public.union_members where person_id = pg_temp.v('wrong_dad')),
  0, 'and their partnerships');
select ok((select deleted_at is not null from public.unions where id = pg_temp.v('wrong_union')),
  'a partnership left with one person is closed');
select ok(not exists (select 1 from public.parent_child where child_id = pg_temp.v('me') and union_id is not null),
  'and the remaining parent''s children are no longer tied to it');
select is((select kind from public.siblings(pg_temp.v('me')) where person_id = pg_temp.v('sis')), 'full',
  'siblings are derived from the remaining shared parent only');

insert into t values ('dad', public.add_parent(pg_temp.v('me'), pg_temp.adult('Ravi', 'male')));
select is(pg_temp.parents_of(pg_temp.v('me')),
  (select array_agg(x order by x) from unnest(array[pg_temp.v('mum'), pg_temp.v('dad')]) x),
  'the right father can be added after removing the wrong one');

-- Placeholders from a sibling add are replaced by the real parents -----------------------
insert into t values ('dev', public.add_partner(pg_temp.v('me'), pg_temp.adult('Dev', 'male')));
insert into t values ('dev_sib', public.add_sibling(pg_temp.v('dev'), pg_temp.adult('Kiran', 'female')));
insert into t select 'ph_mum', pc.parent_id from public.parent_child pc join public.persons p on p.id = pc.parent_id
  where pc.child_id = pg_temp.v('dev') and p.is_placeholder and p.gender = 'female';
insert into t select 'ph_dad', pc.parent_id from public.parent_child pc join public.persons p on p.id = pc.parent_id
  where pc.child_id = pg_temp.v('dev') and p.is_placeholder and p.gender = 'male';
select is(cardinality(pg_temp.parents_of(pg_temp.v('dev'))), 2, 'a sibling add with no parents creates two placeholders');

select throws_ok(
  format('select public.add_parent(%L, %L::jsonb)', pg_temp.v('dev'), pg_temp.adult('Sam')),
  '23514', null, 'a parent of unknown gender is not guessed into one of two placeholders');

insert into t values ('dev_mum', public.add_parent(pg_temp.v('dev'), pg_temp.adult('Sunita', 'female')));
select ok(pg_temp.v('dev_mum') = any (pg_temp.parents_of(pg_temp.v('dev')))
          and pg_temp.v('dev_mum') = any (pg_temp.parents_of(pg_temp.v('dev_sib'))),
  'adding a mother replaces "Unknown mother" for both siblings');
select ok((select deleted_at is not null from public.persons where id = pg_temp.v('ph_mum')),
  'the placeholder is removed');
select ok(exists (select 1 from public.union_members a join public.union_members b on b.union_id = a.union_id
                  where a.person_id = pg_temp.v('dev_mum') and b.person_id = pg_temp.v('ph_dad')),
  'and takes over the partnership with the other parent');
select is((select kind from public.siblings(pg_temp.v('dev')) where person_id = pg_temp.v('dev_sib')), 'full',
  'the siblings stay full siblings');

-- Linking an existing person as the father replaces "Unknown father" too.
insert into t values ('existing_dad', public.add_partner(pg_temp.v('mum'), pg_temp.adult('Mohan', 'male')));
select public.add_parent(pg_temp.v('dev'), null, pg_temp.v('existing_dad'));
select ok(pg_temp.v('existing_dad') = any (pg_temp.parents_of(pg_temp.v('dev_sib')))
          and not pg_temp.v('ph_dad') = any (pg_temp.parents_of(pg_temp.v('dev_sib'))),
  'linking an existing person as father replaces "Unknown father"');

-- The wizard path (commit_payload) does the same --------------------------------------------
insert into t values ('anil', public.add_partner(pg_temp.v('sis'), pg_temp.adult('Anil', 'male')));
insert into t values ('anil_sib', public.add_sibling(pg_temp.v('anil'), pg_temp.adult('Ajay', 'male')));
insert into t select 'wiz', (public.commit_payload(pg_temp.v('space'), jsonb_build_object(
  'submitter', jsonb_build_object('temp_id', 'anchor', 'existing_person_id', pg_temp.v('anil')),
  'persons', jsonb_build_array(pg_temp.adult('Usha', 'female') || '{"temp_id": "mother"}',
                               pg_temp.adult('Arun', 'male') || '{"temp_id": "father"}',
                               pg_temp.adult('Anita', 'female') || '{"temp_id": "sib"}'),
  'parent_child', jsonb_build_array(
    jsonb_build_object('parent_temp_id', 'mother', 'child_temp_id', 'anchor'),
    jsonb_build_object('parent_temp_id', 'father', 'child_temp_id', 'anchor'),
    jsonb_build_object('parent_temp_id', 'mother', 'child_temp_id', 'sib'),
    jsonb_build_object('parent_temp_id', 'father', 'child_temp_id', 'sib')),
  'unions', jsonb_build_array(jsonb_build_object('member_temp_ids', jsonb_build_array('mother', 'father'), 'kind', 'marriage'))
), 'self', pg_temp.v('anil')) ->> 'mother')::uuid;
select is(cardinality(pg_temp.parents_of(pg_temp.v('anil'))), 2, 'wizard: filling both parents keeps two parents');
select ok(pg_temp.v('wiz') = any (pg_temp.parents_of(pg_temp.v('anil_sib'))),
  'wizard: the earlier sibling gets the real mother too');
select is((select kind from public.siblings(pg_temp.v('anil')) where person_id = pg_temp.v('anil_sib')), 'full',
  'wizard: earlier and new siblings are full siblings');
select is((select count(*)::int from public.union_members a join public.union_members b
           on b.union_id = a.union_id and b.person_id <> a.person_id
           join public.unions u on u.id = a.union_id and u.deleted_at is null
           where a.person_id = pg_temp.v('wiz')), 1,
  'wizard: the parents end up with one partnership, not two');

-- Viewers get an error instead of a silent no-op ------------------------------------------
reset role;
insert into public.space_members (space_id, user_id, role) values (pg_temp.v('space'), pg_temp.sid('user:kabir'), 'viewer');
select pg_temp.act_as('kabir');
set local role authenticated;
select throws_ok(format('select public.update_person(%L, %L::jsonb)', pg_temp.v('mum'), '{"given_name": "X"}'),
  '42501', null, 'a viewer cannot edit (clear error)');
select throws_ok(format('select public.remove_person(%L)', pg_temp.v('mum')),
  '42501', null, 'a viewer cannot remove (clear error)');

-- "This is me" on a profile added without a phone uses the sign-in phone --------------
select lives_ok(format('select public.claim_self(%L)', pg_temp.v('sis')), 'a member can claim a profile that has no phone');
select is((select phone from public.persons where id = pg_temp.v('sis')), '+919800000102',
  'and it gets the phone they signed in with');

-- Members list: phones for admins, and your own -------------------------------------------
select is((select array_agg(phone order by phone nulls last) from public.list_members(pg_temp.v('space'))),
  array['+919800000102', null], 'a viewer sees only their own sign-in phone');
select pg_temp.act_as('meera');
select is((select array_agg(phone order by phone) from public.list_members(pg_temp.v('space'))),
  array['+919800000101', '+919800000102'], 'an owner sees every member''s phone');

select * from finish();
rollback;
