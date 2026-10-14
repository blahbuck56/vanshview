# Vanshview: Design and User Flows

Companion to `SPEC.md`. Visual mock: https://claude.ai/artifact/UephL1aE7ZJkYVMYBCmpZr (private). The spec says what the system does. This doc says how it should feel and how people move through it. If the two conflict, raise it; don't silently pick one.

---

## 1. Who actually uses this

| Persona | Share of users | Device | What they want | What kills it |
| --- | --- | --- | --- | --- |
| **Keeper** (initiator, 25–45, often diaspora) | 1–2 per space | Laptop first, then phone | Get the tree started fast, get relatives to fill gaps, look good when shared | Blank canvas, data entry tedium, chasing people |
| **Contributor** (cousins, siblings) | 3–10 | Phone | Add their own branch, fix wrong data about themselves | Being forced to create an account to fix one name |
| **Elder** (60+, knows the most) | Few, but most of the data | Phone, WhatsApp-native, may prefer Hindi | Tell the story; see their parents remembered | Forms, small text, English-only, "required" errors |
| **Viewer** | Most members | Phone | "How am I related to her?" before a wedding | A graph they can't read on a 6-inch screen |

Two things follow from this:

1. **Most of the data comes from elders, but they don't type it in.** Usually a younger relative sits with them and does the typing. That makes **interview mode** (§3.6) a core flow, not an edge case.
2. **Most views happen on phones, and a full graph is unreadable there.** On mobile the default is a person-centric card view; the graph is secondary (§4.3).

---

## 2. Design principles

1. **Talk in relationships, not in graph terms.** Buttons say "Add Ramesh's mother", not "Add parent node". Nobody but us ever sees "union", "edge" or "placeholder". Unions show up as "married 1971", placeholders as "Unknown father".
2. **Every add starts as a search.** One name field searches existing people as you type and offers "Create new" at the bottom. The spec's "link existing before create" happens inside the field, not as a separate step.
3. **Ask only when the answer is ambiguous.** Only one partner? The child goes to that union and we don't ask. Both parents known? Then ask "full or half sibling". Otherwise don't.
4. **Required means required, but never a dead end.** Every required field has a sensible escape hatch, e.g. a location with "Somewhere in Punjab" as free text. See §5 for the phone problem.
5. **Undo instead of confirm.** Every change shows a toast with Undo, backed by change_log. Use confirm dialogs only for merge, hard delete and role changes. People edit more when it's safe to make mistakes.
6. **Respect the dead and the private.** Use quiet treatments for deceased people, with no skulls, crosses or crying emoji. Masked fields simply aren't shown; we never render "Hidden 🔒" to tease people.
7. **The data is the colour.** The app chrome is neutral, so colour modes can carry meaning without fighting the UI.

---

## 3. Core flows

### 3.1 First run (keeper)

Target: **under 3 minutes from landing page to a tree of 7+ people.**

```
Landing → Phone number → 6-digit SMS code (WhatsApp as fallback channel;
email code available as a secondary option)
  → "What should we call this family?"   [Malhotra family]
  → "Start with you"                      name · location · phone
  → "Your parents"                        two cards, side by side
  → "Your partner"          (skippable)
  → "Your children"         (skippable)
  → "Your siblings"         (skippable)
  → Tree, focused on you, with a one-line nudge:
     "Your grandparents are missing. Ask your father, or send him a form."  [Share on WhatsApp]
```

- **Onboarding is the wizard.** It's the same component, the same payload and the same `commit_submission`, anchored on yourself. That gives us one code path and one source of bugs instead of two.
- Use "Your parents", not "Parents (2)". Each card has "Don't know" and "Passed away" toggles at the top, *before* the fields, because they change which fields appear.
- The final screen is never empty. It shows the tree plus the single most useful next action, which is usually "send a form to the oldest living person you've added".

### 3.2 Adding a relative from the tree (desktop)

```
Hover a person → four "+" handles appear:
        ▲ parent
  ◀ partner  ●  sibling ▶
        ▼ child
Click → side sheet slides in (tree stays visible, new node previewed as a ghost)
```

The sheet works like this:

| Step | What the user sees | Notes |
| --- | --- | --- |
| 1 | Title: "Add Ramesh's mother". Pick Mother / Father as two buttons; parent gender is preset by the button | Kinship terms (chacha vs mama) need gender, so we capture it without asking for it |
| 2 | One name field. Typing shows existing matches first ("Kamla Devi · b. ~1930 · Amritsar"), then a "+ Create Kamla …" row | Dedup candidates show here, ranked by the same `dedup_candidates` function as the review queue |
| 3a | If you pick an existing person, the sheet collapses to just the contextual question, if any | e.g. "Make Kamla and Mohan partners?" when the child already has one parent |
| 3b | If you create new, you get the required fields (location, living toggle, phone if living adult) and "More details" collapsed | |
| 4 | Save. The ghost node becomes real and the layout animates once (≤300 ms). Toast: "Added Kamla Devi · Undo" | |

Contextual questions are asked only when needed:

| Adding | Asked only when | Question |
| --- | --- | --- |
| Child | Focus has ≥2 partners | "Who's the other parent?" (partners listed + "Someone else / unknown") |
| Sibling | Focus has 2 known parents | "Same mother and father?" Yes / Only mother / Only father |
| Sibling | Focus has no parents | Nothing. We silently create the "Unknown father / Unknown mother" pair and show it dashed |
| Parent | Child already has one parent | "Were Mohan and Kamla married?" Yes / No / Don't know |
| Partner | Focus has an active marriage | "Is this a current or past marriage?" plus the end reason if past |

### 3.3 Public form via WhatsApp (non-member)

This is the main growth loop: each form brings in a branch and the next round of invites.

```
Admin: Settings → Forms → New form
  label "Sharma side, Diwali", about: [Nani ▾] or "anyone", expiry 30 days
  → gets: link, QR, and a pre-written WhatsApp message (Hindi + English):
     "Namaste! We're putting together the Malhotra family tree.
      Could you add your side? Takes about 5 minutes: <link>"

Relative (phone, no account):
  Intro screen  — who's asking (Divyansh Malhotra, with photo), what it's for,
                  who will see it, "about 5 minutes", language toggle
  "Is this you?" — if anchored: "Kamla Devi, b. ~1930, Amritsar" [Yes, that's me] [No]
  Steps 1–8 per spec, one group per screen, big tap targets, progress bar
  Done — "Thank you. Divyansh will review and add this to the tree."
         + "Want to see the tree? Leave your email and we'll send an invite."
```

- **The intro screen matters more than any other screen.** An unknown link asking for family phone numbers looks like a scam. Showing the keeper's real name and photo, saying who sees the data, and offering "you can skip anything except your own name" is what gets people through it.
- Resuming: the resume link goes to the submitter's email/phone if given. Otherwise "Bookmark this page" plus autosave in the URL token.
- Existing relatives (anchored form) appear as **already-filled cards with a green "Already in tree" label**. The submitter confirms or taps "Something's wrong" to correct. They never retype them.

### 3.4 Review queue (admin)

The goal is that **approving a clean submission takes one click and an overlapping one takes under a minute.**

```
Inbox (one place for everything that needs an admin):
  [Submissions 2] [Claim requests 1] [Suggested edits 3] [Data issues 7]

Submission view:
  Left: submitted mini-tree (same focus-view components), new people outlined, matches linked
  Right: one row per person
     Kamla Devi (new)     → ● Same as "Kamla Devi, b.1931, Amritsar"  phone match   [✓ preselected]
     Rohit Sharma (new)   → ○ No match → Create                                   [✓ preselected]
     Unknown spouse       → Reject                                                [ ]
  Footer: [Approve 5 of 6]  [Reject with note]
```

- **Preselect the obvious action.** A phone match or a high-score match defaults to link_existing; anything else defaults to create. The admin only has to look at the yellow rows.
- Field-level merge appears only when there's an actual conflict, as a two-column picker for that field.

### 3.5 Joining and claiming

| Entry | Flow |
| --- | --- |
| Invite tied to a person (`invites.person_id`) | Accept → OTP → auto-claimed (the invite is the approval) → lands on own node: "This is you. Anything wrong?" |
| Invite without a person | Accept → "Are you one of these?" (top matches by name/phone in that space) → pick one = claim request, or "I'm not in the tree yet" → mini wizard for self |
| Public form submitter who left an email | After approval, gets an invite already tied to their person |

### 3.6 Interview mode (editor entering on behalf of someone)

This uses the same wizard, launched from a person: "Fill in Nani's family with her". The wizard is anchored on Nani, and the copy switches to second person about her ("Nani's parents", "Nani's siblings"). The submission records the editor as submitter and Nani as the anchor. This is the single highest-yield flow for older generations.

### 3.7 Everyday viewing

- **Search is the primary navigation.** A ⌘K / top search bar jumps to anyone and refocuses the tree.
- **"How are we related?"** Pick two people and get a highlighted path plus a label ("Your father's cousin" / "Pitaji ke chachere bhai"). The kinship engine lands in Phase 5, but the entry point should exist from Phase 2 with path highlighting.

---

## 4. Visual design

### 4.1 Direction: family register, not SaaS dashboard

The reference points are a well-kept family register, a museum catalogue and a printed timetable. The anti-references, which are what makes things look AI-generated:

| Avoid | Instead |
| --- | --- |
| Purple/blue gradients, glassmorphism, glows | Flat warm paper, ink, one accent |
| Every surface a `rounded-2xl shadow-lg` card | Hairline rules (1px), 4–6px radius, shadows only on floating layers (sheets, menus) |
| Inter everywhere, uniform weight | A serif for **names**, a sans for UI, tabular figures for dates |
| Emoji and sparkle icons in headings | No emoji in the UI. Lucide icons at 16px, used sparingly |
| Big hero copy ("Discover your roots ✨") | Plain statements ("Your family, in one place. Private to the people you invite.") |
| Avatar circles with initials on every node | Text-first name plates; photo only where one exists |
| Chirpy microcopy ("Awesome! 🎉") | Calm and specific ("Added Kamla Devi. Undo") |

### 4.2 Tokens

**Type**

| Role | Face | Why |
| --- | --- | --- |
| Person names, page titles | IBM Plex Serif, falling back to Noto Serif Devanagari | Feels like a record. The Devanagari fallback matches its weight well |
| UI, body | IBM Plex Sans + IBM Plex Sans Devanagari | Same family covers Hindi properly, so there's no mismatched fallback when the UI switches language |
| Dates, years, counts | IBM Plex Mono or Plex Sans with `tabular-nums` | Years line up in lists and on node stacks |

Scale: 12 / 13 / 14 (base UI) / 16 / 20 / 28. Names on nodes are 14px serif and medium weight. Years are 12px mono, muted.

**Colour (light)**

| Token | Value | Use |
| --- | --- | --- |
| `--ground` | `#F3F4F2` | App background, neutral (deliberately not cream) |
| `--surface` | `#FFFFFF` | Sheets, nodes |
| `--ink` | `#16181B` | Primary text |
| `--ink-muted` | `#5F6368` | Secondary text, years |
| `--rule` | `#E1E2DE` | Hairlines; edges use `#BFC1BC` |
| `--accent` | `#2F4A7A` (neel / indigo ink) | Primary actions and focus ring. Used rarely |
| `--danger` | `#9A3412` | Destructive only |
| `--unknown` | `#B5B8B4` | "Unknown" bucket in every colour mode |

Dark mode is a neutral charcoal (`#141516` ground, `#1C1D1F` surface), not blue-black.

Data palette (categorical): `#C98A2B` `#1E6B66` `#A8452F` `#5B78B0` `#6E7F2E` `#7C4D7A`, unknown `#B5B8B4`. Indigo is never a data colour.

**Data palettes** (colour modes) are separate from the chrome. Categorical: 8 muted, equal-lightness hues validated for colour-blind contrast. Sequential (generation, decade): single-hue ramp in indigo. Diverging (paternal vs maternal): indigo ↔ terracotta with neutral in the middle.

### 4.3 The tree

**Person node (name plate):** about 168×56, surface fill, 1px rule border, 4px radius.

```
┌▌─────────────────────┐
│▌ Kamla Devi           │   ← serif 14 medium
│▌ ~1930 – 2009 · Amritsar   ← mono 12 muted
└▌─────────────────────┘
 ↑ 4px colour-mode bar (branch / generation / location …)
   in two branches = bar split 60/40, dominant on top
```

| State | Treatment |
| --- | --- |
| Living | Years as "b. 1972" |
| Deceased | Range "1930 – 2009", name in ink-muted. No symbol |
| Placeholder | Dashed border, "Unknown mother", tap shows "Fill in" |
| Minor (masked) | Name + birth year only, no photo |
| You | Small "You" label above the plate, not a different colour (colour belongs to the data) |
| Focus | 2px accent ring |
| Filtered out | 25% opacity, edges stay visible |

**Union node:** an 8px dot on the partner line. Marriage is solid. Partnership is solid with a hollow dot. An ended union shows the line broken with a small gap. Hovering shows "Married 1971 · divorced 1984". Children drop from the union dot, never from a person, which keeps multiple marriages readable.

**Edges:** orthogonal, rounded 6px corners, 1.25px `--rule`. Adoptive is dashed, step is dotted, foster/guardian is dotted and lighter. The legend explains this once.

**Mobile (<768px):** default to **card view**: the focus person at the top as a large plate, then sections for Parents, Partners, Children, Siblings, each as a tappable row. Tapping refocuses. A "Tree" toggle switches to the graph with a 2-up/2-down default. This is the view elders and viewers will actually use.

### 4.4 Motion

- Use motion only to explain change. When nodes are added the layout animates once (≤300 ms, ease-out); when you refocus, it pans to the new focus.
- No bouncing, no skeleton shimmer longer than 400 ms, no confetti.

---

## 5. Spec items I'd push back on

| # | Spec says | Problem | Recommendation |
| --- | --- | --- | --- |
| 1 | **DECIDED:** phone stays required for living adults; for anyone other than the submitter / claimed person, "Ask later" is allowed and sets `phone_status = 'requested'`. Original concern: | The keeper adding 20 relatives won't know 20 numbers. People will type `9999999999` to get past the form, which poisons phone dedup, our strongest signal. | Require phone for **the submitter and claimed persons**. For everyone else it's strongly encouraged, with "Don't have it, ask later". That sets `phone_status = 'requested'`, shows on the person as "Number missing · Ask on WhatsApp", and counts in data_issues. The CHECK becomes `phone IS NOT NULL OR phone_status <> 'required'`. |
| 2 | **DECIDED:** phone number + SMS OTP is primary sign-in (WhatsApp fallback, email secondary). Original concern with magic link: | It breaks across devices (mail on phone, app on laptop) | Email OTP code as primary, magic link as a fallback in the same email |
| 3 | Onboarding is not specified | Two parallel paths (graph clicks and wizard) for first run | First run = wizard anchored on self (§3.1) |
| 4 | Wizard step 1 asks for many optional fields | Slows down the one moment that must be fast | Step 1 is name, location and phone, nothing else visible. "More" lives on the person later |
| 5 | Placeholder sibling parent: unspecified count | One placeholder makes siblings derive as half | Two placeholders in one union |

### Schema impacts from this doc (fold into Phase 0)
- `persons.phone_status` enum `[provided|requested|not_applicable]` (if #1 accepted)
- `submissions.anchor_person_id` and `submissions.mode [self|interview|public]` for interview mode and analytics
- `form_links.message_template` for the editable WhatsApp text

---

## 6. Metrics worth instrumenting from day one

| Metric | Definition | Target |
| --- | --- | --- |
| Activation | Space with ≥10 persons **and** ≥1 other member within 7 days | 40% |
| First-run time | Sign-up to first tree render | p50 < 3 min |
| Form completion | Submitted / opened (public links) | > 50% |
| Review latency | Submitted → decided | p50 < 48 h |
| Viral coefficient | Invites + form opens generated per new member | > 1.5 |

---

## 7. Out of scope for design now
- Marketing site beyond a single landing page
- Printable tree posters (good Phase 5+ idea, strong word-of-mouth driver)
- Hindi copy: strings are structured for i18n from Phase 1, translations land in Phase 5
