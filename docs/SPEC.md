# Vanshview: Build Spec

## 1. Product

Private, collaborative family-graph web app. Members of a family space build one shared graph. Any member can extend the graph up, down or sideways from any person. One dataset, multiple views and colour modes.

### Non-goals (v1)
- No global "world tree" and no matching with strangers' trees. Each family space is closed.
- No DNA, no payments, no native app. Responsive web only.
- No realtime multiplayer cursors. Standard refetch on change is enough.

## 2. Stack

- Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui
- Supabase: Postgres, Auth (email magic link / OTP), Storage, Row Level Security
- Schema via SQL migrations in `supabase/migrations`; generate TS types from the DB
- Graph rendering: `@xyflow/react` (React Flow) + `elkjs` (layered layout)
- Map view (Phase 4): MapLibre GL
- Forms: react-hook-form + Zod (one shared Zod schema for client validation, server actions and the commit function's payload contract)
- Bot protection on public forms: Cloudflare Turnstile
- Tests: Vitest (domain logic), pgTAP or SQL test scripts (constraints, RLS), Playwright (core flows)
- Deploy: Vercel + Supabase

## 3. Data model principles

1. **Person is not User.** Most persons never log in (deceased, children, non-tech relatives). A user claims at most one person per space.
2. **Store only primitive relationships:** parent-child edges and unions (partnerships). Siblings, cousins, in-laws, generation and kinship are always derived. Never store a sibling edge.
3. **Union is a first-class entity** (GEDCOM FAM equivalent). Supports multiple marriages, divorce, widowhood, remarriage. Children link to each parent individually and optionally to the union they belong to.
4. **Fuzzy dates everywhere.** Genealogy data is mostly "about 1920" or year-only.
5. **Everything auditable and reversible.** Soft deletes, append-only change log, reversible merges.
6. **Authorization lives in Postgres (RLS),** never only in the client.
7. **Minimal required data.** Only three things are mandatory; everything else is optional enrichment. See 3a.

## 3a. Required fields (enforced in Zod, server actions and DB constraints)

| Person state | Required | Optional |
| --- | --- | --- |
| Living adult | Name, location, phone | Everything else |
| Living minor (under 18, or marked minor) | Name, location | Phone; if blank, the UI shows the parent or guardian's number as the contact |
| Deceased | Name, location | Everything else, including phone (never collected) |
| Placeholder ("unknown parent") | None | All |

Rules:
- **Name:** at least a given name. Family name optional (single-name entries are common).
- **Location:** one place. Living: current location (`person_places.kind = current`). Deceased: last known or ancestral location. Free text is accepted when geocoding fails (place saved with NULL lat/lng and flagged for later geocoding). The form never blocks on geocoding.
- **Phone:** normalised to E.164 with libphonenumber, default country +91, editable. Duplicate numbers within a space trigger a warning, not a block (shared family landlines exist).
- **Living status:** an explicit toggle on every person, default "living". Birth date is optional, so living status can never be inferred from dates alone. Deceased toggle hides the phone field and clears any entered value.
- **Minor status:** derived from birth date when present; otherwise an explicit "under 18" checkbox appears when the phone is left blank.
- DB constraint: `CHECK (is_placeholder OR is_deceased OR is_minor OR phone IS NOT NULL)` plus a trigger requiring at least one `person_places` row for non-placeholders (deferrable, checked at commit).

## 4. Schema

Use UUID PKs, `created_at`, `updated_at`, `created_by` on all mutable tables. `deleted_at` for soft delete on persons, unions, media.

```
spaces(id, name, created_by)
space_members(space_id, user_id, role [owner|admin|editor|viewer], person_id NULL, joined_at)
  -- person_id = the person this user has claimed in this space

persons(
  id, space_id,
  given_name, family_name, gender [male|female|other|unknown],
  birth_date DATE NULL, birth_precision [day|month|year|decade|unknown], birth_qualifier [exact|about|before|after],
  death_date DATE NULL, death_precision, death_qualifier,
  is_deceased BOOL,            -- explicit flag; death date may be unknown
  is_placeholder BOOL,         -- "Unknown parent" nodes created by sibling flow
  biography TEXT, photo_media_id NULL,
  email NULL, phone NULL,      -- phone E.164; required for living adults (see 3a); privacy-restricted
  is_minor BOOL,
  merged_into NULL             -- set when merged; row kept for undo
)
-- Store fuzzy dates normalised to the start of the period (year-only 1920 -> 1920-01-01, precision=year)
-- Living status comes from is_deceased only (explicit toggle). Add is_minor BOOL, derived from birth_date when known, else explicit.

person_names(id, person_id, kind [birth|married|nickname|alias|transliteration], given, family, script NULL, is_primary)
  -- script supports Devanagari / Gurmukhi etc. alongside Latin

places(id, label, city, region, country_code, lat, lng)
person_places(id, person_id, place_id, kind [birth|death|residence|current|ancestral], from_date NULL, to_date NULL)

person_links(id, person_id, platform [linkedin|instagram|facebook|x|website|other], url)

unions(id, space_id, kind [marriage|partnership|unknown], start_date NULL, end_date NULL, end_reason [divorce|separation|death] NULL)
union_members(union_id, person_id)          -- CHECK max 2 members per union

parent_child(
  id, parent_id, child_id,
  kind [biological|adoptive|step|foster|guardian|unknown],
  union_id NULL,
  UNIQUE(parent_id, child_id)
)

branches(id, space_id, name, root_person_id, lineage [all_descendants|patrilineal|matrilineal], color)
  -- A branch is a rule, not a label stamped on people. Membership is computed.

media(id, space_id, storage_path, caption, taken_date NULL, uploaded_by)
media_people(media_id, person_id)

invites(id, space_id, person_id NULL, email, token, invited_by, role, status [pending|accepted|expired|revoked], expires_at)
claim_requests(id, person_id, user_id, status [pending|approved|rejected], decided_by NULL)
suggestions(id, person_id, proposed_by, patch JSONB, status, decided_by NULL)   -- edits to claimed profiles

change_log(id, space_id, actor_user_id, table_name, row_id, op [insert|update|delete], before JSONB, after JSONB, at)
  -- written by triggers only; append-only; no UPDATE/DELETE grants

saved_views(id, space_id, user_id, name, config JSONB)   -- focus person, depth, colour mode, filters

form_links(
  id, space_id, created_by,
  anchor_person_id NULL,       -- person the form is "about" (pre-filled as "you"), NULL = open family form
  token,                       -- unguessable, URL-safe
  label,                       -- e.g. "Sharma side, Diwali 2026"
  status [active|paused|expired],
  expires_at, max_submissions NULL,
  require_verification BOOL    -- email OTP before submit
)

submissions(
  id, space_id, form_link_id NULL,   -- NULL when submitted via in-app wizard by a logged-in member
  submitter_name, submitter_email NULL, submitter_phone NULL, submitter_user_id NULL,
  payload JSONB,                      -- validated against SubmissionPayload Zod schema, see section 5a
  status [draft|pending|approved|partially_approved|rejected],
  resume_token,                       -- lets submitter return to a draft
  consent_given_at,                   -- required before status leaves draft
  reviewed_by NULL, reviewed_at NULL, review_notes NULL,
  ip_hash, user_agent                 -- abuse tracing only
)

submission_resolutions(
  id, submission_id, temp_person_id,  -- temp id from payload
  action [create|link_existing|reject],
  person_id NULL                      -- resolved canonical person after commit
)
```

Unauthenticated users never touch canonical tables. Public form access is only through security-definer RPCs scoped by token (`get_form(token)`, `save_draft(token, resume_token, payload)`, `submit(token, resume_token, payload)`), all rate-limited.

### DB-level integrity (hard blocks)
- No self-edges in `parent_child` or `union_members`.
- No cycles: trigger rejects a parent_child insert if the child is already an ancestor of the parent (recursive CTE).
- Max 2 `biological` parents per child.
- Both ends of every edge must be in the same space.
- Death date cannot precede birth date.

### Data issues (soft warnings, surfaced in UI, never blocking)
Expose a `data_issues` view: parent younger than 12 at child's birth; child born more than 1 year after a parent's death; union member under 16 at union start; birth year more than 120 years before death; likely duplicate persons.

### Derived queries (SQL functions, `security invoker`)
- `ancestors(person_id, max_depth)` / `descendants(person_id, max_depth)`
- `siblings(person_id)` returning full / half / step, derived from shared parents and unions
- `neighborhood(focus_id, up, down)` returning persons + parent_child + unions + union_members for the focus view in one call
- `dedup_candidates(given, family, phone, location, birth_year)`: exact phone match ranks first; then `pg_trgm` on all names + same location + birth year within 3 years (when known) + shared relatives as a ranking boost

## 5. Add-relative semantics (the core logic, unit-test all of it)

Every add flow starts with **"Link an existing person"** (search + dedup candidates) before **"Create new"**. Optional email on create generates an invite.

| Action | Behaviour |
| --- | --- |
| Add parent | Create/link person, insert parent_child. If child already has one parent, offer to create a union between the two parents and set union_id. Block a third biological parent. |
| Add child | Ask which union (partner) the child belongs to, or "other parent unknown". Insert parent_child for each known parent. |
| Add sibling | Requires a shared parent. If focus has parents/union, attach new person to them (ask full vs half). If focus has no parents, create a placeholder parent union (`is_placeholder`) and attach both. Never store a sibling edge. |
| Add spouse/partner | Create union with both members. Multiple unions allowed; enforce union dates do not overlap for `marriage` as a soft warning only. |
| Merge persons | Repoint all edges, names, places, links, media to survivor; set `merged_into` on loser; log full before-state for undo. |

All add/merge operations run as single Postgres functions (transactions), not multi-call client sequences.

## 5a. Form-based submission

Two entry points, one pipeline. Both produce a `SubmissionPayload`; both commit through the same Postgres function that calls the section 5 add-relative logic. The graph UI and the forms must never diverge in behaviour.

### Entry points
1. **In-app guided wizard (members):** "Add my family" step-by-step flow, an alternative to clicking on graph nodes. Editors' submissions commit immediately after an inline dedup step; viewers' submissions go to review.
2. **Public intake form (non-members):** admin creates a `form_link`, shares the URL (WhatsApp, email, QR). Relative fills it on mobile with no account. Submission lands in a review queue, never directly in the graph. Optional email OTP verification per link.

### Form flow (mobile-first, one question group per screen, progress bar)

Every person card shows only the required fields (name, location, living toggle, phone if living) plus an "Add more details" expander holding everything else. A relative should be able to finish a full family submission in under five minutes with required fields only. Every step after "About you" is skippable.

1. About you: name, current location, phone (required). Optional expander: other names (maiden, other script), birth date with "year only / about" toggle, birthplace, photo, social links, email
2. Your parents: two cards, each with "don't know" and "deceased" toggles
3. Grandparents (optional, skippable): four cards, pre-labelled paternal / maternal
4. Partner(s): repeatable; status married / divorced / widowed
5. Children: repeatable; each child asks which partner is the other parent (select from step 4 or "other / unknown")
6. Siblings: repeatable; full or half (if half, which parent is shared). Siblings automatically attach to the parents from step 2. Never ask for sibling links separately.
7. Anything else: free-text stories, photo uploads, "who else should we invite" (name + email/phone)
8. Review and consent: summary of everything entered, edit links back to each step, mandatory consent checkbox covering living people's data, submit

Behaviour:
- If `anchor_person_id` is set, pre-fill known data and show existing relatives as already-present cards the submitter can confirm or correct rather than re-enter.
- Autosave drafts every step; resume via `resume_token` link.
- Place autocomplete (geocoding service, store lat/lng).
- Date input accepts "1952", "about 1950", "March 1952", full date; maps to precision + qualifier.
- Phone is the strongest dedup signal: an exact E.164 match against an existing person in scope ranks first.
- Light duplicate hint while typing ("Is this Ramesh Sharma, b. 1948?") only when anchor is set, and only showing names the link's scope already exposes. Never expose the full space to anonymous users.
- English and Hindi UI labels (Phase 5; structure strings for i18n from the start).

### SubmissionPayload contract (Zod, shared)
```
{
  submitter: { temp_id, ...personFields },
  persons: [{ temp_id, ...personFields, is_deceased, existing_person_id? }],
  parent_child: [{ parent_temp_id, child_temp_id, kind }],
  unions: [{ member_temp_ids: [a, b], kind, end_reason? }],
  media: [{ temp_id, storage_path, person_temp_ids[] }],
  invites: [{ name, email?, phone? }],
  notes: string
}
```
Temp ids reference each other within the payload, or `existing_person_id` points at canonical persons. Uploads go to a quarantine storage bucket, moved on approval.

### Review queue (admins, and editors if the admin allows it)
- List of pending submissions with submitter, link, date, person count.
- Review screen: submitted mini-graph rendered with the same focus-view components, next to a per-person resolution list.
- For each temp person: top dedup candidates with match reasons; admin picks `create`, `link_existing` (field-level merge: choose which value wins for conflicts), or `reject`.
- Approve all / approve selected / reject with note. Approval calls `commit_submission(submission_id, resolutions JSONB)`: one transaction, runs integrity checks, writes `submission_resolutions`, logs every change in `change_log` with the submission id, sends queued invites.
- Rejections and partial approvals notify the submitter by email if one was provided.
- A committed submission can be reverted from change_log as one unit.

## 6. Permissions

- RLS: a user sees rows only in spaces where they are a member.
- Roles: `viewer` reads; `editor` adds and edits unclaimed and deceased persons; `admin` also manages members, approves claims, merges, hard-deletes; `owner` is admin plus ownership transfer.
- Claimed person: only the claiming user and admins edit core fields directly. Other editors submit `suggestions`.
- Living persons: phone, email, social links and exact birth date visible to editors+ and the person themselves. Viewers see name, location (city level) and birth year only. Phone numbers are never returned to anonymous form users, including in duplicate hints.
- Minors (living, under 18): name and birth year only for everyone except admins and their parents in the graph. No photo, no links, no contact.
- Implement restricted fields via a view or security-definer function that masks columns by role, since RLS is row-level.
- Write RLS tests per role per table.

## 7. Views

1. **Focus view (default):** hourglass around a focus person, default 3 generations up and 3 down, expand/collapse per node, double-click to re-focus. Layout: React Flow + ELK layered. **Model unions as small connector nodes** (person -> union -> children). This turns the graph into a DAG that layered layout handles cleanly, including multiple marriages and remarriage.
2. **Network view:** whole space at once for overview, same node components, minimap, lazy rendering above ~1,500 nodes.
3. **Map view (Phase 4):** persons plotted by selected place kind (birth / current / ancestral), clustered.
4. **Person panel:** side sheet with profile, relatives grouped (parents, partners, children, derived siblings), places timeline, media, links, change history.
5. **List view:** searchable, filterable table, CSV export.

### Colour modes (pure functions of data + focus; no colours stored on persons)
- Branch (person in multiple branches: dominant fill + secondary ring)
- Generation relative to focus person
- Location: country or city of selected place kind
- Birth decade / age band
- Living vs deceased
- Paternal vs maternal side of focus person

Every colour mode has an "Unknown" bucket in neutral grey, since only name, location and phone are required (age and decade modes will often be sparse). Legend always visible and shows counts per bucket. Filters: date range, depth, relationship kind, branch, location, living status. Filters dim non-matching nodes rather than removing them, so structure stays readable.

## 8. Seed data

Synthetic 60-person, 5-generation Indian joint family covering: one person with two marriages (divorce, then remarriage), a widow who remarried, one adoption, one step-child, placeholder parents from a sibling add, deceased ancestors with year-only and "about" dates, names in Latin + Devanagari, residences across India, UK, US, UAE, three living minors, two near-duplicate persons for dedup testing, plus two pending public-form submissions (one clean, one overlapping existing persons) for review-queue testing.

## 9. Phases and acceptance criteria

**Phase 0: Foundation**
Scaffold, full schema migrations, integrity triggers, derived functions, seed, SQL tests.
Done when: `supabase db reset` runs clean, seed loads, all constraint tests pass (cycle, 3rd parent, cross-space, death before birth).

**Phase 1: Core flows**
Magic-link auth, create space, create/claim self, person CRUD with fuzzy dates, names, places, links, photo upload, all add-relative flows including link-existing and placeholder sibling logic, person panel. SubmissionPayload Zod schema, `commit_submission` function, and the in-app guided wizard for members (editors commit directly).
Done when: Playwright test signs up, adds 2 parents, 1 sibling, spouse, 2 children with that spouse, a child from a second union, and derived siblings (full and half) are correct. The same family entered through the wizard produces an identical graph.

**Phase 2: Focus view**
Union-node layout with ELK, pan/zoom, expand/collapse, click to open panel, re-focus, add-relative from node context menu.
Done when: seed renders 3 up / 3 down in under 1s, multiple marriages render without overlapping edges, pan/zoom stays smooth.

**Phase 3: Collaboration and governance**
Invites by email, claims with approval, roles, privacy masking for living and minors, suggestions, change_log triggers, undo, dedup candidates, merge and unmerge. Public intake forms: form_links management, token RPCs, Turnstile, rate limits, drafts and resume, quarantine uploads, review queue with per-person resolution, commit and revert.
Done when: RLS tests pass for every role; viewer cannot read minor details via API; merge then undo restores the exact prior state. An anonymous user with a valid token can submit but cannot read any person outside the link's scope; an expired or paused token is rejected; a submission with 6 persons where 2 match existing people commits with correct links and reverts as one unit.

**Phase 4: Views and colour modes**
All colour modes, filters, legend, network view, map view, search, saved views.
Done when: switching colour mode never refetches data; all modes correct against seed.

**Phase 5: Depth**
GEDCOM 5.5.1 import and export, JSON backup, kinship labels relative to focus (English plus Hindi terms that distinguish paternal and maternal sides: chacha, mama, bua, mausi, etc.), media gallery with person tagging, data_issues review screen.

## 10. Working rules for Claude Code

- Plan before each phase: file list, migrations, tests, open questions. Wait for approval.
- Schema changes only through new migrations. Never edit an applied migration.
- Domain logic (add-relative, derivations, colour modes, kinship) lives in `lib/domain` as pure, unit-tested functions or in Postgres functions with SQL tests.
- Never fake functionality: no mock data in UI paths, no buttons that do nothing.
- End each phase with: summary, what changed, how to test manually, known gaps.
