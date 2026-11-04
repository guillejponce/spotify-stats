import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  createServerSupabaseClient,
  supabasePublishableKey,
  supabaseUrlForClients,
} from "@/lib/supabase";
import type { Profile, UserCtx } from "@/lib/user-context";

/** Cliente con la sesión del usuario (cookies). Solo para auth; los datos van por `UserCtx`. */
export function createSessionSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(supabaseUrlForClients(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components no pueden escribir cookies; el middleware ya refrescó la sesión.
        }
      },
    },
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const supabase = createSessionSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const db = createServerSupabaseClient();
  const { data } = await db
    .from("profiles")
    .select("id, email, display_name, avatar_url, role, status")
    .eq("id", userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export type AuthedRequest = { ctx: UserCtx; profile: Profile };
type AuthResult = AuthedRequest | { response: NextResponse };

export async function requireUser(): Promise<AuthResult> {
  const userId = await getSessionUserId();
  if (!userId) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const profile = await getProfile(userId);
  if (!profile || profile.status !== "active") {
    return {
      response: NextResponse.json(
        { error: "Cuenta pendiente de aprobación", status: profile?.status ?? "pending" },
        { status: 403 }
      ),
    };
  }
  return { ctx: { db: createServerSupabaseClient(), userId }, profile };
}

export async function requireAdmin(): Promise<AuthResult> {
  const auth = await requireUser();
  if ("response" in auth) return auth;
  if (auth.profile.role !== "admin") {
    return { response: NextResponse.json({ error: "Solo admin" }, { status: 403 }) };
  }
  return auth;
}

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
