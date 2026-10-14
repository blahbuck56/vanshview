"use client";

import { useState } from "react";
import { NameSearch } from "@/components/name-search";
import { PersonForm } from "@/components/person-form";
import { Button, ErrorNote, Field, Input, Segmented, Sheet } from "@/components/ui";
import { displayName, errorMessage, firstName, subtitle, type Person, type Relatives } from "@/lib/data/family";
import { parseFuzzyDate } from "@/lib/domain/dates";
import { t } from "@/lib/i18n/en";
import { draftToPayload, emptyDraft, type DraftErrors, type PersonDraft } from "@/lib/person-draft";
import { createClient } from "@/lib/supabase/client";

export type RelativeKind = "parent" | "partner" | "child" | "sibling";

type Pick = { existing: Person } | { draft: PersonDraft } | null;
type ParentKind = "biological" | "adoptive" | "step" | "guardian";

const BIRTH_KINDS = new Set(["biological", "adoptive", "unknown"]);

export function AddRelativeSheet({
  kind,
  anchor,
  relatives,
  spaceId,
  onClose,
  onDone,
}: {
  kind: RelativeKind;
  anchor: Person;
  relatives: Relatives;
  spaceId: string;
  onClose: () => void;
  onDone: (personId: string, name: string) => void;
}) {
  const [pick, setPick] = useState<Pick>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Parent
  const [parentRole, setParentRole] = useState<"mother" | "father" | null>(null);
  const [parentKind, setParentKind] = useState<ParentKind>("biological");
  const birthParents = relatives.parents.filter((p) => BIRTH_KINDS.has(p.kind));
  const otherParent = birthParents.length === 1 ? birthParents[0].person : null;
  const [couple, setCouple] = useState<"married" | "partners" | "no" | "unknown">("married");

  // Child
  const [otherParentId, setOtherParentId] = useState<string | null>(
    relatives.partners.length === 1 ? relatives.partners[0].person.id : relatives.partners.length === 0 ? "none" : null,
  );
  const [childKind, setChildKind] = useState<ParentKind>("biological");

  // Partner
  const [unionKind, setUnionKind] = useState<"marriage" | "partnership">("marriage");
  const [status, setStatus] = useState<"current" | "divorce" | "separation" | "death">("current");
  const [since, setSince] = useState("");

  // Sibling
  const [shared, setShared] = useState<string>("all");

  const name = firstName(anchor);
  const label =
    kind === "parent" ? (parentRole ?? "parent") : kind === "partner" ? "partner" : kind === "child" ? "child" : "sibling";
  const existingIds = [
    anchor.id,
    ...relatives.parents.map((r) => r.person.id),
    ...relatives.partners.map((r) => r.person.id),
    ...relatives.children.map((r) => r.person.id),
    ...relatives.siblings.map((r) => r.person.id),
  ];

  async function save() {
    setError(null);
    let p_new: unknown = null;
    let p_existing: string | null = null;
    if (!pick) return;
    if ("existing" in pick) p_existing = pick.existing.id;
    else {
      const draft = kind === "parent" && parentRole ? { ...pick.draft, gender: parentRole === "mother" ? "female" : "male" } as const : pick.draft;
      const parsed = draftToPayload(draft, { allowAskLater: true });
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return;
      }
      setErrors({});
      p_new = parsed.value;
    }

    const db = createClient();
    setBusy(true);
    let result: { data: unknown; error: unknown };
    if (kind === "parent") {
      result = await db.rpc("add_parent", {
        p_child_id: anchor.id,
        p_new: p_new as never,
        p_existing: p_existing ?? undefined,
        p_kind: parentKind,
        p_link_partner: couple !== "no",
        p_union_kind: couple === "married" ? "marriage" : couple === "partners" ? "partnership" : "unknown",
      });
    } else if (kind === "child") {
      if (otherParentId === null) {
        setBusy(false);
        setError("Choose who the other parent is.");
        return;
      }
      result = await db.rpc("add_child", {
        p_parent_id: anchor.id,
        p_new: p_new as never,
        p_existing: p_existing ?? undefined,
        p_other_parent_id: otherParentId === "none" ? undefined : otherParentId,
        p_kind: childKind,
      });
    } else if (kind === "partner") {
      const start = parseFuzzyDate(since);
      if (!start.ok) {
        setBusy(false);
        setError(t(start.error));
        return;
      }
      result = await db.rpc("add_partner", {
        p_person_id: anchor.id,
        p_new: p_new as never,
        p_existing: p_existing ?? undefined,
        p_kind: unionKind,
        p_start: (start.value.date ? start.value : undefined) as never,
        p_end_reason: status === "current" ? undefined : status,
      });
    } else {
      result = await db.rpc("add_sibling", {
        p_person_id: anchor.id,
        p_new: p_new as never,
        p_existing: p_existing ?? undefined,
        p_parent_ids: shared === "all" ? undefined : [shared],
      });
    }
    setBusy(false);
    if (result.error) setError(errorMessage(result.error));
    else {
      const newName = pick && "existing" in pick ? displayName(pick.existing) : pick && "draft" in pick ? pick.draft.givenName : "";
      onDone(result.data as string, newName);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      eyebrow={`${displayName(anchor)}${anchor.birth ? ` · ${subtitle(anchor).split(" · ")[0]}` : ""}`}
      title={`Add ${name}'s ${label}`}
      footer={
        <>
          <span className="flex-1 text-[12px] text-ink-muted">Everything is saved together, or not at all.</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!pick || busy}>
            {busy ? "Saving…" : "Add"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {kind === "parent" && (
          <Field label="Who are you adding?">
            <Segmented
              label="Parent"
              value={parentRole}
              onChange={setParentRole}
              options={[
                { value: "mother", label: "Mother" },
                { value: "father", label: "Father" },
              ]}
            />
          </Field>
        )}

        {!pick && <NameSearch spaceId={spaceId} excludeIds={existingIds} onPickExisting={(p) => setPick({ existing: p })} onPickNew={(n) => {
          const words = n.split(/\s+/);
          setPick({
            draft: emptyDraft({
              givenName: words.length > 1 ? words.slice(0, -1).join(" ") : n,
              familyName: words.length > 1 ? words.at(-1)! : (kind === "child" || kind === "sibling" ? (anchor.familyName ?? "") : ""),
            }),
          });
        }} />}

        {pick && "existing" in pick && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-rule bg-ground px-3 py-3">
            <div>
              <p className="font-serif text-[15px] font-medium">{displayName(pick.existing)}</p>
              <p className="text-[12.5px] text-ink-muted">{subtitle(pick.existing) || "Already in the family"}</p>
            </div>
            <button type="button" className="text-[13px] font-medium text-accent" onClick={() => setPick(null)}>
              Change
            </button>
          </div>
        )}

        {pick && "draft" in pick && (
          <div className="flex flex-col gap-3">
            <PersonForm value={pick.draft} onChange={(d) => setPick({ draft: d })} errors={errors} />
            <button type="button" className="self-start text-[13px] font-medium text-accent" onClick={() => setPick(null)}>
              Search again instead
            </button>
          </div>
        )}

        {pick && kind === "parent" && (
          <>
            <Field label="Relationship">
              <Segmented
                label="Relationship"
                value={parentKind}
                onChange={setParentKind}
                options={[
                  { value: "biological", label: "Birth parent" },
                  { value: "adoptive", label: "Adoptive" },
                  { value: "step", label: "Step-parent" },
                  { value: "guardian", label: "Guardian" },
                ]}
              />
            </Field>
            {otherParent && BIRTH_KINDS.has(parentKind) && (
              <Field label={`Were they a couple with ${firstName(otherParent)}?`}>
                <Segmented
                  label="Couple"
                  value={couple}
                  onChange={setCouple}
                  options={[
                    { value: "married", label: "Married" },
                    { value: "partners", label: "Partners" },
                    { value: "unknown", label: "Don't know" },
                    { value: "no", label: "No" },
                  ]}
                />
              </Field>
            )}
          </>
        )}

        {pick && kind === "child" && (
          <>
            {relatives.partners.length > 0 && (
              <Field label="Who's the other parent?">
                <Segmented
                  label="Other parent"
                  value={otherParentId}
                  onChange={setOtherParentId}
                  options={[
                    ...relatives.partners.map((r) => ({ value: r.person.id, label: displayName(r.person) })),
                    { value: "none", label: "Someone else / unknown" },
                  ]}
                />
              </Field>
            )}
            <Field label="Relationship">
              <Segmented
                label="Relationship"
                value={childKind}
                onChange={setChildKind}
                options={[
                  { value: "biological", label: "Birth child" },
                  { value: "adoptive", label: "Adopted" },
                  { value: "step", label: "Step-child" },
                ]}
              />
            </Field>
          </>
        )}

        {pick && kind === "partner" && (
          <>
            <Field label="Relationship">
              <Segmented
                label="Relationship"
                value={unionKind}
                onChange={setUnionKind}
                options={[
                  { value: "marriage", label: "Married" },
                  { value: "partnership", label: "Partners" },
                ]}
              />
            </Field>
            <Field label="Status">
              <Segmented
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "current", label: "Together" },
                  { value: "divorce", label: "Divorced" },
                  { value: "separation", label: "Separated" },
                  { value: "death", label: "Widowed" },
                ]}
              />
            </Field>
            <Field label={unionKind === "marriage" ? "Married in (optional)" : "Together since (optional)"} htmlFor="since">
              <Input id="since" value={since} onChange={(e) => setSince(e.target.value)} placeholder="e.g. 2015 or about 1990" />
            </Field>
          </>
        )}

        {pick && kind === "sibling" &&
          (birthParents.length >= 2 ? (
            <Field label="Same parents?">
              <Segmented
                label="Shared parents"
                value={shared}
                onChange={setShared}
                options={[
                  { value: "all", label: "Same mother and father" },
                  ...birthParents.map((p) => ({ value: p.person.id, label: `Only ${firstName(p.person)}` })),
                ]}
              />
            </Field>
          ) : birthParents.length === 0 ? (
            <p className="text-[13px] text-ink-muted">
              {name}'s parents aren't in the tree yet, so we'll add them as “Unknown father” and “Unknown mother” to
              connect the siblings. You can fill them in later.
            </p>
          ) : null)}

        <ErrorNote message={error} />
      </div>
    </Sheet>
  );
}
