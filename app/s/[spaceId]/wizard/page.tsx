"use client";

import { Plus, Trash2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { NoAccess } from "@/components/no-access";
import { PersonForm } from "@/components/person-form";
import { Button, ErrorNote, Field, Input, Segmented, Spinner, Toggle, scrollToFirstError } from "@/components/ui";
import {
  displayName,
  errorMessage,
  findCandidates,
  firstName,
  loadPeople,
  loadRelatives,
  subtitle,
  type Candidate,
  type Person,
  type Relatives,
} from "@/lib/data/family";
import { formatLifespan, parseFuzzyDate } from "@/lib/domain/dates";
import { t } from "@/lib/i18n/en";
import { draftToPayload, emptyDraft, type DraftErrors, type PersonDraft } from "@/lib/person-draft";
import type { SubmissionPayloadInput } from "@/lib/schemas/submission";
import { createClient } from "@/lib/supabase/client";
import { useSpace } from "@/lib/use-space";

type Card = { key: string; draft: PersonDraft; skip?: boolean };
type PartnerCard = Card & { kind: "marriage" | "partnership"; status: "current" | "divorce" | "separation" | "death"; since: string };
type ParentsRelation = "married" | "partners" | "divorced" | "unknown";
type ChildCard = Card & { otherParent: string };
type SiblingCard = Card & { shared: string };

const STEPS = ["Parents", "Partners", "Children", "Siblings", "Check and save"] as const;
let counter = 0;
const nextKey = (prefix: string) => `${prefix}${++counter}`;

function CardShell({ title, onRemove, children }: { title: string; onRemove?: () => void; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-rule bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-serif text-[18px] font-medium">{title}</h3>
        {onRemove && (
          <button type="button" aria-label="Remove" onClick={onRemove} className="rounded-md p-1.5 text-ink-muted hover:bg-ground">
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Wizard() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const about = useSearchParams().get("about");
  const router = useRouter();
  const { ctx, error: ctxError } = useSpace(spaceId);

  const [anchor, setAnchor] = useState<Person | null>(null);
  const [rel, setRel] = useState<Relatives | null>(null);
  const [step, setStep] = useState(0);
  const [parents, setParents] = useState<Card[]>([]);
  const [partners, setPartners] = useState<PartnerCard[]>([]);
  const [children, setChildren] = useState<ChildCard[]>([]);
  const [siblings, setSiblings] = useState<SiblingCard[]>([]);
  const [errors, setErrors] = useState<Record<string, DraftErrors>>({});
  const [matches, setMatches] = useState<Record<string, Candidate>>({});
  const [useExisting, setUseExisting] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parentsRelation, setParentsRelation] = useState<ParentsRelation>("married");
  const [sinceErrors, setSinceErrors] = useState<Record<string, string>>({});

  const anchorId = about ?? ctx?.membership?.personId ?? null;

  useEffect(() => {
    if (!anchorId) return;
    const db = createClient();
    Promise.all([loadPeople(db, [anchorId]), loadRelatives(db, anchorId)]).then(([people, r]) => {
      const a = people.get(anchorId) ?? null;
      setAnchor(a);
      setRel(r);
      // "Unknown mother/father" placeholders count as missing: a card fills them in.
      const birth = r.parents.filter((p) => ["biological", "adoptive", "unknown"].includes(p.kind) && !p.person.isPlaceholder);
      const family = a?.familyName ?? "";
      if (birth.length === 0) {
        setParents([
          { key: "mother", draft: emptyDraft({ gender: "female" }) },
          { key: "father", draft: emptyDraft({ gender: "male", familyName: family }) },
        ]);
      } else if (birth.length === 1) {
        const g = birth[0].person.gender === "male" ? "female" : "male";
        setParents([{ key: g === "female" ? "mother" : "father", draft: emptyDraft({ gender: g, familyName: g === "male" ? family : "" }) }]);
      }
    });
  }, [anchorId]);

  if (ctxError || (ctx && !ctx.membership)) return <NoAccess reason={ctxError} />;
  const blocked =
    ctx && ctx.membership?.role === "viewer"
      ? "Viewers can look at the tree but can't add people. Ask an admin of this family to make you an editor."
      : ctx && !anchorId
        ? "First find yourself in the tree and tap “This is me” on your profile. Then this guide can add your family around you."
        : null;
  if (blocked) {
    return (
      <div className="min-h-dvh">
        <AppHeader spaceId={spaceId} memberships={ctx!.memberships} active="wizard" />
        <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-10">
          <h1 className="font-serif text-[26px] font-medium tracking-tight">Add your family</h1>
          <p className="text-ink-muted">{blocked}</p>
          <Button className="self-start" onClick={() => router.push(`/s/${spaceId}`)}>
            Open the tree
          </Button>
        </main>
      </div>
    );
  }
  if (!ctx || !anchorId || !anchor || !rel) {
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  }

  const isSelf = anchorId === ctx.membership?.personId;
  const who = isSelf ? "Your" : `${firstName(anchor)}'s`;
  const birthParents = rel.parents.filter((p) => ["biological", "adoptive", "unknown"].includes(p.kind));
  const existingBirthParents = birthParents.filter((p) => !p.person.isPlaceholder);
  const activeParents = parents.filter((p) => !p.skip);
  // The anchor's two parent slots: a known parent, a new card, or an "Unknown mother/father" left as is.
  const parentSlots = [
    ...existingBirthParents.map((p) => ({ id: `ex:${p.person.id}`, label: displayName(p.person) })),
    ...parents.flatMap((c) => {
      if (!c.skip) return [{ id: c.key, label: c.draft.givenName || (c.key === "mother" ? "Mother" : "Father") }];
      const ph = birthParents.find((p) => p.person.isPlaceholder && p.person.gender === (c.key === "mother" ? "female" : "male"));
      return ph ? [{ id: `ex:${ph.person.id}`, label: displayName(ph.person) }] : [];
    }),
  ];
  const parentOptions = parentSlots;
  const partnerOptions = [
    ...rel.partners.map((p) => ({ value: `ex:${p.person.id}`, label: displayName(p.person) })),
    ...partners.map((p) => ({ value: p.key, label: p.draft.givenName || "New partner" })),
    { value: "none", label: "Someone else / unknown" },
  ];
  // A new child's other parent defaults to the one current partner; never to an ex or a late partner.
  const currentPartners = [
    ...rel.partners.filter((p) => !p.union.endReason).map((p) => `ex:${p.person.id}`),
    ...partners.filter((p) => p.status === "current").map((p) => p.key),
  ];
  const defaultOtherParent =
    partnerOptions.length === 1 ? "none" : currentPartners.length === 1 ? currentPartners[0] : partnerOptions.length === 2 ? partnerOptions[0].value : "";
  const partnerGender = (key: string) =>
    key.startsWith("ex:") ? rel.partners.find((p) => `ex:${p.person.id}` === key)?.person.gender : partners.find((p) => p.key === key)?.draft.gender;
  const partnerFamily = (key: string) =>
    key.startsWith("ex:") ? rel.partners.find((p) => `ex:${p.person.id}` === key)?.person.familyName : partners.find((p) => p.key === key)?.draft.familyName;
  // A child usually takes the father's family name.
  const childFamilyName = (otherParent: string) =>
    anchor.gender === "female" && partnerGender(otherParent) === "male" && partnerFamily(otherParent)
      ? partnerFamily(otherParent)!
      : (anchor.familyName ?? "");
  const twoParents = parentSlots.length === 2 && activeParents.length > 0;

  const allCards = (): Card[] => [...activeParents, ...partners, ...children, ...siblings];

  const isChild = (c: Card) => children.some((ch) => ch.key === c.key);

  function validate(cards: Card[]): boolean {
    const next: Record<string, DraftErrors> = {};
    for (const c of cards) {
      const r = draftToPayload(c.draft, { allowAskLater: true, phoneOptional: isChild(c) });
      if (!r.ok) next[c.key] = r.errors;
    }
    const since: Record<string, string> = {};
    for (const c of cards) {
      const pc = partners.find((p) => p.key === c.key);
      if (pc?.since.trim()) {
        const d = parseFuzzyDate(pc.since);
        if (!d.ok) since[c.key] = t(d.error);
      }
    }
    setErrors(next);
    setSinceErrors(since);
    const missingOther = cards.some((c) => children.some((ch) => ch.key === c.key && !ch.otherParent));
    if (missingOther) setError("Choose the other parent for each child.");
    const ok = Object.keys(next).length === 0 && Object.keys(since).length === 0 && !missingOther;
    if (!ok) scrollToFirstError();
    return ok;
  }

  const stepCards = [activeParents, partners, children, siblings];

  async function goNext() {
    setError(null);
    if (step < 4 && !validate(stepCards[step])) return;
    if (step === 3) {
      // Before saving, look for people who may already be in the family.
      setChecking(true);
      const db = createClient();
      const found: Record<string, Candidate> = {};
      for (const c of allCards()) {
        const name = `${c.draft.givenName} ${c.draft.familyName}`.trim();
        const cands = await findCandidates(db, spaceId, name, { place: c.draft.place || null });
        const best = cands[0];
        if (best && best.score >= 60 && best.person.id !== anchorId) found[c.key] = best;
      }
      setMatches(found);
      setChecking(false);
    }
    setStep((s) => Math.min(s + 1, 4));
  }

  function personRef(c: Card) {
    if (useExisting[c.key] && matches[c.key]) return { temp_id: c.key, existing_person_id: matches[c.key].person.id };
    const r = draftToPayload(c.draft, { allowAskLater: true, phoneOptional: isChild(c) });
    return { temp_id: c.key, ...(r.ok ? r.value : {}) };
  }

  async function save() {
    setError(null);
    if (!validate(allCards())) {
      setError((e) => e ?? "Some details need fixing. Go back to the step with the red message.");
      return;
    }
    const persons: SubmissionPayloadInput["persons"] = [];
    const parentChild: NonNullable<SubmissionPayloadInput["parent_child"]> = [];
    const unions: NonNullable<SubmissionPayloadInput["unions"]> = [];
    const existingRef = (id: string) => {
      const key = `ex_${id.slice(0, 8)}`;
      if (!persons.some((p) => p.temp_id === key)) persons.push({ temp_id: key, existing_person_id: id });
      return key;
    };
    const resolve = (id: string) => (id.startsWith("ex:") ? existingRef(id.slice(3)) : id);

    for (const c of [...activeParents, ...partners, ...children, ...siblings]) persons.push(personRef(c) as never);

    // Parents of the anchor, and a union between the two parents. A new parent replaces an
    // "Unknown mother/father" placeholder in the database, keeping earlier siblings attached.
    const parentKeys = parentSlots.map((s) => s.id);
    for (const p of activeParents) parentChild.push({ parent_temp_id: p.key, child_temp_id: "anchor", kind: "biological" });
    if (twoParents) {
      unions.push({
        member_temp_ids: [resolve(parentKeys[0]), resolve(parentKeys[1])],
        kind: parentsRelation === "partners" ? "partnership" : parentsRelation === "unknown" ? "unknown" : "marriage",
        ...(parentsRelation === "divorced" ? { end_reason: "divorce" as const } : {}),
      });
    }

    for (const p of partners) {
      const start = p.since.trim() ? parseFuzzyDate(p.since) : null;
      unions.push({
        member_temp_ids: ["anchor", p.key],
        kind: p.kind,
        ...(p.status !== "current" ? { end_reason: p.status } : {}),
        ...(start?.ok && start.value.date ? { start: start.value } : {}),
      });
    }

    for (const c of children) {
      parentChild.push({ parent_temp_id: "anchor", child_temp_id: c.key, kind: "biological" });
      if (c.otherParent !== "none") parentChild.push({ parent_temp_id: resolve(c.otherParent), child_temp_id: c.key, kind: "biological" });
    }

    if (siblings.length) {
      let shared = parentKeys.map(resolve);
      if (shared.length === 0) {
        // No parents known: placeholder parents so the siblings are linked (never a sibling edge).
        persons.push({ temp_id: "ph_father", is_placeholder: true, gender: "male", family_name: anchor?.familyName ?? undefined } as never);
        persons.push({ temp_id: "ph_mother", is_placeholder: true, gender: "female" } as never);
        unions.push({ member_temp_ids: ["ph_father", "ph_mother"], kind: "unknown" });
        parentChild.push({ parent_temp_id: "ph_father", child_temp_id: "anchor", kind: "biological" });
        parentChild.push({ parent_temp_id: "ph_mother", child_temp_id: "anchor", kind: "biological" });
        shared = ["ph_father", "ph_mother"];
      }
      for (const s of siblings) {
        // "Only <parent>" whose card was later switched to "Don't know" falls back to both.
        const from = s.shared === "all" || !parentKeys.includes(s.shared) ? shared : [resolve(s.shared)];
        for (const p of from) parentChild.push({ parent_temp_id: p, child_temp_id: s.key, kind: "biological" });
      }
    }

    const payload: SubmissionPayloadInput = {
      submitter: { temp_id: "anchor", existing_person_id: anchorId! },
      persons,
      parent_child: parentChild,
      unions,
      notes: "",
    };

    setBusy(true);
    const { error } = await createClient().rpc("commit_payload", {
      p_space_id: spaceId,
      p_payload: payload as never,
      p_mode: isSelf ? "self" : "interview",
      p_anchor_person_id: anchorId!,
    });
    setBusy(false);
    if (error) {
      setError(errorMessage(error));
      scrollToFirstError();
    }
    else router.push(`/s/${spaceId}?focus=${anchorId}`);
  }

  const cardErrors = (k: string) => errors[k] ?? {};
  const update = <T extends Card>(list: T[], set: (l: T[]) => void, key: string, patch: Partial<T>) =>
    set(list.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const total = allCards().length;

  // What the review screen says about each person: their relationship, years and place.
  const gendered = (d: PersonDraft, female: string, male: string, other: string) =>
    d.gender === "female" ? female : d.gender === "male" ? male : other;
  const optionLabel = (value: string) => partnerOptions.find((o) => o.value === value)?.label;
  function describe(c: Card): { step: number; relation: string; details: string } {
    const born = parseFuzzyDate(c.draft.born);
    const died = parseFuzzyDate(c.draft.died);
    const years = formatLifespan(born.ok ? born.value : null, !c.draft.living && died.ok ? died.value : null, !c.draft.living);
    const details = [c.draft.birthFamilyName.trim() && `born ${c.draft.birthFamilyName.trim()}`, years, c.draft.place.trim()]
      .filter(Boolean)
      .join(" · ");
    const partner = partners.find((p) => p.key === c.key);
    const child = children.find((p) => p.key === c.key);
    const sibling = siblings.find((p) => p.key === c.key);
    if (partner) {
      const base = partner.kind === "marriage" ? gendered(c.draft, "Wife", "Husband", "Spouse") : "Partner";
      const status = { current: "", divorce: "divorced", separation: "separated", death: "widowed" }[partner.status];
      const since = partner.since.trim() ? `${partner.kind === "marriage" ? "married" : "since"} ${partner.since.trim()}` : "";
      return { step: 1, relation: [base, since, status].filter(Boolean).join(" · "), details };
    }
    if (child) {
      const other = child.otherParent && child.otherParent !== "none" ? `with ${optionLabel(child.otherParent)}` : "other parent unknown";
      return { step: 2, relation: `${gendered(c.draft, "Daughter", "Son", "Child")} · ${other}`, details };
    }
    if (sibling) {
      const only = parentOptions.find((o) => o.id === sibling.shared);
      const base = gendered(c.draft, "Sister", "Brother", "Sibling");
      return { step: 3, relation: only ? `Half-${base.toLowerCase()} · only ${only.label}` : base, details };
    }
    return { step: 0, relation: c.key === "mother" ? "Mother" : "Father", details };
  }

  function skipToTree() {
    if (total > 0 && !window.confirm(`Leave without saving? The ${total} ${total === 1 ? "person" : "people"} you've entered won't be added.`)) return;
    router.push(`/s/${spaceId}?focus=${anchorId}`);
  }

  return (
    <div className="min-h-dvh">
      <AppHeader spaceId={spaceId} memberships={ctx.memberships} active="wizard" />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-6 pb-32">
        <div>
          <div className="flex justify-between text-[13px] text-ink-muted tabular-nums">
            <span>
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </span>
            {!isSelf && <span>Filling in for {displayName(anchor)}</span>}
          </div>
          <div className="mt-2 h-[3px] rounded bg-rule">
            <div className="h-[3px] rounded bg-accent transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        {step === 0 && (
          <>
            <h1 className="font-serif text-[26px] font-medium tracking-tight">{who} parents</h1>
            {existingBirthParents.length > 0 && (
              <p className="text-[14px] text-ink-muted">
                Already in the tree: {existingBirthParents.map((p) => displayName(p.person)).join(" and ")}.
              </p>
            )}
            {parents.map((c) => (
              <CardShell key={c.key} title={c.key === "mother" ? "Mother" : "Father"}>
                <div>
                  <Toggle pressed={Boolean(c.skip)} onChange={(skip) => update(parents, setParents, c.key, { skip })}>
                    Don't know
                  </Toggle>
                </div>
                {!c.skip && (
                  <PersonForm
                    value={c.draft}
                    onChange={(d) => update(parents, setParents, c.key, { draft: d })}
                    errors={cardErrors(c.key)}
                    showGender={false}
                  />
                )}
              </CardShell>
            ))}
            {twoParents && (
              <Field label={`${parentSlots[0].label} and ${parentSlots[1].label} are (or were)`}>
                <Segmented
                  label="Parents' relationship"
                  value={parentsRelation}
                  onChange={setParentsRelation}
                  options={[
                    { value: "married", label: "Married" },
                    { value: "partners", label: "Partners" },
                    { value: "divorced", label: "Divorced or separated" },
                    { value: "unknown", label: "Don't know" },
                  ]}
                />
              </Field>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="font-serif text-[26px] font-medium tracking-tight">{isSelf ? "Your partner" : `${firstName(anchor)}'s partner`}</h1>
            {rel.partners.length > 0 && (
              <p className="text-[14px] text-ink-muted">Already in the tree: {rel.partners.map((p) => displayName(p.person)).join(", ")}.</p>
            )}
            {partners.map((c) => (
              <CardShell
                key={c.key}
                title="Partner"
                onRemove={() => {
                  setPartners(partners.filter((p) => p.key !== c.key));
                  setChildren(children.map((ch) => (ch.otherParent === c.key ? { ...ch, otherParent: "none" } : ch)));
                }}
              >
                <Field label="Relationship">
                  <Segmented
                    label="Relationship"
                    value={c.kind}
                    onChange={(kind) => update(partners, setPartners, c.key, { kind })}
                    options={[
                      { value: "marriage", label: "Married" },
                      { value: "partnership", label: "Partners" },
                    ]}
                  />
                </Field>
                <Field label="Status">
                  <Segmented
                    label="Status"
                    value={c.status}
                    onChange={(status) =>
                      // Widowed means this partner has passed away.
                      update(partners, setPartners, c.key, {
                        status,
                        draft: { ...c.draft, living: status !== "death", phone: status === "death" ? "" : c.draft.phone },
                      })
                    }
                    options={[
                      { value: "current", label: "Together" },
                      { value: "divorce", label: "Divorced" },
                      { value: "separation", label: "Separated" },
                      { value: "death", label: "Widowed" },
                    ]}
                  />
                </Field>
                <Field
                  label={c.kind === "marriage" ? "Married in (optional)" : "Together since (optional)"}
                  htmlFor={`${c.key}-since`}
                  error={sinceErrors[c.key]}
                >
                  <Input
                    id={`${c.key}-since`}
                    value={c.since}
                    placeholder="e.g. 2015 or about 1990"
                    onChange={(e) => update(partners, setPartners, c.key, { since: e.target.value })}
                  />
                </Field>
                <PersonForm value={c.draft} onChange={(d) => update(partners, setPartners, c.key, { draft: d })} errors={cardErrors(c.key)} />
              </CardShell>
            ))}
            <Button
              className="self-start"
              onClick={() =>
                setPartners([
                  ...partners,
                  {
                    key: nextKey("partner"),
                    draft: emptyDraft({ gender: anchor.gender === "male" ? "female" : anchor.gender === "female" ? "male" : "unknown" }),
                    kind: "marriage",
                    status: "current",
                    since: "",
                  },
                ])
              }
            >
              <Plus size={15} /> Add a partner
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="font-serif text-[26px] font-medium tracking-tight">{who} children</h1>
            {rel.children.length > 0 && (
              <p className="text-[14px] text-ink-muted">Already in the tree: {rel.children.map((p) => displayName(p.person)).join(", ")}.</p>
            )}
            {children.map((c) => (
              <CardShell key={c.key} title="Child" onRemove={() => setChildren(children.filter((p) => p.key !== c.key))}>
                <Field label="Other parent">
                  <Segmented
                    label="Other parent"
                    value={c.otherParent || null}
                    onChange={(otherParent) =>
                      update(children, setChildren, c.key, {
                        otherParent,
                        // Keep the family name in step with the other parent unless it was typed.
                        draft:
                          c.draft.familyName === childFamilyName(c.otherParent)
                            ? { ...c.draft, familyName: childFamilyName(otherParent) }
                            : c.draft,
                      })
                    }
                    options={partnerOptions}
                  />
                </Field>
                <PersonForm
                  value={c.draft}
                  onChange={(d) => update(children, setChildren, c.key, { draft: d })}
                  errors={cardErrors(c.key)}
                  phoneOptional
                />
              </CardShell>
            ))}
            <Button
              className="self-start"
              onClick={() =>
                setChildren([
                  ...children,
                  {
                    key: nextKey("child"),
                    draft: emptyDraft({ familyName: defaultOtherParent ? childFamilyName(defaultOtherParent) : (anchor.familyName ?? "") }),
                    otherParent: defaultOtherParent,
                  },
                ])
              }
            >
              <Plus size={15} /> Add a child
            </Button>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="font-serif text-[26px] font-medium tracking-tight">{who} brothers and sisters</h1>
            {rel.siblings.length > 0 && (
              <p className="text-[14px] text-ink-muted">Already in the tree: {rel.siblings.map((p) => displayName(p.person)).join(", ")}.</p>
            )}
            {siblings.map((c) => (
              <CardShell key={c.key} title="Sibling" onRemove={() => setSiblings(siblings.filter((p) => p.key !== c.key))}>
                {parentOptions.length >= 2 && (
                  <Field label="Same parents?">
                    <Segmented
                      label="Shared parents"
                      value={c.shared}
                      onChange={(shared) => update(siblings, setSiblings, c.key, { shared })}
                      options={[{ value: "all", label: "Both" }, ...parentOptions.map((p) => ({ value: p.id, label: `Only ${p.label}` }))]}
                    />
                  </Field>
                )}
                <PersonForm value={c.draft} onChange={(d) => update(siblings, setSiblings, c.key, { draft: d })} errors={cardErrors(c.key)} />
              </CardShell>
            ))}
            <Button
              className="self-start"
              onClick={() => setSiblings([...siblings, { key: nextKey("sibling"), draft: emptyDraft({ familyName: anchor.familyName ?? "" }), shared: "all" }])}
            >
              <Plus size={15} /> Add a sibling
            </Button>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="font-serif text-[26px] font-medium tracking-tight">Check and save</h1>
            {total === 0 ? (
              <p className="text-[14px] text-ink-muted">Nothing new to add. Go back to add someone, or open the tree.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-surface">
                {allCards().map((c) => {
                  const m = matches[c.key];
                  const d = describe(c);
                  return (
                    <li key={c.key} className="flex flex-col gap-2 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-serif text-[15px] font-medium">
                            {[c.draft.givenName, c.draft.familyName].filter(Boolean).join(" ")}
                          </p>
                          <p className="text-[13px] text-ink">{d.relation}</p>
                          {d.details && <p className="text-[12.5px] text-ink-muted tabular-nums">{d.details}</p>}
                        </div>
                        <button type="button" className="text-[13px] font-medium text-accent" onClick={() => setStep(d.step)}>
                          Edit
                        </button>
                      </div>
                      {m && (
                        <div className="flex flex-col gap-2 rounded-md bg-ground px-3 py-2 text-[13px]">
                          <span>
                            Already in the family? <b className="font-medium">{displayName(m.person)}</b>
                            {subtitle(m.person) ? ` · ${subtitle(m.person)}` : ""}
                          </span>
                          <Segmented
                            label="Same person?"
                            value={useExisting[c.key] ? "same" : "new"}
                            onChange={(v) => setUseExisting({ ...useExisting, [c.key]: v === "same" })}
                            options={[
                              { value: "same", label: "Same person" },
                              { value: "new", label: "Different person" },
                            ]}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <ErrorNote message={error} />
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-rule bg-surface">
        <div className="mx-auto flex w-full max-w-xl items-center gap-2 px-4 py-3">
          {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
          <button type="button" className="px-2 text-[14px] text-ink-muted" onClick={skipToTree}>
            Skip to the tree
          </button>
          <span className="flex-1" />
          {step < 4 ? (
            <Button variant="primary" onClick={goNext} disabled={checking}>
              {checking ? "Checking…" : "Next"}
            </Button>
          ) : (
            <Button variant="primary" onClick={save} disabled={busy || total === 0}>
              {busy ? "Saving…" : `Save ${total} ${total === 1 ? "person" : "people"}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WizardPage() {
  return (
    <Suspense>
      <Wizard />
    </Suspense>
  );
}
