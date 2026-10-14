-- Synthetic seed: a 60-person, 5-generation Indian joint family ("Malhotra family").
-- Entirely fictional. Covers every case the spec lists:
--   two marriages (Ashwin: divorce, then remarriage) · a widow who remarried (Shakuntala)
--   an adoption (Simran) · a step-child (Dev) · placeholder parents from a sibling add (Rohan, Kriti)
--   deceased ancestors with year-only and "about" dates · names in Latin, Devanagari, Gurmukhi, Tamil
--   residences across India, UK, US, UAE · three living minors (Kabir, Ira, Myra)
--   two near-duplicate persons (Kamla Devi) · two pending public-form submissions
--
-- IDs are deterministic: md5('vanshview:' || key)::uuid, so tests can refer to people by key.
-- Seed users sign in locally with phone OTP 123456 (see supabase/config.toml).
--
-- No explicit transaction: every helper call inserts a person together with their place in
-- one statement, so the deferred "location required" check holds statement by statement.

create function pg_temp.sid(k text) returns uuid language sql immutable as $$
  select md5('vanshview:' || k)::uuid
$$;

-- '1928-03-14' day · '1952-03' month · '1920' year · '1950s' decade · '~' prefix = about
create function pg_temp.fd(t text, out d date, out p public.date_precision, out q public.date_qualifier)
language plpgsql immutable as $$
declare
  s text := btrim(coalesce(t, ''));
begin
  q := 'exact';
  if s = '' then
    d := null; p := 'unknown'; return;
  end if;
  if left(s, 1) = '~' then
    q := 'about'; s := substr(s, 2);
  end if;
  if s ~ '^\d{4}s$' then d := make_date(left(s, 4)::int, 1, 1); p := 'decade';
  elsif s ~ '^\d{4}$' then d := make_date(s::int, 1, 1); p := 'year';
  elsif s ~ '^\d{4}-\d{2}$' then d := (s || '-01')::date; p := 'month';
  else d := s::date; p := 'day';
  end if;
end
$$;

create function pg_temp.place(k text, label text, city text, region text, cc text, lat float8, lng float8)
returns void language sql as $$
  insert into public.places (id, space_id, label, city, region, country_code, lat, lng)
  values (pg_temp.sid('place:' || k), pg_temp.sid('space'), label, city, region, cc, lat, lng)
$$;

-- phone: E.164, NULL (not applicable), or 'ASK' (skipped with "ask later").
create function pg_temp.person(
  k text, given text, family text, g text, birth text, death text, phone text, place_k text
) returns void language plpgsql as $$
declare
  b record := pg_temp.fd(birth);
  dd record := pg_temp.fd(death);
  dead boolean := death is not null;
begin
  insert into public.persons (
    id, space_id, given_name, family_name, gender,
    birth_date, birth_precision, birth_qualifier,
    death_date, death_precision, death_qualifier,
    is_deceased, phone, phone_status
  ) values (
    pg_temp.sid(k), pg_temp.sid('space'), given, family, g::public.gender,
    b.d, b.p, b.q,
    dd.d, dd.p, dd.q,
    dead,
    case when phone = 'ASK' then null else phone end,
    case when phone = 'ASK' then 'requested'::public.phone_status else 'provided' end
  );
  insert into public.person_places (space_id, person_id, place_id, kind)
  values (pg_temp.sid('space'), pg_temp.sid(k), pg_temp.sid('place:' || place_k),
          case when dead then 'death'::public.place_kind else 'current'::public.place_kind end);
end
$$;

create function pg_temp.placeholder(k text, g text, family text) returns void language sql as $$
  insert into public.persons (id, space_id, family_name, gender, is_placeholder)
  values (pg_temp.sid(k), pg_temp.sid('space'), family, g::public.gender, true)
$$;

create function pg_temp.alt_name(k text, kind text, given text, family text, script text, is_primary boolean)
returns void language sql as $$
  insert into public.person_names (space_id, person_id, kind, given, family, script, is_primary)
  values (pg_temp.sid('space'), pg_temp.sid(k), kind::public.name_kind, given, family, script, is_primary)
$$;

create function pg_temp.couple(k text, kind text, a text, b text, start_t text, end_t text, reason text)
returns void language plpgsql as $$
declare
  s record := pg_temp.fd(start_t);
  e record := pg_temp.fd(end_t);
begin
  insert into public.unions (
    id, space_id, kind, start_date, start_precision, start_qualifier,
    end_date, end_precision, end_qualifier, end_reason
  ) values (
    pg_temp.sid('union:' || k), pg_temp.sid('space'), kind::public.union_kind, s.d, s.p, s.q,
    e.d, e.p, e.q, reason::public.union_end_reason
  );
  insert into public.union_members (union_id, person_id, space_id) values
    (pg_temp.sid('union:' || k), pg_temp.sid(a), pg_temp.sid('space')),
    (pg_temp.sid('union:' || k), pg_temp.sid(b), pg_temp.sid('space'));
end
$$;

create function pg_temp.child(parent text, child text, kind text, union_k text) returns void language sql as $$
  insert into public.parent_child (space_id, parent_id, child_id, kind, union_id)
  values (pg_temp.sid('space'), pg_temp.sid(parent), pg_temp.sid(child), kind::public.parent_child_kind,
          case when union_k is null then null else pg_temp.sid('union:' || union_k) end)
$$;

-- Users --------------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, phone, phone_confirmed_at, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  encrypted_password, confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', pg_temp.sid('user:' || u.k), 'authenticated', 'authenticated',
  u.k || '@example.com', u.phone, now(), now(),
  '{"provider":"phone","providers":["phone"]}', '{}', now(), now(),
  '', '', '', '', ''
from (values
  ('arjun', '919876500001'),
  ('neelam', '919876500002'),
  ('tanvi', '919876500003'),
  ('rahul', '919876500004')
) as u(k, phone);

-- Space (trigger makes Arjun its owner) -------------------------------------------------
insert into public.spaces (id, name, created_by)
values (pg_temp.sid('space'), 'Malhotra family', pg_temp.sid('user:arjun'));

-- Places -------------------------------------------------------------------------------
select pg_temp.place('sargodha', 'Village near Sargodha', null, 'Punjab', 'PK', null, null); -- awaiting geocoding
select pg_temp.place('lahore', 'Lahore, Punjab, Pakistan', 'Lahore', 'Punjab', 'PK', 31.5204, 74.3587);
select pg_temp.place('amritsar', 'Amritsar, Punjab', 'Amritsar', 'Punjab', 'IN', 31.6340, 74.8723);
select pg_temp.place('ludhiana', 'Ludhiana, Punjab', 'Ludhiana', 'Punjab', 'IN', 30.9010, 75.8573);
select pg_temp.place('delhi', 'Delhi', 'Delhi', 'Delhi', 'IN', 28.6139, 77.2090);
select pg_temp.place('gurgaon', 'Gurugram, Haryana', 'Gurugram', 'Haryana', 'IN', 28.4595, 77.0266);
select pg_temp.place('pune', 'Pune, Maharashtra', 'Pune', 'Maharashtra', 'IN', 18.5204, 73.8567);
select pg_temp.place('mumbai', 'Mumbai, Maharashtra', 'Mumbai', 'Maharashtra', 'IN', 19.0760, 72.8777);
select pg_temp.place('chennai', 'Chennai, Tamil Nadu', 'Chennai', 'Tamil Nadu', 'IN', 13.0827, 80.2707);
select pg_temp.place('london', 'London, UK', 'London', 'England', 'GB', 51.5074, -0.1278);
select pg_temp.place('edison', 'Edison, New Jersey', 'Edison', 'New Jersey', 'US', 40.5187, -74.4121);
select pg_temp.place('sf', 'San Francisco, California', 'San Francisco', 'California', 'US', 37.7749, -122.4194);
select pg_temp.place('nyc', 'New York, New York', 'New York', 'New York', 'US', 40.7128, -74.0060);
select pg_temp.place('dubai', 'Dubai, UAE', 'Dubai', 'Dubai', 'AE', 25.2048, 55.2708);
select pg_temp.place('abudhabi', 'Abu Dhabi, UAE', 'Abu Dhabi', 'Abu Dhabi', 'AE', 24.4539, 54.3773);

-- People: generation 1 (all deceased, year-only and "about" dates) ---------------------
select pg_temp.person('hari',      'Hari Ram',      'Malhotra', 'male',   '~1902',      '1971',       null, 'sargodha');
select pg_temp.person('vidya',     'Vidya',         'Wati',     'female', '1908',       '1980',       null, 'amritsar');
select pg_temp.person('kartar',    'Kartar Singh',  'Kohli',    'male',   '1905',       '1979',       null, 'ludhiana');
select pg_temp.person('jaswant',   'Jaswant',       'Kaur',     'female', '~1910',      '~1985',      null, 'ludhiana');

-- Generation 2
select pg_temp.person('mohan',     'Mohan Lal',     'Malhotra', 'male',   '1928-03-14', '2001-11-02', null, 'amritsar');
select pg_temp.person('kamla',     'Kamla',         'Devi',     'female', '~1932',      '2009',       null, 'amritsar');
select pg_temp.person('prem',      'Prem',          'Malhotra', 'male',   '1931',       '1990',       null, 'delhi');
select pg_temp.person('shakuntala','Shakuntala',    'Sethi',    'female', '1935',       '2012',       null, 'delhi');
select pg_temp.person('baldev',    'Baldev',        'Sethi',    'male',   '1930',       '2005',       null, 'delhi');
select pg_temp.person('harbans',   'Harbans Singh', 'Kohli',    'male',   '1935',       '2016',       null, 'ludhiana');
select pg_temp.person('satwant',   'Satwant',       'Kaur',     'female', '1940',       null,         '+919814022517', 'ludhiana');
select pg_temp.person('venkat',    'Venkat',        'Iyer',     'male',   '1938',       '2010',       null, 'chennai');
select pg_temp.person('meenakshi', 'Meenakshi',     'Iyer',     'female', '1942',       null,         'ASK', 'chennai');
select pg_temp.person('krishna',   'Krishna',       'Malhotra', 'male',   '1934',       '2015',       null, 'london');
select pg_temp.person('usha',      'Usha',          'Malhotra', 'female', '1938',       '2020',       null, 'london');
select pg_temp.person('mohinder',  'Mohinder',      'Kohli',    'male',   '~1938',      '1999',       null, 'ludhiana');
select pg_temp.person('surjit',    'Surjit',        'Kaur',     'female', '~1941',      '2018',       null, 'ludhiana');

-- Generation 3 (Rajiv and Neelam share a landline: a duplicate-phone warning, not a block)
select pg_temp.person('rajiv',     'Rajiv',         'Malhotra', 'male',   '1958-06-02', null, '+912025530100', 'pune');
select pg_temp.person('neelam',    'Neelam',        'Malhotra', 'female', '1962-09-18', null, '+912025530100', 'pune');
select pg_temp.person('sunita',    'Sunita',        'Arora',    'female', '1961',       null, '+919811000003', 'delhi');
select pg_temp.person('vikram',    'Vikram',        'Arora',    'male',   '1958',       null, '+919811000004', 'delhi');
select pg_temp.person('ashwin',    'Ashwin',        'Malhotra', 'male',   '1964-02-11', null, '+971501000005', 'dubai');
select pg_temp.person('rita',      'Rita',          'Kapoor',   'female', '1966',       null, '+919820000006', 'mumbai');
select pg_temp.person('nisha',     'Nisha',         'Malhotra', 'female', '1970',       null, '+971501000007', 'dubai');
select pg_temp.person('gurpreet',  'Gurpreet',      'Kohli',    'male',   '1966',       null, '+17325550108', 'edison');
select pg_temp.person('harleen',   'Harleen',       'Kohli',    'female', '1970',       null, '+17325550109', 'edison');
select pg_temp.person('suresh',    'Suresh',        'Iyer',     'male',   '1960',       null, '+919840000010', 'chennai');
select pg_temp.person('lakshmi',   'Lakshmi',       'Iyer',     'female', '1965',       null, '+919840000011', 'chennai');
select pg_temp.person('anil',      'Anil',          'Malhotra', 'male',   '1956',       null, '+919811000012', 'delhi');
select pg_temp.person('sarita',    'Sarita',        'Malhotra', 'female', '1959',       null, '+919811000013', 'delhi');
select pg_temp.person('sanjay',    'Sanjay',        'Malhotra', 'male',   '1962',       null, '+447911123014', 'london');
select pg_temp.person('anjali',    'Anjali',        'Malhotra', 'female', '1964',       null, 'ASK', 'london');
select pg_temp.person('manpreet',  'Manpreet',      'Kohli',    'male',   '1968',       null, '+919814000016', 'ludhiana');
select pg_temp.person('rajinder',  'Rajinder',      'Kaur',     'female', '1970',       null, '+919814000017', 'ludhiana');

-- Generation 4
select pg_temp.person('arjun',     'Arjun',         'Malhotra', 'male',   '1991-04-23', null, '+919876500001', 'pune');
select pg_temp.person('tanvi',     'Tanvi',         'Malhotra', 'female', '1995-12-05', null, '+919876500003', 'london');
select pg_temp.person('meera',     'Meera',         'Iyer',     'female', '1992',       null, '+919876500020', 'pune');
select pg_temp.person('karthik',   'Karthik',       'Iyer',     'male',   '1996',       null, '+14155550121', 'sf');
select pg_temp.person('rohan',     'Rohan',         'Mehra',    'male',   '1993',       null, '+447911123022', 'london');
select pg_temp.person('kriti',     'Kriti',         'Mehra',    'female', '1997',       null, '+919820000023', 'mumbai');
select pg_temp.placeholder('ph_father', 'male', 'Mehra');   -- created when Kriti was added as Rohan's sibling
select pg_temp.placeholder('ph_mother', 'female', null);
select pg_temp.person('pooja',     'Pooja',         'Kapoor',   'female', '1986',       null, '+919811000024', 'delhi');
select pg_temp.person('rohan_k',   'Rohan',         'Kapoor',   'male',   '1987',       null, '+919811000025', 'delhi');
select pg_temp.person('kunal',     'Kunal',         'Malhotra', 'male',   '1992',       null, '+919820000026', 'mumbai');
select pg_temp.person('sneha',     'Sneha',         'Kulkarni', 'female', '1993',       null, '+919820000027', 'mumbai');
select pg_temp.person('dev',       'Dev',           'Malhotra', 'male',   '1995',       null, '+971501000028', 'dubai');
select pg_temp.person('aisha',     'Aisha',         'Malhotra', 'female', '2001-07-19', null, '+971501000029', 'dubai');
select pg_temp.person('simran',    'Simran',        'Kohli',    'female', '2005',       null, '+17325550130', 'edison');
select pg_temp.person('rahul',     'Rahul',         'Malhotra', 'male',   '1983',       null, '+919876500004', 'gurgaon');
select pg_temp.person('priya',     'Priya',         'Malhotra', 'female', '1985',       null, '+919811000032', 'gurgaon');
select pg_temp.person('nikhil',    'Nikhil',        'Malhotra', 'male',   '1990',       null, '+447911123033', 'london');
select pg_temp.person('sarah',     'Sarah',         'Bennett',  'female', '1991',       null, '+447911123034', 'london');
select pg_temp.person('riya',      'Riya',          'Malhotra', 'female', '1994',       null, '+12125550135', 'nyc');
select pg_temp.person('jaspreet',  'Jaspreet',      'Kohli',    'male',   '1995',       null, '+971501000036', 'abudhabi');

-- Generation 5: three living minors (no phone) and one young adult
select pg_temp.person('kabir',     'Kabir',         'Malhotra', 'male',   '2021-08-30', null, null, 'pune');
select pg_temp.person('ira',       'Ira',           'Malhotra', 'female', '2024-01-10', null, null, 'pune');
select pg_temp.person('myra',      'Myra',          'Kapoor',   'female', '2016',       null, null, 'delhi');
select pg_temp.person('vihaan',    'Vihaan',        'Malhotra', 'male',   '2007-05-03', null, '+919811000040', 'gurgaon');

-- Near-duplicate of Kamla Devi, entered separately by another relative
select pg_temp.person('kamla_dup', 'Kamla Devi',    'Malhotra', 'female', '~1931',      '~2009',      null, 'amritsar');

-- Other names --------------------------------------------------------------------------
select pg_temp.alt_name('hari',      'transliteration', 'हरि राम',     'मल्होत्रा', 'Deva', true);
select pg_temp.alt_name('mohan',     'transliteration', 'मोहन लाल',    'मल्होत्रा', 'Deva', true);
select pg_temp.alt_name('kamla',     'transliteration', 'कमला',        'देवी',      'Deva', true);
select pg_temp.alt_name('rajiv',     'transliteration', 'राजीव',        'मल्होत्रा', 'Deva', true);
select pg_temp.alt_name('arjun',     'transliteration', 'अर्जुन',       'मल्होत्रा', 'Deva', true);
select pg_temp.alt_name('harbans',   'transliteration', 'ਹਰਬੰਸ ਸਿੰਘ',  'ਕੋਹਲੀ',     'Guru', true);
select pg_temp.alt_name('satwant',   'transliteration', 'ਸਤਵੰਤ',        'ਕੌਰ',       'Guru', true);
select pg_temp.alt_name('meenakshi', 'transliteration', 'மீனாட்சி',     'ஐயர்',      'Taml', true);
select pg_temp.alt_name('neelam',    'birth',           'Neelam',      'Kohli',     'Latn', false);
select pg_temp.alt_name('sunita',    'birth',           'Sunita',      'Malhotra',  'Latn', false);
select pg_temp.alt_name('pooja',     'birth',           'Pooja',       'Arora',     'Latn', false);
select pg_temp.alt_name('nisha',     'birth',           'Nisha',       'Verma',     'Latn', false);
select pg_temp.alt_name('shakuntala','married',         'Shakuntala',  'Malhotra',  'Latn', false);
select pg_temp.alt_name('kunal',     'nickname',        'Bittu',       null,        'Latn', false);

-- Unions -------------------------------------------------------------------------------
select pg_temp.couple('hari_vidya',        'marriage',    'hari',      'vidya',      '~1925',      '1971',       'death');
select pg_temp.couple('kartar_jaswant',    'marriage',    'kartar',    'jaswant',    '1930',       '1979',       'death');
select pg_temp.couple('mohan_kamla',       'marriage',    'mohan',     'kamla',      '~1955',      '2001-11-02', 'death');
select pg_temp.couple('prem_shakuntala',   'marriage',    'prem',      'shakuntala', '1954',       '1990',       'death');
select pg_temp.couple('shakuntala_baldev', 'marriage',    'shakuntala','baldev',     '1993',       '2005',       'death');
select pg_temp.couple('harbans_satwant',   'marriage',    'harbans',   'satwant',    '1959',       '2016',       'death');
select pg_temp.couple('venkat_meenakshi',  'marriage',    'venkat',    'meenakshi',  '1958',       '2010',       'death');
select pg_temp.couple('krishna_usha',      'marriage',    'krishna',   'usha',       '1960',       '2015',       'death');
select pg_temp.couple('mohinder_surjit',   'marriage',    'mohinder',  'surjit',     '~1962',      '1999',       'death');
select pg_temp.couple('rajiv_neelam',      'marriage',    'rajiv',     'neelam',     '1987-02-14', null,         null);
select pg_temp.couple('sunita_vikram',     'marriage',    'sunita',    'vikram',     '1984',       null,         null);
select pg_temp.couple('ashwin_rita',       'marriage',    'ashwin',    'rita',       '1990',       '1996',       'divorce');
select pg_temp.couple('ashwin_nisha',      'marriage',    'ashwin',    'nisha',      '1999',       null,         null);
select pg_temp.couple('gurpreet_harleen',  'marriage',    'gurpreet',  'harleen',    '1994',       null,         null);
select pg_temp.couple('suresh_lakshmi',    'marriage',    'suresh',    'lakshmi',    '1989',       null,         null);
select pg_temp.couple('anil_sarita',       'marriage',    'anil',      'sarita',     '1981',       null,         null);
select pg_temp.couple('sanjay_anjali',     'marriage',    'sanjay',    'anjali',     '1988',       null,         null);
select pg_temp.couple('manpreet_rajinder', 'marriage',    'manpreet',  'rajinder',   '1992',       null,         null);
select pg_temp.couple('arjun_meera',       'marriage',    'arjun',     'meera',      '2019-11-24', null,         null);
select pg_temp.couple('tanvi_rohan',       'marriage',    'tanvi',     'rohan',      '2022',       null,         null);
select pg_temp.couple('pooja_rohan_k',     'marriage',    'pooja',     'rohan_k',    '2013',       null,         null);
select pg_temp.couple('kunal_sneha',       'marriage',    'kunal',     'sneha',      '2020',       null,         null);
select pg_temp.couple('rahul_priya',       'marriage',    'rahul',     'priya',      '2005',       null,         null);
select pg_temp.couple('nikhil_sarah',      'partnership', 'nikhil',    'sarah',      '2018',       null,         null);
select pg_temp.couple('mehra_placeholders','unknown',     'ph_father', 'ph_mother',  null,         null,         null);

-- Parent-child edges -------------------------------------------------------------------
select pg_temp.child('hari', 'mohan', 'biological', 'hari_vidya');
select pg_temp.child('vidya', 'mohan', 'biological', 'hari_vidya');
select pg_temp.child('hari', 'prem', 'biological', 'hari_vidya');
select pg_temp.child('vidya', 'prem', 'biological', 'hari_vidya');
select pg_temp.child('hari', 'krishna', 'biological', 'hari_vidya');
select pg_temp.child('vidya', 'krishna', 'biological', 'hari_vidya');

select pg_temp.child('kartar', 'harbans', 'biological', 'kartar_jaswant');
select pg_temp.child('jaswant', 'harbans', 'biological', 'kartar_jaswant');
select pg_temp.child('kartar', 'mohinder', 'biological', 'kartar_jaswant');
select pg_temp.child('jaswant', 'mohinder', 'biological', 'kartar_jaswant');

select pg_temp.child('mohan', 'rajiv', 'biological', 'mohan_kamla');
select pg_temp.child('kamla', 'rajiv', 'biological', 'mohan_kamla');
select pg_temp.child('mohan', 'sunita', 'biological', 'mohan_kamla');
select pg_temp.child('kamla', 'sunita', 'biological', 'mohan_kamla');
select pg_temp.child('mohan', 'ashwin', 'biological', 'mohan_kamla');
select pg_temp.child('kamla', 'ashwin', 'biological', 'mohan_kamla');

select pg_temp.child('prem', 'anil', 'biological', 'prem_shakuntala');
select pg_temp.child('shakuntala', 'anil', 'biological', 'prem_shakuntala');

select pg_temp.child('harbans', 'neelam', 'biological', 'harbans_satwant');
select pg_temp.child('satwant', 'neelam', 'biological', 'harbans_satwant');
select pg_temp.child('harbans', 'gurpreet', 'biological', 'harbans_satwant');
select pg_temp.child('satwant', 'gurpreet', 'biological', 'harbans_satwant');

select pg_temp.child('venkat', 'suresh', 'biological', 'venkat_meenakshi');
select pg_temp.child('meenakshi', 'suresh', 'biological', 'venkat_meenakshi');

select pg_temp.child('krishna', 'sanjay', 'biological', 'krishna_usha');
select pg_temp.child('usha', 'sanjay', 'biological', 'krishna_usha');

select pg_temp.child('mohinder', 'manpreet', 'biological', 'mohinder_surjit');
select pg_temp.child('surjit', 'manpreet', 'biological', 'mohinder_surjit');

select pg_temp.child('rajiv', 'arjun', 'biological', 'rajiv_neelam');
select pg_temp.child('neelam', 'arjun', 'biological', 'rajiv_neelam');
select pg_temp.child('rajiv', 'tanvi', 'biological', 'rajiv_neelam');
select pg_temp.child('neelam', 'tanvi', 'biological', 'rajiv_neelam');

select pg_temp.child('sunita', 'pooja', 'biological', 'sunita_vikram');
select pg_temp.child('vikram', 'pooja', 'biological', 'sunita_vikram');

-- Ashwin: Kunal from the first marriage, Aisha from the second, Dev is Nisha's son (step-son to Ashwin)
select pg_temp.child('ashwin', 'kunal', 'biological', 'ashwin_rita');
select pg_temp.child('rita', 'kunal', 'biological', 'ashwin_rita');
select pg_temp.child('ashwin', 'aisha', 'biological', 'ashwin_nisha');
select pg_temp.child('nisha', 'aisha', 'biological', 'ashwin_nisha');
select pg_temp.child('nisha', 'dev', 'biological', null);
select pg_temp.child('ashwin', 'dev', 'step', null);

-- Simran was adopted by Gurpreet and Harleen
select pg_temp.child('gurpreet', 'simran', 'adoptive', 'gurpreet_harleen');
select pg_temp.child('harleen', 'simran', 'adoptive', 'gurpreet_harleen');

select pg_temp.child('suresh', 'meera', 'biological', 'suresh_lakshmi');
select pg_temp.child('lakshmi', 'meera', 'biological', 'suresh_lakshmi');
select pg_temp.child('suresh', 'karthik', 'biological', 'suresh_lakshmi');
select pg_temp.child('lakshmi', 'karthik', 'biological', 'suresh_lakshmi');

select pg_temp.child('anil', 'rahul', 'biological', 'anil_sarita');
select pg_temp.child('sarita', 'rahul', 'biological', 'anil_sarita');

select pg_temp.child('sanjay', 'nikhil', 'biological', 'sanjay_anjali');
select pg_temp.child('anjali', 'nikhil', 'biological', 'sanjay_anjali');
select pg_temp.child('sanjay', 'riya', 'biological', 'sanjay_anjali');
select pg_temp.child('anjali', 'riya', 'biological', 'sanjay_anjali');

select pg_temp.child('manpreet', 'jaspreet', 'biological', 'manpreet_rajinder');
select pg_temp.child('rajinder', 'jaspreet', 'biological', 'manpreet_rajinder');

-- Rohan and Kriti: siblings through placeholder parents
select pg_temp.child('ph_father', 'rohan', 'biological', 'mehra_placeholders');
select pg_temp.child('ph_mother', 'rohan', 'biological', 'mehra_placeholders');
select pg_temp.child('ph_father', 'kriti', 'biological', 'mehra_placeholders');
select pg_temp.child('ph_mother', 'kriti', 'biological', 'mehra_placeholders');

select pg_temp.child('arjun', 'kabir', 'biological', 'arjun_meera');
select pg_temp.child('meera', 'kabir', 'biological', 'arjun_meera');
select pg_temp.child('arjun', 'ira', 'biological', 'arjun_meera');
select pg_temp.child('meera', 'ira', 'biological', 'arjun_meera');

select pg_temp.child('pooja', 'myra', 'biological', 'pooja_rohan_k');
select pg_temp.child('rohan_k', 'myra', 'biological', 'pooja_rohan_k');

select pg_temp.child('rahul', 'vihaan', 'biological', 'rahul_priya');
select pg_temp.child('priya', 'vihaan', 'biological', 'rahul_priya');

-- Branches (rules; membership is computed) ---------------------------------------------
insert into public.branches (space_id, name, root_person_id, lineage, color) values
  (pg_temp.sid('space'), 'Malhotra', pg_temp.sid('hari'), 'all_descendants', '#C98A2B'),
  (pg_temp.sid('space'), 'Kohli', pg_temp.sid('kartar'), 'patrilineal', '#1E6B66'),
  (pg_temp.sid('space'), 'Iyer', pg_temp.sid('venkat'), 'all_descendants', '#A8452F');

-- Members and claims (Arjun is already owner via the space trigger) --------------------
update public.space_members set person_id = pg_temp.sid('arjun')
where space_id = pg_temp.sid('space') and user_id = pg_temp.sid('user:arjun');
insert into public.space_members (space_id, user_id, role, person_id) values
  (pg_temp.sid('space'), pg_temp.sid('user:neelam'), 'admin', pg_temp.sid('neelam')),
  (pg_temp.sid('space'), pg_temp.sid('user:tanvi'), 'editor', pg_temp.sid('tanvi')),
  (pg_temp.sid('space'), pg_temp.sid('user:rahul'), 'viewer', pg_temp.sid('rahul'));

-- Public form links and two pending submissions ----------------------------------------
insert into public.form_links (id, space_id, created_by, anchor_person_id, label, message_template, expires_at)
values
  (pg_temp.sid('form:mehra'), pg_temp.sid('space'), pg_temp.sid('user:arjun'), pg_temp.sid('rohan'),
   'Mehra side · Diwali',
   'Namaste! We''re putting together our family tree. Could you add the Mehra side? Takes about 5 minutes: {link}',
   now() + interval '30 days'),
  (pg_temp.sid('form:iyer'), pg_temp.sid('space'), pg_temp.sid('user:arjun'), pg_temp.sid('lakshmi'),
   'Iyer side',
   'Hello! Meera and I are building the family tree. Could you add your side? {link}',
   now() + interval '30 days');

-- Overlapping submission: Rohan (same phone) and Tanvi (same name and birth year) already
-- exist; "Kritika Mehra, 1998, Bombay" is a fuzzy match for Kriti Mehra.
insert into public.submissions (
  id, space_id, form_link_id, mode, anchor_person_id, submitter_name, submitter_phone,
  payload, status, consent_given_at, ip_hash, user_agent
) values (
  pg_temp.sid('submission:mehra'), pg_temp.sid('space'), pg_temp.sid('form:mehra'), 'public', pg_temp.sid('rohan'),
  'Poonam Mehra', '+919810000050',
  $json${
    "submitter": {"temp_id": "p1", "given_name": "Poonam", "family_name": "Mehra", "gender": "female",
                  "birth": {"date": "1964-01-01", "precision": "year", "qualifier": "about"},
                  "is_deceased": false, "phone": "+919810000050",
                  "location": {"label": "Delhi", "kind": "current"}},
    "persons": [
      {"temp_id": "p2", "given_name": "Ashok", "family_name": "Mehra", "gender": "male",
       "birth": {"date": "1960-01-01", "precision": "year", "qualifier": "exact"},
       "death": {"date": "2019-01-01", "precision": "year", "qualifier": "exact"},
       "is_deceased": true, "location": {"label": "Delhi", "kind": "death"}},
      {"temp_id": "p3", "given_name": "Pushpa", "family_name": "Mehra", "gender": "female",
       "birth": {"date": "1938-01-01", "precision": "year", "qualifier": "about"},
       "death": {"date": "2015-01-01", "precision": "year", "qualifier": "exact"},
       "is_deceased": true, "location": {"label": "Lahore", "kind": "ancestral"}},
      {"temp_id": "p4", "given_name": "Kritika", "family_name": "Mehra", "gender": "female",
       "birth": {"date": "1998-01-01", "precision": "year", "qualifier": "exact"},
       "is_deceased": false, "phone": "+919820000099", "location": {"label": "Bombay", "kind": "current"}},
      {"temp_id": "p5", "given_name": "Rohan", "family_name": "Mehra", "gender": "male",
       "birth": {"date": "1993-01-01", "precision": "year", "qualifier": "exact"},
       "is_deceased": false, "phone": "+447911123022", "location": {"label": "London", "kind": "current"}},
      {"temp_id": "p6", "given_name": "Tanvi", "family_name": "Malhotra", "gender": "female",
       "birth": {"date": "1995-01-01", "precision": "year", "qualifier": "exact"},
       "is_deceased": false, "phone_status": "requested", "location": {"label": "London", "kind": "current"}}
    ],
    "parent_child": [
      {"parent_temp_id": "p1", "child_temp_id": "p4", "kind": "biological"},
      {"parent_temp_id": "p2", "child_temp_id": "p4", "kind": "biological"},
      {"parent_temp_id": "p1", "child_temp_id": "p5", "kind": "biological"},
      {"parent_temp_id": "p2", "child_temp_id": "p5", "kind": "biological"},
      {"parent_temp_id": "p3", "child_temp_id": "p2", "kind": "biological"}
    ],
    "unions": [
      {"member_temp_ids": ["p1", "p2"], "kind": "marriage", "end_reason": "death"},
      {"member_temp_ids": ["p5", "p6"], "kind": "marriage"}
    ],
    "media": [],
    "invites": [{"name": "Kritika Mehra", "phone": "+919820000099"}],
    "notes": "Ashok's mother came from Lahore in 1947. Kritika is our daughter, she lives in Bombay now."
  }$json$::jsonb,
  'pending', now() - interval '1 day', 'seed', 'seed'
);

-- Clean submission: an entirely new branch (Lakshmi's sister's family), linked to Lakshmi
-- (q7 carries Lakshmi's id, md5('vanshview:lakshmi')::uuid).
insert into public.submissions (
  id, space_id, form_link_id, mode, anchor_person_id, submitter_name, submitter_phone, submitter_email,
  payload, status, consent_given_at, ip_hash, user_agent
) values (
  pg_temp.sid('submission:iyer'), pg_temp.sid('space'), pg_temp.sid('form:iyer'), 'public', pg_temp.sid('lakshmi'),
  'Padma Raghavan', '+919840000060', 'padma@example.com',
  $json${
    "submitter": {"temp_id": "q1", "given_name": "Padma", "family_name": "Raghavan", "gender": "female",
                  "birth": {"date": "1968-01-01", "precision": "year", "qualifier": "exact"},
                  "is_deceased": false, "phone": "+919840000060",
                  "location": {"label": "Bengaluru", "kind": "current"}},
    "persons": [
      {"temp_id": "q2", "given_name": "Ravi", "family_name": "Raghavan", "gender": "male",
       "birth": {"date": "1965-01-01", "precision": "year", "qualifier": "exact"},
       "is_deceased": false, "phone": "+919840000061", "location": {"label": "Bengaluru", "kind": "current"}},
      {"temp_id": "q3", "given_name": "Divya", "family_name": "Raghavan", "gender": "female",
       "birth": {"date": "1998-04-01", "precision": "month", "qualifier": "exact"},
       "is_deceased": false, "phone": "+919840000062", "location": {"label": "Bengaluru", "kind": "current"}},
      {"temp_id": "q4", "given_name": "Arvind", "family_name": "Raghavan", "gender": "male",
       "birth": {"date": "2012-01-01", "precision": "year", "qualifier": "exact"},
       "is_deceased": false, "location": {"label": "Bengaluru", "kind": "current"}},
      {"temp_id": "q5", "given_name": "Krishnan", "family_name": "Natarajan", "gender": "male",
       "birth": {"date": "1935-01-01", "precision": "year", "qualifier": "about"},
       "death": {"date": "2004-01-01", "precision": "year", "qualifier": "exact"},
       "is_deceased": true, "location": {"label": "Thanjavur", "kind": "ancestral"}},
      {"temp_id": "q6", "given_name": "Saraswati", "family_name": "Natarajan", "gender": "female",
       "birth": {"date": "1940-01-01", "precision": "year", "qualifier": "about"},
       "death": {"date": "2017-01-01", "precision": "year", "qualifier": "exact"},
       "is_deceased": true, "location": {"label": "Chennai", "kind": "death"}},
      {"temp_id": "q7", "existing_person_id": "3e10a678-b4ff-676e-3869-a1971805b202"}
    ],
    "parent_child": [
      {"parent_temp_id": "q5", "child_temp_id": "q1", "kind": "biological"},
      {"parent_temp_id": "q6", "child_temp_id": "q1", "kind": "biological"},
      {"parent_temp_id": "q5", "child_temp_id": "q7", "kind": "biological"},
      {"parent_temp_id": "q6", "child_temp_id": "q7", "kind": "biological"},
      {"parent_temp_id": "q1", "child_temp_id": "q3", "kind": "biological"},
      {"parent_temp_id": "q2", "child_temp_id": "q3", "kind": "biological"},
      {"parent_temp_id": "q1", "child_temp_id": "q4", "kind": "biological"},
      {"parent_temp_id": "q2", "child_temp_id": "q4", "kind": "biological"}
    ],
    "unions": [
      {"member_temp_ids": ["q5", "q6"], "kind": "marriage", "end_reason": "death"},
      {"member_temp_ids": ["q1", "q2"], "kind": "marriage"}
    ],
    "media": [],
    "invites": [{"name": "Divya Raghavan", "email": "divya@example.com"}],
    "notes": ""
  }$json$::jsonb,
  'pending', now() - interval '3 hours', 'seed', 'seed'
);
