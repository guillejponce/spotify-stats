import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertTrackAndGetPk } from "@/lib/spotify-tracks-db";
import { upsertArtistAndGetDbId, upsertAlbumAndGetDbId } from "@/lib/spotify-graph-db";

type ArtistStub = {
  id?: string;
  name?: string;
  images?: { url?: string }[];
  external_urls?: { spotify?: string };
};

type AlbumStub = {
  id?: string;
  name?: string;
  images?: { url?: string }[];
  release_date?: string;
  album_type?: string;
  external_urls?: { spotify?: string };
};

export type PersistedTrack = {
  trackId: string;
  artistId: string;
  albumId: string | null;
  durationMs: number;
};

/** Guarda artista, álbum y canción de un objeto track de la Web API de Spotify. */
export async function persistSpotifyTrackGraph(
  db: SupabaseClient,
  track: Record<string, unknown>
): Promise<PersistedTrack | null> {
  if (!track?.id) return null;

  const artists = track.artists as ArtistStub[] | undefined;
  const album = track.album as AlbumStub | undefined;
  const primaryArtist: ArtistStub = artists?.[0] ?? {
    id: `unknown_${String(track.name ?? "x").slice(0, 20)}`,
    name: "Unknown",
  };
  const spotifyArtistKey =
    primaryArtist.id ||
    String(track.name ?? "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_");

  const artistId = await upsertArtistAndGetDbId(db, {
    spotifyArtistId: spotifyArtistKey,
    name: primaryArtist.name || "Unknown",
    image_url: primaryArtist.images?.[0]?.url ?? album?.images?.[0]?.url ?? null,
    spotify_url: primaryArtist.external_urls?.spotify ?? null,
  });
  if (!artistId) {
    console.error("[track-graph] artist upsert failed", spotifyArtistKey);
    return null;
  }

  let albumId: string | null = null;
  if (album?.name) {
    albumId = await upsertAlbumAndGetDbId(db, {
      spotifyAlbumId: album.id ?? null,
      name: album.name,
      artist_db_id: artistId,
      image_url: album.images?.[0]?.url ?? null,
      release_date: album.release_date ?? null,
      album_type: album.album_type ?? null,
      spotify_url: album.external_urls?.spotify ?? null,
    });
  }

  const durationMs = typeof track.duration_ms === "number" ? track.duration_ms : 0;
  const trackId = await upsertTrackAndGetPk(db, {
    spotifyTrackId: track.id as string,
    name: track.name as string,
    artist_id: artistId,
    album_id: albumId,
    duration_ms: durationMs,
    explicit: Boolean(track.explicit),
    preview_url: (track.preview_url as string | null) ?? null,
    spotify_url: (track.external_urls as { spotify?: string } | undefined)?.spotify ?? null,
    popularity: typeof track.popularity === "number" ? (track.popularity as number) : null,
  });
  if (!trackId) {
    console.error("[track-graph] track upsert failed", track.id);
    return null;
  }

  return { trackId, artistId, albumId, durationMs };
}
