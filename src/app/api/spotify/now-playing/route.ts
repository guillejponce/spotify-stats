import { NextResponse } from "next/server";
import { getCurrentlyPlaying } from "@/lib/spotify";
import { createServerSupabaseClient } from "@/lib/supabase";
import {
  forceRefreshSpotifyAccessToken,
  getSpotifyAccessToken,
} from "@/lib/spotify-token";
import { upsertTrackAndGetPk } from "@/lib/spotify-tracks-db";
import {
  upsertArtistAndGetDbId,
  upsertAlbumAndGetDbId,
} from "@/lib/spotify-graph-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    let accessToken = await getSpotifyAccessToken(supabase);

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authenticated with Spotify" },
        { status: 401 }
      );
    }

    let data;
    try {
      data = await getCurrentlyPlaying(accessToken);
    } catch (err) {
      if (err instanceof Error && err.message === "EXPIRED_TOKEN") {
        const fresh = await forceRefreshSpotifyAccessToken(supabase);
        if (!fresh) {
          return NextResponse.json(
            {
              error:
                "Spotify access expired; reconnect with “Connect Spotify” in the dashboard.",
            },
            { status: 401 }
          );
        }
        accessToken = fresh;
        data = await getCurrentlyPlaying(accessToken);
      } else {
        throw err;
      }
    }

    if (!data || !data.item) {
      await supabase
        .from("now_playing")
        .update({ is_playing: false, updated_at: new Date().toISOString() })
        .eq("id", 1);

      return NextResponse.json({ nowPlaying: null });
    }

    const track = data.item;
    const a0 = track.artists?.[0];
    const spotifyArtistKey =
      a0?.id ||
      a0?.name?.toLowerCase().replace(/[^a-z0-9]/g, "_") ||
      "unknown";

    const artistDbId = await upsertArtistAndGetDbId(supabase, {
      spotifyArtistId: spotifyArtistKey,
      name: a0?.name || "Unknown",
      image_url: a0?.images?.[0]?.url ?? null,
      spotify_url: a0?.external_urls?.spotify ?? null,
    });

    if (!artistDbId) {
      console.error("[now-playing] artist upsert failed", spotifyArtistKey);
      return NextResponse.json(
        { error: "Failed to persist artist row" },
        { status: 500 }
      );
    }

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
      duration_ms: track.duration_ms,
      explicit: track.explicit || false,
      preview_url: track.preview_url || null,
      spotify_url: track.external_urls?.spotify || null,
      popularity: track.popularity ?? null,
    });

    if (!dbTrackId) {
      console.error("[now-playing] tracks upsert failed", track.id);
      return NextResponse.json(
        { error: "Failed to persist track row" },
        { status: 500 }
      );
    }

    await supabase.from("now_playing").upsert(
      {
        id: 1,
        track_id: dbTrackId,
        artist_id: artistDbId,
        album_id: albumDbId,
        is_playing: data.is_playing,
        progress_ms: data.progress_ms || 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    return NextResponse.json({
      nowPlaying: {
        track_name: track.name,
        artist_name: track.artists?.map((a: { name: string }) => a.name).join(", "),
        album_name: track.album?.name,
        album_art_url: track.album?.images?.[0]?.url || null,
        duration_ms: track.duration_ms,
        progress_ms: data.progress_ms || 0,
        is_playing: data.is_playing,
      },
    });
  } catch (error) {
    console.error("Now playing error:", error);
    return NextResponse.json(
      { error: "Failed to fetch now playing" },
      { status: 500 }
    );
  }
}
