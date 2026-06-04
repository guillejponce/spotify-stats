-- ============================================================================
-- SONG RATINGS: tabla + índices + RPCs optimizadas
-- Ejecutar en Supabase SQL Editor después de tener `tracks`, `artists`, `albums`.
-- ============================================================================

-- 1) TABLA PRINCIPAL
CREATE TABLE IF NOT EXISTS song_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id text NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 10),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT song_ratings_track_unique UNIQUE (track_id)
);

-- 2) ÍNDICES para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_song_ratings_rating_desc
  ON song_ratings (rating DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_song_ratings_updated_desc
  ON song_ratings (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_song_ratings_track_id
  ON song_ratings (track_id);

-- 3) RPC: Dashboard de ratings (una sola query, todo el cálculo en DB)
CREATE OR REPLACE FUNCTION public.get_ratings_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  result jsonb;
  total_rated bigint;
  avg_rating numeric;
  top_tracks_json jsonb;
  top_albums_json jsonb;
  top_artists_json jsonb;
  recent_json jsonb;
  distribution_json jsonb;
BEGIN
  SELECT COUNT(*), COALESCE(ROUND(AVG(rating)::numeric, 1), 0)
  INTO total_rated, avg_rating
  FROM song_ratings;

  -- Top canciones (las mejor puntuadas)
  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO top_tracks_json
  FROM (
    SELECT
      sr.track_id,
      sr.rating,
      sr.updated_at,
      t.name AS track_name,
      ar.name AS artist_name,
      al.name AS album_name,
      t.album_id,
      t.artist_id,
      COALESCE(al.image_url, ar.image_url) AS image_url
    FROM song_ratings sr
    INNER JOIN tracks t ON t.id = sr.track_id
    LEFT JOIN artists ar ON ar.id = t.artist_id
    LEFT JOIN albums al ON al.id = t.album_id
    ORDER BY sr.rating DESC, sr.updated_at DESC
    LIMIT 20
  ) q;

  -- Top álbumes (promedio de canciones)
  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO top_albums_json
  FROM (
    SELECT
      t.album_id,
      al.name AS album_name,
      ar.name AS artist_name,
      al.image_url,
      ROUND(AVG(sr.rating)::numeric, 1) AS avg_rating,
      COUNT(*)::integer AS rated_tracks
    FROM song_ratings sr
    INNER JOIN tracks t ON t.id = sr.track_id
    INNER JOIN albums al ON al.id = t.album_id
    LEFT JOIN artists ar ON ar.id = t.artist_id
    WHERE t.album_id IS NOT NULL
    GROUP BY t.album_id, al.name, ar.name, al.image_url
    ORDER BY AVG(sr.rating) DESC, COUNT(*) DESC
    LIMIT 20
  ) q;

  -- Top artistas (promedio de canciones)
  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO top_artists_json
  FROM (
    SELECT
      t.artist_id,
      ar.name AS artist_name,
      COALESCE(ar.image_url, cover.fallback_img) AS image_url,
      ROUND(AVG(sr.rating)::numeric, 1) AS avg_rating,
      COUNT(*)::integer AS rated_tracks
    FROM song_ratings sr
    INNER JOIN tracks t ON t.id = sr.track_id
    INNER JOIN artists ar ON ar.id = t.artist_id
    LEFT JOIN LATERAL (
      SELECT al2.image_url AS fallback_img
      FROM albums al2
      WHERE al2.artist_id = ar.id AND al2.image_url IS NOT NULL
      LIMIT 1
    ) cover ON TRUE
    WHERE t.artist_id IS NOT NULL
    GROUP BY t.artist_id, ar.name, COALESCE(ar.image_url, cover.fallback_img)
    ORDER BY AVG(sr.rating) DESC, COUNT(*) DESC
    LIMIT 20
  ) q;

  -- Últimas valoraciones
  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO recent_json
  FROM (
    SELECT
      sr.track_id,
      sr.rating,
      sr.updated_at,
      t.name AS track_name,
      ar.name AS artist_name,
      al.name AS album_name,
      t.album_id,
      t.artist_id,
      COALESCE(al.image_url, ar.image_url) AS image_url
    FROM song_ratings sr
    INNER JOIN tracks t ON t.id = sr.track_id
    LEFT JOIN artists ar ON ar.id = t.artist_id
    LEFT JOIN albums al ON al.id = t.album_id
    ORDER BY sr.updated_at DESC
    LIMIT 10
  ) q;

  -- Distribución 1-10
  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.rating), '[]'::jsonb)
  INTO distribution_json
  FROM (
    SELECT gs.r AS rating, COALESCE(c.cnt, 0)::integer AS count
    FROM generate_series(1, 10) gs(r)
    LEFT JOIN (
      SELECT rating, COUNT(*)::integer AS cnt
      FROM song_ratings
      GROUP BY rating
    ) c ON c.rating = gs.r
    ORDER BY gs.r
  ) q;

  RETURN jsonb_build_object(
    'totalRated', total_rated,
    'avgRating', avg_rating,
    'topTracks', top_tracks_json,
    'topAlbums', top_albums_json,
    'topArtists', top_artists_json,
    'recentRatings', recent_json,
    'distribution', distribution_json
  );
END;
$$;

-- 4) RPC: Listar ratings paginados con sort
CREATE OR REPLACE FUNCTION public.get_rated_tracks(
  sort_mode text DEFAULT 'rating_desc',
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 36
)
RETURNS TABLE (
  track_id text,
  rating smallint,
  created_at timestamptz,
  updated_at timestamptz,
  track_name text,
  artist_name text,
  album_name text,
  album_id text,
  artist_id text,
  image_url text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    sr.track_id,
    sr.rating,
    sr.created_at,
    sr.updated_at,
    t.name AS track_name,
    ar.name AS artist_name,
    al.name AS album_name,
    t.album_id,
    t.artist_id,
    COALESCE(al.image_url, ar.image_url) AS image_url
  FROM song_ratings sr
  INNER JOIN tracks t ON t.id = sr.track_id
  LEFT JOIN artists ar ON ar.id = t.artist_id
  LEFT JOIN albums al ON al.id = t.album_id
  ORDER BY
    CASE WHEN sort_mode = 'rating_desc' THEN sr.rating END DESC NULLS LAST,
    CASE WHEN sort_mode = 'rating_asc' THEN sr.rating END ASC NULLS LAST,
    CASE WHEN sort_mode = 'recent' THEN sr.updated_at END DESC NULLS LAST,
    CASE WHEN sort_mode = 'name' THEN t.name END ASC NULLS LAST,
    sr.updated_at DESC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
$$;

-- 5) RPC: Buscar tracks para valorar (con rating actual si existe)
CREATE OR REPLACE FUNCTION public.search_tracks_for_rating(
  search_query text,
  result_limit integer DEFAULT 20
)
RETURNS TABLE (
  id text,
  name text,
  artist_name text,
  album_name text,
  image_url text,
  current_rating smallint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    t.id,
    t.name,
    ar.name AS artist_name,
    al.name AS album_name,
    COALESCE(al.image_url, ar.image_url) AS image_url,
    sr.rating AS current_rating
  FROM tracks t
  LEFT JOIN artists ar ON ar.id = t.artist_id
  LEFT JOIN albums al ON al.id = t.album_id
  LEFT JOIN song_ratings sr ON sr.track_id = t.id
  WHERE t.name ILIKE '%' || trim(search_query) || '%'
     OR ar.name ILIKE '%' || trim(search_query) || '%'
  ORDER BY
    (sr.rating IS NOT NULL) DESC,
    t.name ASC
  LIMIT greatest(least(result_limit, 50), 1);
$$;

-- 6) PERMISOS
GRANT ALL ON song_ratings TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ratings_dashboard() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_rated_tracks(text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_tracks_for_rating(text, integer) TO anon, authenticated, service_role;
