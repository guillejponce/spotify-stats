-- Cancionero personal: cifras ChordPro por track.
-- Ejecutar en Supabase SQL Editor después de `tracks`.
-- RLS permisivo: app personal. Lookup reusa get_equivalent_track_ids.

CREATE TABLE IF NOT EXISTS public.song_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id text NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  artist_name text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  original_key text,
  capo smallint NOT NULL DEFAULT 0 CHECK (capo >= 0 AND capo <= 12),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT song_charts_track_unique UNIQUE (track_id)
);

CREATE INDEX IF NOT EXISTS idx_song_charts_updated_desc
  ON public.song_charts (updated_at DESC);

ALTER TABLE public.song_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS song_charts_personal ON public.song_charts;
CREATE POLICY song_charts_personal ON public.song_charts
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.song_charts TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_song_chart(p_track_id text)
RETURNS TABLE (
  id uuid,
  track_id text,
  title text,
  artist_name text,
  content text,
  original_key text,
  capo smallint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    sc.id,
    sc.track_id,
    sc.title,
    sc.artist_name,
    sc.content,
    sc.original_key,
    sc.capo,
    sc.created_at,
    sc.updated_at
  FROM public.song_charts sc
  INNER JOIN public.tracks t_chart ON t_chart.id = sc.track_id
  INNER JOIN public.tracks t_req ON t_req.id = p_track_id
  WHERE sc.track_id = p_track_id
     OR public.rating_song_key(t_chart.name, t_chart.artist_id)
      = public.rating_song_key(t_req.name, t_req.artist_id)
  ORDER BY sc.updated_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.search_tracks_for_chart(
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
  has_chart boolean
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
      EXISTS (
        SELECT 1
        FROM public.song_charts sc
        INNER JOIN public.tracks t2 ON t2.id = sc.track_id
        WHERE sc.track_id = t.id
           OR public.rating_song_key(t2.name, t2.artist_id)
            = public.rating_song_key(t.name, t.artist_id)
      ) AS has_chart
    FROM public.tracks t
    LEFT JOIN public.artists ar ON ar.id = t.artist_id
    LEFT JOIN public.albums al ON al.id = t.album_id
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
      c.has_chart
    FROM candidates c
    ORDER BY
      public.rating_song_key(c.name, c.artist_id),
      c.has_chart DESC,
      c.name ASC
  )
  SELECT d.id, d.name, d.artist_id, d.artist_name, d.album_name, d.image_url, d.has_chart
  FROM deduped d
  ORDER BY d.has_chart DESC, d.name ASC
  LIMIT greatest(least(result_limit, 50), 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_song_chart(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_tracks_for_chart(text, integer)
  TO anon, authenticated, service_role;
