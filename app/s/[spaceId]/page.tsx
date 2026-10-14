"use client";

import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AddRelativeSheet, type RelativeKind } from "@/components/add-relative-sheet";
import { AppHeader } from "@/components/app-header";
import { EditPersonSheet } from "@/components/edit-person-sheet";
import { PersonDetails } from "@/components/person-details";
import { ErrorNote, Segmented, Spinner } from "@/components/ui";
import {
  displayName,
  errorMessage,
  loadNeighborhood,
  loadPeople,
  loadRelatives,
  type Neighborhood,
  type Person,
  type Relatives,
} from "@/lib/data/family";
import { createClient } from "@/lib/supabase/client";
import { useSpace } from "@/lib/use-space";
import { cn } from "@/lib/utils";

// The layout engine is large; load it only when the tree is shown (phones start on the person view).
const TreeView = dynamic(() => import("@/components/tree-view").then((m) => m.TreeView), {
  ssr: false,
  loading: () => (
    <div className="p-6">
      <Spinner label="Drawing the tree" />
    </div>
  ),
});

function FamilyTree() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const params = useSearchParams();
  const { ctx, error: ctxError, reload: reloadCtx } = useSpace(spaceId);

  const [focusId, setFocusId] = useState<string | null>(params.get("focus"));
  const [selectedId, setSelectedId] = useState<string | null>(params.get("focus"));
  const [up, setUp] = useState(3);
  const [down, setDown] = useState(3);
  const [tree, setTree] = useState<Neighborhood | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [relatives, setRelatives] = useState<Relatives | null>(null);
  const [adding, setAdding] = useState<RelativeKind | null>(null);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"person" | "tree">("person");
  const [empty, setEmpty] = useState(false);

  // Default focus: the person you claimed, else the first person added.
  useEffect(() => {
    if (!ctx || focusId) return;
    if (ctx.membership?.personId) {
      setFocusId(ctx.membership.personId);
      setSelectedId(ctx.membership.personId);
      return;
    }
    createClient()
      .from("persons")
      .select("id")
      .eq("space_id", spaceId)
      .is("deleted_at", null)
      .eq("is_placeholder", false)
      .order("created_at")
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]) {
          setFocusId(data[0].id);
          setSelectedId(data[0].id);
        } else setEmpty(true);
      });
  }, [ctx, focusId, spaceId]);

  const loadTree = useCallback(async () => {
    if (!focusId) return;
    try {
      setTree(await loadNeighborhood(createClient(), focusId, up, down));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [focusId, up, down]);

  const loadSelected = useCallback(async () => {
    if (!selectedId) return;
    const db = createClient();
    try {
      const [people, rel] = await Promise.all([loadPeople(db, [selectedId]), loadRelatives(db, selectedId)]);
      setPerson(people.get(selectedId) ?? null);
      setRelatives(rel);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [selectedId]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);
  useEffect(() => {
    setRelatives(null);
    loadSelected();
  }, [loadSelected]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const focus = (id: string) => {
    setFocusId(id);
    setSelectedId(id);
    setMobileView("person");
    window.history.replaceState(null, "", `?focus=${id}`);
  };
  const open = (id: string) => {
    if (window.matchMedia("(min-width: 768px)").matches && tree?.persons.some((p) => p.id === id)) setSelectedId(id);
    else focus(id);
  };
  const refreshAll = async () => {
    await Promise.all([loadTree(), loadSelected()]);
  };

  async function remove() {
    if (!person) return;
    if (!window.confirm(`Remove ${displayName(person)} from the tree? Their links to relatives are hidden too.`)) return;
    const { error } = await createClient().rpc("remove_person", { p_person_id: person.id });
    if (error) return setError(errorMessage(error));
    setToast(`Removed ${displayName(person)}`);
    if (person.id === focusId) focus(ctx?.membership?.personId ?? relatives?.parents[0]?.person.id ?? focusId!);
    else {
      setSelectedId(focusId);
      loadTree();
    }
  }

  async function claim() {
    if (!person) return;
    const { error } = await createClient().rpc("claim_self", { p_person_id: person.id });
    if (error) return setError(errorMessage(error));
    setToast("Linked to your account");
    reloadCtx();
  }

  if (ctxError) return <p className="p-6 text-danger">{ctxError}</p>;
  if (!ctx) return <div className="p-6"><Spinner /></div>;
  if (!ctx.membership) {
    return <p className="p-6 text-ink-muted">You're not a member of this family. Ask someone in it for an invite link.</p>;
  }

  const role = ctx.membership.role;
  const claimedBy = person ? ctx.claims.get(person.id) : undefined;
  const canEditPerson =
    role !== "viewer" && (!claimedBy || claimedBy === ctx.userId || role === "admin" || role === "owner");

  const details = person ? (
    <PersonDetails
      person={person}
      relatives={relatives}
      canEdit={canEditPerson}
      isMe={ctx.membership.personId === person.id}
      isClaimed={Boolean(claimedBy)}
      canClaim={!ctx.membership.personId && !claimedBy && !person.isPlaceholder && !person.isDeceased}
      isFocus={person.id === focusId}
      onOpen={open}
      onFocus={focus}
      onAdd={setAdding}
      onEdit={() => setEditing(true)}
      onRemove={remove}
      onClaim={claim}
    />
  ) : (
    <Spinner />
  );

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader spaceId={spaceId} memberships={ctx.memberships} active="tree" onPickPerson={focus} />

      <div className="flex items-center gap-2 border-b border-rule bg-surface px-4 py-2 md:hidden">
        <Segmented
          label="View"
          value={mobileView}
          onChange={setMobileView}
          options={[
            { value: "person", label: "Person" },
            { value: "tree", label: "Tree" },
          ]}
        />
      </div>

      {empty ? (
        <p className="p-6 text-ink-muted">No one is in this family yet.</p>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className={cn("relative min-w-0 flex-1", mobileView === "person" && "hidden md:block")}>
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-md border border-rule bg-surface px-3 py-1.5 text-[13px]">
              <label className="flex items-center gap-1.5 text-ink-muted">
                Up
                <select value={up} onChange={(e) => setUp(Number(e.target.value))} className="bg-transparent text-ink">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <span className="h-4 w-px bg-rule" />
              <label className="flex items-center gap-1.5 text-ink-muted">
                Down
                <select value={down} onChange={(e) => setDown(Number(e.target.value))} className="bg-transparent text-ink">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <span className="hidden text-ink-muted lg:inline">· Double-click someone to centre on them</span>
            </div>
            {tree && focusId ? (
              <TreeView
                data={tree}
                focusId={focusId}
                meId={ctx.membership.personId}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  if (!window.matchMedia("(min-width: 768px)").matches) setMobileView("person");
                }}
                onFocus={focus}
              />
            ) : (
              <div className="p-6">
                <Spinner label="Drawing the tree" />
              </div>
            )}
          </div>

          <aside className="hidden w-[400px] shrink-0 overflow-y-auto border-l border-rule bg-surface p-6 md:block">
            {details}
          </aside>
          <div className={cn("flex-1 overflow-y-auto bg-surface p-4 md:hidden", mobileView === "tree" && "hidden")}>
            {details}
          </div>
        </div>
      )}

      {adding && person && relatives && (
        <AddRelativeSheet
          kind={adding}
          anchor={person}
          relatives={relatives}
          spaceId={spaceId}
          onClose={() => setAdding(null)}
          onDone={async (_id, name) => {
            setAdding(null);
            setToast(`Added ${name}`);
            await refreshAll();
          }}
        />
      )}
      {editing && person && (
        <EditPersonSheet
          person={person}
          isSelf={ctx.membership.personId === person.id}
          onClose={() => setEditing(false)}
          onDone={async () => {
            setEditing(false);
            setToast("Saved");
            await refreshAll();
          }}
        />
      )}

      {(toast || error) && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2">
          {error ? (
            <div className="flex items-start gap-3 rounded-md bg-surface shadow-lg">
              <div className="flex-1">
                <ErrorNote message={error} />
              </div>
              <button type="button" className="px-3 py-2 text-[13px] text-ink-muted" onClick={() => setError(null)}>
                Dismiss
              </button>
            </div>
          ) : (
            <p role="status" className="rounded-md bg-ink px-4 py-3 text-[14px] text-surface shadow-lg">
              {toast}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function FamilyPage() {
  return (
    <Suspense>
      <FamilyTree />
    </Suspense>
  );
}
