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

-- Clave lógica de canción (artista principal + título normalizado)
CREATE OR REPLACE FUNCTION public.rating_song_key(track_name text, artist_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(trim(track_name)) || '|' || COALESCE(artist_id, '');
$$;

-- IDs de todas las versiones (single / álbum) de la misma canción
CREATE OR REPLACE FUNCTION public.get_equivalent_track_ids(p_track_id text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(t2.id ORDER BY t2.id), ARRAY[]::text[])
  FROM tracks t1
  INNER JOIN tracks t2
    ON public.rating_song_key(t2.name, t2.artist_id) = public.rating_song_key(t1.name, t1.artist_id)
  WHERE t1.id = p_track_id;
$$;

-- Rating vigente para una canción lógica (cualquier track_id equivalente)
CREATE OR REPLACE FUNCTION public.get_logical_track_rating(p_track_name text, p_artist_id text)
RETURNS smallint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT sr.rating
  FROM song_ratings sr
  INNER JOIN tracks t ON t.id = sr.track_id
  WHERE public.rating_song_key(t.name, t.artist_id) = public.rating_song_key(p_track_name, p_artist_id)
  ORDER BY sr.updated_at DESC
  LIMIT 1;
$$;

-- 3) RPC: Dashboard de ratings (deduplica por canción lógica)
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
  WITH logical AS (
    SELECT DISTINCT ON (public.rating_song_key(t.name, t.artist_id))
      sr.track_id,
      sr.rating,
      sr.updated_at,
      t.name AS track_name,
      t.artist_id,
      t.album_id,
      ar.name AS artist_name,
      al.name AS album_name,
      COALESCE(al.image_url, ar.image_url) AS image_url
    FROM song_ratings sr
    INNER JOIN tracks t ON t.id = sr.track_id
    LEFT JOIN artists ar ON ar.id = t.artist_id
    LEFT JOIN albums al ON al.id = t.album_id
    ORDER BY public.rating_song_key(t.name, t.artist_id), sr.updated_at DESC
  )
  SELECT COUNT(*), COALESCE(ROUND(AVG(rating)::numeric, 1), 0)
  INTO total_rated, avg_rating
  FROM logical;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO top_tracks_json
  FROM (
    SELECT
      l.track_id,
      l.rating,
      l.updated_at,
      l.track_name,
      l.artist_name,
      l.album_name,
      l.album_id,
      l.artist_id,
      l.image_url
    FROM (
      SELECT DISTINCT ON (public.rating_song_key(t.name, t.artist_id))
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
      ORDER BY public.rating_song_key(t.name, t.artist_id), sr.rating DESC, sr.updated_at DESC
    ) l
    ORDER BY l.rating DESC, l.updated_at DESC
    LIMIT 100
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO top_albums_json
  FROM (
    WITH logical_ratings AS (
      SELECT DISTINCT ON (public.rating_song_key(t.name, t.artist_id))
        public.rating_song_key(t.name, t.artist_id) AS song_key,
        sr.rating
      FROM song_ratings sr
      INNER JOIN tracks t ON t.id = sr.track_id
      ORDER BY public.rating_song_key(t.name, t.artist_id), sr.updated_at DESC
    )
    SELECT
      al.id AS album_id,
      al.name AS album_name,
      ar.name AS artist_name,
      al.image_url,
      AVG(lr.rating)::numeric AS avg_rating,
      COUNT(lr.rating)::integer AS rated_tracks,
      COUNT(t.id)::integer AS total_tracks
    FROM albums al
    LEFT JOIN artists ar ON ar.id = al.artist_id
    INNER JOIN tracks t ON t.album_id = al.id
    LEFT JOIN logical_ratings lr
      ON lr.song_key = public.rating_song_key(t.name, t.artist_id)
    WHERE (
      al.album_type = 'album'
      OR al.album_type = 'compilation'
      OR (al.album_type IS NULL
          AND (SELECT COUNT(*) FROM tracks t2 WHERE t2.album_id = al.id) >= 4)
    )
    AND NOT EXISTS (
      SELECT 1 FROM albums bigger
      WHERE bigger.id != al.id
        AND bigger.artist_id = al.artist_id
        AND (SELECT COUNT(*) FROM tracks tb WHERE tb.album_id = bigger.id)
            > (SELECT COUNT(*) FROM tracks ts WHERE ts.album_id = al.id)
        AND NOT EXISTS (
          SELECT 1 FROM tracks sub_t
          WHERE sub_t.album_id = al.id
            AND NOT EXISTS (
              SELECT 1 FROM tracks sup_t
              WHERE sup_t.album_id = bigger.id
                AND public.rating_song_key(sup_t.name, sup_t.artist_id)
                    = public.rating_song_key(sub_t.name, sub_t.artist_id)
            )
        )
    )
    GROUP BY al.id, al.name, ar.name, al.image_url
    HAVING COUNT(lr.rating) = COUNT(t.id)
    ORDER BY AVG(lr.rating) DESC, COUNT(lr.rating) DESC
    LIMIT 100
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO top_artists_json
  FROM (
    SELECT
      l.artist_id,
      l.artist_name,
      l.image_url,
      ROUND(AVG(l.rating)::numeric, 1) AS avg_rating,
      COUNT(*)::integer AS rated_tracks
    FROM (
      SELECT DISTINCT ON (public.rating_song_key(t.name, t.artist_id))
        sr.rating,
        t.artist_id,
        ar.name AS artist_name,
        COALESCE(ar.image_url, cover.fallback_img) AS image_url
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
      ORDER BY public.rating_song_key(t.name, t.artist_id), sr.updated_at DESC
    ) l
    GROUP BY l.artist_id, l.artist_name, l.image_url
    HAVING COUNT(*) > 10
    ORDER BY AVG(l.rating) DESC, COUNT(*) DESC
    LIMIT 100
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO recent_json
  FROM (
    SELECT
      l.track_id,
      l.rating,
      l.updated_at,
      l.track_name,
      l.artist_name,
      l.album_name,
      l.album_id,
      l.artist_id,
      l.image_url
    FROM (
      SELECT DISTINCT ON (public.rating_song_key(t.name, t.artist_id))
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
      ORDER BY public.rating_song_key(t.name, t.artist_id), sr.updated_at DESC
    ) l
    ORDER BY l.updated_at DESC
    LIMIT 10
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.rating), '[]'::jsonb)
  INTO distribution_json
  FROM (
    SELECT gs.r AS rating, COALESCE(c.cnt, 0)::integer AS count
    FROM generate_series(1, 10) gs(r)
    LEFT JOIN (
      SELECT l.rating, COUNT(*)::integer AS cnt
      FROM (
        SELECT DISTINCT ON (public.rating_song_key(t.name, t.artist_id))
          sr.rating
        FROM song_ratings sr
        INNER JOIN tracks t ON t.id = sr.track_id
        ORDER BY public.rating_song_key(t.name, t.artist_id), sr.updated_at DESC
      ) l
      GROUP BY l.rating
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

-- 4) RPC: Listar ratings paginados (una fila por canción lógica)
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
  WITH logical AS (
    SELECT DISTINCT ON (public.rating_song_key(t.name, t.artist_id))
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
      public.rating_song_key(t.name, t.artist_id),
      sr.updated_at DESC
  )
  SELECT
    l.track_id,
    l.rating,
    l.created_at,
    l.updated_at,
    l.track_name,
    l.artist_name,
    l.album_name,
    l.album_id,
    l.artist_id,
    l.image_url
  FROM logical l
  ORDER BY
    CASE WHEN sort_mode = 'rating_desc' THEN l.rating END DESC NULLS LAST,
    CASE WHEN sort_mode = 'rating_asc' THEN l.rating END ASC NULLS LAST,
    CASE WHEN sort_mode = 'recent' THEN l.updated_at END DESC NULLS LAST,
    CASE WHEN sort_mode = 'name' THEN l.track_name END ASC NULLS LAST,
    l.updated_at DESC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
$$;

-- Migración: Postgres no permite cambiar RETURNS TABLE con CREATE OR REPLACE
DROP FUNCTION IF EXISTS public.search_tracks_for_rating(text, integer);
DROP FUNCTION IF EXISTS public.get_album_tracks_for_rating(text, integer);

-- 5) RPC: Buscar tracks para valorar (deduplicado + rating lógico)
CREATE OR REPLACE FUNCTION public.search_tracks_for_rating(
  search_query text,
  result_limit integer DEFAULT 20
)
RETURNS TABLE (
  id text,
  name text,
  artist_id text,
  artist_name text,
  album_name text,
  image_url text,
  current_rating smallint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      t.id,
      t.name,
      t.artist_id,
      ar.name AS artist_name,
      al.name AS album_name,
      COALESCE(al.image_url, ar.image_url) AS image_url,
      public.get_logical_track_rating(t.name, t.artist_id) AS current_rating
    FROM tracks t
    LEFT JOIN artists ar ON ar.id = t.artist_id
    LEFT JOIN albums al ON al.id = t.album_id
    WHERE t.name ILIKE '%' || trim(search_query) || '%'
       OR ar.name ILIKE '%' || trim(search_query) || '%'
  ),
  deduped AS (
    SELECT DISTINCT ON (public.rating_song_key(c.name, c.artist_id))
      c.id,
      c.name,
      c.artist_id,
      c.artist_name,
      c.album_name,
      c.image_url,
      c.current_rating
    FROM candidates c
    ORDER BY
      public.rating_song_key(c.name, c.artist_id),
      (c.current_rating IS NOT NULL) DESC,
      c.name ASC
  )
  SELECT d.id, d.name, d.artist_id, d.artist_name, d.album_name, d.image_url, d.current_rating
  FROM deduped d
  ORDER BY (d.current_rating IS NOT NULL) DESC, d.name ASC
  LIMIT greatest(least(result_limit, 50), 1);
$$;

-- 6) RPC: Buscar álbumes para valorar
CREATE OR REPLACE FUNCTION public.search_albums_for_rating(
  search_query text,
  result_limit integer DEFAULT 20
)
RETURNS TABLE (
  id text,
  name text,
  artist_name text,
  image_url text,
  track_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    al.id,
    al.name,
    ar.name AS artist_name,
    al.image_url,
    COUNT(t.id)::bigint AS track_count
  FROM albums al
  LEFT JOIN artists ar ON ar.id = al.artist_id
  LEFT JOIN tracks t ON t.album_id = al.id
  WHERE al.name ILIKE '%' || trim(search_query) || '%'
     OR ar.name ILIKE '%' || trim(search_query) || '%'
  GROUP BY al.id, al.name, ar.name, al.image_url
  ORDER BY al.name ASC
  LIMIT greatest(least(result_limit, 40), 1);
$$;

-- 7) RPC: Tracklist de un álbum para valorar
CREATE OR REPLACE FUNCTION public.get_album_tracks_for_rating(
  p_album_id text,
  result_limit integer DEFAULT 200
)
RETURNS TABLE (
  id text,
  name text,
  artist_id text,
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
    t.artist_id,
    ar.name AS artist_name,
    al.name AS album_name,
    COALESCE(al.image_url, ar.image_url) AS image_url,
    public.get_logical_track_rating(t.name, t.artist_id) AS current_rating
  FROM tracks t
  INNER JOIN albums al ON al.id = t.album_id
  LEFT JOIN artists ar ON ar.id = t.artist_id
  WHERE t.album_id = p_album_id
  ORDER BY t.name ASC
  LIMIT greatest(least(result_limit, 300), 1);
$$;

-- 8) Descubrir: canciones aleatorias escuchadas pero no valoradas
CREATE OR REPLACE FUNCTION public.get_unrated_random_tracks(
  result_limit integer DEFAULT 10,
  p_exclude_ids text[] DEFAULT ARRAY['__none__']::text[]
)
RETURNS TABLE(
  id text,
  name text,
  artist_id text,
  artist_name text,
  album_name text,
  image_url text,
  play_count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT
    t.id::text,
    t.name,
    t.artist_id::text,
    ar.name AS artist_name,
    al.name AS album_name,
    COALESCE(al.image_url, ar.image_url) AS image_url,
    COUNT(p.id) AS play_count
  FROM plays p
  JOIN tracks t ON t.id = p.track_id
  LEFT JOIN artists ar ON ar.id = t.artist_id
  LEFT JOIN albums al ON al.id = t.album_id
  LEFT JOIN song_ratings sr ON sr.track_id = t.id
  WHERE sr.track_id IS NULL
    AND t.id::text != ALL(p_exclude_ids)
  GROUP BY t.id, t.name, t.artist_id, ar.name, al.name, al.image_url, ar.image_url
  ORDER BY random()
  LIMIT result_limit;
$$;

-- 9) Obtener rating actual de un track por track_id
CREATE OR REPLACE FUNCTION public.get_track_rating(p_track_id text)
RETURNS integer
LANGUAGE sql STABLE
AS $$
  SELECT sr.rating
  FROM song_ratings sr
  WHERE sr.track_id = p_track_id
  LIMIT 1;
$$;

-- 10) PERMISOS
GRANT ALL ON song_ratings TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rating_song_key(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_equivalent_track_ids(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_logical_track_rating(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ratings_dashboard() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_rated_tracks(text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_tracks_for_rating(text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_albums_for_rating(text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_album_tracks_for_rating(text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_unrated_random_tracks(integer, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_track_rating(text) TO anon, authenticated, service_role;
