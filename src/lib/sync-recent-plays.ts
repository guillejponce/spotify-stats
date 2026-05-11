import type { SupabaseClient } from "@supabase/supabase-js";
import { getRecentlyPlayed } from "@/lib/spotify";
import { getSpotifyAccessToken } from "@/lib/spotify-token";

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

    const artistId =
      primaryArtist?.id ||
      String(track.name ?? "unknown")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_");

    if (primaryArtist?.name) {
      await supabase.from("artists").upsert(
        {
          id: artistId,
          name: primaryArtist.name,
          image_url: primaryArtist.images?.[0]?.url ?? null,
          spotify_url: primaryArtist.external_urls?.spotify ?? null,
        },
        { onConflict: "id" }
      );
    }

    const albumId = album?.id ?? null;
    if (album?.id && album?.name) {
      await supabase.from("albums").upsert(
        {
          id: album.id,
          name: album.name,
          artist_id: artistId,
          image_url: album.images?.[0]?.url ?? null,
          release_date: album.release_date ?? null,
          album_type: album.album_type ?? null,
          spotify_url: album.external_urls?.spotify ?? null,
        },
        { onConflict: "id" }
      );
    }

    await supabase.from("tracks").upsert(
      {
        id: track.id as string,
        name: track.name as string,
        artist_id: artistId,
        album_id: albumId,
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
      },
      { onConflict: "id" }
    );

    const playedAtTs = new Date(playedAt).toISOString();
    const dur =
      typeof track.duration_ms === "number" ? track.duration_ms : 180_000;

    const { error: insErr } = await supabase.from("plays").insert({
      track_id: track.id as string,
      artist_id: artistId,
      album_id: albumId,
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
