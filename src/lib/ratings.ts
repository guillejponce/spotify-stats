import { createServerSupabaseClient } from "./supabase";
import { ratingSongKey, type TrackIdentityRow } from "./rating-identity";

export interface SongRating {
  track_id: string;
  rating: number;
  track_name: string;
  artist_name: string | null;
  album_name: string | null;
  album_id: string | null;
  artist_id: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface RatedAlbum {
  album_id: string;
  album_name: string;
  artist_name: string | null;
  image_url: string | null;
  avg_rating: number;
  rated_tracks: number;
  total_tracks: number;
}

export interface RatedArtist {
  artist_id: string;
  artist_name: string;
  image_url: string | null;
  avg_rating: number;
  rated_tracks: number;
}

export interface RatingsDashboard {
  totalRated: number;
  avgRating: number;
  topTracks: SongRating[];
  topAlbums: RatedAlbum[];
  topArtists: RatedArtist[];
  recentRatings: SongRating[];
  distribution: { rating: number; count: number }[];
}

function numeric(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

async function resolveEquivalentTrackIds(trackId: string): Promise<string[]> {
  const supabase = createServerSupabaseClient();

  const { data: rpcIds, error: rpcError } = await supabase.rpc("get_equivalent_track_ids", {
    p_track_id: trackId,
  });

  if (!rpcError && Array.isArray(rpcIds) && rpcIds.length > 0) {
    return rpcIds.map(String);
  }

  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("id, name, artist_id")
    .eq("id", trackId)
    .maybeSingle();

  if (trackError || !track) return [trackId];

  const key = ratingSongKey(String(track.name), track.artist_id ? String(track.artist_id) : null);
  let query = supabase.from("tracks").select("id, name, artist_id");

  if (track.artist_id) {
    query = query.eq("artist_id", track.artist_id);
  } else {
    query = query.is("artist_id", null);
  }

  const { data: matches } = await query;
  const ids = (matches || [])
    .filter(
      (t: TrackIdentityRow) =>
        ratingSongKey(String(t.name), t.artist_id ? String(t.artist_id) : null) === key
    )
    .map((t: TrackIdentityRow) => String(t.id));

  return ids.length > 0 ? ids : [trackId];
}

export async function upsertRating(
  trackId: string,
  rating: number
): Promise<{ success: boolean; error?: string }> {
  if (rating < 1 || rating > 10 || !Number.isInteger(rating)) {
    return { success: false, error: "Rating must be an integer between 1 and 10" };
  }

  const supabase = createServerSupabaseClient();
  const trackIds = await resolveEquivalentTrackIds(trackId);
  const updatedAt = new Date().toISOString();

  const { error } = await supabase.from("song_ratings").upsert(
    trackIds.map((id) => ({ track_id: id, rating, updated_at: updatedAt })),
    { onConflict: "track_id" }
  );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteRating(
  trackId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();
  const trackIds = await resolveEquivalentTrackIds(trackId);

  const { error } = await supabase.from("song_ratings").delete().in("track_id", trackIds);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getRatedTracks(options: {
  search?: string;
  offset?: number;
  limit?: number;
  sortBy?: "rating_desc" | "rating_asc" | "recent" | "name";
}): Promise<{ tracks: SongRating[]; total: number }> {
  const supabase = createServerSupabaseClient();
  const { search, offset = 0, limit = 36, sortBy = "rating_desc" } = options;

  // Try RPC (much faster: single SQL with proper indexes)
  if (!search) {
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_rated_tracks", {
      sort_mode: sortBy,
      result_offset: offset,
      result_limit: limit,
    });

    if (!rpcError && rpcData) {
      const rows = Array.isArray(rpcData) ? rpcData : [];
      const tracks: SongRating[] = rows.map((r: Record<string, unknown>) => mapRpcSongRating(r));

      const total = await countLogicalRatedTracks(supabase);
      return { tracks, total };
    }
  }

  // Fallback: PostgREST query
  let query = supabase
    .from("song_ratings")
    .select(
      `track_id, rating, created_at, updated_at,
       tracks!inner(name, artist_id, album_id,
         artists(name, image_url),
         albums(name, image_url)
       )`,
      { count: "exact" }
    );

  if (search) {
    query = query.or(
      `tracks.name.ilike.%${search}%,tracks.artists.name.ilike.%${search}%`
    );
  }

  switch (sortBy) {
    case "rating_asc":
      query = query.order("rating", { ascending: true });
      break;
    case "recent":
      query = query.order("updated_at", { ascending: false });
      break;
    case "name":
      query = query.order("tracks(name)", { ascending: true });
      break;
    default:
      query = query.order("rating", { ascending: false }).order("updated_at", { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  const tracks: SongRating[] = (data || []).map((row: Record<string, unknown>) => {
    const track = row.tracks as Record<string, unknown> | null;
    const artist = track?.artists as Record<string, unknown> | null;
    const album = track?.albums as Record<string, unknown> | null;

    return {
      track_id: String(row.track_id),
      rating: numeric(row.rating),
      track_name: String(track?.name ?? ""),
      artist_name: artist?.name ? String(artist.name) : null,
      album_name: album?.name ? String(album.name) : null,
      album_id: track?.album_id ? String(track.album_id) : null,
      artist_id: track?.artist_id ? String(track.artist_id) : null,
      image_url: (album?.image_url as string | null) ?? (artist?.image_url as string | null) ?? null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  });

  const deduped = dedupeSongRatings(tracks);
  const total = await countLogicalRatedTracks(supabase);
  const sliced = deduped.slice(offset, offset + limit);
  return { tracks: sliced, total };
}

async function countLogicalRatedTracks(
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<number> {
  const { data, error } = await supabase
    .from("song_ratings")
    .select("track_id, tracks!inner(name, artist_id)");

  if (error) return 0;
  const keys = new Set<string>();
  for (const row of data || []) {
    const track = row.tracks as unknown as { name: string; artist_id: string | null } | null;
    if (!track) continue;
    keys.add(ratingSongKey(String(track.name), track.artist_id ? String(track.artist_id) : null));
  }
  return keys.size;
}

function dedupeSongRatings(tracks: SongRating[]): SongRating[] {
  const byKey = new Map<string, SongRating>();
  for (const t of tracks) {
    const key = ratingSongKey(t.track_name, t.artist_id);
    const prev = byKey.get(key);
    if (!prev || new Date(t.updated_at) > new Date(prev.updated_at)) {
      byKey.set(key, t);
    }
  }
  return Array.from(byKey.values());
}

export async function getRatingsDashboard(): Promise<RatingsDashboard> {
  const supabase = createServerSupabaseClient();

  // Try optimized RPC first
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_ratings_dashboard");

  if (!rpcError && rpcData) {
    const d = (typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData) as Record<string, unknown>;
    return {
      totalRated: numeric(d.totalRated),
      avgRating: numeric(d.avgRating),
      topTracks: asRpcArray(d.topTracks).map(mapRpcSongRating),
      topAlbums: asRpcArray(d.topAlbums).map((r) => ({
        album_id: String(r.album_id ?? ""),
        album_name: String(r.album_name ?? ""),
        artist_name: r.artist_name ? String(r.artist_name) : null,
        image_url: r.image_url ? String(r.image_url) : null,
        avg_rating: numeric(r.avg_rating),
        rated_tracks: numeric(r.rated_tracks),
        total_tracks: numeric(r.total_tracks, numeric(r.rated_tracks)),
      })),
      topArtists: asRpcArray(d.topArtists).map((r) => ({
        artist_id: String(r.artist_id ?? ""),
        artist_name: String(r.artist_name ?? ""),
        image_url: r.image_url ? String(r.image_url) : null,
        avg_rating: numeric(r.avg_rating),
        rated_tracks: numeric(r.rated_tracks),
      })),
      recentRatings: asRpcArray(d.recentRatings).map(mapRpcSongRating),
      distribution: asRpcArray(d.distribution).map((r) => ({
        rating: numeric(r.rating),
        count: numeric(r.count),
      })),
    };
  }

  // Fallback: compute in JS
  return getRatingsDashboardFallback();
}

function asRpcArray(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function mapRpcSongRating(r: Record<string, unknown>): SongRating {
  return {
    track_id: String(r.track_id ?? ""),
    rating: numeric(r.rating),
    track_name: String(r.track_name ?? ""),
    artist_name: r.artist_name ? String(r.artist_name) : null,
    album_name: r.album_name ? String(r.album_name) : null,
    album_id: r.album_id ? String(r.album_id) : null,
    artist_id: r.artist_id ? String(r.artist_id) : null,
    image_url: r.image_url ? String(r.image_url) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

async function getRatingsDashboardFallback(): Promise<RatingsDashboard> {
  const supabase = createServerSupabaseClient();

  const { data: allRatings, error } = await supabase
    .from("song_ratings")
    .select(
      `track_id, rating, created_at, updated_at,
       tracks!inner(name, artist_id, album_id,
         artists(name, image_url),
         albums(name, image_url)
       )`
    )
    .order("rating", { ascending: false });

  if (error) throw error;

  const ratings: SongRating[] = (allRatings || []).map((row: Record<string, unknown>) => {
    const track = row.tracks as Record<string, unknown> | null;
    const artist = track?.artists as Record<string, unknown> | null;
    const album = track?.albums as Record<string, unknown> | null;

    return {
      track_id: String(row.track_id),
      rating: numeric(row.rating),
      track_name: String(track?.name ?? ""),
      artist_name: artist?.name ? String(artist.name) : null,
      album_name: album?.name ? String(album.name) : null,
      album_id: track?.album_id ? String(track.album_id) : null,
      artist_id: track?.artist_id ? String(track.artist_id) : null,
      image_url: (album?.image_url as string | null) ?? (artist?.image_url as string | null) ?? null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  });

  const logical = dedupeSongRatings(ratings);
  const totalRated = logical.length;
  const avgRating =
    totalRated > 0
      ? Math.round((logical.reduce((s, r) => s + r.rating, 0) / totalRated) * 10) / 10
      : 0;

  const topTracks = [...logical]
    .sort((a, b) => b.rating - a.rating || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 100);

  const recentRatings = [...logical]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10);

  const distribution: { rating: number; count: number }[] = [];
  for (let r = 1; r <= 10; r++) {
    distribution.push({ rating: r, count: logical.filter((x) => x.rating === r).length });
  }

  // Fetch album metadata (album_type + total track count) for filtering
  const albumIdSet = new Set<string>();
  for (const r of logical) { if (r.album_id) albumIdSet.add(r.album_id); }
  const albumIds = Array.from(albumIdSet);
  const albumMeta = new Map<string, { album_type: string | null; total_tracks: number }>();
  if (albumIds.length > 0) {
    const { data: albumRows } = await supabase
      .from("albums")
      .select("id, album_type")
      .in("id", albumIds);
    for (const a of albumRows || []) {
      albumMeta.set(String(a.id), { album_type: a.album_type as string | null, total_tracks: 0 });
    }
    const { data: trackCountRows } = await supabase
      .from("tracks")
      .select("album_id")
      .in("album_id", albumIds);
    for (const t of trackCountRows || []) {
      const aid = String(t.album_id);
      const m = albumMeta.get(aid);
      if (m) m.total_tracks += 1;
    }
  }

  const albumMap = new Map<string, { sum: number; count: number; name: string; artist: string | null; image: string | null }>();
  for (const r of logical) {
    if (!r.album_id) continue;
    const meta = albumMeta.get(r.album_id);
    const atype = meta?.album_type;
    const totalTracks = meta?.total_tracks ?? 0;
    if (atype === "single") continue;
    if (atype == null && totalTracks < 4) continue;
    const prev = albumMap.get(r.album_id) ?? { sum: 0, count: 0, name: r.album_name ?? "", artist: r.artist_name, image: r.image_url };
    prev.sum += r.rating;
    prev.count += 1;
    albumMap.set(r.album_id, prev);
  }
  const topAlbums: RatedAlbum[] = Array.from(albumMap.entries())
    .map(([album_id, v]) => ({
      album_id,
      album_name: v.name,
      artist_name: v.artist,
      image_url: v.image,
      avg_rating: v.sum / v.count,
      rated_tracks: v.count,
      total_tracks: albumMeta.get(album_id)?.total_tracks ?? v.count,
    }))
    .sort((a, b) => b.avg_rating - a.avg_rating || b.rated_tracks - a.rated_tracks)
    .slice(0, 100);

  const artistMap = new Map<string, { sum: number; count: number; name: string; image: string | null }>();
  for (const r of logical) {
    if (!r.artist_id) continue;
    const prev = artistMap.get(r.artist_id) ?? { sum: 0, count: 0, name: r.artist_name ?? "", image: r.image_url };
    prev.sum += r.rating;
    prev.count += 1;
    artistMap.set(r.artist_id, prev);
  }
  const topArtists: RatedArtist[] = Array.from(artistMap.entries())
    .filter(([, v]) => v.count > 10)
    .map(([artist_id, v]) => ({
      artist_id,
      artist_name: v.name,
      image_url: v.image,
      avg_rating: Math.round((v.sum / v.count) * 10) / 10,
      rated_tracks: v.count,
    }))
    .sort((a, b) => b.avg_rating - a.avg_rating || b.rated_tracks - a.rated_tracks)
    .slice(0, 100);

  return {
    totalRated,
    avgRating,
    topTracks,
    topAlbums,
    topArtists,
    recentRatings,
    distribution,
  };
}

export async function getTrackRating(trackId: string): Promise<number | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("song_ratings")
    .select("rating")
    .eq("track_id", trackId)
    .maybeSingle();

  if (error || !data) return null;
  return numeric(data.rating);
}

export async function searchTracksForRating(
  query: string,
  limit: number = 20
): Promise<{
  id: string;
  name: string;
  artist_id: string | null;
  artist_name: string | null;
  album_name: string | null;
  image_url: string | null;
  current_rating: number | null;
}[]> {
  const supabase = createServerSupabaseClient();

  // Try RPC (single query with LEFT JOIN to song_ratings, uses indexes)
  const { data: rpcData, error: rpcError } = await supabase.rpc("search_tracks_for_rating", {
    search_query: query,
    result_limit: limit,
  });

  if (!rpcError && rpcData) {
    return (Array.isArray(rpcData) ? rpcData : []).map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      artist_id: r.artist_id ? String(r.artist_id) : null,
      artist_name: r.artist_name ? String(r.artist_name) : null,
      album_name: r.album_name ? String(r.album_name) : null,
      image_url: r.image_url ? String(r.image_url) : null,
      current_rating: r.current_rating != null ? numeric(r.current_rating) : null,
    }));
  }

  // Fallback: two queries
  const { data, error } = await supabase
    .from("tracks")
    .select(
      `id, name, artist_id, album_id,
       artists(name, image_url),
       albums(name, image_url)`
    )
    .ilike("name", `%${query}%`)
    .limit(limit);

  if (error) throw error;

  const trackIds = (data || []).map((t: Record<string, unknown>) => String(t.id));
  const { data: existingRatings } = await supabase
    .from("song_ratings")
    .select("track_id, rating")
    .in("track_id", trackIds);

  const ratingsMap = new Map<string, number>();
  for (const r of existingRatings || []) {
    ratingsMap.set(String(r.track_id), numeric(r.rating));
  }

  const mapped = (data || []).map((row: Record<string, unknown>) => {
    const artist = row.artists as Record<string, unknown> | null;
    const album = row.albums as Record<string, unknown> | null;
    const trackId = String(row.id);
    const name = String(row.name ?? "");
    const artistId = row.artist_id ? String(row.artist_id) : null;
    const key = ratingSongKey(name, artistId);

    let current_rating: number | null = ratingsMap.get(trackId) ?? null;
    if (current_rating == null) {
      ratingsMap.forEach((r, tid) => {
        if (current_rating != null) return;
        const t = (data || []).find((x: Record<string, unknown>) => String(x.id) === tid);
        if (!t) return;
        const tKey = ratingSongKey(
          String(t.name ?? ""),
          t.artist_id ? String(t.artist_id) : null
        );
        if (tKey === key) current_rating = r;
      });
    }

    return {
      id: trackId,
      name,
      artist_id: artistId,
      artist_name: artist?.name ? String(artist.name) : null,
      album_name: album?.name ? String(album.name) : null,
      image_url: (album?.image_url as string | null) ?? (artist?.image_url as string | null) ?? null,
      current_rating,
    };
  });

  const seen = new Set<string>();
  const deduped: typeof mapped = [];
  for (const row of mapped) {
    const key = ratingSongKey(row.name, row.artist_id);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

export interface RatingAlbumSearchResult {
  id: string;
  name: string;
  artist_name: string | null;
  image_url: string | null;
  track_count: number;
}

export async function searchAlbumsForRating(
  query: string,
  limit: number = 20
): Promise<RatingAlbumSearchResult[]> {
  const supabase = createServerSupabaseClient();

  const { data: rpcData, error: rpcError } = await supabase.rpc("search_albums_for_rating", {
    search_query: query,
    result_limit: limit,
  });

  if (!rpcError && rpcData) {
    return (Array.isArray(rpcData) ? rpcData : []).map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      artist_name: r.artist_name ? String(r.artist_name) : null,
      image_url: r.image_url ? String(r.image_url) : null,
      track_count: numeric(r.track_count),
    }));
  }

  const { data, error } = await supabase
    .from("albums")
    .select("id, name, image_url, artist_id, artists(name)")
    .ilike("name", `%${query}%`)
    .limit(limit);

  if (error) throw error;

  const results: RatingAlbumSearchResult[] = [];
  for (const row of data || []) {
    const artist = row.artists as { name: string } | { name: string }[] | null;
    const artistName = Array.isArray(artist) ? artist[0]?.name : artist?.name;
    const { data: trackRows } = await supabase
      .from("tracks")
      .select("name, artist_id")
      .eq("album_id", row.id);
    const uniqueKeys = new Set<string>();
    for (const t of trackRows || []) {
      uniqueKeys.add(ratingSongKey(String(t.name), t.artist_id ? String(t.artist_id) : null));
    }
    results.push({
      id: String(row.id),
      name: String(row.name ?? ""),
      artist_name: artistName ? String(artistName) : null,
      image_url: row.image_url ? String(row.image_url) : null,
      track_count: uniqueKeys.size,
    });
  }
  return results;
}

export async function getAlbumTracksForRating(
  albumId: string,
  limit: number = 200
): Promise<
  {
    id: string;
    name: string;
    artist_id: string | null;
    artist_name: string | null;
    album_name: string | null;
    image_url: string | null;
    current_rating: number | null;
  }[]
> {
  const supabase = createServerSupabaseClient();

  const { data: rpcData, error: rpcError } = await supabase.rpc("get_album_tracks_for_rating", {
    p_album_id: albumId,
    result_limit: limit,
  });

  if (!rpcError && rpcData) {
    return (Array.isArray(rpcData) ? rpcData : []).map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      artist_id: r.artist_id ? String(r.artist_id) : null,
      artist_name: r.artist_name ? String(r.artist_name) : null,
      album_name: r.album_name ? String(r.album_name) : null,
      image_url: r.image_url ? String(r.image_url) : null,
      current_rating: r.current_rating != null ? numeric(r.current_rating) : null,
    }));
  }

  const { data, error } = await supabase
    .from("tracks")
    .select(
      `id, name, artist_id,
       artists(name, image_url),
       albums(name, image_url)`
    )
    .eq("album_id", albumId)
    .order("name")
    .limit(limit);

  if (error) throw error;

  const trackIds = (data || []).map((t: Record<string, unknown>) => String(t.id));
  const { data: existingRatings } = await supabase
    .from("song_ratings")
    .select("track_id, rating, tracks!inner(name, artist_id)")
    .in("track_id", trackIds.length > 0 ? trackIds : ["__none__"]);

  const logicalRatings = new Map<string, number>();
  for (const r of existingRatings || []) {
    const track = r.tracks as unknown as { name: string; artist_id: string | null };
    const key = ratingSongKey(String(track.name), track.artist_id ? String(track.artist_id) : null);
    logicalRatings.set(key, numeric(r.rating));
  }

  const mapped = (data || []).map((row: Record<string, unknown>) => {
    const artist = row.artists as Record<string, unknown> | null;
    const album = row.albums as Record<string, unknown> | null;
    const name = String(row.name ?? "");
    const artistId = row.artist_id ? String(row.artist_id) : null;
    const key = ratingSongKey(name, artistId);

    return {
      id: String(row.id),
      name,
      artist_id: artistId,
      artist_name: artist?.name ? String(artist.name) : null,
      album_name: album?.name ? String(album.name) : null,
      image_url: (album?.image_url as string | null) ?? (artist?.image_url as string | null) ?? null,
      current_rating: logicalRatings.get(key) ?? null,
    };
  });

  const seen = new Set<string>();
  return mapped.filter((t) => {
    const key = ratingSongKey(t.name, t.artist_id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
