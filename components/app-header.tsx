"use client";

import { LogOut, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { displayName, searchPeople, subtitle, type Membership, type Person } from "@/lib/data/family";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function AppHeader({
  spaceId,
  memberships,
  active,
  onPickPerson,
}: {
  spaceId: string;
  memberships: Membership[];
  active: "tree" | "wizard" | "members";
  onPickPerson?: (id: string) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const current = memberships.find((m) => m.spaceId === spaceId);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => searchPeople(createClient(), spaceId, q).then(setResults), 200);
    return () => clearTimeout(timer);
  }, [q, spaceId]);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const canEdit = current && current.role !== "viewer";
  const tab = (key: typeof active, href: string, label: string) => (
    <Link
      href={href}
      className={cn(
        "px-2.5 py-4 text-[14px] whitespace-nowrap",
        active === key ? "border-b-2 border-ink font-medium text-ink" : "text-ink-muted hover:text-ink",
      )}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:h-14 md:flex-nowrap md:px-5">
        <div className="flex h-14 min-w-0 items-center gap-3 md:h-auto">
          <Link href="/" className="font-serif text-[18px] font-semibold tracking-tight">
            Vanshview
          </Link>
          <span className="h-5 w-px bg-rule" />
          {memberships.length > 1 ? (
            <select
              aria-label="Family"
              value={spaceId}
              onChange={(e) => router.push(`/s/${e.target.value}`)}
              className="max-w-[180px] truncate bg-transparent text-[14px] font-medium"
            >
              {memberships.map((m) => (
                <option key={m.spaceId} value={m.spaceId}>
                  {m.spaceName}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate text-[14px] font-medium">{current?.spaceName}</span>
          )}
        </div>

        {onPickPerson && (
          <div className="relative order-last w-full pb-2 md:order-none md:w-auto md:max-w-sm md:flex-1 md:pb-0">
            <label className="flex h-9 items-center gap-2 rounded-md border border-rule bg-ground px-2.5 text-ink-muted">
              <Search size={16} />
              <span className="sr-only">Find someone</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find anyone in the family"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-muted"
              />
            </label>
            {results.length > 0 && (
              <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-rule bg-surface shadow-[0_6px_20px_rgba(22,24,27,0.1)]">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onPickPerson(p.id);
                      setQ("");
                    }}
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left hover:bg-ground"
                  >
                    <span className="font-serif text-[15px] font-medium">{displayName(p)}</span>
                    <span className="truncate text-[12px] text-ink-muted">{subtitle(p)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <nav aria-label="Main" className="ml-auto flex items-center">
          {tab("tree", `/s/${spaceId}`, "Tree")}
          {canEdit && tab("wizard", `/s/${spaceId}/wizard`, "Add family")}
          {tab("members", `/s/${spaceId}/members`, "Members")}
          <button type="button" aria-label="Sign out" onClick={signOut} className="ml-1 rounded-md p-2 text-ink-muted hover:bg-ground">
            <LogOut size={17} />
          </button>
        </nav>
      </div>
    </header>
  );
}
