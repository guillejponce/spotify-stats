import { createServerSupabaseClient } from "./supabase";

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

export async function upsertRating(
  trackId: string,
  rating: number
): Promise<{ success: boolean; error?: string }> {
  if (rating < 1 || rating > 10 || !Number.isInteger(rating)) {
    return { success: false, error: "Rating must be an integer between 1 and 10" };
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("song_ratings")
    .upsert(
      { track_id: trackId, rating, updated_at: new Date().toISOString() },
      { onConflict: "track_id" }
    );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteRating(
  trackId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("song_ratings")
    .delete()
    .eq("track_id", trackId);

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

  return { tracks, total: count ?? 0 };
}

export async function getRatingsDashboard(): Promise<RatingsDashboard> {
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

  const totalRated = ratings.length;
  const avgRating =
    totalRated > 0
      ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / totalRated) * 10) / 10
      : 0;

  const topTracks = ratings.slice(0, 20);

  const recentRatings = [...ratings]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10);

  const distribution: { rating: number; count: number }[] = [];
  for (let r = 1; r <= 10; r++) {
    distribution.push({ rating: r, count: ratings.filter((x) => x.rating === r).length });
  }

  const albumMap = new Map<string, { sum: number; count: number; name: string; artist: string | null; image: string | null }>();
  for (const r of ratings) {
    if (!r.album_id) continue;
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
      avg_rating: Math.round((v.sum / v.count) * 10) / 10,
      rated_tracks: v.count,
      total_tracks: v.count,
    }))
    .sort((a, b) => b.avg_rating - a.avg_rating || b.rated_tracks - a.rated_tracks)
    .slice(0, 20);

  const artistMap = new Map<string, { sum: number; count: number; name: string; image: string | null }>();
  for (const r of ratings) {
    if (!r.artist_id) continue;
    const prev = artistMap.get(r.artist_id) ?? { sum: 0, count: 0, name: r.artist_name ?? "", image: r.image_url };
    prev.sum += r.rating;
    prev.count += 1;
    artistMap.set(r.artist_id, prev);
  }
  const topArtists: RatedArtist[] = Array.from(artistMap.entries())
    .map(([artist_id, v]) => ({
      artist_id,
      artist_name: v.name,
      image_url: v.image,
      avg_rating: Math.round((v.sum / v.count) * 10) / 10,
      rated_tracks: v.count,
    }))
    .sort((a, b) => b.avg_rating - a.avg_rating || b.rated_tracks - a.rated_tracks)
    .slice(0, 20);

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
): Promise<{ id: string; name: string; artist_name: string | null; album_name: string | null; image_url: string | null; current_rating: number | null }[]> {
  const supabase = createServerSupabaseClient();

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

  return (data || []).map((row: Record<string, unknown>) => {
    const artist = row.artists as Record<string, unknown> | null;
    const album = row.albums as Record<string, unknown> | null;
    const trackId = String(row.id);

    return {
      id: trackId,
      name: String(row.name ?? ""),
      artist_name: artist?.name ? String(artist.name) : null,
      album_name: album?.name ? String(album.name) : null,
      image_url: (album?.image_url as string | null) ?? (artist?.image_url as string | null) ?? null,
      current_rating: ratingsMap.get(trackId) ?? null,
    };
  });
}
