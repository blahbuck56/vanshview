-- Supabase grants EXECUTE on new functions to `authenticated` directly (not only via PUBLIC),
-- so earlier revokes from PUBLIC/anon left internal functions (trigger functions, the daily
-- refresh_minor_flags job) callable through the API. Switch to an explicit allow-list:
-- signed-in users can call exactly the functions below, and new functions start closed.

revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

grant execute on function
  -- App actions
  public.start_family(text, jsonb),
  public.add_parent(uuid, jsonb, uuid, public.parent_child_kind, boolean, public.union_kind),
  public.add_child(uuid, jsonb, uuid, uuid, public.parent_child_kind),
  public.add_partner(uuid, jsonb, uuid, public.union_kind, jsonb, public.union_end_reason),
  public.add_sibling(uuid, jsonb, uuid, uuid[]),
  public.update_person(uuid, jsonb),
  public.remove_person(uuid),
  public.commit_payload(uuid, jsonb, public.submission_mode, uuid),
  public.get_invite(text),
  public.accept_invite(text),
  public.claim_self(uuid),
  -- Reads
  public.ancestors(uuid, integer),
  public.descendants(uuid, integer),
  public.siblings(uuid),
  public.neighborhood(uuid, integer, integer),
  public.dedup_candidates(uuid, text, text, text, text, integer, uuid[], uuid, integer),
  -- Used inside RLS policies, CHECK constraints and the functions above (run as the caller)
  public.has_role(uuid, public.member_role),
  public.is_member(uuid),
  public.fuzzy_date_is_normalised(date, public.date_precision),
  public.fuzzy_date_end(date, public.date_precision),
  public.compute_is_minor(date, public.date_precision, boolean, boolean, date),
  public.find_or_create_place(uuid, text),
  public.create_person(uuid, jsonb),
  public.resolve_person(uuid, jsonb, uuid),
  public.ensure_union(uuid, uuid, uuid, public.union_kind),
  public.person_space(uuid)
to authenticated;
