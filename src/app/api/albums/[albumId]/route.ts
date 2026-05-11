import { NextRequest, NextResponse } from "next/server";
import {
  fetchAlbumFromDb,
  fetchAlbumPeriodStats,
  fetchTrackPlayCountsInPeriod,
} from "@/lib/album-browse";
import { createServerSupabaseClient } from "@/lib/supabase";
import { forceRefreshSpotifyAccessToken, getSpotifyAccessToken } from "@/lib/spotify-token";
import { getSpotifyAlbumWithTracks } from "@/lib/spotify";
import type { TimeFilter, TimeFilterParams } from "@/types/database";

export const dynamic = "force-dynamic";

function parseParams(sp: URLSearchParams): TimeFilterParams {
  const filter = (sp.get("filter") || "all") as TimeFilter;
  const year = sp.get("year") ? Number(sp.get("year")) : undefined;
  const month = sp.get("month") ? Number(sp.get("month")) : undefined;
  return { filter, year, month };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { albumId: string } }
) {
  try {
    const albumId = decodeURIComponent(params.albumId);
    if (!albumId) {
      return NextResponse.json({ error: "Missing album" }, { status: 400 });
    }

    const filterParams = parseParams(request.nextUrl.searchParams);
    const supabase = createServerSupabaseClient();

    const [dbAlbum, stats] = await Promise.all([
      fetchAlbumFromDb(albumId),
      fetchAlbumPeriodStats(filterParams, albumId),
    ]);

    let accessToken = await getSpotifyAccessToken(supabase);
    let spotifyBundle: Awaited<ReturnType<typeof getSpotifyAlbumWithTracks>> | null =
      null;

    if (accessToken) {
      try {
        spotifyBundle = await getSpotifyAlbumWithTracks(accessToken, albumId);
      } catch (err) {
        if (err instanceof Error && err.message === "EXPIRED_TOKEN") {
          const fresh = await forceRefreshSpotifyAccessToken(supabase);
          if (fresh) {
            try {
              spotifyBundle = await getSpotifyAlbumWithTracks(fresh, albumId);
            } catch {
              spotifyBundle = null;
            }
          }
        } else {
          spotifyBundle = null;
        }
      }
    }

    type TrackOut = {
      id: string;
      name: string;
      duration_ms: number;
      track_number: number;
      play_count: number;
      total_ms_played: number;
      listened: boolean;
    };

    let tracks: TrackOut[] = [];
    let spotifyFullTracklist = false;
    let albumPayload: {
      id: string;
      name: string;
      image_url: string | null;
      spotify_url: string | null;
      artist_name: string | null;
    };

    if (spotifyBundle) {
      spotifyFullTracklist = true;
      const ids = spotifyBundle.tracks.map((t) => t.id);
      const counts = await fetchTrackPlayCountsInPeriod(filterParams, ids);
      const byId = new Map(counts.map((c) => [c.track_id, c]));

      tracks = spotifyBundle.tracks.map((t) => {
        const c = byId.get(t.id);
        const play_count = c?.play_count ?? 0;
        return {
          id: t.id,
          name: t.name,
          duration_ms: t.duration_ms,
          track_number: t.track_number,
          play_count,
          total_ms_played: c?.total_ms_played ?? 0,
          listened: play_count > 0,
        };
      });

      const a = spotifyBundle.album;
      const cover = a.images?.[0]?.url ?? dbAlbum?.image_url ?? null;
      albumPayload = {
        id: a.id,
        name: a.name,
        image_url: cover,
        spotify_url: a.external_urls?.spotify ?? dbAlbum?.spotify_url ?? null,
        artist_name: a.artists?.[0]?.name ?? dbAlbum?.artist_name ?? null,
      };
    } else {
      const { data: trows } = await supabase
        .from("tracks")
        .select("id, name, duration_ms")
        .eq("album_id", albumId)
        .order("name");

      const list = trows ?? [];
      const ids = list.map((r) => r.id as string);
      const counts = await fetchTrackPlayCountsInPeriod(filterParams, ids);
      const byId = new Map(counts.map((c) => [c.track_id, c]));

      tracks = list.map((r, i) => {
        const id = r.id as string;
        const c = byId.get(id);
        const play_count = c?.play_count ?? 0;
        return {
          id,
          name: r.name as string,
          duration_ms: typeof r.duration_ms === "number" ? r.duration_ms : 0,
          track_number: i + 1,
          play_count,
          total_ms_played: c?.total_ms_played ?? 0,
          listened: play_count > 0,
        };
      });

      if (!dbAlbum && tracks.length === 0) {
        return NextResponse.json({ error: "Album not found" }, { status: 404 });
      }

      albumPayload = {
        id: albumId,
        name: dbAlbum?.name ?? "Álbum",
        image_url: dbAlbum?.image_url ?? null,
        spotify_url: dbAlbum?.spotify_url ?? null,
        artist_name: dbAlbum?.artist_name ?? null,
      };
    }

    const unheard_count = tracks.filter((t) => !t.listened).length;

    return NextResponse.json({
      album: albumPayload,
      stats,
      spotify_full_tracklist: spotifyFullTracklist,
      unheard_count,
      tracks,
    });
  } catch (e) {
    console.error("[api/albums/...]", e);
    return NextResponse.json(
      { error: "Failed to load album", detail: String(e) },
      { status: 500 }
    );
  }
}
