import { redirect } from "next/navigation";
import { myMemberships } from "@/lib/data/family";
import { createClient } from "@/lib/supabase/server";

// Sends people to their family's tree, or to onboarding when they have none yet.
export default async function Home() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const memberships = await myMemberships(db, user.id);
  if (memberships.length === 0) redirect("/start");
  redirect(`/s/${memberships[0].spaceId}`);
}
