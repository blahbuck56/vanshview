"use client";

import { ChevronRight, Pencil, Plus, Trash2, Waypoints } from "lucide-react";
import type { RelativeKind } from "@/components/add-relative-sheet";
import { Button } from "@/components/ui";
import { displayName, subtitle, type Person, type Relatives } from "@/lib/data/family";
import { formatFuzzyDate } from "@/lib/domain/dates";
import { formatPhone } from "@/lib/domain/phone";

const by = (g: Person["gender"], female: string, male: string, other: string) =>
  g === "female" ? female : g === "male" ? male : other;

// "Mother", "Adoptive mother", "Step-mother", "Foster mother", "Guardian".
function withKind(base: string, kind: string) {
  const lower = base.toLowerCase();
  if (kind === "adoptive") return `Adoptive ${lower}`;
  if (kind === "step") return `Step-${lower}`;
  if (kind === "foster") return `Foster ${lower}`;
  return base;
}

function parentLabel(p: Person, kind: string) {
  if (p.isPlaceholder) return "Not known yet";
  if (kind === "guardian") return "Guardian";
  return withKind(by(p.gender, "Mother", "Father", "Parent"), kind);
}

function childLabel(p: Person, kind: string) {
  if (kind === "guardian") return "In their care";
  const base = by(p.gender, "Daughter", "Son", "Child");
  return kind === "adoptive" ? `Adopted ${base.toLowerCase()}` : withKind(base, kind);
}

function siblingLabel(p: Person, kind: "full" | "half" | "step") {
  const base = by(p.gender, "sister", "brother", "sibling");
  return kind === "full" ? base[0].toUpperCase() + base.slice(1) : `${kind === "half" ? "Half" : "Step"}-${base}`;
}

function partnerLabel(p: Person, u: Relatives["partners"][number]["union"]) {
  const base = u.kind === "marriage" ? by(p.gender, "Wife", "Husband", "Spouse") : "Partner";
  const since = u.start ? `${u.kind === "marriage" ? "married" : "since"} ${formatFuzzyDate(u.start, "year")}` : "";
  const ended = u.endReason === "divorce" ? "divorced" : u.endReason === "separation" ? "separated" : u.endReason === "death" ? "widowed" : "";
  return [base, since, ended].filter(Boolean).join(" · ");
}

function Row({ person, label, onClick }: { person: Person; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-ground">
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-serif text-[15px] font-medium ${person.isDeceased || person.isPlaceholder ? "text-ink-muted" : ""}`}>
          {displayName(person)}
        </span>
        <span className="block truncate text-[12.5px] text-ink-muted tabular-nums">
          {[label, subtitle(person)].filter(Boolean).join(" · ")}
        </span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-ink-muted/60" />
    </button>
  );
}

function Section({ title, children, empty }: { title: string; children: React.ReactNode[]; empty?: string }) {
  if (children.length === 0 && !empty) return null;
  return (
    <section>
      <h3 className="px-2 pb-1 text-[12.5px] font-semibold text-ink-muted">{title}</h3>
      {children.length ? children : <p className="px-2 py-1 text-[13px] text-ink-muted">{empty}</p>}
    </section>
  );
}

export function PersonDetails({
  person,
  relatives,
  canEdit,
  canAdd,
  isMe,
  isClaimed,
  canClaim,
  isFocus,
  onOpen,
  onFocus,
  onAdd,
  onEdit,
  onRemove,
  onClaim,
}: {
  person: Person;
  relatives: Relatives | null;
  /** May change this person's own details (not someone else's claimed profile). */
  canEdit: boolean;
  /** May add relatives around this person (any editor, claimed or not). */
  canAdd: boolean;
  isMe: boolean;
  isClaimed: boolean;
  canClaim: boolean;
  isFocus: boolean;
  onOpen: (id: string) => void;
  onFocus: (id: string) => void;
  onAdd: (kind: RelativeKind) => void;
  onEdit: () => void;
  onRemove: () => void;
  onClaim: () => void;
}) {
  const r = relatives;
  return (
    <div className="flex flex-col gap-6">
      <div>
        {isMe && <p className="text-[13px] font-medium text-accent">You</p>}
        <h2 className={`font-serif text-[26px] leading-tight font-medium tracking-tight ${person.isPlaceholder ? "text-ink-muted italic" : ""}`}>
          {displayName(person)}
        </h2>
        {!person.isPlaceholder && (
          <p className="mt-1 text-[14px] text-ink-muted tabular-nums">{subtitle(person) || "No dates or place yet"}</p>
        )}
        {person.isPlaceholder && (
          <p className="mt-1 text-[14px] text-ink-muted">
            Added so siblings could be linked. Fill in their details when you know them.
          </p>
        )}
        {person.phone && <p className="mt-2 text-[14px] tabular-nums">{formatPhone(person.phone)}</p>}
        {person.phoneStatus === "requested" && (
          <p className="mt-2 inline-block rounded bg-ground px-2 py-0.5 text-[12px] text-ink-muted">Phone number missing</p>
        )}
        {person.isMinor && <p className="mt-2 text-[12.5px] text-ink-muted">Under 18</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {!isFocus && (
          <Button onClick={() => onFocus(person.id)}>
            <Waypoints size={16} /> Centre the tree here
          </Button>
        )}
        {canEdit && (
          <Button onClick={onEdit}>
            <Pencil size={15} /> {person.isPlaceholder ? "Fill in" : "Edit"}
          </Button>
        )}
        {canClaim && (
          <Button variant="primary" onClick={onClaim}>
            This is me
          </Button>
        )}
      </div>

      {canAdd && !person.isPlaceholder && (
        <div>
          <p className="pb-2 text-[12.5px] font-semibold text-ink-muted">Add a relative</p>
          <div className="grid grid-cols-2 gap-2">
            {(["parent", "partner", "child", "sibling"] as const).map((k) => (
              <Button key={k} onClick={() => onAdd(k)} className="justify-start">
                <Plus size={15} /> {k[0].toUpperCase() + k.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {r ? (
        <div className="flex flex-col gap-4">
          <Section title="Parents" empty={canAdd ? "None added yet" : undefined}>
            {r.parents.map((x) => (
              <Row key={x.person.id} person={x.person} label={parentLabel(x.person, x.kind)} onClick={() => onOpen(x.person.id)} />
            ))}
          </Section>
          <Section title={r.partners.length > 1 ? "Partners" : "Partner"}>
            {r.partners.map((x) => (
              <Row key={x.union.id} person={x.person} label={partnerLabel(x.person, x.union)} onClick={() => onOpen(x.person.id)} />
            ))}
          </Section>
          <Section title="Children">
            {r.children.map((x) => (
              <Row
                key={x.person.id}
                person={x.person}
                label={childLabel(x.person, x.kind)}
                onClick={() => onOpen(x.person.id)}
              />
            ))}
          </Section>
          <Section title="Siblings">
            {r.siblings.map((x) => (
              <Row
                key={x.person.id}
                person={x.person}
                label={siblingLabel(x.person, x.kind)}
                onClick={() => onOpen(x.person.id)}
              />
            ))}
          </Section>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Loading relatives…</p>
      )}

      {canEdit && !isClaimed && (
        <button type="button" onClick={onRemove} className="flex items-center gap-1.5 self-start text-[13px] text-danger">
          <Trash2 size={14} /> Remove from the tree
        </button>
      )}
    </div>
  );
}
