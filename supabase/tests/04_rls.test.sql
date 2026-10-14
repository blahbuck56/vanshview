begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create function pg_temp.sid(k text) returns uuid language sql immutable as $$
  select md5('vanshview:' || k)::uuid
$$;

-- Act as a seed user: set the JWT claims Supabase's auth.uid() reads, and drop to the
-- authenticated role so RLS applies.
create function pg_temp.act_as(k text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.sid('user:' || k), 'role', 'authenticated')::text, true);
$$;

create function pg_temp.edit_bio(k text) returns integer language plpgsql as $$
declare
  n integer;
begin
  update public.persons set biography = 'edited' where id = pg_temp.sid(k);
  get diagnostics n = row_count;
  return n;
end
$$;

create function pg_temp.add_person(k text) returns void language plpgsql as $$
begin
  insert into public.persons (id, space_id, given_name, phone)
  values (pg_temp.sid(k), pg_temp.sid('space'), 'New Cousin', '+919000000077');
  insert into public.person_places (space_id, person_id, place_id, kind)
  values (pg_temp.sid('space'), pg_temp.sid(k), pg_temp.sid('place:pune'), 'current');
end
$$;

insert into auth.users (id, email, aud, role)
values (pg_temp.sid('user:stranger'), 'stranger@example.com', 'authenticated', 'authenticated'),
       (pg_temp.sid('user:newcomer'), 'newcomer@example.com', 'authenticated', 'authenticated');


-- Viewer (Rahul) --------------------------------------------------------------------------
select pg_temp.act_as('rahul');
set local role authenticated;

select is((select count(*)::int from public.persons), 60, 'viewer reads every person in their space');
select throws_ok($$select pg_temp.add_person('by_viewer')$$, '42501', null, 'viewer cannot add a person');
select is(pg_temp.edit_bio('sunita'), 0, 'viewer cannot edit a person');
select is((select count(*)::int from public.change_log), 0, 'viewer cannot read the change log (it holds private values)');
select is((select count(*)::int from public.submissions) + (select count(*)::int from public.form_links), 0,
  'viewer cannot see form links or submissions');
select is((select count(*)::int from public.space_members), 4, 'viewer sees the member list');
select ok((select count(*) from public.identities) >= 60, 'viewer can resolve identities of people in their space');
select throws_ok(
  $$insert into public.suggestions (space_id, person_id, proposed_by, patch)
    values (pg_temp.sid('space'), pg_temp.sid('arjun'), auth.uid(), '{"biography": "x"}')$$,
  '42501', null, 'viewer cannot propose suggestions');

-- Editor (Tanvi) --------------------------------------------------------------------------
reset role;
select pg_temp.act_as('tanvi');
set local role authenticated;

select is(pg_temp.edit_bio('sunita'), 1, 'editor edits an unclaimed person');
select throws_like($$select pg_temp.edit_bio('arjun')$$, '%claimed%', 'editor cannot edit someone else''s claimed profile');
select lives_ok(
  $$insert into public.suggestions (space_id, person_id, proposed_by, patch)
    values (pg_temp.sid('space'), pg_temp.sid('arjun'), auth.uid(), '{"biography": "Loves chess"}')$$,
  'editor proposes a suggestion instead');
select lives_ok($$select pg_temp.add_person('by_editor')$$, 'editor adds a person');
select ok((select count(*) from public.change_log) > 0, 'editor reads the change log');
select is((select count(*)::int from public.submissions), 0, 'editor cannot see the review queue (admin only)');
select throws_ok(
  $$insert into public.space_members (space_id, user_id, role)
    values (pg_temp.sid('space'), pg_temp.sid('user:newcomer'), 'viewer')$$,
  '42501', null, 'editor cannot add members');

-- Claimed person (Arjun) sees suggestions about him --------------------------------------
reset role;
select pg_temp.act_as('arjun');
set local role authenticated;
select is((select count(*)::int from public.suggestions where person_id = pg_temp.sid('arjun')), 1,
  'the claimed person sees suggestions about their profile');

-- Admin (Neelam) --------------------------------------------------------------------------
reset role;
select pg_temp.act_as('neelam');
set local role authenticated;

select is((select count(*)::int from public.submissions), 2, 'admin sees the review queue');
select is(pg_temp.edit_bio('arjun'), 1, 'admin can edit a claimed profile');
select lives_ok(
  $$insert into public.space_members (space_id, user_id, role)
    values (pg_temp.sid('space'), pg_temp.sid('user:newcomer'), 'viewer')$$,
  'admin adds a member');
select throws_ok(
  $$update public.space_members set role = 'owner'
    where space_id = pg_temp.sid('space') and user_id = pg_temp.sid('user:neelam')$$,
  '42501', null, 'admin cannot make anyone an owner');

-- Owner (Arjun) ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('arjun');
set local role authenticated;
select lives_ok(
  $$update public.space_members set role = 'owner'
    where space_id = pg_temp.sid('space') and user_id = pg_temp.sid('user:neelam')$$,
  'owner can share ownership');

-- Non-member ------------------------------------------------------------------------------
reset role;
select pg_temp.act_as('stranger');
set local role authenticated;

select is((select count(*)::int from public.persons) + (select count(*)::int from public.spaces), 0,
  'a non-member sees no spaces and no people');
select is(jsonb_array_length(public.neighborhood(pg_temp.sid('arjun'), 3, 3) -> 'persons'), 0,
  'derived functions respect RLS (security invoker)');
select throws_ok($$select pg_temp.add_person('by_stranger')$$, '42501', null, 'a non-member cannot add people');
select lives_ok($$insert into public.spaces (name) values ('Stranger family')$$, 'any signed-in user can create a space');
select is(
  (select role::text from public.space_members where user_id = auth.uid()), 'owner',
  'the creator becomes its owner');

-- Anonymous -------------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok($$select count(*) from public.persons$$, '42501', null, 'anon cannot read tables at all');

reset role;
select * from finish();
rollback;
