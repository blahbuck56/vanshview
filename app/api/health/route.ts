import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

// For uptime monitoring: 200 when the app and its database answer, 503 otherwise. Pinging it
// regularly also keeps a free Supabase project from pausing for inactivity.
export const dynamic = "force-dynamic";

export async function GET() {
  const { url, key } = supabaseEnv();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const started = Date.now();
  const { data, error } = await db.rpc("health");
  const ok = !error && data === true;
  return Response.json(
    { ok, db: ok ? "up" : "down", ms: Date.now() - started },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
