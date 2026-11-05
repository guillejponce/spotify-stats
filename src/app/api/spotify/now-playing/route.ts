import { NextResponse } from "next/server";
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
import { getTrackHarmony } from "@/lib/track-harmony";
import { requireUser } from "@/lib/auth";
import type { UserCtx } from "@/lib/user-context";
import { loadLastfmAccount, syncLastfmForUser } from "@/lib/lastfm-sync";

export const dynamic = "force-dynamic";

/** Last.fm no da progreso ni pausa: solo "sonando ahora" sí/no. `undefined` = sin Last.fm. */
async function lastfmNowPlaying(ctx: UserCtx) {
  const account = await loadLastfmAccount(ctx.db, ctx.userId);
  if (!account) return undefined;
  await syncLastfmForUser(ctx, { minIntervalMs: 30_000 });

  const { data: np } = await ctx.db
    .from("now_playing")
    .select("is_playing, track_id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!np?.is_playing || !np.track_id) return null;

  const [{ data: track }, { data: rating }] = await Promise.all([
    ctx.db
      .from("tracks")
      .select("id, name, duration_ms, artist_id, artists(name), albums(name, image_url)")
      .eq("id", np.track_id)
      .maybeSingle(),
    ctx.db
      .from("song_ratings")
      .select("rating")
      .eq("user_id", ctx.userId)
      .eq("track_id", np.track_id)
      .maybeSingle(),
  ]);
  if (!track) return null;
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const artist = one(track.artists as { name: string } | { name: string }[] | null);
  const album = one(track.albums as { name: string; image_url: string | null } | { name: string; image_url: string | null }[] | null);

  return {
    track_id: track.id,
    artist_id: track.artist_id,
    track_name: track.name,
    artist_name: artist?.name ?? "",
    album_name: album?.name ?? null,
    album_art_url: album?.image_url ?? null,
    duration_ms: track.duration_ms ?? 0,
    progress_ms: 0,
    is_playing: true,
    current_rating: (rating?.rating as number | undefined) ?? null,
    key: null,
    tempo: null,
  };
}

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { ctx } = auth;
  try {
    const supabase = ctx.db;
    let accessToken = await getSpotifyAccessToken(ctx);

    if (!accessToken) {
      const fromLastfm = await lastfmNowPlaying(ctx);
      if (fromLastfm !== undefined) return NextResponse.json({ nowPlaying: fromLastfm, source: "lastfm" });
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
        const fresh = await forceRefreshSpotifyAccessToken(ctx);
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
        .eq("user_id", ctx.userId);

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
        user_id: ctx.userId,
        track_id: dbTrackId,
        artist_id: artistDbId,
        album_id: albumDbId,
        is_playing: data.is_playing,
        progress_ms: data.progress_ms || 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    let currentRating: number | null = null;
    const [ratingRow, harmony] = await Promise.all([
      dbTrackId
        ? supabase
            .from("song_ratings")
            .select("rating")
            .eq("user_id", ctx.userId)
            .eq("track_id", dbTrackId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      getTrackHarmony(ctx, {
        accessToken,
        spotifyTrackId: typeof track.id === "string" ? track.id : null,
        dbTrackId,
        previewUrl: typeof track.preview_url === "string" ? track.preview_url : null,
      }),
    ]);
    if (ratingRow.data) currentRating = ratingRow.data.rating as number;

    const nowPlaying = {
        track_id: dbTrackId,
        artist_id: artistDbId,
        track_name: track.name,
        artist_name: track.artists?.map((a: { name: string }) => a.name).join(", "),
        album_name: track.album?.name,
        album_art_url: track.album?.images?.[0]?.url || null,
        duration_ms: track.duration_ms,
        progress_ms: data.progress_ms || 0,
        is_playing: data.is_playing,
        current_rating: currentRating,
        key: harmony.key,
        tempo: harmony.tempo,
        ...(process.env.NODE_ENV !== "production"
          ? { harmony_debug: harmony.debug }
          : {}),
    };

    return NextResponse.json({ nowPlaying });
  } catch (error) {
    console.error("Now playing error:", error);
    return NextResponse.json(
      { error: "Failed to fetch now playing" },
      { status: 500 }
    );
  }
}
