"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, myMemberships, type Membership } from "@/lib/data/family";
import { createClient } from "@/lib/supabase/client";

export type SpaceContext = {
  userId: string;
  memberships: Membership[];
  membership: Membership | null;
  /** person_id -> user_id for everyone who has claimed themselves in this space. */
  claims: Map<string, string>;
};

/** Who the signed-in user is in this family space. `null` while loading. */
export function useSpace(spaceId: string) {
  const [ctx, setCtx] = useState<SpaceContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const db = createClient();
    // getSession reads the cookie locally; every query is still verified by the database.
    const {
      data: { session },
    } = await db.auth.getSession();
    const user = session?.user;
    if (!user) return;
    try {
      const [memberships, members] = await Promise.all([
        myMemberships(db, user.id),
        db.from("space_members").select("user_id, person_id").eq("space_id", spaceId),
      ]);
      if (members.error) throw members.error;
      setCtx({
        userId: user.id,
        memberships,
        membership: memberships.find((m) => m.spaceId === spaceId) ?? null,
        claims: new Map(
          (members.data ?? []).filter((m) => m.person_id).map((m) => [m.person_id as string, m.user_id]),
        ),
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [spaceId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ctx, error, reload: load };
}
