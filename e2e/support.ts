import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "@/types/database";

// The suite runs against a local Supabase (`supabase start` + `supabase db reset`) and the app on
// localhost. Every sign-in uses a test number from supabase/config.toml with code 123456.
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_KEY = process.env.E2E_SUPABASE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

/** Sample "Malhotra family" members from supabase/seed.sql. */
export const SEED = {
  owner: "98765 00001", // Arjun
  admin: "98765 00002", // Neelam
  editor: "98765 00003", // Tanvi
  viewer: "98765 00004", // Rahul
};

/** Fresh test numbers (no family yet after a database reset). Each spec file owns a few. */
export const fresh = (n: number) => `99999 000${String(n).padStart(2, "0")}`;
const e164 = (local: string) => `+91${local.replace(/\D/g, "")}`;

/** Signs in through the real login screen. */
export async function signIn(page: Page, local: string) {
  await page.goto("/login");
  await page.getByLabel("Phone number").fill(local);
  // One code per number per second: if the suite just used this number, wait and ask again.
  await expect(async () => {
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByLabel("6-digit code")).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

const clients = new Map<string, SupabaseClient<Database>>();

/** A database client signed in as that number, for setting up data quickly. */
export async function api(local: string): Promise<SupabaseClient<Database>> {
  const cached = clients.get(local);
  if (cached) return cached;
  const db = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const phone = e164(local);
  for (let attempt = 0; ; attempt++) {
    const sent = await db.auth.signInWithOtp({ phone });
    if (!sent.error) break;
    if (attempt > 5) throw sent.error;
    await new Promise((r) => setTimeout(r, 1200)); // one code per number per second
  }
  const { error } = await db.auth.verifyOtp({ phone, token: "123456", type: "sms" });
  if (error) throw error;
  clients.set(local, db);
  return db;
}

export const adult = (given: string, extra: Record<string, unknown> = {}) => ({
  given_name: given,
  family_name: "Shah",
  location: { label: "Pune", kind: "current" },
  phone_status: "requested",
  ...extra,
});

/** Creates a family owned by `local` and returns its id and the owner's person id. */
export async function newFamily(local: string, name: string, self: Record<string, unknown> = {}) {
  const db = await api(local);
  const { data: spaceId, error } = await db.rpc("start_family", {
    p_name: name,
    p_self: { ...adult("Owner"), phone: e164(local), phone_status: undefined, ...self } as never,
  });
  if (error) throw error;
  const { data: me } = await db.auth.getUser();
  const { data: row } = await db
    .from("space_members")
    .select("person_id")
    .eq("space_id", spaceId as string)
    .eq("user_id", me.user!.id)
    .single();
  return { spaceId: spaceId as string, meId: row!.person_id as string, db };
}

/** Throws if an RPC fails, returns its data otherwise. */
export async function rpc<T = string>(
  db: SupabaseClient<Database>,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.rpc(fn as never, args as never);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** Adds `member` to a family through a real invite link, with the given role. */
export async function joinViaInvite(owner: SupabaseClient<Database>, spaceId: string, member: string, role: string) {
  const { data, error } = await owner.from("invites").insert({ space_id: spaceId, role: role as never }).select("token").single();
  if (error) throw error;
  await rpc(await api(member), "accept_invite", { p_token: data.token });
  return data.token;
}

/** The right-hand person panel (desktop) or the person view (phone). */
export const panel = (page: Page) => page.getByRole("complementary").last();

/** Opens the tree centred on a person. */
export async function openPerson(page: Page, spaceId: string, personId: string) {
  await page.goto(`/s/${spaceId}?focus=${personId}`);
}

export const stamp = () => Math.random().toString(36).slice(2, 7);
