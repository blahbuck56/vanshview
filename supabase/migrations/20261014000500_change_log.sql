-- Append-only audit log, written only by triggers.
--
-- Grouping keys make multi-row operations reversible as one unit:
--   txid           every row written in the same transaction
--   submission_id  set via `set local vanshview.submission_id = '<uuid>'` by commit_submission
--   operation      free-form label, e.g. 'merge:<survivor>:<loser>', via `set local vanshview.operation`

create table public.change_log (
  id bigint generated always as identity primary key,
  -- No FK: the log must outlive the rows (and spaces) it describes.
  space_id uuid not null,
  actor_user_id uuid,
  table_name text not null,
  row_id uuid,
  op public.change_op not null,
  before jsonb,
  after jsonb,
  at timestamptz not null default now(),
  txid bigint not null default txid_current(),
  submission_id uuid,
  operation text
);
create index change_log_space_at_idx on public.change_log (space_id, at desc);
create index change_log_row_idx on public.change_log (row_id) where row_id is not null;
create index change_log_txid_idx on public.change_log (txid);
create index change_log_submission_idx on public.change_log (submission_id) where submission_id is not null;

create function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'token' - 'resume_token' end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'token' - 'resume_token' end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;

  insert into public.change_log (
    space_id, actor_user_id, table_name, row_id, op, before, after, submission_id, operation
  ) values (
    case when tg_table_name = 'spaces' then (v_row ->> 'id')::uuid else (v_row ->> 'space_id')::uuid end,
    auth.uid(),
    tg_table_name,
    (v_row ->> 'id')::uuid, -- NULL for tables keyed by composite PKs (union_members, media_people)
    lower(tg_op)::public.change_op,
    v_old,
    v_new,
    nullif(current_setting('vanshview.submission_id', true), '')::uuid,
    nullif(current_setting('vanshview.operation', true), '')
  );
  return null;
end
$$;

create function public.change_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'change_log is append-only' using errcode = 'insufficient_privilege';
end
$$;

create trigger change_log_no_update before update or delete on public.change_log
  for each row execute function public.change_log_append_only();
create trigger change_log_no_truncate before truncate on public.change_log
  for each statement execute function public.change_log_append_only();

do $$
declare
  t text;
begin
  foreach t in array array[
    'spaces', 'space_members', 'persons', 'person_names', 'places', 'person_places', 'person_links',
    'unions', 'union_members', 'parent_child', 'branches', 'media', 'media_people',
    'invites', 'claim_requests', 'suggestions', 'form_links', 'submissions', 'submission_resolutions'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.log_change()',
      t || '_change_log', t
    );
  end loop;
end
$$;
