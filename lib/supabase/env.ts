// The hosted test project's URL and publishable key. Both are public by design: they ship to
// every browser, and the database's row-level security decides what each user can read or
// write. Environment variables override them (use those for production).
const TEST_PROJECT_URL = "https://axqvckorrcwzfvmnmozb.supabase.co";
const TEST_PROJECT_KEY = "sb_publishable_29DH6t7kN9FBki4NRILl6A_If441FaV";

// Referenced literally so Next.js can inline them into the browser bundle.
export function supabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || TEST_PROJECT_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || TEST_PROJECT_KEY,
  };
}
