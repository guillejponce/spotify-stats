import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase";

/**
 * Contexto de datos por usuario. `db` es service role (catálogo compartido +
 * crons), así que toda lectura/escritura de datos privados filtra por `userId`
 * y toda RPC recibe `p_user_id: userId`.
 */
export type UserCtx = {
  db: SupabaseClient;
  userId: string;
};

export type UserRole = "admin" | "user";
export type UserStatus = "pending" | "active" | "blocked";

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
};

export function serviceCtx(userId: string): UserCtx {
  return { db: createServerSupabaseClient(), userId };
}

/** Usuarios activos con token de Spotify guardado (crons / sync). */
export async function listActiveUsersWithSpotify(
  db: SupabaseClient
): Promise<string[]> {
  const { data: tokens, error } = await db
    .from("spotify_tokens")
    .select("user_id")
    .not("user_id", "is", null);
  if (error) throw error;
  const ids = (tokens ?? []).map((t) => t.user_id as string);
  if (ids.length === 0) return [];
  const { data: profiles, error: pErr } = await db
    .from("profiles")
    .select("id")
    .in("id", ids)
    .eq("status", "active");
  if (pErr) throw pErr;
  return (profiles ?? []).map((p) => p.id as string);
}

export async function listActiveUserIds(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from("profiles").select("id").eq("status", "active");
  if (error) throw error;
  return (data ?? []).map((p) => p.id as string);
}

/** Usuarios activos con al menos un dispositivo suscrito a push. */
export async function listActiveUsersWithPush(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from("push_subscriptions").select("user_id");
  if (error) throw error;
  const withPush = new Set((data ?? []).map((r) => r.user_id as string));
  const active = await listActiveUserIds(db);
  return active.filter((id) => withPush.has(id));
}

/** Corre `job` por usuario en serie; un error no corta a los demás. */
export async function forEachUser<T>(
  userIds: string[],
  job: (ctx: UserCtx) => Promise<T>,
): Promise<{ userId: string; ok: boolean; result?: T; error?: string }[]> {
  const db = createServerSupabaseClient();
  const out: { userId: string; ok: boolean; result?: T; error?: string }[] = [];
  for (const userId of userIds) {
    try {
      out.push({ userId, ok: true, result: await job({ db, userId }) });
    } catch (e) {
      console.error("[forEachUser]", userId, e);
      out.push({ userId, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export async function getAdminUserId(db: SupabaseClient): Promise<string | null> {
  const { data } = await db
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
