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

export type SyncRecentResult = {
  synced: number;
  skipped: number;
  polled: number;
  ok: boolean;
  error?: string;
  /** Fotos actualizadas vía GET /artists para filas sin `image_url`. */
  images_enriched?: number;
};

/** Pull Spotify Recently Played and append `plays` rows (source live). Requires spotify_tokens. */
export async function syncRecentPlaysFromSpotify(
  supabase: SupabaseClient,
  limit: number = 50
): Promise<SyncRecentResult> {
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
      return await getRecentlyPlayed(access, limit, before ? { before } : undefined);
    } catch (err) {
      if (err instanceof Error && err.message === "EXPIRED_TOKEN") {
        const fresh = await forceRefreshSpotifyAccessToken(supabase);
        if (!fresh) throw err;
        token = fresh;
        return await getRecentlyPlayed(fresh, limit, before ? { before } : undefined);
      }
      throw err;
    }
  };

  const collected: { track?: Record<string, unknown>; played_at?: string }[] = [];
  const seen = new Set<string>();
  let before: number | undefined;
  for (let page = 0; page < 3; page++) {
    const data = await loadPage(token, before);
    const batch = data?.items ?? [];
    for (const entry of batch) {
      const key = `${String(entry.track?.id ?? "")}|${entry.played_at ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(entry);
    }
    const cursor = data?.cursors?.before;
    if (!batch.length || batch.length < limit || !cursor) break;
    before = Number(cursor);
    if (!Number.isFinite(before)) break;
  }

  const items = collected;

  const runImageBackfill = async () => {
    try {
      return await enrichArtistsMissingImages(supabase, token);
    } catch (e) {
      console.warn("[sync-recent] enrich artist images", e);
      return 0;
    }
  };

  if (!items?.length) {
    const ie = await runImageBackfill();
    return {
      synced: 0,
      skipped: 0,
      polled: 0,
      ok: true,
      images_enriched: ie,
    };
  }

  let inserted = 0;
  let skipped = 0;

  for (const entry of items) {
    const track = entry.track as Record<string, unknown> | undefined;
    const playedAt = entry.played_at;
    if (!track?.id || !playedAt || typeof playedAt !== "string") {
      skipped++;
      continue;
    }

    type ArtistStub = {
      id: string;
      name: string;
      images?: { url?: string }[];
      external_urls?: { spotify?: string };
    };
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

    /** Prefer Spotify id when present so legacy base_script upsert stays stable. */
    const spotifyArtistKey =
      primaryArtist?.id ||
      String(track.name ?? "unknown")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_");

    const artistName = primaryArtist.name || "Unknown";

    // Recently Played casi nunca trae images del artista; usamos portada del álbum.
    const artistImage =
      primaryArtist.images?.[0]?.url ?? album?.images?.[0]?.url ?? null;

    const artistDbId = await upsertArtistAndGetDbId(supabase, {
      spotifyArtistId: spotifyArtistKey,
      name: artistName,
      image_url: artistImage,
      spotify_url: primaryArtist.external_urls?.spotify ?? null,
    });

    if (!artistDbId) {
      console.error("[sync-recent] artist upsert failed", spotifyArtistKey);
      skipped++;
      continue;
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
      if (!albumDbId && album?.id) {
        console.warn(
          "[sync-recent] album upsert skipped; track/play without album",
          album.name
        );
      }
    }

    const dbTrackId = await upsertTrackAndGetPk(supabase, {
      spotifyTrackId: track.id as string,
      name: track.name as string,
      artist_id: artistDbId,
      album_id: albumDbId,
      duration_ms:
        typeof track.duration_ms === "number" ? track.duration_ms : 0,
      explicit: Boolean(track.explicit),
      preview_url: (track.preview_url as string | null) ?? null,
      spotify_url:
        (track.external_urls as { spotify?: string } | undefined)?.spotify ??
        null,
      popularity:
        typeof track.popularity === "number"
          ? (track.popularity as number)
          : null,
    });

    if (!dbTrackId) {
      console.error("[sync-recent] tracks upsert failed", track.id);
      skipped++;
      continue;
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

    if (insErr?.code === "23505") {
      skipped++;
    } else if (insErr) {
      console.error("[sync-recent] insert play", insErr);
      skipped++;
    } else {
      inserted++;
    }
  }

  const imagesEnriched = await runImageBackfill();

  return {
    synced: inserted,
    skipped,
    polled: items.length,
    ok: true,
    images_enriched: imagesEnriched,
  };
}
