"use client";

import { Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui";
import { displayName, findCandidates, subtitle, type Candidate, type Person } from "@/lib/data/family";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const REASON_LABEL: Record<string, string> = {
  same_phone: "Same phone number",
  similar_name: "Similar name",
  same_place: "Same place",
  birth_year_close: "Similar birth year",
  shared_relatives: "Shares relatives",
};

/**
 * One name field that checks the family as you type. Existing matches come first, "add as
 * someone new" last, so linking an existing person is always the first option offered.
 */
export function NameSearch({
  spaceId,
  excludeIds,
  onPickExisting,
  onPickNew,
}: {
  spaceId: string;
  excludeIds: string[];
  onPickExisting: (p: Person) => void;
  onPickNew: (name: string) => void;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const excludeKey = excludeIds.join(",");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await findCandidates(createClient(), spaceId, term);
        setResults(found.filter((c) => !excludeKey.split(",").includes(c.person.id)));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, spaceId, excludeKey]);

  const term = q.trim();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        Name
      </label>
      <Input
        id={id}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Start typing a name"
        autoFocus
        autoComplete="off"
      />
      <p className="text-[12.5px] text-ink-muted">We'll check if they're already in the family.</p>
      {term.length >= 2 && (
        <div role="listbox" aria-label="Matching people" className="mt-1 overflow-hidden rounded-md border border-rule shadow-[0_6px_20px_rgba(22,24,27,0.08)]">
          {results.length > 0 && <p className="px-3 pt-2.5 pb-1 text-[12px] font-medium text-ink-muted">Already in the family</p>}
          {results.map((c) => (
            <button
              key={c.person.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onPickExisting(c.person)}
              className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-ground"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-serif text-[15px] font-medium">{displayName(c.person)}</span>
                <span className="text-[12px] text-ink-muted tabular-nums">{subtitle(c.person)}</span>
              </span>
              {c.reasons.length > 0 && (
                <span className="text-[12px] text-ink-muted">{c.reasons.map((r) => REASON_LABEL[r] ?? r).join(" · ")}</span>
              )}
            </button>
          ))}
          <button
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => onPickNew(term)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-3 text-left text-[14px] font-medium text-accent hover:bg-ground",
              results.length > 0 && "border-t border-rule",
            )}
          >
            <Plus size={16} />
            {loading ? "Checking…" : `Add “${term}” as someone new`}
          </button>
        </div>
      )}
    </div>
  );
}
