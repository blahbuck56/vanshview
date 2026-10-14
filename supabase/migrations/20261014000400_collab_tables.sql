-- Media, invites, claims, suggestions, saved views and form-based submissions.

create table public.media (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) > 0),
  caption text,
  taken_date date,
  taken_precision public.date_precision not null default 'unknown',
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (space_id, id),
  check (public.fuzzy_date_is_normalised(taken_date, taken_precision))
);

create table public.media_people (
  media_id uuid not null,
  person_id uuid not null,
  space_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (media_id, person_id),
  foreign key (space_id, media_id) references public.media (space_id, id) on delete cascade,
  foreign key (space_id, person_id) references public.persons (space_id, id) on delete cascade
);
create index media_people_person_idx on public.media_people (person_id);

alter table public.persons
  add constraint persons_photo_media_fk
  foreign key (space_id, photo_media_id) references public.media (space_id, id) on delete set null (photo_media_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  -- When set, accepting the invite also claims this person (the invite is the approval).
  person_id uuid,
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  role public.member_role not null default 'viewer' check (role <> 'owner'),
  status public.invite_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (space_id, person_id) references public.persons (space_id, id) on delete set null (person_id),
  check (email is not null or phone is not null)
);

create table public.claim_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  person_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.decision_status not null default 'pending',
  note text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (space_id, person_id) references public.persons (space_id, id) on delete cascade
);
create unique index claim_requests_one_pending
  on public.claim_requests (person_id, user_id) where status = 'pending';

-- Edits proposed to a claimed profile by someone other than its owner.
create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  person_id uuid not null,
  proposed_by uuid references auth.users (id) on delete set null default auth.uid(),
  patch jsonb not null check (jsonb_typeof(patch) = 'object'),
  status public.decision_status not null default 'pending',
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (space_id, person_id) references public.persons (space_id, id) on delete cascade
);

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null check (char_length(btrim(name)) > 0),
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.form_links (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  -- The person the form is "about" (pre-filled as "you"); NULL = open family form.
  anchor_person_id uuid,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  label text not null check (char_length(btrim(label)) > 0),
  -- Editable share text (WhatsApp / email) shown to the admin when sharing the link.
  message_template text,
  status public.form_link_status not null default 'active',
  expires_at timestamptz not null default now() + interval '30 days',
  max_submissions integer check (max_submissions is null or max_submissions > 0),
  require_verification boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, id),
  foreign key (space_id, anchor_person_id) references public.persons (space_id, id) on delete set null (anchor_person_id)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  -- NULL when submitted through the in-app wizard by a logged-in member.
  form_link_id uuid,
  mode public.submission_mode not null,
  -- Whose family this describes: the submitter (self), the person interviewed, or the form's anchor.
  anchor_person_id uuid,
  submitter_name text not null check (char_length(btrim(submitter_name)) > 0),
  submitter_email text,
  submitter_phone text check (submitter_phone is null or submitter_phone ~ '^\+[1-9][0-9]{6,14}$'),
  submitter_user_id uuid references auth.users (id) on delete set null,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  status public.submission_status not null default 'draft',
  resume_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  consent_given_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, id),
  foreign key (space_id, form_link_id) references public.form_links (space_id, id) on delete set null (form_link_id),
  foreign key (space_id, anchor_person_id) references public.persons (space_id, id) on delete set null (anchor_person_id),
  check (status = 'draft' or consent_given_at is not null),
  -- Only public submissions come through a form link (the link may later be deleted).
  check (mode = 'public' or form_link_id is null),
  check (mode = 'public' or submitter_user_id is not null)
);
create index submissions_queue_idx on public.submissions (space_id, status, created_at);

create table public.submission_resolutions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  submission_id uuid not null,
  temp_person_id text not null,
  action public.resolution_action not null,
  person_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (submission_id, temp_person_id),
  foreign key (space_id, submission_id) references public.submissions (space_id, id) on delete cascade,
  foreign key (space_id, person_id) references public.persons (space_id, id) on delete set null (person_id),
  check (action <> 'reject' or person_id is null)
);

create trigger media_updated_at before update on public.media
  for each row execute function public.set_updated_at();
create trigger invites_updated_at before update on public.invites
  for each row execute function public.set_updated_at();
create trigger claim_requests_updated_at before update on public.claim_requests
  for each row execute function public.set_updated_at();
create trigger suggestions_updated_at before update on public.suggestions
  for each row execute function public.set_updated_at();
create trigger saved_views_updated_at before update on public.saved_views
  for each row execute function public.set_updated_at();
create trigger form_links_updated_at before update on public.form_links
  for each row execute function public.set_updated_at();
create trigger submissions_updated_at before update on public.submissions
  for each row execute function public.set_updated_at();
