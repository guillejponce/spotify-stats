-- Artist browser: /artists + /api/artists (ejecutar con tablas core + stats_rollups para máxima velocidad).
-- `play_count` = filas/segmentos en `plays` (misma semántica que el dashboard en modo rollup), no sesiones 15 min.

CREATE OR REPLACE FUNCTION public.get_artists_leaderboard(
  start_date timestamptz,
  end_date timestamptz,
  search_query text DEFAULT NULL,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 40
)
RETURNS TABLE (
  id text,
  name text,
  image_url text,
  play_count bigint,
  total_ms_played bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  rollup_ok boolean;
  use_rollup boolean;
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  rollup_ok :=
    to_regclass('public.stats_daily_segments') IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.stats_daily_segments LIMIT 1)
    AND EXISTS (SELECT 1 FROM public.stats_artist_segments LIMIT 1)
    AND (
      SELECT MAX(d.bucket_date)
      FROM public.stats_daily_segments d
    ) >= COALESCE(
      (
        SELECT MAX((p.played_at AT TIME ZONE 'America/Santiago')::date)
        FROM public.plays p
      ),
      '1900-01-01'::date
    );

  use_rollup := rollup_ok AND start_date < timestamptz '1971-01-01 UTC';

  IF use_rollup THEN
    RETURN QUERY
    SELECT
      sas.artist_id::text AS id,
      ar.name::text AS name,
      (COALESCE(ar.image_url, cover.fallback_img))::text AS image_url,
      sas.segment_count::bigint AS play_count,
      sas.total_ms::bigint AS total_ms_played
    FROM public.stats_artist_segments sas
    INNER JOIN public.artists ar ON ar.id = sas.artist_id
    LEFT JOIN LATERAL (
      SELECT al2.image_url AS fallback_img
      FROM public.albums al2
      WHERE al2.artist_id = ar.id
        AND al2.image_url IS NOT NULL
      LIMIT 1
    ) cover ON TRUE
    WHERE (
      search_query IS NULL
      OR trim(search_query) = ''
      OR ar.name ILIKE '%' || trim(search_query) || '%'
    )
    ORDER BY sas.segment_count DESC, sas.total_ms DESC, ar.name ASC
    OFFSET greatest(result_offset, 0)
    LIMIT greatest(least(result_limit, 200), 1);
    RETURN;
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      COALESCE(p.artist_id, tr.artist_id) AS artist_id,
      COUNT(*)::bigint AS pc,
      COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    LEFT JOIN public.tracks tr ON tr.id = p.track_id
    WHERE p.played_at >= start_date
      AND p.played_at <= end_date
      AND COALESCE(p.artist_id, tr.artist_id) IS NOT NULL
    GROUP BY COALESCE(p.artist_id, tr.artist_id)
  ),
  joined AS (
    SELECT
      a.artist_id,
      a.pc AS play_count,
      a.ms AS total_ms_played,
      ar.name AS ar_name,
      ar.image_url AS ar_img,
      cover.fallback_img
    FROM agg a
    INNER JOIN public.artists ar ON ar.id = a.artist_id
    LEFT JOIN LATERAL (
      SELECT al2.image_url AS fallback_img
      FROM public.albums al2
      WHERE al2.artist_id = ar.id
        AND al2.image_url IS NOT NULL
      LIMIT 1
    ) cover ON TRUE
    WHERE (
      search_query IS NULL
      OR trim(search_query) = ''
      OR ar.name ILIKE '%' || trim(search_query) || '%'
    )
  )
  SELECT
    j.artist_id::text AS id,
    j.ar_name::text AS name,
    (COALESCE(j.ar_img, j.fallback_img))::text AS image_url,
    j.play_count,
    j.total_ms_played
  FROM joined j
  ORDER BY j.play_count DESC, j.total_ms_played DESC, j.ar_name ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
END;
$$;


CREATE OR REPLACE FUNCTION public.get_artist_top_tracks_in_period(
  artist_ref text,
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 80
)
RETURNS TABLE (
  id text,
  name text,
  image_url text,
  play_count bigint,
  total_ms_played bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    tr.id AS id,
    tr.name AS name,
    COALESCE(al.image_url, ar.image_url) AS image_url,
    COUNT(*)::bigint AS play_count,
    COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
  FROM public.plays p
  INNER JOIN public.tracks tr ON tr.id = p.track_id
  INNER JOIN public.artists ar ON ar.id = tr.artist_id
  LEFT JOIN public.albums al ON al.id = tr.album_id
  WHERE ar.id = artist_ref
    AND p.played_at >= start_date
    AND p.played_at <= end_date
    AND p.track_id IS NOT NULL
  GROUP BY tr.id, tr.name, COALESCE(al.image_url, ar.image_url)
  ORDER BY COUNT(*) DESC, tr.name ASC
  LIMIT greatest(least(result_limit, 200), 1);
$$;


CREATE OR REPLACE FUNCTION public.get_artist_period_stats(
  artist_ref text,
  start_date timestamptz,
  end_date timestamptz
)
RETURNS TABLE (play_count bigint, total_ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS play_count,
    COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
  FROM public.plays p
  INNER JOIN public.tracks tr ON tr.id = p.track_id
  INNER JOIN public.artists ar ON ar.id = tr.artist_id
  WHERE ar.id = artist_ref
    AND p.played_at >= start_date
    AND p.played_at <= end_date;
$$;


GRANT EXECUTE ON FUNCTION public.get_artists_leaderboard(
  timestamptz, timestamptz, text, integer, integer
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_artist_top_tracks_in_period(
  text, timestamptz, timestamptz, integer
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_artist_period_stats(
  text, timestamptz, timestamptz
) TO anon, authenticated, service_role;
