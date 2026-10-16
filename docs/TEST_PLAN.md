# Test plan

What Vanshview must get right, and where each case is checked. Three layers, all run in CI on every push:

| Layer | What it proves | Where | Run locally |
| --- | --- | --- | --- |
| Database (pgTAP) | Family rules, permissions and data safety hold no matter how the app calls them | `supabase/tests/*.test.sql` | `pnpm supabase test db` |
| Unit (Vitest) | Dates, phones, minors, form rules, error messages, redirects | `lib/**/__tests__` | `pnpm test` |
| End to end (Playwright) | Real flows in a real browser against a real database | `e2e/*.spec.ts` | see below |

**End-to-end locally:** `pnpm supabase start`, `pnpm supabase db reset` (fresh sample family and test numbers), then `pnpm e2e`. It signs in with test numbers from `supabase/config.toml` (code `123456`), so no SMS is sent.

## Cases

**Sign-in and access** (`e2e/auth.spec.ts`)
- Phone + code signs in and lands on your family; a new user lands on "Start your family tree".
- Malformed number and wrong code are explained; fixing the code works without restarting.
- Signed-out visitors go to sign-in and come back to the page they wanted (e.g. an invite link).
- The return address can't send you to another site.
- Sign out ends the session on this device only.
- Unknown pages show a friendly screen.

**Onboarding and the "Add family" guide** (`e2e/onboarding.spec.ts`)
- Required fields: name and place for everyone; phone for living adults (or "Ask later", except for yourself); never for someone who has died; not for under-18s.
- One save adds parents, partner, child and siblings; full and half siblings are labelled correctly.
- Unknown parents plus a sibling creates "Unknown mother/father" to link them.
- Filling in a parent later replaces the placeholder, and earlier siblings get the real parent.
- Viewers are told why they can't use the guide.

**Adding and changing relatives** (`e2e/relatives.spec.ts`, `supabase/tests/05*`, `06*`)
- Second parent is linked as a couple; a third birth parent is refused with an explanation.
- Typing a name offers people already in the family; picking one links them, no duplicate.
- Partners: married / divorced labels and year; same partner twice is refused.
- Children: with two current partners you must pick the other parent.
- No loops: someone can't become their own ancestor.
- Dates like "1952", "about 1950" are understood; nonsense and death-before-birth are explained.
- "Under 18" is kept when editing (no phone demanded).
- Editing name, place and dates shows everywhere and survives a reload; a family name can be cleared.
- Removing a wrongly added parent frees the slot for the right one; removed people vanish from search.
- Your own (claimed) profile can't be removed.

**Details from entering a 6-generation family by hand** (`e2e/details.spec.ts`, `supabase/tests/07*`)
- A new child's other parent follows the partner list even when the form opens mid-refresh, and defaults to the current partner, never an ex.
- Gender is asked on every form (known from the role for mothers and fathers), so labels read son/daughter, husband/wife.
- The guide asks how the parents are related, records a partner's marriage year, marks a widowed partner as passed away, and shows a real review (relationship, years, place, Edit) before saving; skipping warns first.
- Family name at birth: shown as "née", searchable, editable and clearable.
- Your own form has no "Passed away"/"Under 18" and says your phone is needed; a child's phone is optional.
- Errors scroll into view.

**Tree view** (`e2e/tree.spec.ts`)
- Shows aunts, uncles and cousins around you, not just your direct line.
- Opens on you, marked YOU. Click selects, double-click re-centres, the link keeps the person on reload.
- Half and step siblings derived correctly on the sample family.
- Generations up/down change how much is drawn.
- A link to someone outside the family falls back to you.
- Phones: slim header with search behind an icon, person view first, tree one tap away.

**Members, invites, roles, privacy** (`e2e/members.spec.ts`, `supabase/tests/04*`)
- Invite link (with WhatsApp share) → sign in → join with the right role → "Which one is you?" → "This is me" (fills your phone) → guide works.
- Owner sees who joined, with phone. Reusing a link says you're already in; a turned-off link says it no longer works.
- Viewers can't change anything (buttons hidden and the database refuses). Editors can't manage members. Admins change roles and remove members, who lose access at once.
- One person can be in several families and switch between them; nobody can open a family they're not in, even through the API.

**Security and running it** (`e2e/hardening.spec.ts`, `supabase/tests/08*`, `lib/**/__tests__`)
- Every page is sent with security headers; the content policy blocks nothing the app uses (sign-in, tree, search, members).
- `/api/health` answers without signing in; signed-out callers still can't read any data, and `health()` is the only function they can run.
- No RLS policy evaluates `auth.uid()` per row.
- Names with apostrophes (straight or curly), Devanagari, Gurmukhi, Urdu, accents and emoji are saved as typed, shown, and found; "D'Souza" finds "D’Souza"; a name typed with a combining accent is stored in one form.
- Error reports mask phone numbers; sign-in errors (wait, failed robot check, bad number) are explained.

## Not covered yet (features not built)
Public intake form and review queue, hiding phone numbers and children's details from viewers, merge and undo, colour modes and map, photos, Hindi, GEDCOM.
