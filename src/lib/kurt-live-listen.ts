import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentlyPlaying } from "@/lib/spotify";
import {
  forceRefreshSpotifyAccessToken,
  getSpotifyAccessToken,
} from "@/lib/spotify-token";
import { upsertTrackAndGetPk } from "@/lib/spotify-tracks-db";
import {
  upsertArtistAndGetDbId,
  upsertAlbumAndGetDbId,
} from "@/lib/spotify-graph-db";
import { PLAYBACK_PLATFORM_SPOTIFY_SYNC } from "@/lib/playback-platform";
import type { KurtStatus } from "@/lib/kurt-types";

type SpotifyArtist = {
  id?: string;
  name?: string;
  images?: { url?: string }[];
  external_urls?: { spotify?: string };
};

type SpotifyAlbum = {
  id?: string;
  name?: string;
  images?: { url?: string }[];
  release_date?: string;
  album_type?: string;
  external_urls?: { spotify?: string };
};

type SpotifyTrack = {
  id?: string;
  name?: string;
  duration_ms?: number;
  explicit?: boolean;
  preview_url?: string | null;
  popularity?: number | null;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
  external_urls?: { spotify?: string };
};

type CurrentlyPlaying = {
  is_playing?: boolean;
  progress_ms?: number;
  currently_playing_type?: string;
  item?: SpotifyTrack | null;
};

/**
 * Recently Played no incluye el tema actual hasta que termina o lo skipeás.
 * Si Spotify dice que hay algo sonando (o pausado con ≥30s), cuenta como día escuchado.
 */
export function overlayListenedToday(status: KurtStatus): KurtStatus {
  if (status.listened_today) return status;
  const today = status.today;
  const current_streak = status.current_streak + 1;
  return {
    ...status,
    listened_today: true,
    at_risk: false,
    kurt_down: false,
    current_streak,
    longest_streak: Math.max(status.longest_streak, current_streak),
    last_listen_day: today,
    total_listen_days: status.total_listen_days + 1,
    recent: status.recent.map((day) =>
      day.date === today ? { ...day, listened: true } : day,
    ),
  };
}

export async function creditLiveListenIfNeeded(
  supabase: SupabaseClient,
): Promise<boolean> {
  let token = await getSpotifyAccessToken(supabase);
  if (!token) return false;

  let data: CurrentlyPlaying | null;
  try {
    data = (await getCurrentlyPlaying(token)) as CurrentlyPlaying | null;
  } catch (err) {
    if (err instanceof Error && err.message === "EXPIRED_TOKEN") {
      const fresh = await forceRefreshSpotifyAccessToken(supabase);
      if (!fresh) return false;
      data = (await getCurrentlyPlaying(fresh)) as CurrentlyPlaying | null;
    } else {
      throw err;
    }
  }

  const track = data?.item;
  if (
    !data ||
    !track?.id ||
    !track.name ||
    data.currently_playing_type === "episode"
  ) {
    return false;
  }

  const progress = Number(data.progress_ms) || 0;
  const playing = Boolean(data.is_playing);
  if (!playing && progress < 30_000) return false;

  const a0 = track.artists?.[0];
  const spotifyArtistKey =
    a0?.id ||
    a0?.name?.toLowerCase().replace(/[^a-z0-9]/g, "_") ||
    "unknown";

  const artistDbId = await upsertArtistAndGetDbId(supabase, {
    spotifyArtistId: spotifyArtistKey,
    name: a0?.name || "Unknown",
    image_url: a0?.images?.[0]?.url ?? track.album?.images?.[0]?.url ?? null,
    spotify_url: a0?.external_urls?.spotify ?? null,
  });
  if (!artistDbId) return false;

  let albumDbId: string | null = null;
  if (track.album?.name) {
    albumDbId = await upsertAlbumAndGetDbId(supabase, {
      spotifyAlbumId: track.album.id ?? null,
      name: track.album.name,
      artist_db_id: artistDbId,
      image_url: track.album.images?.[0]?.url ?? null,
      release_date: track.album.release_date ?? null,
      album_type: track.album.album_type ?? null,
      spotify_url: track.album.external_urls?.spotify ?? null,
    });
  }

  const dbTrackId = await upsertTrackAndGetPk(supabase, {
    spotifyTrackId: track.id,
    name: track.name,
    artist_id: artistDbId,
    album_id: albumDbId,
    duration_ms: typeof track.duration_ms === "number" ? track.duration_ms : 0,
    explicit: Boolean(track.explicit),
    preview_url: track.preview_url ?? null,
    spotify_url: track.external_urls?.spotify ?? null,
    popularity: typeof track.popularity === "number" ? track.popularity : null,
  });
  if (!dbTrackId) return false;

  const duration =
    typeof track.duration_ms === "number" && track.duration_ms > 0
      ? track.duration_ms
      : 180_000;
  const msPlayed = Math.min(duration, Math.max(progress, 30_000));
  const startedMs = Date.now() - progress;
  const playedAt = new Date(Math.max(0, startedMs)).toISOString();

  const { error } = await supabase.from("plays").insert({
    track_id: dbTrackId,
    artist_id: artistDbId,
    album_id: albumDbId,
    played_at: playedAt,
    ms_played: msPlayed,
    source: "live",
    shuffle: null,
    offline: null,
    platform: PLAYBACK_PLATFORM_SPOTIFY_SYNC,
  });

  if (error?.code === "23505") return true;
  if (error) {
    console.warn("[kurt] credit live play", error);
    return true;
  }
  return true;
}
