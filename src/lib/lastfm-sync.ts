import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserCtx } from "@/lib/user-context";
import { getLastfmRecentTracks, LastfmError, type LastfmScrobble } from "@/lib/lastfm";
import { resolveScrobbleTrack } from "@/lib/lastfm-match";
import type { PersistedTrack } from "@/lib/spotify-track-graph";
import { PLAYBACK_PLATFORM_LASTFM } from "@/lib/playback-platform";

/** Páginas de 200 por corrida; si hay más atraso, la siguiente corrida sigue. */
const MAX_PAGES_PER_RUN = 5;
/**
 * El zip marca el fin de la reproducción y Last.fm el inicio: una misma
 * escucha se reconoce si la misma canción cae dentro de su duración + margen.
 */
const DEDUP_MARGIN_MS = 3 * 60 * 1000;
const DEFAULT_DURATION_MS = 210_000;

export type LastfmAccountRow = {
  user_id: string;
  username: string;
  session_key: string;
  connected_at: string;
  last_scrobble_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
};

export type LastfmSyncResult = {
  ok: boolean;
  inserted: number;
  duplicates: number;
  unmatched: number;
  polled: number;
  nowPlaying: boolean;
  skippedReason?: "not_connected" | "spotify_primary" | "recent";
  error?: string;
};

const inflight = new Map<string, Promise<LastfmSyncResult>>();

/** Spotify en vivo es la fuente principal mientras su token funcione. */
export async function hasWorkingSpotify(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await db
    .from("spotify_tokens")
    .select("refresh_token, needs_reconnect")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.refresh_token) && !data?.needs_reconnect;
}

export async function loadLastfmAccount(
  db: SupabaseClient,
  userId: string
): Promise<LastfmAccountRow | null> {
  const { data } = await db
    .from("lastfm_accounts")
    .select("user_id, username, session_key, connected_at, last_scrobble_at, last_synced_at, last_error")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as LastfmAccountRow | null) ?? null;
}

type Resolved = { scrobble: LastfmScrobble & { playedAt: Date }; track: PersistedTrack };

async function filterDuplicates(ctx: UserCtx, rows: Resolved[]): Promise<Resolved[]> {
  if (!rows.length) return [];
  const durationOf = (r: Resolved) => r.track.durationMs || DEFAULT_DURATION_MS;
  const minMs = Math.min(...rows.map((r) => r.scrobble.playedAt.getTime())) - DEDUP_MARGIN_MS;
  const maxMs = Math.max(...rows.map((r) => r.scrobble.playedAt.getTime() + durationOf(r))) + DEDUP_MARGIN_MS;
  const trackIds = Array.from(new Set(rows.map((r) => r.track.trackId)));

  const { data, error } = await ctx.db
    .from("plays")
    .select("track_id, played_at")
    .eq("user_id", ctx.userId)
    .in("track_id", trackIds)
    .gte("played_at", new Date(minMs).toISOString())
    .lte("played_at", new Date(maxMs).toISOString());
  if (error) throw error;

  const seen = new Map<string, number[]>();
  for (const p of data ?? []) {
    const list = seen.get(p.track_id as string) ?? [];
    list.push(new Date(p.played_at as string).getTime());
    seen.set(p.track_id as string, list);
  }

  const out: Resolved[] = [];
  for (const r of rows) {
    const start = r.scrobble.playedAt.getTime();
    const lo = start - DEDUP_MARGIN_MS;
    const hi = start + durationOf(r) + DEDUP_MARGIN_MS;
    const list = seen.get(r.track.trackId) ?? [];
    if (list.some((t) => t >= lo && t <= hi)) continue;
    list.push(start);
    seen.set(r.track.trackId, list);
    out.push(r);
  }
  return out;
}

async function updateNowPlaying(ctx: UserCtx, track: PersistedTrack | null) {
  const now = new Date().toISOString();
  if (track) {
    await ctx.db.from("now_playing").upsert(
      {
        user_id: ctx.userId,
        track_id: track.trackId,
        artist_id: track.artistId,
        album_id: track.albumId,
        is_playing: true,
        progress_ms: 0,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );
  } else {
    await ctx.db
      .from("now_playing")
      .update({ is_playing: false, updated_at: now })
      .eq("user_id", ctx.userId)
      .eq("is_playing", true);
  }
}

function friendlyError(e: unknown): string {
  if (e instanceof LastfmError) {
    if (e.code === 9 || e.code === 4 || e.code === 14) {
      return "Last.fm ya no da acceso a esta cuenta. Vuelve a conectarla.";
    }
    if (e.code === 17) return "La cuenta de Last.fm es privada y no se pudo leer.";
    if (e.code === 29) return "Last.fm limitó las consultas; se reintenta solo.";
    return `Last.fm: ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

async function syncInner(
  ctx: UserCtx,
  opts: { force: boolean; minIntervalMs: number }
): Promise<LastfmSyncResult> {
  const base: LastfmSyncResult = {
    ok: true,
    inserted: 0,
    duplicates: 0,
    unmatched: 0,
    polled: 0,
    nowPlaying: false,
  };
  const account = await loadLastfmAccount(ctx.db, ctx.userId);
  if (!account) return { ...base, ok: false, skippedReason: "not_connected" };
  if (!opts.force && (await hasWorkingSpotify(ctx.db, ctx.userId))) {
    return { ...base, skippedReason: "spotify_primary" };
  }
  if (
    opts.minIntervalMs > 0 &&
    account.last_synced_at &&
    Date.now() - new Date(account.last_synced_at).getTime() < opts.minIntervalMs
  ) {
    return { ...base, skippedReason: "recent" };
  }

  const from = account.last_scrobble_at
    ? new Date(account.last_scrobble_at)
    : new Date(new Date(account.connected_at).getTime() - 24 * 60 * 60 * 1000);

  try {
    const first = await getLastfmRecentTracks(account.username, account.session_key, { from });
    const nowPlayingScrobble = first.scrobbles.find((s) => s.nowPlaying) ?? null;

    // Las páginas van de más nueva a más vieja: con atraso se procesan primero las más viejas.
    const lastPage = first.totalPages;
    const pages: number[] = [];
    for (let p = lastPage; p >= 1 && pages.length < MAX_PAGES_PER_RUN; p--) pages.push(p);

    const scrobbles: LastfmScrobble[] = [];
    for (const page of pages) {
      const batch =
        page === 1
          ? first.scrobbles
          : (await getLastfmRecentTracks(account.username, account.session_key, { from, page })).scrobbles;
      scrobbles.push(...batch.filter((s) => !s.nowPlaying && s.playedAt && s.playedAt > from));
    }
    scrobbles.sort((a, b) => a.playedAt!.getTime() - b.playedAt!.getTime());
    base.polled = scrobbles.length;

    const cache = new Map<string, PersistedTrack | null>();
    const resolved: Resolved[] = [];
    for (const s of scrobbles) {
      const track = await resolveScrobbleTrack(ctx.db, s.artist, s.track, cache);
      if (track) resolved.push({ scrobble: s as Resolved["scrobble"], track });
      else base.unmatched++;
    }

    const fresh = await filterDuplicates(ctx, resolved);
    base.duplicates = resolved.length - fresh.length;

    if (fresh.length) {
      const { data: insertedRows, error } = await ctx.db
        .from("plays")
        .upsert(
          fresh.map((r) => ({
            user_id: ctx.userId,
            track_id: r.track.trackId,
            artist_id: r.track.artistId,
            album_id: r.track.albumId,
            played_at: r.scrobble.playedAt.toISOString(),
            ms_played: r.track.durationMs || DEFAULT_DURATION_MS,
            source: "lastfm",
            platform: PLAYBACK_PLATFORM_LASTFM,
          })),
          { onConflict: "user_id,track_id,played_at", ignoreDuplicates: true }
        )
        .select("id");
      if (error) throw error;
      base.inserted = insertedRows?.length ?? 0;
    }

    const nowTrack = nowPlayingScrobble
      ? await resolveScrobbleTrack(ctx.db, nowPlayingScrobble.artist, nowPlayingScrobble.track, cache)
      : null;
    await updateNowPlaying(ctx, nowTrack);
    base.nowPlaying = Boolean(nowTrack);

    const newest = scrobbles.length ? scrobbles[scrobbles.length - 1].playedAt! : null;
    await ctx.db
      .from("lastfm_accounts")
      .update({
        last_synced_at: new Date().toISOString(),
        last_error: null,
        ...(newest ? { last_scrobble_at: newest.toISOString() } : {}),
      })
      .eq("user_id", ctx.userId);

    return base;
  } catch (e) {
    const message = friendlyError(e);
    console.warn("[lastfm-sync]", ctx.userId, e);
    await ctx.db
      .from("lastfm_accounts")
      .update({ last_synced_at: new Date().toISOString(), last_error: message })
      .eq("user_id", ctx.userId);
    return { ...base, ok: false, error: message };
  }
}

/**
 * Trae los scrobbles nuevos de Last.fm y los agrega a `plays` (source lastfm).
 * No hace nada si la persona tiene Spotify en vivo funcionando, salvo `force`.
 */
export function syncLastfmForUser(
  ctx: UserCtx,
  opts: { force?: boolean; minIntervalMs?: number } = {}
): Promise<LastfmSyncResult> {
  const running = inflight.get(ctx.userId);
  if (running) return running;
  const job = syncInner(ctx, {
    force: Boolean(opts.force),
    minIntervalMs: opts.minIntervalMs ?? 0,
  }).finally(() => inflight.delete(ctx.userId));
  inflight.set(ctx.userId, job);
  return job;
}

export async function listActiveUsersWithLastfm(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from("lastfm_accounts").select("user_id");
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.user_id as string);
  if (!ids.length) return [];
  const { data: profiles, error: pErr } = await db
    .from("profiles")
    .select("id")
    .in("id", ids)
    .eq("status", "active");
  if (pErr) throw pErr;
  return (profiles ?? []).map((p) => p.id as string);
}
