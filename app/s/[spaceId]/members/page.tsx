"use client";

import { Copy, MessageCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button, ErrorNote, Field, Segmented, Spinner } from "@/components/ui";
import { displayName, errorMessage, loadPeople, type Person } from "@/lib/data/family";
import { createClient } from "@/lib/supabase/client";
import { useSpace } from "@/lib/use-space";
import type { Database } from "@/types/database";

type Role = Database["public"]["Enums"]["member_role"];
type Member = { userId: string; role: Role; person: Person | null };
type Invite = { id: string; token: string; role: Role; expires_at: string };

const ROLE_HELP: Record<Role, string> = {
  viewer: "Can look around, can't change anything",
  editor: "Can add and edit people",
  admin: "Editor, plus manages members and invites",
  owner: "Admin, plus can delete the family",
};

export default function MembersPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { ctx } = useSpace(spaceId);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newRole, setNewRole] = useState<Role>("editor");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = ctx?.membership?.role === "admin" || ctx?.membership?.role === "owner";

  const load = useCallback(async () => {
    const db = createClient();
    const { data, error } = await db.from("space_members").select("user_id, role, person_id").eq("space_id", spaceId).order("joined_at");
    if (error) return setError(errorMessage(error));
    const people = await loadPeople(db, (data ?? []).map((m) => m.person_id).filter((x): x is string => Boolean(x)));
    setMembers((data ?? []).map((m) => ({ userId: m.user_id, role: m.role, person: m.person_id ? (people.get(m.person_id) ?? null) : null })));
    const inv = await db
      .from("invites")
      .select("id, token, role, expires_at")
      .eq("space_id", spaceId)
      .eq("status", "pending")
      .is("person_id", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    setInvites(inv.data ?? []);
  }, [spaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const link = (token: string) => `${window.location.origin}/join/${token}`;

  async function createInvite() {
    setError(null);
    const { error } = await createClient().from("invites").insert({ space_id: spaceId, role: newRole });
    if (error) setError(errorMessage(error));
    else load();
  }

  async function revoke(id: string) {
    await createClient().from("invites").update({ status: "revoked" }).eq("id", id);
    load();
  }

  async function changeRole(userId: string, role: Role) {
    setError(null);
    const { error } = await createClient().from("space_members").update({ role }).eq("space_id", spaceId).eq("user_id", userId);
    if (error) setError(errorMessage(error));
    load();
  }

  async function copy(token: string) {
    await navigator.clipboard.writeText(link(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!ctx) return <div className="p-6"><Spinner /></div>;

  return (
    <div className="min-h-dvh">
      <AppHeader spaceId={spaceId} memberships={ctx.memberships} active="members" />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 py-8">
        <section>
          <h1 className="font-serif text-[26px] font-medium tracking-tight">Members</h1>
          <p className="mt-1 text-[14px] text-ink-muted">People who can open this family's tree.</p>
          <ErrorNote message={error} />
          {!members ? (
            <div className="mt-4"><Spinner /></div>
          ) : (
            <ul className="mt-4 divide-y divide-rule rounded-md border border-rule bg-surface">
              {members.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-[15px] font-medium">
                      {m.person ? displayName(m.person) : "Not linked to a person yet"}
                      {m.userId === ctx.userId && <span className="ml-2 font-sans text-[12px] text-accent">You</span>}
                    </p>
                    <p className="text-[12.5px] text-ink-muted">{ROLE_HELP[m.role]}</p>
                  </div>
                  {isAdmin && m.userId !== ctx.userId && m.role !== "owner" ? (
                    <select
                      aria-label="Role"
                      value={m.role}
                      onChange={(e) => changeRole(m.userId, e.target.value as Role)}
                      className="h-9 rounded-md border border-edge bg-surface px-2 text-[13px]"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    <span className="text-[13px] capitalize text-ink-muted">{m.role}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {isAdmin && (
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="font-serif text-xl font-medium">Invite family</h2>
              <p className="mt-1 text-[14px] text-ink-muted">
                Anyone with the link can join after signing in with their phone. Links last 14 days.
              </p>
            </div>
            <Field label="They join as">
              <Segmented
                label="Role"
                value={newRole}
                onChange={setNewRole}
                options={[
                  { value: "viewer", label: "Viewer" },
                  { value: "editor", label: "Editor" },
                  { value: "admin", label: "Admin" },
                ]}
              />
            </Field>
            <p className="text-[13px] text-ink-muted">{ROLE_HELP[newRole]}.</p>
            <Button variant="primary" onClick={createInvite} className="self-start">
              Create invite link
            </Button>

            {invites.length > 0 && (
              <ul className="flex flex-col gap-2">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-md border border-rule bg-surface px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-muted">{link(i.token)}</span>
                    <span className="text-[12.5px] capitalize">{i.role}</span>
                    <Button className="h-8 px-3" onClick={() => copy(i.token)}>
                      <Copy size={14} /> {copied === i.token ? "Copied" : "Copy"}
                    </Button>
                    <a
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-edge px-3 text-[13px] font-medium"
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Join our family tree on Vanshview: ${link(i.token)}`,
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                    <button type="button" className="text-[13px] text-danger" onClick={() => revoke(i.id)}>
                      Turn off
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
