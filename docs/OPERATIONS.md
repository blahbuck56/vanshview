# Operations

How Vanshview is kept safe and running, and the dashboard steps that live outside the code.
Production: https://vanshview.vercel.app (Vercel, region bom1) · Supabase project `vanshview-test` (Mumbai).

## Settings

All optional: with none set, the app works exactly as in development.

| Variable (Vercel → Settings → Environment Variables) | What it switches on |
| --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | The "not a robot" check before a sign-in code is sent |
| `NEXT_PUBLIC_SENTRY_DSN` | Error reports to Sentry |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Readable stack traces in Sentry (source map upload at build) |

`NEXT_PUBLIC_*` values are baked in at build time: redeploy after changing them.

## One-time setup

### 1. Bot protection on sign-in (Cloudflare Turnstile)
Do this together with switching on real SMS, not before: until then no code costs anything.
Each sign-in code is a paid SMS, so bots asking for codes cost money. Order matters: if step 3 is done before step 2 is live, nobody can sign in.
1. Cloudflare dashboard → Turnstile → Add widget. Hostnames: `vanshview.vercel.app` (and any custom domain). Mode: Managed. Copy the site key and the secret key.
2. Vercel: set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the site key, redeploy, and check the sign-in page still sends a code.
3. Supabase → Authentication → Attack Protection → Enable CAPTCHA protection → Cloudflare Turnstile → paste the secret key → Save.

Also in Supabase → Authentication → Rate Limits: keep "SMS messages sent" at 30 per hour or lower until real usage needs more.

### 2. Error reports (Sentry)
1. sentry.io → Create project → Next.js. Copy the DSN.
2. Vercel: set `NEXT_PUBLIC_SENTRY_DSN`, redeploy.
3. Optional, for readable traces: create an org auth token (Settings → Auth Tokens) and set `SENTRY_AUTH_TOKEN` (mark Sensitive), `SENTRY_ORG=vanshview`, `SENTRY_PROJECT=javascript-nextjs`.
4. Sentry → Alerts → create "A new issue is created" → email.

Reports go through `/monitoring` on our own domain, so ad blockers don't drop them. Phone numbers are masked, IP addresses and cookies are not sent, and there are no session replays. The SDK only downloads after the page has loaded, and not at all without a DSN.

### 3. Page views (Vercel Analytics)
Vercel → project → Analytics → Enable. No cookies. Counts only.

### 4. Uptime and keep-awake (UptimeRobot, free)
1. uptimerobot.com → New monitor → HTTP(s) → `https://vanshview.vercel.app/api/health` → every 5 minutes.
2. Alert contact: your email (and the mobile app for push alerts).

`/api/health` returns `200 {"ok":true,"db":"up"}` when the app and database answer, `503` otherwise. It runs `public.health()`, the only database function open to signed-out callers, which reads no data. The regular ping also stops a free Supabase project from pausing after a week without traffic.

## Before real families sign in (go-live checklist)

- [ ] Real SMS provider connected (Twilio or MSG91) with DLT registration; SMS sending limited to India
- [ ] Turnstile switched on (section 1 above) the same day
- [ ] Test numbers removed from Supabase → Authentication → Phone (anyone who knows one can sign in with 123456)
- [ ] Sample "Malhotra family" removed or kept as a demo deliberately
- [ ] Backups / point-in-time restore decided (Supabase plan)

## Status

| Setup | Done |
| --- | --- |
| Sentry error reports | 16 Oct 2026, test error delivered |
| Supabase policy speed-ups | 16 Oct 2026, verified on the hosted database |

## What runs automatically

| What | Where |
| --- | --- |
| Security headers on every response (content policy, no framing, HTTPS only, no sniffing, strict referrer, camera/mic/location off) | `next.config.ts`; checked by `e2e/hardening.spec.ts` |
| Dependency updates: weekly grouped PR for npm, monthly for GitHub Actions | `.github/dependabot.yml` |
| CI fails if anything shipped to users has a known high-severity vulnerability | `pnpm audit --prod --audit-level high` in `ci.yml` |
| Database rules, RLS, migrations, E2E on every push | `ci.yml`, see [TEST_PLAN.md](TEST_PLAN.md) |

## Supabase advisors (checked 16 Oct 2026)

| Finding | Status |
| --- | --- |
| 14 RLS policies re-evaluated `auth.uid()` per row | Fixed in `20261018000100_hardening.sql`; a pgTAP test stops it coming back |
| SECURITY DEFINER functions callable by signed-in users (`accept_invite`, `get_invite`, `claim_self`, `list_members`, `is_member`, `has_role`) | Intended. Each checks the caller itself; `is_member`/`has_role` only answer about the caller's own membership |
| Leaked password protection off | Not applicable: there are no passwords |
| 39 foreign keys without a covering index | Not needed now: lookups the app makes (`child_id`, `parent_id`, `person_id`) are indexed; the rest are on features not built yet or columns never queried. Revisit if a family passes ~1,000 people |
| 8 unused indexes | Search and audit indexes; unused only because the test project has little data. Keep |

Re-run: Supabase dashboard → Advisors, after any schema change.

## Releasing and rolling back

- Every push to `claude/new-session-mj61u8` deploys to production once CI has run. A bad release: Vercel → Deployments → previous deployment → Promote to Production (instant).
- The database can't roll back with it, so migrations only add (new columns, functions, policies) and never remove or rename what the live app uses. Removal comes in a later release, once nothing reads it.
- Hosted database changes are applied from the migration files in `supabase/migrations/`, in order.
