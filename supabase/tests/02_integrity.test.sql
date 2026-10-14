begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create function pg_temp.sid(k text) returns uuid language sql immutable as $$
  select md5('vanshview:' || k)::uuid
$$;

-- A valid living adult with a place, so deferred location checks stay satisfied.
create function pg_temp.add_person(k text, given text, birth date, phone text, space_k text default 'space')
returns uuid language plpgsql as $$
begin
  insert into public.persons (id, space_id, given_name, birth_date, birth_precision, phone)
  values (pg_temp.sid(k), pg_temp.sid(space_k), given, birth,
          case when birth is null then 'unknown'::public.date_precision else 'day' end, phone);
  insert into public.places (id, space_id, label) values (pg_temp.sid('place:' || k), pg_temp.sid(space_k), 'Somewhere')
  on conflict do nothing;
  insert into public.person_places (space_id, person_id, place_id, kind)
  values (pg_temp.sid(space_k), pg_temp.sid(k), pg_temp.sid('place:' || k), 'current');
  return pg_temp.sid(k);
end
$$;

create function pg_temp.check_deferred() returns void language sql as $$
  set constraints all immediate
$$;

-- Graph edges ------------------------------------------------------------------------------
select throws_like(
  $$insert into public.parent_child (space_id, parent_id, child_id, kind)
    values (pg_temp.sid('space'), pg_temp.sid('arjun'), pg_temp.sid('arjun'), 'guardian')$$,
  '%parent_child_no_self%', 'no self-edge in parent_child');

select throws_like(
  $$insert into public.parent_child (space_id, parent_id, child_id)
    values (pg_temp.sid('space'), pg_temp.sid('kabir'), pg_temp.sid('arjun'))$$,
  '%own ancestor%', 'direct cycle rejected (child as parent of its parent)');

select throws_like(
  $$insert into public.parent_child (space_id, parent_id, child_id)
    values (pg_temp.sid('space'), pg_temp.sid('kabir'), pg_temp.sid('mohan'))$$,
  '%own ancestor%', 'deep cycle rejected (great-grandchild as parent of great-grandfather)');

select throws_like(
  $$insert into public.parent_child (space_id, parent_id, child_id, kind)
    values (pg_temp.sid('space'), pg_temp.sid('sunita'), pg_temp.sid('arjun'), 'biological')$$,
  '%at most two biological parents%', 'third biological parent rejected');

select lives_ok(
  $$insert into public.parent_child (space_id, parent_id, child_id, kind)
    values (pg_temp.sid('space'), pg_temp.sid('sunita'), pg_temp.sid('arjun'), 'guardian')$$,
  'a guardian can be added alongside two biological parents');

-- Cross-space edges
insert into public.spaces (id, name) values (pg_temp.sid('space2'), 'Another family');
select pg_temp.add_person('stranger', 'Stranger', '1980-01-01', '+919000000001', 'space2');

select throws_ok(
  $$insert into public.parent_child (space_id, parent_id, child_id)
    values (pg_temp.sid('space'), pg_temp.sid('arjun'), pg_temp.sid('stranger'))$$,
  '23503', null, 'parent_child cannot point at a person in another space');

insert into public.unions (id, space_id, kind) values (pg_temp.sid('union:solo'), pg_temp.sid('space'), 'unknown');
select throws_ok(
  $$insert into public.union_members (union_id, person_id, space_id)
    values (pg_temp.sid('union:solo'), pg_temp.sid('stranger'), pg_temp.sid('space'))$$,
  '23503', null, 'union_members cannot mix spaces');

select throws_like(
  $$update public.persons set space_id = pg_temp.sid('space2') where id = pg_temp.sid('meera')$$,
  '%space_id cannot be changed%', 'rows never move between spaces');

-- Unions
select throws_like(
  $$insert into public.union_members (union_id, person_id, space_id)
    values (pg_temp.sid('union:arjun_meera'), pg_temp.sid('tanvi'), pg_temp.sid('space'))$$,
  '%at most two members%', 'third union member rejected');

create function pg_temp.child_via_wrong_union() returns void language plpgsql as $$
begin
  insert into public.parent_child (space_id, parent_id, child_id, kind, union_id)
  values (pg_temp.sid('space'), pg_temp.sid('tanvi'), pg_temp.sid('myra'), 'guardian', pg_temp.sid('union:arjun_meera'));
  perform pg_temp.check_deferred();
end
$$;
select throws_like('select pg_temp.child_via_wrong_union()', '%not a member of the union%',
  'a child linked through a union must come from one of its members');

-- Dates ------------------------------------------------------------------------------------
select throws_like(
  $$insert into public.persons (space_id, given_name, is_deceased, birth_date, birth_precision, death_date, death_precision)
    values (pg_temp.sid('space'), 'Backwards', true, '2000-05-01', 'day', '1999-05-01', 'day')$$,
  '%persons_death_after_birth%', 'exact death date before exact birth date rejected');

select lives_ok(
  $$insert into public.persons (id, space_id, given_name, is_deceased, birth_date, birth_precision, birth_qualifier,
                                death_date, death_precision)
    values (pg_temp.sid('fuzzy'), pg_temp.sid('space'), 'Fuzzy', true, '1950-01-01', 'year', 'about', '1949-01-01', 'year');
    insert into public.person_places (space_id, person_id, place_id, kind)
    values (pg_temp.sid('space'), pg_temp.sid('fuzzy'), pg_temp.sid('place:pune'), 'death')$$,
  'fuzzy conflicting dates are accepted (and reported as a data issue)');

select throws_like(
  $$insert into public.persons (space_id, given_name, is_deceased, birth_date, birth_precision)
    values (pg_temp.sid('space'), 'Unnormalised', true, '1920-05-05', 'year')$$,
  '%persons_birth_normalised%', 'year-precision dates must be stored as 1 January');

select is(public.fuzzy_date_end('1952-03-01', 'month'), '1952-03-31'::date, 'fuzzy_date_end: month');
select is(public.fuzzy_date_end('1950-01-01', 'decade'), '1959-12-31'::date, 'fuzzy_date_end: decade');

-- Required fields (spec 3a) ----------------------------------------------------------------
select throws_like(
  $$insert into public.persons (space_id, given_name, birth_date, birth_precision)
    values (pg_temp.sid('space'), 'No Phone', '1980-01-01', 'day')$$,
  '%phone number is required%', 'living adult without a phone rejected');

select lives_ok(
  $$insert into public.persons (id, space_id, given_name, phone_status)
    values (pg_temp.sid('asklater'), pg_temp.sid('space'), 'Ask Later', 'requested');
    insert into public.person_places (space_id, person_id, place_id, kind)
    values (pg_temp.sid('space'), pg_temp.sid('asklater'), pg_temp.sid('place:pune'), 'current')$$,
  'living adult with phone skipped as "ask later" accepted');

select throws_like(
  $$insert into public.persons (space_id, given_name, phone) values (pg_temp.sid('space'), 'Bad Phone', '98765')$$,
  '%persons_phone_e164%', 'phone must be E.164');

select throws_like(
  $$insert into public.persons (space_id, given_name, phone) values (pg_temp.sid('space'), '  ', '+919000000009')$$,
  '%persons_name_required%', 'a given name is required (except placeholders)');

insert into public.persons (id, space_id, given_name, is_deceased, phone)
values (pg_temp.sid('late'), pg_temp.sid('space'), 'Late', true, '+919000000002');
insert into public.person_places (space_id, person_id, place_id, kind)
values (pg_temp.sid('space'), pg_temp.sid('late'), pg_temp.sid('place:pune'), 'death');
select is(
  (select phone from public.persons where id = pg_temp.sid('late')), null,
  'marking someone deceased clears their phone');

select ok(
  (select is_minor and phone_status = 'not_applicable' from public.persons where id = pg_temp.sid('kabir')),
  'a minor needs no phone');
select ok(
  public.compute_is_minor('2008-01-01', 'year', null, false, '2026-12-30')
  and not public.compute_is_minor('2008-01-01', 'year', null, false, '2026-12-31')
  and public.compute_is_minor(null, 'unknown', true, false, '2026-10-14')
  and not public.compute_is_minor('2015-01-01', 'year', null, true, '2026-10-14'),
  'minor status: "born 2008" counts as minor until 31 Dec 2026; override; deceased');

-- Location required at commit (deferred)
create function pg_temp.person_without_place() returns void language plpgsql as $$
begin
  insert into public.persons (space_id, given_name, is_deceased) values (pg_temp.sid('space'), 'Nowhere', true);
  perform pg_temp.check_deferred();
end
$$;
select throws_like('select pg_temp.person_without_place()', '%needs at least one location%',
  'a person without a location is rejected at commit');

create function pg_temp.placeholder_without_place() returns void language plpgsql as $$
begin
  insert into public.persons (space_id, is_placeholder) values (pg_temp.sid('space'), true);
  perform pg_temp.check_deferred();
end
$$;
select lives_ok('select pg_temp.placeholder_without_place()', 'placeholders need no location');

create function pg_temp.remove_only_place() returns void language plpgsql as $$
begin
  delete from public.person_places where person_id = pg_temp.sid('karthik');
  perform pg_temp.check_deferred();
end
$$;
select throws_like('select pg_temp.remove_only_place()', '%needs at least one location%',
  'removing a person''s only location is rejected');

-- Membership -------------------------------------------------------------------------------
select throws_like(
  $$delete from public.space_members where space_id = pg_temp.sid('space') and user_id = pg_temp.sid('user:arjun')$$,
  '%at least one owner%', 'the last owner cannot leave');

select throws_like(
  $$update public.space_members set person_id = pg_temp.sid('ph_father')
    where space_id = pg_temp.sid('space') and user_id = pg_temp.sid('user:rahul')$$,
  '%cannot be claimed%', 'placeholders cannot be claimed');

select throws_like(
  $$update public.space_members set person_id = pg_temp.sid('meenakshi')
    where space_id = pg_temp.sid('space') and user_id = pg_temp.sid('user:rahul')$$,
  '%phone number to this profile before claiming%', 'claiming requires a phone on the profile');

-- change_log -------------------------------------------------------------------------------
update public.persons set biography = 'Loves cricket' where id = pg_temp.sid('karthik');
select ok(
  exists (select 1 from public.change_log
          where table_name = 'persons' and row_id = pg_temp.sid('karthik') and op = 'update'
            and txid = txid_current() and after ->> 'biography' = 'Loves cricket'
            and before ->> 'biography' is null),
  'updates are logged with before/after and the transaction id');

select throws_like($$update public.change_log set op = 'delete'$$, '%append-only%', 'change_log rows cannot be updated');
select throws_like($$delete from public.change_log$$, '%append-only%', 'change_log rows cannot be deleted');

select * from finish();
rollback;
