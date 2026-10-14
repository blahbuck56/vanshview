-- Spaces, membership, identities, persons and person enrichment (names, places, links).
--
-- Integrity pattern used throughout: every space-owned table carries space_id, and
-- references to other space-owned rows are composite foreign keys on (space_id, id).
-- That makes "both ends of every edge are in the same space" a declarative guarantee
-- instead of a trigger, and keeps RLS policies a single cheap membership check.

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A real-world human. In v1 every person row gets its own identity. Cross-space
-- linking (same human in two family spaces, with consent from both sides) will point
-- both person rows at one identity; data stays owned by each space and is never copied.
create table public.identities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  identity_id uuid not null references public.identities (id),

  given_name text,
  family_name text,
  gender public.gender not null default 'unknown',

  birth_date date,
  birth_precision public.date_precision not null default 'unknown',
  birth_qualifier public.date_qualifier not null default 'exact',
  death_date date,
  death_precision public.date_precision not null default 'unknown',
  death_qualifier public.date_qualifier not null default 'exact',

  is_deceased boolean not null default false,
  is_placeholder boolean not null default false,
  -- Maintained by trigger: derived from birth date when precise enough, else minor_override.
  is_minor boolean not null default false,
  minor_override boolean,

  biography text,
  photo_media_id uuid,
  email text,
  phone text,
  phone_status public.phone_status not null default 'provided',

  merged_into uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,

  unique (space_id, id),
  foreign key (space_id, merged_into) references public.persons (space_id, id),

  constraint persons_name_required
    check (is_placeholder or char_length(btrim(coalesce(given_name, ''))) > 0),
  constraint persons_birth_normalised
    check (public.fuzzy_date_is_normalised(birth_date, birth_precision)),
  constraint persons_death_normalised
    check (public.fuzzy_date_is_normalised(death_date, death_precision)),
  constraint persons_death_implies_deceased
    check (death_date is null or is_deceased),
  -- Hard block only when both dates are asserted exactly; fuzzy conflicts surface in data_issues.
  constraint persons_death_after_birth
    check (
      birth_date is null or death_date is null
      or birth_qualifier <> 'exact' or death_qualifier <> 'exact'
      or public.fuzzy_date_end(death_date, death_precision) >= birth_date
    ),
  constraint persons_phone_e164
    check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  constraint persons_email_format
    check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Spec 3a: living adults need a phone. "Ask later" (requested) is the agreed escape hatch.
  constraint persons_phone_status_matches
    check ((phone_status = 'provided') = (phone is not null)),
  constraint persons_phone_not_applicable
    check (phone_status <> 'not_applicable' or is_deceased or is_minor or is_placeholder),
  constraint persons_not_merged_into_self
    check (merged_into is null or merged_into <> id)
);

-- One live person per identity per space (duplicates are resolved by merging).
create unique index persons_identity_per_space
  on public.persons (space_id, identity_id)
  where deleted_at is null and merged_into is null;
create index persons_space_idx on public.persons (space_id) where deleted_at is null;
create index persons_phone_idx on public.persons (space_id, phone) where phone is not null;
create index persons_name_trgm on public.persons
  using gin ((lower(coalesce(given_name, '') || ' ' || coalesce(family_name, ''))) extensions.gin_trgm_ops);

create table public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'viewer',
  person_id uuid,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (space_id, user_id),
  foreign key (space_id, person_id) references public.persons (space_id, id) on delete set null (person_id)
);
-- A person can be claimed by at most one user per space.
create unique index space_members_person_claim
  on public.space_members (space_id, person_id) where person_id is not null;
create index space_members_user_idx on public.space_members (user_id);

create table public.person_names (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  person_id uuid not null,
  kind public.name_kind not null,
  given text,
  family text,
  -- ISO 15924 script code: Latn, Deva, Guru, Taml ...
  script text check (script is null or script ~ '^[A-Z][a-z]{3}$'),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (space_id, person_id) references public.persons (space_id, id) on delete cascade,
  check (char_length(btrim(coalesce(given, '') || coalesce(family, ''))) > 0)
);
-- At most one preferred name per script per person.
create unique index person_names_primary_per_script
  on public.person_names (person_id, coalesce(script, '')) where is_primary;
create index person_names_person_idx on public.person_names (person_id);
create index person_names_trgm on public.person_names
  using gin ((lower(coalesce(given, '') || ' ' || coalesce(family, ''))) extensions.gin_trgm_ops);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  label text not null check (char_length(btrim(label)) > 0),
  city text,
  region text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  -- Free text is accepted when geocoding fails; such places are flagged for later.
  needs_geocoding boolean generated always as (lat is null or lng is null) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (space_id, id),
  check ((lat is null) = (lng is null))
);
create index places_label_trgm on public.places using gin (lower(label) extensions.gin_trgm_ops);

create table public.person_places (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  person_id uuid not null,
  place_id uuid not null,
  kind public.place_kind not null,
  from_date date,
  to_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (space_id, person_id) references public.persons (space_id, id) on delete cascade,
  foreign key (space_id, place_id) references public.places (space_id, id),
  check (from_date is null or to_date is null or from_date <= to_date)
);
create index person_places_person_idx on public.person_places (person_id);
create index person_places_place_idx on public.person_places (place_id);

create table public.person_links (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  person_id uuid not null,
  platform public.link_platform not null,
  url text not null check (url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (space_id, person_id) references public.persons (space_id, id) on delete cascade
);
create index person_links_person_idx on public.person_links (person_id);

create trigger spaces_updated_at before update on public.spaces
  for each row execute function public.set_updated_at();
create trigger persons_updated_at before update on public.persons
  for each row execute function public.set_updated_at();
create trigger space_members_updated_at before update on public.space_members
  for each row execute function public.set_updated_at();
create trigger person_names_updated_at before update on public.person_names
  for each row execute function public.set_updated_at();
create trigger places_updated_at before update on public.places
  for each row execute function public.set_updated_at();
create trigger person_places_updated_at before update on public.person_places
  for each row execute function public.set_updated_at();
create trigger person_links_updated_at before update on public.person_links
  for each row execute function public.set_updated_at();
