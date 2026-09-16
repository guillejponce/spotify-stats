import type { SupabaseClient } from "@supabase/supabase-js";
import { getRecentlyPlayed } from "@/lib/spotify";
import {
  forceRefreshSpotifyAccessToken,
  getSpotifyAccessToken,
} from "@/lib/spotify-token";
import { enrichArtistsMissingImages } from "@/lib/enrich-artist-images";
import { upsertTrackAndGetPk } from "@/lib/spotify-tracks-db";
import {
  upsertArtistAndGetDbId,
  upsertAlbumAndGetDbId,
} from "@/lib/spotify-graph-db";
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

type ArtistStub = {
  id: string;
  name: string;
  images?: { url?: string }[];
  external_urls?: { spotify?: string };
};

let inflight: Promise<SyncRecentResult> | null = null;

function toIso(raw: string): string | null {
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

async function existingPlayedAtSet(
  supabase: SupabaseClient,
  timestamps: string[],
): Promise<Set<string>> {
  if (!timestamps.length) return new Set();
  const { data, error } = await supabase
    .from("plays")
    .select("played_at")
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
  supabase: SupabaseClient,
  entry: RecentEntry,
): Promise<"inserted" | "skipped"> {
  const track = entry.track;
  const playedAt = entry.played_at;
  if (!track?.id || !playedAt || typeof playedAt !== "string") return "skipped";

  const artists = track.artists as ArtistStub[] | undefined;
  const album = track.album as
    | {
        id: string;
        name: string;
        images?: { url?: string }[];
        release_date?: string;
        album_type?: string;
        external_urls?: { spotify?: string };
      }
    | undefined;

  const FALLBACK_ARTIST: ArtistStub = {
    id: `unknown_${String(track.name ?? "x").slice(0, 20)}`,
    name: "Unknown",
  };

  const primaryArtist = artists?.[0] ?? FALLBACK_ARTIST;
  const spotifyArtistKey =
    primaryArtist?.id ||
    String(track.name ?? "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_");

  const artistDbId = await upsertArtistAndGetDbId(supabase, {
    spotifyArtistId: spotifyArtistKey,
    name: primaryArtist.name || "Unknown",
    image_url:
      primaryArtist.images?.[0]?.url ?? album?.images?.[0]?.url ?? null,
    spotify_url: primaryArtist.external_urls?.spotify ?? null,
  });

  if (!artistDbId) {
    console.error("[sync-recent] artist upsert failed", spotifyArtistKey);
    return "skipped";
  }

  let albumDbId: string | null = null;
  if (album?.name) {
    albumDbId = await upsertAlbumAndGetDbId(supabase, {
      spotifyAlbumId: album?.id ?? null,
      name: album.name,
      artist_db_id: artistDbId,
      image_url: album.images?.[0]?.url ?? null,
      release_date: album.release_date ?? null,
      album_type: album.album_type ?? null,
      spotify_url: album.external_urls?.spotify ?? null,
    });
  }

  const dbTrackId = await upsertTrackAndGetPk(supabase, {
    spotifyTrackId: track.id as string,
    name: track.name as string,
    artist_id: artistDbId,
    album_id: albumDbId,
    duration_ms: typeof track.duration_ms === "number" ? track.duration_ms : 0,
    explicit: Boolean(track.explicit),
    preview_url: (track.preview_url as string | null) ?? null,
    spotify_url:
      (track.external_urls as { spotify?: string } | undefined)?.spotify ??
      null,
    popularity:
      typeof track.popularity === "number" ? (track.popularity as number) : null,
  });

  if (!dbTrackId) {
    console.error("[sync-recent] tracks upsert failed", track.id);
    return "skipped";
  }

  const playedAtTs = new Date(playedAt).toISOString();
  const dur =
    typeof track.duration_ms === "number" ? track.duration_ms : 180_000;

  const { error: insErr } = await supabase.from("plays").insert({
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
  supabase: SupabaseClient,
  limit: number,
  options: SyncRecentOptions,
): Promise<SyncRecentResult> {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 3, 5));
  const enrichImages = Boolean(options.enrichImages);
  const includeNowPlaying = options.includeNowPlaying !== false;

  let token = await getSpotifyAccessToken(supabase);
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
        const fresh = await forceRefreshSpotifyAccessToken(supabase);
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
      supabase,
      withIso.map((row) => row.iso),
    );
    const fresh = withIso.filter((row) => !known.has(row.iso));
    skipped += withIso.length - fresh.length;

    for (const row of fresh) {
      const result = await persistRecentEntry(supabase, row.entry);
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
      const live = await creditLiveListenIfNeeded(supabase);
      if (live.inserted) inserted++;
    } catch (e) {
      console.warn("[sync-recent] live credit", e);
    }
  }

  let imagesEnriched = 0;
  if (enrichImages) {
    try {
      imagesEnriched = await enrichArtistsMissingImages(supabase, token);
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
  supabase: SupabaseClient,
  limit: number = 50,
  options: SyncRecentOptions = {},
): Promise<SyncRecentResult> {
  if (inflight) return inflight;
  inflight = syncRecentPlaysFromSpotifyInner(supabase, limit, options).finally(
    () => {
      inflight = null;
    },
  );
  return inflight;
}
