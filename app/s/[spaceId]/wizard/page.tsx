"use client";

import { Plus, Trash2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { PersonForm } from "@/components/person-form";
import { Button, ErrorNote, Field, Segmented, Spinner, Toggle } from "@/components/ui";
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
import { draftToPayload, emptyDraft, type DraftErrors, type PersonDraft } from "@/lib/person-draft";
import type { SubmissionPayloadInput } from "@/lib/schemas/submission";
import { createClient } from "@/lib/supabase/client";
import { useSpace } from "@/lib/use-space";

type Card = { key: string; draft: PersonDraft; skip?: boolean };
type PartnerCard = Card & { kind: "marriage" | "partnership"; status: "current" | "divorce" | "separation" | "death" };
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
  const { ctx } = useSpace(spaceId);

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

  const anchorId = about ?? ctx?.membership?.personId ?? null;

  useEffect(() => {
    if (!anchorId) return;
    const db = createClient();
    Promise.all([loadPeople(db, [anchorId]), loadRelatives(db, anchorId)]).then(([people, r]) => {
      const a = people.get(anchorId) ?? null;
      setAnchor(a);
      setRel(r);
      const birth = r.parents.filter((p) => ["biological", "adoptive", "unknown"].includes(p.kind));
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

  if (!ctx || !anchorId || !anchor || !rel) {
    return (
      <div className="p-6">
        {ctx && !anchorId ? <p className="text-ink-muted">Link yourself to a person in the tree first (“This is me”).</p> : <Spinner />}
      </div>
    );
  }

  const isSelf = anchorId === ctx.membership?.personId;
  const who = isSelf ? "Your" : `${firstName(anchor)}'s`;
  const existingBirthParents = rel.parents.filter((p) => ["biological", "adoptive", "unknown"].includes(p.kind));
  const activeParents = parents.filter((p) => !p.skip);
  const parentOptions = [
    ...existingBirthParents.map((p) => ({ id: `ex:${p.person.id}`, label: displayName(p.person) })),
    ...activeParents.map((p) => ({ id: p.key, label: p.draft.givenName || (p.key === "mother" ? "Mother" : "Father") })),
  ];
  const partnerOptions = [
    ...rel.partners.map((p) => ({ value: `ex:${p.person.id}`, label: displayName(p.person) })),
    ...partners.map((p) => ({ value: p.key, label: p.draft.givenName || "New partner" })),
    { value: "none", label: "Someone else / unknown" },
  ];

  const allCards = (): Card[] => [...activeParents, ...partners, ...children, ...siblings];

  function validate(cards: Card[]): boolean {
    const next: Record<string, DraftErrors> = {};
    for (const c of cards) {
      const r = draftToPayload(c.draft, { allowAskLater: true });
      if (!r.ok) next[c.key] = r.errors;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
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
    const r = draftToPayload(c.draft, { allowAskLater: true });
    return { temp_id: c.key, ...(r.ok ? r.value : {}) };
  }

  async function save() {
    setError(null);
    if (!validate(allCards())) {
      setError("Some details need fixing. Go back to the step with the red message.");
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

    // Parents of the anchor, and a union between the two parents.
    const parentKeys = [...existingBirthParents.map((p) => `ex:${p.person.id}`), ...activeParents.map((p) => p.key)];
    for (const p of activeParents) parentChild.push({ parent_temp_id: p.key, child_temp_id: "anchor", kind: "biological" });
    if (parentKeys.length === 2 && activeParents.length > 0) {
      unions.push({ member_temp_ids: [resolve(parentKeys[0]), resolve(parentKeys[1])], kind: "marriage" });
    }

    for (const p of partners) {
      unions.push({
        member_temp_ids: ["anchor", p.key],
        kind: p.kind,
        ...(p.status !== "current" ? { end_reason: p.status } : {}),
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
        const from = s.shared === "all" ? shared : [resolve(s.shared)];
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
    if (error) setError(errorMessage(error));
    else router.push(`/s/${spaceId}?focus=${anchorId}`);
  }

  const cardErrors = (k: string) => errors[k] ?? {};
  const update = <T extends Card>(list: T[], set: (l: T[]) => void, key: string, patch: Partial<T>) =>
    set(list.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const total = allCards().length;

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
                <Toggle pressed={Boolean(c.skip)} onChange={(skip) => update(parents, setParents, c.key, { skip })}>
                  Don't know
                </Toggle>
                {!c.skip && (
                  <PersonForm value={c.draft} onChange={(d) => update(parents, setParents, c.key, { draft: d })} errors={cardErrors(c.key)} />
                )}
              </CardShell>
            ))}
            {parents.length === 0 && existingBirthParents.length >= 2 && <p className="text-[14px]">Both parents are in. Next.</p>}
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="font-serif text-[26px] font-medium tracking-tight">{isSelf ? "Your partner" : `${firstName(anchor)}'s partner`}</h1>
            {rel.partners.length > 0 && (
              <p className="text-[14px] text-ink-muted">Already in the tree: {rel.partners.map((p) => displayName(p.person)).join(", ")}.</p>
            )}
            {partners.map((c) => (
              <CardShell key={c.key} title="Partner" onRemove={() => setPartners(partners.filter((p) => p.key !== c.key))}>
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
                    onChange={(status) => update(partners, setPartners, c.key, { status })}
                    options={[
                      { value: "current", label: "Together" },
                      { value: "divorce", label: "Divorced" },
                      { value: "death", label: "Widowed" },
                    ]}
                  />
                </Field>
                <PersonForm value={c.draft} onChange={(d) => update(partners, setPartners, c.key, { draft: d })} errors={cardErrors(c.key)} />
              </CardShell>
            ))}
            <Button
              className="self-start"
              onClick={() => setPartners([...partners, { key: nextKey("partner"), draft: emptyDraft(), kind: "marriage", status: "current" }])}
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
                    value={c.otherParent}
                    onChange={(otherParent) => update(children, setChildren, c.key, { otherParent })}
                    options={partnerOptions}
                  />
                </Field>
                <PersonForm value={c.draft} onChange={(d) => update(children, setChildren, c.key, { draft: d })} errors={cardErrors(c.key)} />
              </CardShell>
            ))}
            <Button
              className="self-start"
              onClick={() =>
                setChildren([
                  ...children,
                  {
                    key: nextKey("child"),
                    draft: emptyDraft({ familyName: anchor.familyName ?? "" }),
                    otherParent: partnerOptions.length === 2 ? partnerOptions[0].value : "none",
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
                  return (
                    <li key={c.key} className="flex flex-col gap-2 px-4 py-3">
                      <span className="font-serif text-[15px] font-medium">
                        {[c.draft.givenName, c.draft.familyName].filter(Boolean).join(" ")}
                      </span>
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
          <button type="button" className="px-2 text-[14px] text-ink-muted" onClick={() => router.push(`/s/${spaceId}?focus=${anchorId}`)}>
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
