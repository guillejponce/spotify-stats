import type { SupabaseClient } from "@supabase/supabase-js";
import type { TimeFilterParams, TopItem } from "@/types/database";
import { getDashboardBundlePayload } from "@/lib/stats";
import { readKurtStatus } from "@/lib/kurt";

export type PublicProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  country: string | null;
  followers: number | null;
  product: string | null;
  spotify_url: string | null;
};

export type Relation = "self" | "friends" | "incoming" | "outgoing" | "none";

export type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at: string;
};

export type FriendEntry = {
  friendshipId: string;
  since: string;
  profile: PublicProfile;
};

const PUBLIC_PROFILE_COLUMNS =
  "id, display_name, avatar_url, country, followers, product, spotify_url";

async function loadProfiles(db: SupabaseClient, ids: string[]): Promise<Map<string, PublicProfile>> {
  const out = new Map<string, PublicProfile>();
  if (ids.length === 0) return out;
  const { data, error } = await db
    .from("profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .in("id", ids)
    .eq("status", "active");
  if (error) throw error;
  for (const p of (data ?? []) as PublicProfile[]) out.set(p.id, p);
  return out;
}

async function loadFriendshipRows(db: SupabaseClient, userId: string): Promise<FriendshipRow[]> {
  const { data, error } = await db
    .from("friendships")
    .select("id, requester_id, addressee_id, status, created_at")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) throw error;
  return (data ?? []) as FriendshipRow[];
}

function otherId(row: FriendshipRow, userId: string): string {
  return row.requester_id === userId ? row.addressee_id : row.requester_id;
}

function relationFor(row: FriendshipRow | undefined, userId: string): Relation {
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requester_id === userId ? "outgoing" : "incoming";
}

export async function listFriendships(
  db: SupabaseClient,
  userId: string
): Promise<{ friends: FriendEntry[]; incoming: FriendEntry[]; outgoing: FriendEntry[] }> {
  const rows = await loadFriendshipRows(db, userId);
  const profiles = await loadProfiles(db, rows.map((r) => otherId(r, userId)));

  const friends: FriendEntry[] = [];
  const incoming: FriendEntry[] = [];
  const outgoing: FriendEntry[] = [];
  for (const row of rows) {
    const profile = profiles.get(otherId(row, userId));
    if (!profile) continue;
    const entry = { friendshipId: row.id, since: row.created_at, profile };
    const rel = relationFor(row, userId);
    if (rel === "friends") friends.push(entry);
    else if (rel === "incoming") incoming.push(entry);
    else outgoing.push(entry);
  }
  const byName = (a: FriendEntry, b: FriendEntry) =>
    (a.profile.display_name ?? "").localeCompare(b.profile.display_name ?? "", "es");
  friends.sort(byName);
  return { friends, incoming, outgoing };
}

export async function countIncomingRequests(db: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await db
    .from("friendships")
    .select("id", { count: "exact", head: true })
    .eq("addressee_id", userId)
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}

export async function searchUsers(
  db: SupabaseClient,
  userId: string,
  query: string
): Promise<(PublicProfile & { relation: Relation })[]> {
  const q = query.trim().replace(/[%_,()]/g, " ").trim();
  if (q.length < 2) return [];
  const { data, error } = await db
    .from("profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("status", "active")
    .neq("id", userId)
    .ilike("display_name", `%${q}%`)
    .order("display_name")
    .limit(20);
  if (error) throw error;

  const rows = await loadFriendshipRows(db, userId);
  const byOther = new Map(rows.map((r) => [otherId(r, userId), r]));
  return ((data ?? []) as PublicProfile[]).map((p) => ({
    ...p,
    relation: relationFor(byOther.get(p.id), userId),
  }));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findPair(db: SupabaseClient, a: string, b: string): Promise<FriendshipRow | null> {
  // Los ids van dentro del filtro `or()` de PostgREST.
  if (!UUID_RE.test(a) || !UUID_RE.test(b)) return null;
  const { data, error } = await db
    .from("friendships")
    .select("id, requester_id, addressee_id, status, created_at")
    .or(
      `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`
    )
    .maybeSingle();
  if (error) throw error;
  return (data as FriendshipRow | null) ?? null;
}

export class FriendError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Si la otra persona ya te había mandado solicitud, enviar una equivale a aceptarla. */
export async function sendFriendRequest(
  db: SupabaseClient,
  userId: string,
  targetId: string
): Promise<Relation> {
  if (userId === targetId) throw new FriendError("No puedes agregarte a ti mismo", 400);
  if (!UUID_RE.test(targetId)) throw new FriendError("Usuario no encontrado", 404);
  const target = await loadProfiles(db, [targetId]);
  if (!target.has(targetId)) throw new FriendError("Usuario no encontrado", 404);

  const existing = await findPair(db, userId, targetId);
  if (existing) {
    const rel = relationFor(existing, userId);
    if (rel === "incoming") {
      await acceptRow(db, existing.id);
      return "friends";
    }
    return rel;
  }

  const { error } = await db
    .from("friendships")
    .insert({ requester_id: userId, addressee_id: targetId, status: "pending" });
  if (error) {
    if (error.code === "23505") return "outgoing";
    throw error;
  }
  return "outgoing";
}

async function acceptRow(db: SupabaseClient, friendshipId: string) {
  const { error } = await db
    .from("friendships")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", friendshipId);
  if (error) throw error;
}

export async function respondFriendRequest(
  db: SupabaseClient,
  userId: string,
  friendshipId: string,
  accept: boolean
): Promise<void> {
  const { data, error } = await db
    .from("friendships")
    .select("id, addressee_id, status")
    .eq("id", friendshipId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.addressee_id !== userId || data.status !== "pending") {
    throw new FriendError("Solicitud no encontrada", 404);
  }
  if (accept) {
    await acceptRow(db, friendshipId);
  } else {
    const { error: delErr } = await db.from("friendships").delete().eq("id", friendshipId);
    if (delErr) throw delErr;
  }
}

/** Cancela una solicitud enviada o elimina una amistad. */
export async function removeFriendship(
  db: SupabaseClient,
  userId: string,
  otherUserId: string
): Promise<void> {
  const row = await findPair(db, userId, otherUserId);
  if (!row) return;
  const { error } = await db.from("friendships").delete().eq("id", row.id);
  if (error) throw error;
}

export async function relationBetween(
  db: SupabaseClient,
  viewerId: string,
  targetId: string
): Promise<Relation> {
  if (viewerId === targetId) return "self";
  return relationFor((await findPair(db, viewerId, targetId)) ?? undefined, viewerId);
}

export type ProfilePeriod = "all" | "year" | "last_month";

export function periodParams(period: string | null): { period: ProfilePeriod; params: TimeFilterParams } {
  if (period === "year") return { period, params: { filter: "year" } };
  if (period === "last_month") return { period, params: { filter: "last_month" } };
  return { period: "all", params: { filter: "all" } };
}

export type ListeningNow = {
  is_playing: boolean;
  updated_at: string;
  track_name: string;
  artist_name: string | null;
  album_art_url: string | null;
  spotify_url: string | null;
};

/** "Escuchando ahora" si se actualizó hace poco; si no, la última reproducción guardada. */
const NOW_PLAYING_FRESH_MS = 5 * 60 * 1000;

async function loadListening(db: SupabaseClient, userId: string): Promise<ListeningNow | null> {
  const { data: np } = await db
    .from("now_playing")
    .select("is_playing, updated_at, track_id")
    .eq("user_id", userId)
    .maybeSingle();

  const fresh =
    np?.is_playing &&
    np.track_id &&
    Date.now() - new Date(np.updated_at as string).getTime() < NOW_PLAYING_FRESH_MS;

  let trackId: string | null = fresh ? (np!.track_id as string) : null;
  let at: string | null = fresh ? (np!.updated_at as string) : null;

  if (!trackId) {
    const { data: last } = await db
      .from("plays")
      .select("track_id, played_at")
      .eq("user_id", userId)
      .not("track_id", "is", null)
      .order("played_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) return null;
    trackId = last.track_id as string;
    at = last.played_at as string;
  }

  const { data: track } = await db
    .from("tracks")
    .select("name, spotify_url, artists(name), albums(image_url)")
    .eq("id", trackId)
    .maybeSingle();
  if (!track) return null;

  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  const artist = one(track.artists as { name: string } | { name: string }[] | null);
  const album = one(track.albums as { image_url: string | null } | { image_url: string | null }[] | null);

  return {
    is_playing: Boolean(fresh),
    updated_at: at!,
    track_name: track.name as string,
    artist_name: artist?.name ?? null,
    album_art_url: album?.image_url ?? null,
    spotify_url: (track.spotify_url as string | null) ?? null,
  };
}

export type ProfileView = {
  profile: PublicProfile;
  relation: Relation;
  period: ProfilePeriod;
  stats: {
    totalMs: number;
    playCount: number;
    currentStreak: number;
    longestStreak: number;
    topTracks: TopItem[];
    topArtists: TopItem[];
    topAlbums: TopItem[];
  } | null;
  listening: ListeningNow | null;
  source: DataSource | null;
};

/** De dónde llegan las canciones nuevas de la persona. */
export type DataSource =
  | { kind: "spotify" }
  | { kind: "lastfm"; username: string; profileUrl: string | null }
  | { kind: "history"; lastPlayAt: string | null };

async function loadDataSource(db: SupabaseClient, userId: string): Promise<DataSource> {
  const [{ data: token }, { data: lastfm }] = await Promise.all([
    db.from("spotify_tokens").select("refresh_token, needs_reconnect").eq("user_id", userId).maybeSingle(),
    db.from("lastfm_accounts").select("username, profile_url").eq("user_id", userId).maybeSingle(),
  ]);
  if (token?.refresh_token && !token.needs_reconnect) return { kind: "spotify" };
  if (lastfm) {
    return {
      kind: "lastfm",
      username: lastfm.username as string,
      profileUrl: (lastfm.profile_url as string | null) ?? null,
    };
  }
  const { data: last } = await db
    .from("plays")
    .select("played_at")
    .eq("user_id", userId)
    .order("played_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { kind: "history", lastPlayAt: (last?.played_at as string | undefined) ?? null };
}

/** Stats solo para uno mismo o amigos aceptados; el resto ve la ficha pública. */
export async function getProfileView(
  db: SupabaseClient,
  viewerId: string,
  targetId: string,
  period: string | null
): Promise<ProfileView | null> {
  if (!UUID_RE.test(targetId)) return null;
  const profiles = await loadProfiles(db, [targetId]);
  const profile = profiles.get(targetId);
  if (!profile) return null;

  const relation = await relationBetween(db, viewerId, targetId);
  const resolved = periodParams(period);
  if (relation !== "self" && relation !== "friends") {
    return { profile, relation, period: resolved.period, stats: null, listening: null, source: null };
  }

  const ctx = { db, userId: targetId };
  const [bundle, kurt, listening, source] = await Promise.all([
    getDashboardBundlePayload(ctx, resolved.params, 10),
    readKurtStatus(ctx).catch(() => null),
    loadListening(db, targetId).catch(() => null),
    loadDataSource(db, targetId).catch(() => null),
  ]);

  return {
    profile,
    relation,
    period: resolved.period,
    stats: {
      totalMs: bundle.totalMs,
      playCount: bundle.playCount,
      currentStreak: kurt?.current_streak ?? 0,
      longestStreak: kurt?.longest_streak ?? 0,
      topTracks: bundle.topTracks,
      topArtists: bundle.topArtists,
      topAlbums: bundle.topAlbums,
    },
    listening,
    source,
  };
}
