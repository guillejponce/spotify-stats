import { createServerSupabaseClient } from "./supabase";
import { ratingSongKey, type TrackIdentityRow } from "./rating-identity";
import { normalizeChartInput } from "./chordpro";
import type { ChartSearchHit, ChartTrack, SongChart } from "@/types/charts";

export type { ChartSearchHit, ChartTrack, SongChart };

function isMissingChartsTable(err: { code?: string; message?: string }): boolean {
  const msg = err.message || "";
  return err.code === "PGRST205" || /song_charts/i.test(msg);
}

function numeric(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function mapChart(row: Record<string, unknown>): SongChart {
  return {
    id: String(row.id ?? ""),
    track_id: String(row.track_id ?? ""),
    title: String(row.title ?? ""),
    artist_name: String(row.artist_name ?? ""),
    content: String(row.content ?? ""),
    original_key: row.original_key == null ? null : String(row.original_key),
    capo: numeric(row.capo, 0),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

async function resolveEquivalentTrackIds(trackId: string): Promise<string[]> {
  const supabase = createServerSupabaseClient();
  const { data: rpcIds, error: rpcError } = await supabase.rpc(
    "get_equivalent_track_ids",
    { p_track_id: trackId },
  );

  if (!rpcError && Array.isArray(rpcIds) && rpcIds.length > 0) {
    return rpcIds.map(String);
  }

  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("id, name, artist_id")
    .eq("id", trackId)
    .maybeSingle();

  if (trackError || !track) return [trackId];

  const key = ratingSongKey(
    String(track.name),
    track.artist_id ? String(track.artist_id) : null,
  );
  let query = supabase.from("tracks").select("id, name, artist_id");
  if (track.artist_id) query = query.eq("artist_id", track.artist_id);
  else query = query.is("artist_id", null);

  const { data: matches } = await query;
  const ids = (matches || [])
    .filter(
      (t: TrackIdentityRow) =>
        ratingSongKey(String(t.name), t.artist_id ? String(t.artist_id) : null) ===
        key,
    )
    .map((t: TrackIdentityRow) => String(t.id));

  return ids.length > 0 ? ids : [trackId];
}

export async function fetchTrackForChart(
  trackId: string,
): Promise<ChartTrack | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("tracks")
    .select(
      `id, name, artist_id, album_id,
       artists(name, image_url),
       albums(name, image_url)`,
    )
    .eq("id", trackId)
    .maybeSingle();

  if (error || !data) return null;
  const artists = data.artists as
    | { name?: string; image_url?: string | null }
    | { name?: string; image_url?: string | null }[]
    | null;
  const albums = data.albums as
    | { name?: string; image_url?: string | null }
    | { name?: string; image_url?: string | null }[]
    | null;
  const artist = Array.isArray(artists) ? artists[0] : artists;
  const album = Array.isArray(albums) ? albums[0] : albums;

  return {
    id: String(data.id),
    name: String(data.name ?? ""),
    artist_id: data.artist_id ? String(data.artist_id) : null,
    artist_name: artist?.name ? String(artist.name) : null,
    album_name: album?.name ? String(album.name) : null,
    image_url: album?.image_url
      ? String(album.image_url)
      : artist?.image_url
        ? String(artist.image_url)
        : null,
  };
}

export async function getSongChart(
  trackId: string,
): Promise<SongChart | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_song_chart", {
    p_track_id: trackId,
  });

  if (!error && data) {
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row === "object" && (row as { id?: unknown }).id) {
      return mapChart(row as Record<string, unknown>);
    }
  }

  const ids = await resolveEquivalentTrackIds(trackId);
  const { data: rows, error: tableError } = await supabase
    .from("song_charts")
    .select(
      "id, track_id, title, artist_name, content, original_key, capo, created_at, updated_at",
    )
    .in("track_id", ids)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (tableError) {
    if (isMissingChartsTable(tableError)) return null;
    throw tableError;
  }
  const first = Array.isArray(rows) ? rows[0] : null;
  return first ? mapChart(first as Record<string, unknown>) : null;
}

export async function upsertSongChart(input: {
  trackId: string;
  content: string;
  title?: string | null;
  artistName?: string | null;
  originalKey?: string | null;
  capo?: number | null;
}): Promise<SongChart> {
  const track = await fetchTrackForChart(input.trackId);
  if (!track) throw new Error("No existe esa canción en el catálogo");
  if (!input.content.trim()) throw new Error("La cifra está vacía");

  const title = (input.title ?? track.name).trim();
  const artistName = (input.artistName ?? track.artist_name ?? "").trim();
  const capo = Math.max(0, Math.min(12, Math.floor(input.capo ?? 0)));
  const content = normalizeChartInput(input.content, {
    title,
    artist: artistName,
    key: input.originalKey,
    capo,
  });

  const supabase = createServerSupabaseClient();
  const existing = await getSongChart(input.trackId);
  const trackId = existing?.track_id ?? input.trackId;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("song_charts")
    .upsert(
      {
        track_id: trackId,
        title,
        artist_name: artistName,
        content,
        original_key: input.originalKey?.trim() || null,
        capo,
        updated_at: now,
      },
      { onConflict: "track_id" },
    )
    .select(
      "id, track_id, title, artist_name, content, original_key, capo, created_at, updated_at",
    )
    .single();

  if (error) {
    if (isMissingChartsTable(error)) {
      throw new Error(
        "Falta ejecutar supabase/song_charts.sql en el SQL Editor de Supabase",
      );
    }
    throw error;
  }
  return mapChart(data as Record<string, unknown>);
}

export async function searchTracksForChart(
  query: string,
  limit = 20,
): Promise<ChartSearchHit[]> {
  const supabase = createServerSupabaseClient();
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "search_tracks_for_chart",
    { search_query: query, result_limit: limit },
  );

  if (!rpcError && rpcData) {
    return (Array.isArray(rpcData) ? rpcData : []).map(
      (r: Record<string, unknown>) => ({
        id: String(r.id ?? ""),
        name: String(r.name ?? ""),
        artist_id: r.artist_id ? String(r.artist_id) : null,
        artist_name: r.artist_name ? String(r.artist_name) : null,
        album_name: r.album_name ? String(r.album_name) : null,
        image_url: r.image_url ? String(r.image_url) : null,
        has_chart: Boolean(r.has_chart),
      }),
    );
  }

  const { data, error } = await supabase
    .from("tracks")
    .select(
      `id, name, artist_id, album_id,
       artists(name, image_url),
       albums(name, image_url)`,
    )
    .ilike("name", `%${query}%`)
    .limit(limit);

  if (error) throw error;
  const rows = data || [];
  const ids = rows.map((t: { id: unknown }) => String(t.id));
  const { data: charts } = await supabase
    .from("song_charts")
    .select("track_id")
    .in("track_id", ids.length > 0 ? ids : ["__none__"]);
  const have = new Set((charts || []).map((c: { track_id: string }) => c.track_id));

  return rows.map((t: Record<string, unknown>) => {
    const artists = t.artists as
      | { name?: string; image_url?: string | null }
      | { name?: string; image_url?: string | null }[]
      | null;
    const albums = t.albums as
      | { name?: string; image_url?: string | null }
      | { name?: string; image_url?: string | null }[]
      | null;
    const artist = Array.isArray(artists) ? artists[0] : artists;
    const album = Array.isArray(albums) ? albums[0] : albums;
    return {
      id: String(t.id ?? ""),
      name: String(t.name ?? ""),
      artist_id: t.artist_id ? String(t.artist_id) : null,
      artist_name: artist?.name ? String(artist.name) : null,
      album_name: album?.name ? String(album.name) : null,
      image_url: album?.image_url
        ? String(album.image_url)
        : artist?.image_url
          ? String(artist.image_url)
          : null,
      has_chart: have.has(String(t.id)),
    };
  });
}

export async function listRecentCharts(limit = 12): Promise<SongChart[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("song_charts")
    .select(
      "id, track_id, title, artist_name, content, original_key, capo, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingChartsTable(error)) return [];
    throw error;
  }
  return (data || []).map((row) => mapChart(row as Record<string, unknown>));
}
