-- The family graph stores only primitive relationships: unions (partnerships) and
-- parent-child edges. Siblings, cousins, in-laws and generations are always derived.

create table public.unions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind public.union_kind not null default 'marriage',
  start_date date,
  start_precision public.date_precision not null default 'unknown',
  start_qualifier public.date_qualifier not null default 'exact',
  end_date date,
  end_precision public.date_precision not null default 'unknown',
  end_qualifier public.date_qualifier not null default 'exact',
  end_reason public.union_end_reason,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  unique (space_id, id),
  check (public.fuzzy_date_is_normalised(start_date, start_precision)),
  check (public.fuzzy_date_is_normalised(end_date, end_precision)),
  check (
    start_date is null or end_date is null
    or public.fuzzy_date_end(end_date, end_precision) >= start_date
  ),
  -- An end date without a reason is ambiguous; a reason without a date is fine (date unknown).
  check (end_date is null or end_reason is not null)
);
create index unions_space_idx on public.unions (space_id) where deleted_at is null;

create table public.union_members (
  union_id uuid not null,
  person_id uuid not null,
  space_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (union_id, person_id),
  foreign key (space_id, union_id) references public.unions (space_id, id) on delete cascade,
  foreign key (space_id, person_id) references public.persons (space_id, id) on delete cascade
);
create index union_members_person_idx on public.union_members (person_id);

create table public.parent_child (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  parent_id uuid not null,
  child_id uuid not null,
  kind public.parent_child_kind not null default 'biological',
  union_id uuid,
  -- Mainly for step / foster / guardian relationships that begin or end over time.
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (parent_id, child_id),
  foreign key (space_id, parent_id) references public.persons (space_id, id) on delete cascade,
  foreign key (space_id, child_id) references public.persons (space_id, id) on delete cascade,
  foreign key (space_id, union_id) references public.unions (space_id, id) on delete set null (union_id),
  constraint parent_child_no_self check (parent_id <> child_id),
  check (start_date is null or end_date is null or start_date <= end_date)
);
create index parent_child_child_idx on public.parent_child (child_id);
create index parent_child_union_idx on public.parent_child (union_id) where union_id is not null;

-- A branch is a rule, not a label stamped on people. Membership is computed.
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  root_person_id uuid not null,
  lineage public.branch_lineage not null default 'all_descendants',
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (space_id, root_person_id) references public.persons (space_id, id) on delete cascade
);

create trigger unions_updated_at before update on public.unions
  for each row execute function public.set_updated_at();
create trigger parent_child_updated_at before update on public.parent_child
  for each row execute function public.set_updated_at();
create trigger branches_updated_at before update on public.branches
  for each row execute function public.set_updated_at();
