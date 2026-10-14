-- Row level security. A user sees rows only in spaces where they are a member.
-- Column masking for living people and minors (phone, exact dates) is a Phase 3 view on
-- top of these policies; RLS is row-level only.
--
-- Anonymous users never touch tables directly. Public forms will go through token-scoped
-- security-definer RPCs (Phase 3).

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete, truncate on public.change_log from authenticated;
revoke insert, update, delete, truncate on public.identities from authenticated;

-- spaces ---------------------------------------------------------------------------------
create policy spaces_select on public.spaces for select to authenticated
  using (public.is_member(id) or created_by = auth.uid());
create policy spaces_insert on public.spaces for insert to authenticated
  with check (created_by = auth.uid());
create policy spaces_update on public.spaces for update to authenticated
  using (public.has_role(id, 'admin')) with check (public.has_role(id, 'admin'));
create policy spaces_delete on public.spaces for delete to authenticated
  using (public.has_role(id, 'owner'));

-- space_members --------------------------------------------------------------------------
-- Admins manage members; only owners grant, change or remove the owner role.
create policy space_members_select on public.space_members for select to authenticated
  using (public.is_member(space_id));
create policy space_members_insert on public.space_members for insert to authenticated
  with check (public.has_role(space_id, 'admin') and (role <> 'owner' or public.has_role(space_id, 'owner')));
create policy space_members_update on public.space_members for update to authenticated
  using (public.has_role(space_id, 'admin') and (role <> 'owner' or public.has_role(space_id, 'owner')))
  with check (public.has_role(space_id, 'admin') and (role <> 'owner' or public.has_role(space_id, 'owner')));
create policy space_members_delete on public.space_members for delete to authenticated
  using (
    user_id = auth.uid()
    or (public.has_role(space_id, 'admin') and (role <> 'owner' or public.has_role(space_id, 'owner')))
  );

-- identities -----------------------------------------------------------------------------
create policy identities_select on public.identities for select to authenticated
  using (exists (
    select 1 from public.persons p where p.identity_id = identities.id and public.is_member(p.space_id)
  ));

-- persons: members read, editors write, admins hard-delete ---------------------------------
create policy persons_select on public.persons for select to authenticated
  using (public.is_member(space_id));
create policy persons_insert on public.persons for insert to authenticated
  with check (public.has_role(space_id, 'editor'));
create policy persons_update on public.persons for update to authenticated
  using (public.has_role(space_id, 'editor')) with check (public.has_role(space_id, 'editor'));
create policy persons_delete on public.persons for delete to authenticated
  using (public.has_role(space_id, 'admin'));

-- Graph and enrichment tables: members read, editors write -------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'person_names', 'places', 'person_places', 'person_links', 'unions', 'union_members',
    'parent_child', 'branches', 'media', 'media_people'
  ] loop
    execute format(
      'create policy %1$I on public.%2$I for select to authenticated using (public.is_member(space_id))',
      t || '_select', t);
    execute format(
      'create policy %1$I on public.%2$I for insert to authenticated with check (public.has_role(space_id, ''editor''))',
      t || '_insert', t);
    execute format(
      'create policy %1$I on public.%2$I for update to authenticated
         using (public.has_role(space_id, ''editor'')) with check (public.has_role(space_id, ''editor''))',
      t || '_update', t);
    execute format(
      'create policy %1$I on public.%2$I for delete to authenticated using (public.has_role(space_id, ''editor''))',
      t || '_delete', t);
  end loop;
end
$$;

-- invites, form links, resolutions: admins only ------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['invites', 'form_links', 'submission_resolutions'] loop
    execute format(
      'create policy %1$I on public.%2$I for all to authenticated
         using (public.has_role(space_id, ''admin'')) with check (public.has_role(space_id, ''admin''))',
      t || '_admin', t);
  end loop;
end
$$;

-- claim_requests -------------------------------------------------------------------------
create policy claim_requests_select on public.claim_requests for select to authenticated
  using (user_id = auth.uid() or public.has_role(space_id, 'admin'));
create policy claim_requests_insert on public.claim_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and public.is_member(space_id));
create policy claim_requests_update on public.claim_requests for update to authenticated
  using (public.has_role(space_id, 'admin')) with check (public.has_role(space_id, 'admin'));
create policy claim_requests_delete on public.claim_requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- suggestions: proposer, the claimed person's user, and admins ----------------------------
create policy suggestions_select on public.suggestions for select to authenticated
  using (
    proposed_by = auth.uid()
    or public.has_role(space_id, 'admin')
    or exists (select 1 from public.space_members m
               where m.space_id = suggestions.space_id and m.person_id = suggestions.person_id
                 and m.user_id = auth.uid())
  );
create policy suggestions_insert on public.suggestions for insert to authenticated
  with check (proposed_by = auth.uid() and status = 'pending' and public.has_role(space_id, 'editor'));
create policy suggestions_update on public.suggestions for update to authenticated
  using (
    public.has_role(space_id, 'admin')
    or exists (select 1 from public.space_members m
               where m.space_id = suggestions.space_id and m.person_id = suggestions.person_id
                 and m.user_id = auth.uid())
  );

-- saved_views: personal ------------------------------------------------------------------
create policy saved_views_own on public.saved_views for all to authenticated
  using (user_id = auth.uid() and public.is_member(space_id))
  with check (user_id = auth.uid() and public.is_member(space_id));

-- submissions: in-app wizard by members; review by admins --------------------------------
create policy submissions_select on public.submissions for select to authenticated
  using (submitter_user_id = auth.uid() or public.has_role(space_id, 'admin'));
create policy submissions_insert on public.submissions for insert to authenticated
  with check (
    submitter_user_id = auth.uid()
    and form_link_id is null
    and (mode = 'self' or (mode = 'interview' and public.has_role(space_id, 'editor')))
    and public.is_member(space_id)
  );
create policy submissions_update on public.submissions for update to authenticated
  using (public.has_role(space_id, 'admin') or (submitter_user_id = auth.uid() and status = 'draft'))
  with check (public.has_role(space_id, 'admin') or submitter_user_id = auth.uid());
create policy submissions_delete on public.submissions for delete to authenticated
  using (submitter_user_id = auth.uid() and status = 'draft');

-- change_log: editors and up (it contains before/after values of private fields) ----------
create policy change_log_select on public.change_log for select to authenticated
  using (public.has_role(space_id, 'editor'));
