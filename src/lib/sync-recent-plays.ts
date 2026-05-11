import type { SupabaseClient } from "@supabase/supabase-js";
import { getRecentlyPlayed } from "@/lib/spotify";
import { getSpotifyAccessToken } from "@/lib/spotify-token";
import { upsertTrackAndGetPk } from "@/lib/spotify-tracks-db";
import {
  upsertArtistAndGetDbId,
  upsertAlbumAndGetDbId,
} from "@/lib/spotify-graph-db";

export type SyncRecentResult = {
  synced: number;
  skipped: number;
  polled: number;
  ok: boolean;
  error?: string;
};

/** Pull Spotify Recently Played and append `plays` rows (source live). Requires spotify_tokens. */
export async function syncRecentPlaysFromSpotify(
  supabase: SupabaseClient,
  limit: number = 50
): Promise<SyncRecentResult> {
  const token = await getSpotifyAccessToken(supabase);
  if (!token) {
    return {
      synced: 0,
      skipped: 0,
      polled: 0,
      ok: false,
      error: "no_tokens",
    };
  }

  const data = await getRecentlyPlayed(token, limit);
  const items = data?.items as
    | { track?: Record<string, unknown>; played_at?: string }[]
    | undefined;

  if (!items?.length) {
    return {
      synced: 0,
      skipped: 0,
      polled: 0,
      ok: true,
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

    const artistDbId = await upsertArtistAndGetDbId(supabase, {
      spotifyArtistId: spotifyArtistKey,
      name: artistName,
      image_url: primaryArtist.images?.[0]?.url ?? null,
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
      platform: "spotify_recent_api",
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

  return {
    synced: inserted,
    skipped,
    polled: items.length,
    ok: true,
  };
}
