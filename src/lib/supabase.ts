import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL en .env.local");
  return url;
}

export function supabasePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) throw new Error("Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local");
  return key;
}

export function supabaseUrlForClients(): string {
  return supabaseUrl();
}

export function createBrowserSupabaseClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}

/**
 * Service role: bypassa RLS. Solo servidor. Cada consulta a datos privados debe
 * filtrar por `user_id` (o pasar `p_user_id` a la RPC) — ver `UserCtx`.
 */
export function createServerSupabaseClient() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY (el servidor la necesita con RLS activo)");
  }

  return createClient(supabaseUrl(), secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
