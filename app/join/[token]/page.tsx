"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ErrorNote, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/data/family";
import { createClient } from "@/lib/supabase/client";

type Invite = { space_id: string; space_name: string; role: string; valid: boolean; already_member: boolean };

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    createClient()
      .rpc("get_invite", { p_token: token })
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error));
        setInvite((data as Invite | null) ?? null);
      });
  }, [token]);

  async function join() {
    setBusy(true);
    const { data, error } = await createClient().rpc("accept_invite", { p_token: token });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else router.push(`/s/${data}`);
  }

  return (
    <main className="mx-auto w-full max-w-sm px-4 pt-16">
      <p className="font-serif text-lg font-semibold">Vanshview</p>
      <div className="mt-12 flex flex-col gap-6">
        {invite === undefined ? (
          <Spinner />
        ) : !invite || !invite.valid ? (
          <>
            <h1 className="font-serif text-[26px] font-medium">This invite link has expired</h1>
            <p className="text-ink-muted">Ask the person who sent it for a new one.</p>
          </>
        ) : invite.already_member ? (
          <>
            <h1 className="font-serif text-[26px] font-medium">You're already in {invite.space_name}</h1>
            <Button variant="primary" onClick={() => router.push(`/s/${invite.space_id}`)}>
              Open the tree
            </Button>
          </>
        ) : (
          <>
            <h1 className="font-serif text-[26px] font-medium leading-tight">
              You've been invited to the {invite.space_name} tree
            </h1>
            <p className="text-ink-muted">
              You'll join as {invite.role === "viewer" ? "a viewer (can look, not change)" : `an ${invite.role}`}. Only
              people in this family can see it.
            </p>
            <ErrorNote message={error} />
            <Button variant="primary" onClick={join} disabled={busy} className="h-12">
              {busy ? "Joining…" : "Join the family"}
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
