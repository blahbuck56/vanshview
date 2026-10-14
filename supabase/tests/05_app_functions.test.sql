begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

create function pg_temp.sid(k text) returns uuid language sql immutable as $$
  select md5('vanshview:' || k)::uuid
$$;

create function pg_temp.act_as(k text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.sid('user:' || k), 'role', 'authenticated')::text, true);
$$;

-- A living adult in the SubmissionPayload person shape.
create function pg_temp.adult(given text, phone text) returns jsonb language sql immutable as $$
  select jsonb_build_object('given_name', given, 'family_name', 'Rao', 'phone', phone,
                            'location', jsonb_build_object('label', 'Pune'))
$$;
create function pg_temp.late(given text) returns jsonb language sql immutable as $$
  select jsonb_build_object('given_name', given, 'family_name', 'Rao', 'is_deceased', true,
                            'location', jsonb_build_object('label', 'Nagpur'))
$$;

-- Edges and unions (read as postgres, so RLS does not hide anything from the assertions).
create function pg_temp.parents_of(child uuid) returns uuid[] language sql stable as $$
  select array_agg(parent_id order by parent_id) from public.parent_child where child_id = child
$$;
create function pg_temp.union_of(child uuid) returns uuid[] language sql stable as $$
  select array_agg(distinct union_id) from public.parent_child where child_id = child and union_id is not null
$$;

insert into auth.users (id, email, aud, role) values
  (pg_temp.sid('user:asha'), 'asha@example.com', 'authenticated', 'authenticated'),
  (pg_temp.sid('user:vikas'), 'vikas@example.com', 'authenticated', 'authenticated');

create temp table t (k text primary key, v uuid);
grant all on t to authenticated;

-- Onboarding ------------------------------------------------------------------------------
select pg_temp.act_as('asha');
set local role authenticated;

insert into t values ('space', public.start_family('Rao family', pg_temp.adult('Asha', '+919800000001')));
insert into t select 'me', person_id from public.space_members where user_id = auth.uid();

select is((select role::text from public.space_members where user_id = auth.uid()), 'owner',
  'start_family makes the caller the owner');
select is((select given_name from public.persons where id = (select v from t where k = 'me')), 'Asha',
  'and adds them as a person they have claimed');

-- Parents: second parent joins the first in a union -------------------------------------
insert into t values ('dad', public.add_parent((select v from t where k = 'me'), pg_temp.adult('Ravi', '+919800000002')));
select is(cardinality(pg_temp.parents_of((select v from t where k = 'me'))), 1, 'add_parent adds one parent');
select ok((select union_id is null from public.parent_child where child_id = (select v from t where k = 'me')),
  'a lone parent has no union yet');

insert into t values ('mum', public.add_parent((select v from t where k = 'me'),
  jsonb_build_object('given_name', 'Lata', 'family_name', 'Rao', 'gender', 'female', 'phone_status', 'requested',
                     'location', jsonb_build_object('label', 'Pune'))));
select is(cardinality(pg_temp.union_of((select v from t where k = 'me'))), 1,
  'the second parent is joined to the first in one union, and both edges point at it');
select ok((select bool_and(union_id is not null) from public.parent_child where child_id = (select v from t where k = 'me')),
  'no edge left without the union');
select throws_like(
  $$select public.add_parent((select v from t where k = 'me'), pg_temp.adult('Third', '+919800000003'))$$,
  '%at most two biological parents%', 'a third biological parent is blocked');
select lives_ok(
  $$select public.add_parent((select v from t where k = 'me'), pg_temp.adult('Guardian', '+919800000004'), null, 'guardian')$$,
  'a guardian is allowed alongside two parents');

-- Siblings: attached to shared parents, never stored --------------------------------------
insert into t values ('bro', public.add_sibling((select v from t where k = 'me'), pg_temp.adult('Kiran', '+919800000005')));
select is((select kind from public.siblings((select v from t where k = 'me')) where person_id = (select v from t where k = 'bro')),
  'full', 'a sibling sharing both parents is a full sibling');
select is(pg_temp.union_of((select v from t where k = 'bro')), pg_temp.union_of((select v from t where k = 'me')),
  'and hangs off the same union');

insert into t values ('half', public.add_sibling((select v from t where k = 'me'), pg_temp.adult('Meena', '+919800000006'),
  null, array[(select v from t where k = 'dad')]));
select is((select kind from public.siblings((select v from t where k = 'me')) where person_id = (select v from t where k = 'half')),
  'half', 'choosing one shared parent makes a half sibling');
select throws_like(
  $$select public.add_sibling((select v from t where k = 'me'), pg_temp.adult('Nope', '+919800000007'), null,
                              array[(select v from t where k = 'half')])$$,
  '%share at least one%', 'a sibling must share one of this person''s parents');

-- Partners and children -----------------------------------------------------------------
insert into t values ('husband', public.add_partner((select v from t where k = 'me'), pg_temp.adult('Dev', '+919800000008'),
  null, 'marriage', '{"date":"2015-01-01","precision":"year","qualifier":"exact"}'));
select is((select start_date from public.unions u join public.union_members m on m.union_id = u.id
           where m.person_id = (select v from t where k = 'husband')), '2015-01-01'::date,
  'add_partner creates a union with its start date');
select throws_like(
  $$select public.add_partner((select v from t where k = 'me'), null, (select v from t where k = 'husband'))$$,
  '%already partners%', 'the same couple cannot be added twice');

insert into t values ('kid1', public.add_child((select v from t where k = 'me'),
  jsonb_build_object('given_name', 'Tara', 'birth', jsonb_build_object('date', '2018-01-01', 'precision', 'year'),
                     'location', jsonb_build_object('label', 'Pune')),
  null, (select v from t where k = 'husband')));
select is(pg_temp.parents_of((select v from t where k = 'kid1')),
  (select array_agg(x order by x) from unnest(array[(select v from t where k = 'me'), (select v from t where k = 'husband')]) x),
  'a child added with the other parent gets both parents');
select is(cardinality(pg_temp.union_of((select v from t where k = 'kid1'))), 1, 'both through the couple''s union');
select ok((select is_minor from public.persons where id = (select v from t where k = 'kid1')),
  'a child born 2018 is a minor and needs no phone');

insert into t values ('kid2', public.add_child((select v from t where k = 'me'), pg_temp.adult('Arun', '+919800000009')));
select is(cardinality(pg_temp.parents_of((select v from t where k = 'kid2'))), 1, 'other parent unknown: one edge only');

-- Sibling of someone with no parents: placeholder parents --------------------------------
insert into t values ('sil', public.add_sibling((select v from t where k = 'husband'), pg_temp.adult('Nisha', '+919800000010')));
select is((select count(*)::int from public.persons p
           where p.id = any (pg_temp.parents_of((select v from t where k = 'husband'))) and p.is_placeholder), 2,
  'with no parents known, two placeholder parents are created');
select is((select kind from public.siblings((select v from t where k = 'husband')) where person_id = (select v from t where k = 'sil')),
  'full', 'and the siblings come out as full siblings');

-- Linking an existing person instead of creating one -------------------------------------
select is(public.add_parent((select v from t where k = 'husband'), null, (select v from t where k = 'mum'), 'step'),
  (select v from t where k = 'mum'), 'add_parent can link an existing person');

-- Wizard commit -------------------------------------------------------------------------
create temp table m as select public.commit_payload(
  (select v from t where k = 'space'),
  jsonb_build_object(
    'submitter', jsonb_build_object('temp_id', 'dad', 'existing_person_id', (select v from t where k = 'dad')),
    'persons', jsonb_build_array(pg_temp.late('Gopal') || '{"temp_id":"gp"}', pg_temp.late('Sita') || '{"temp_id":"gm"}',
                                 pg_temp.adult('Mohan', '+919800000011') || '{"temp_id":"uncle"}'),
    'unions', jsonb_build_array(jsonb_build_object('member_temp_ids', jsonb_build_array('gp', 'gm'), 'kind', 'marriage', 'end_reason', 'death')),
    'parent_child', jsonb_build_array(
      jsonb_build_object('parent_temp_id', 'gp', 'child_temp_id', 'dad'),
      jsonb_build_object('parent_temp_id', 'gm', 'child_temp_id', 'dad'),
      jsonb_build_object('parent_temp_id', 'gp', 'child_temp_id', 'uncle'),
      jsonb_build_object('parent_temp_id', 'gm', 'child_temp_id', 'uncle'))
  )) as map;
select is((select count(*)::int from m, jsonb_object_keys(map)), 4, 'commit_payload maps every temp id to a person');
select is((select kind from public.siblings((select v from t where k = 'dad'))
           where person_id = ((select map from m) ->> 'uncle')::uuid), 'full',
  'the new grandparents share one union, so Ravi and his brother are full siblings');
select ok((select bool_and(submission_id is not null) from public.change_log
           where row_id = ((select map from m) ->> 'gp')::uuid),
  'every change is tagged with the submission (revertable as one unit)');

-- Permissions ---------------------------------------------------------------------------
insert into public.invites (space_id, role) values ((select v from t where k = 'space'), 'viewer');
create temp table inv as select token from public.invites where space_id = (select v from t where k = 'space');
grant select on inv, m to authenticated;

reset role;
select pg_temp.act_as('vikas');
set local role authenticated;
select ok((select (public.get_invite((select token from inv)) ->> 'valid')::boolean), 'a signed-in stranger can read a valid invite');
select is(public.accept_invite((select token from inv)), (select v from t where k = 'space'), 'and join with it');
select throws_ok(
  $$select public.add_parent((select v from t where k = 'kid2'), pg_temp.adult('Viewer Added', '+919800000012'))$$,
  '42501', null, 'a viewer cannot add relatives');
select lives_ok($$select public.claim_self(((select map from m) ->> 'uncle')::uuid)$$, 'a member can claim an unclaimed person as themselves');
select throws_like($$select public.claim_self((select v from t where k = 'kid2'))$$, '%already claimed%',
  'but only one');

reset role;
select pg_temp.act_as('asha');
set local role authenticated;
select throws_like($$select public.remove_person((select v from t where k = 'me'))$$, '%cannot be removed%',
  'a claimed person cannot be removed');

reset role;
select * from finish();
rollback;
