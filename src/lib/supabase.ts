import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

/** Server-side (API routes). Prefer service role key so RLS doesn't block inserts. */
export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return createClient(url, secret!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
