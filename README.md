# Vanshview

Private, collaborative family trees. Members of a family space build one shared graph; relatives without an account contribute through a short mobile form.

- Product and build spec: [`docs/SPEC.md`](docs/SPEC.md)
- Design direction and user flows: [`docs/DESIGN.md`](docs/DESIGN.md)
- Running it: settings, monitoring, security, releases: [`docs/OPERATIONS.md`](docs/OPERATIONS.md)

## Stack

Next.js (App Router, TypeScript strict) · Tailwind v4 · Supabase (Postgres, Auth with phone OTP, Storage, RLS) · Zod · Vitest · pgTAP.

## Getting started

```bash
pnpm install
pnpm supabase start            # needs Docker; applies migrations + seed
cp .env.example .env.local     # fill in the API URL and publishable key printed above
pnpm dev
```

Seed users sign in with phone OTP `123456` (local only, see `supabase/config.toml`):

| User | Phone | Role | Claimed person |
| --- | --- | --- | --- |
| Arjun | +91 98765 00001 | owner | Arjun Malhotra |
| Neelam | +91 98765 00002 | admin | Neelam Malhotra |
| Tanvi | +91 98765 00003 | editor | Tanvi Malhotra |
| Rahul | +91 98765 00004 | viewer | Rahul Malhotra |

## Tests

| Command | What it runs |
| --- | --- |
| `pnpm test` | Vitest: fuzzy dates, phone normalisation, minor status, Zod person rules, SubmissionPayload contract (including the seed's payloads) |
| `pnpm supabase test db` | pgTAP against the Supabase stack: schema and seed shape, integrity rules, derived queries, RLS per role |
| `pnpm db:test:local` | Same pgTAP suite against plain Postgres 15+ without Docker (`scripts/db-test-local.sh`; needs `pgtap` and `pg_prove`) |
| `pnpm e2e` | Playwright: 34 real-browser journeys (sign-in, onboarding wizard, add/link/edit/remove relatives, tree, invites, roles, privacy, security headers, names in any script) against a local Supabase. Run `pnpm supabase start` and `pnpm supabase db reset` first; it starts the app if needed |
| `pnpm db:types` | Regenerates `types/database.ts` from the database (CI fails if it is stale) |

Every case and where it is checked: [docs/TEST_PLAN.md](docs/TEST_PLAN.md). Locally, phone sign-in needs `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` set to any value (test numbers never send an SMS).

CI (`.github/workflows/ci.yml`) runs a dependency audit, lint, typecheck, unit tests and a production build; starts Supabase, runs `supabase db reset`, the pgTAP suite, `supabase db lint`, and checks the generated types; and runs the Playwright suite against a local Supabase and a production build.

## Database at a glance

```
spaces ─┬─ space_members (role, claimed person)
        ├─ persons ─┬─ person_names (other names and scripts)
        │           ├─ person_places ── places
        │           ├─ person_links
        │           └─ identity_id ── identities   (same human across spaces, later)
        ├─ unions ── union_members (≤ 2)
        ├─ parent_child (kind, optional union, start/end)
        ├─ branches (rules, membership computed)
        ├─ media ── media_people
        ├─ invites · claim_requests · suggestions · saved_views
        ├─ form_links ── submissions ── submission_resolutions
        └─ change_log (append-only, written by triggers)
```

- **Only primitive relationships are stored:** parent-child edges and unions. Siblings, generations and kinship are derived (`siblings()`, `ancestors()`, `descendants()`, `neighborhood()`).
- **Same-space integrity is declarative:** every edge uses composite foreign keys on `(space_id, id)`.
- **Hard rules are enforced in Postgres:**
  - no cycles, no self-edges, at most two biological parents and two union members per union (graph writes are serialised per space)
  - an exact death date cannot precede the birth date
  - every non-placeholder person has a location (checked at commit)
  - a living adult has a phone, or it is marked "ask later" (`phone_status = 'requested'`)
- **Soft warnings are reported, not blocked:** they live in the `data_issues` view.
- **Fuzzy dates** are stored as `(date, precision, qualifier)`, normalised to the start of the period.
- **Cross-space linking is ready for later:** every person has an `identity_id`. Linking the same human across two family spaces (with consent from both) will point both records at one identity. No data is copied between spaces.
