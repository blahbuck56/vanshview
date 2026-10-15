// The hosted test project's URL and publishable key. Both are public by design: they ship to
// every browser, and the database's row-level security decides what each user can read or
// write.
//
// Overrides use Vanshview-specific names on purpose: Vercel's Supabase integration injects
// NEXT_PUBLIC_SUPABASE_URL / _KEY for whichever project it is linked to, and that must not
// silently switch the app to a different (empty) database.
const TEST_PROJECT_URL = "https://axqvckorrcwzfvmnmozb.supabase.co";
const TEST_PROJECT_KEY = "sb_publishable_29DH6t7kN9FBki4NRILl6A_If441FaV";

// Referenced literally so Next.js can inline them into the browser bundle.
export function supabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_VANSHVIEW_SUPABASE_URL || TEST_PROJECT_URL,
    key: process.env.NEXT_PUBLIC_VANSHVIEW_SUPABASE_KEY || TEST_PROJECT_KEY,
  };
}
