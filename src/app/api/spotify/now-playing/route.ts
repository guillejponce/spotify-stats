import { NextResponse } from "next/server";
import { getCurrentlyPlaying } from "@/lib/spotify";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getSpotifyAccessToken } from "@/lib/spotify-token";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const accessToken = await getSpotifyAccessToken(supabase);

    if (!accessToken) {
      return NextResponse.json(
        { error: "Not authenticated with Spotify" },
        { status: 401 }
      );
    }

    const data = await getCurrentlyPlaying(accessToken);

    if (!data || !data.item) {
      await supabase
        .from("now_playing")
        .update({ is_playing: false, updated_at: new Date().toISOString() })
        .eq("id", 1);

      return NextResponse.json({ nowPlaying: null });
    }

    const track = data.item;
    const artistId =
      track.artists?.[0]?.id ||
      track.artists?.[0]?.name?.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const albumId = track.album?.id || null;

    if (track.artists?.[0]) {
      const a = track.artists[0];
      await supabase.from("artists").upsert(
        {
          id: a.id || artistId,
          name: a.name,
          image_url: a.images?.[0]?.url || null,
          spotify_url: a.external_urls?.spotify || null,
        },
        { onConflict: "id" }
      );
    }

    if (track.album) {
      await supabase.from("albums").upsert(
        {
          id: track.album.id,
          name: track.album.name,
          artist_id: artistId,
          image_url: track.album.images?.[0]?.url || null,
          release_date: track.album.release_date || null,
          album_type: track.album.album_type || null,
          spotify_url: track.album.external_urls?.spotify || null,
        },
        { onConflict: "id" }
      );
    }

    await supabase.from("tracks").upsert(
      {
        id: track.id,
        name: track.name,
        artist_id: artistId,
        album_id: albumId,
        duration_ms: track.duration_ms,
        explicit: track.explicit || false,
        preview_url: track.preview_url || null,
        spotify_url: track.external_urls?.spotify || null,
        popularity: track.popularity || null,
      },
      { onConflict: "id" }
    );

    await supabase.from("now_playing").upsert(
      {
        id: 1,
        track_id: track.id,
        artist_id: artistId,
        album_id: albumId,
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
