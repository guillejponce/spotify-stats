import type { UserCtx } from "@/lib/user-context";
import { getRecentlyPlayed } from "@/lib/spotify";
import {
  forceRefreshSpotifyAccessToken,
  getSpotifyAccessToken,
} from "@/lib/spotify-token";
import { enrichArtistsMissingImages } from "@/lib/enrich-artist-images";
import { persistSpotifyTrackGraph } from "@/lib/spotify-track-graph";
import { PLAYBACK_PLATFORM_SPOTIFY_SYNC } from "@/lib/playback-platform";
import { creditLiveListenIfNeeded } from "@/lib/kurt-live-listen";

export type SyncRecentResult = {
  synced: number;
  skipped: number;
  polled: number;
  ok: boolean;
  error?: string;
  /** Fotos actualizadas vía GET /artists para filas sin `image_url`. */
  images_enriched?: number;
};

export type SyncRecentOptions = {
  /** Default 3. Cada página son hasta `limit` items (máx. 50 en Spotify). */
  maxPages?: number;
  /** Default false: el backfill de fotos alarga cada visita al dashboard. */
  enrichImages?: boolean;
  /** Default true: si hay un tema sonando, cuenta como play de hoy. */
  includeNowPlaying?: boolean;
};

type RecentEntry = { track?: Record<string, unknown>; played_at?: string };

const inflight = new Map<string, Promise<SyncRecentResult>>();

function toIso(raw: string): string | null {
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

async function existingPlayedAtSet(
  ctx: UserCtx,
  timestamps: string[],
): Promise<Set<string>> {
  if (!timestamps.length) return new Set();
  const { data, error } = await ctx.db
    .from("plays")
    .select("played_at")
    .eq("user_id", ctx.userId)
    .in("played_at", timestamps);
  if (error || !data) return new Set();
  const set = new Set<string>();
  for (const row of data) {
    const iso = toIso(String(row.played_at ?? ""));
    if (iso) set.add(iso);
  }
  return set;
}

async function persistRecentEntry(
  ctx: UserCtx,
  entry: RecentEntry,
): Promise<"inserted" | "skipped"> {
  const supabase = ctx.db;
  const track = entry.track;
  const playedAt = entry.played_at;
  if (!track?.id || !playedAt || typeof playedAt !== "string") return "skipped";

  const persisted = await persistSpotifyTrackGraph(supabase, track);
  if (!persisted) return "skipped";
  const { trackId: dbTrackId, artistId: artistDbId, albumId: albumDbId } = persisted;

  const playedAtTs = new Date(playedAt).toISOString();

  // Window-based dedup: skip if the same track was already recorded within ±3 min.
  // Prevents duplicates when creditLiveListenIfNeeded inserts an estimated
  // played_at that differs by a few seconds from Spotify's official timestamp.
  const DEDUP_WINDOW_MS = 3 * 60 * 1000;
  const playedMs = new Date(playedAtTs).getTime();
  const { data: nearbyPlay } = await supabase
    .from("plays")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("track_id", dbTrackId)
    .gte("played_at", new Date(playedMs - DEDUP_WINDOW_MS).toISOString())
    .lte("played_at", new Date(playedMs + DEDUP_WINDOW_MS).toISOString())
    .limit(1);
  if (nearbyPlay?.[0]?.id) return "skipped";

  const dur =
    typeof track.duration_ms === "number" ? track.duration_ms : 180_000;

  const { error: insErr } = await supabase.from("plays").insert({
    user_id: ctx.userId,
    track_id: dbTrackId,
    artist_id: artistDbId,
    album_id: albumDbId,
    played_at: playedAtTs,
    ms_played: dur,
    source: "live",
    shuffle: null,
    offline: null,
    platform: PLAYBACK_PLATFORM_SPOTIFY_SYNC,
  });

  if (insErr?.code === "23505") return "skipped";
  if (insErr) {
    console.error("[sync-recent] insert play", insErr);
    return "skipped";
  }
  return "inserted";
}

async function syncRecentPlaysFromSpotifyInner(
  ctx: UserCtx,
  limit: number,
  options: SyncRecentOptions,
): Promise<SyncRecentResult> {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 3, 5));
  const enrichImages = Boolean(options.enrichImages);
  const includeNowPlaying = options.includeNowPlaying !== false;

  let token = await getSpotifyAccessToken(ctx);
  if (!token) {
    return {
      synced: 0,
      skipped: 0,
      polled: 0,
      ok: false,
      error: "no_tokens",
    };
  }

  const loadPage = async (access: string, before?: number) => {
    try {
      return await getRecentlyPlayed(
        access,
        limit,
        before ? { before } : undefined,
      );
    } catch (err) {
      if (err instanceof Error && err.message === "EXPIRED_TOKEN") {
        const fresh = await forceRefreshSpotifyAccessToken(ctx);
        if (!fresh) throw err;
        token = fresh;
        return await getRecentlyPlayed(
          fresh,
          limit,
          before ? { before } : undefined,
        );
      }
      throw err;
    }
  };

  let inserted = 0;
  let skipped = 0;
  let polled = 0;
  let before: number | undefined;
  let caughtUp = false;

  for (let page = 0; page < maxPages && !caughtUp; page++) {
    const data = await loadPage(token, before);
    const batch = data?.items ?? [];
    polled += batch.length;

    const withIso: { entry: RecentEntry; iso: string }[] = [];
    for (const entry of batch) {
      if (!entry.played_at) {
        skipped++;
        continue;
      }
      const iso = toIso(entry.played_at);
      if (!iso) {
        skipped++;
        continue;
      }
      withIso.push({ entry, iso });
    }

    const known = await existingPlayedAtSet(
      ctx,
      withIso.map((row) => row.iso),
    );
    const fresh = withIso.filter((row) => !known.has(row.iso));
    skipped += withIso.length - fresh.length;

    for (const row of fresh) {
      const result = await persistRecentEntry(ctx, row.entry);
      if (result === "inserted") inserted++;
      else skipped++;
    }

    // Recently Played viene de más nuevo a más viejo. Si esta página ya estaba, estamos al día.
    if (fresh.length === 0) caughtUp = true;

    const cursor = data?.cursors?.before;
    if (!batch.length || batch.length < limit || !cursor) break;
    before = Number(cursor);
    if (!Number.isFinite(before)) break;
  }

  if (includeNowPlaying) {
    try {
      const live = await creditLiveListenIfNeeded(ctx);
      if (live.inserted) inserted++;
    } catch (e) {
      console.warn("[sync-recent] live credit", e);
    }
  }

  let imagesEnriched = 0;
  if (enrichImages) {
    try {
      imagesEnriched = await enrichArtistsMissingImages(ctx.db, token);
    } catch (e) {
      console.warn("[sync-recent] enrich artist images", e);
    }
  }

  return {
    synced: inserted,
    skipped,
    polled,
    ok: true,
    images_enriched: imagesEnriched,
  };
}

/** Pull Spotify Recently Played and append `plays` rows (source live). Requires spotify_tokens. */
export async function syncRecentPlaysFromSpotify(
  ctx: UserCtx,
  limit: number = 50,
  options: SyncRecentOptions = {},
): Promise<SyncRecentResult> {
  const running = inflight.get(ctx.userId);
  if (running) return running;
  const job = syncRecentPlaysFromSpotifyInner(ctx, limit, options).finally(() => {
    inflight.delete(ctx.userId);
  });
  inflight.set(ctx.userId, job);
  return job;
}
