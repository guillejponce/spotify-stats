-- Tracks browser: /tracks — `play_count` = filas/segmentos en `plays` (misma semántica que el dashboard en modo rollup), no sesiones 15 min.
-- Ejecutar después de base_script.sql + stats_rollups.sql

CREATE OR REPLACE FUNCTION public.get_tracks_leaderboard(
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
  artist_name text,
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
    AND EXISTS (SELECT 1 FROM public.stats_track_segments LIMIT 1)
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
      sts.track_id::text AS id,
      tr.name::text AS name,
      COALESCE(al.image_url, ar.image_url)::text AS image_url,
      ar.name::text AS artist_name,
      sts.segment_count::bigint AS play_count,
      sts.total_ms::bigint AS total_ms_played
    FROM public.stats_track_segments sts
    INNER JOIN public.tracks tr ON tr.id = sts.track_id
    LEFT JOIN public.albums al ON al.id = tr.album_id
    LEFT JOIN public.artists ar ON ar.id = tr.artist_id
    WHERE (
      search_query IS NULL
      OR trim(search_query) = ''
      OR tr.name ILIKE '%' || trim(search_query) || '%'
      OR ar.name ILIKE '%' || trim(search_query) || '%'
    )
    ORDER BY sts.segment_count DESC, sts.total_ms DESC, tr.name ASC
    OFFSET greatest(result_offset, 0)
    LIMIT greatest(least(result_limit, 200), 1);
    RETURN;
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      p.track_id,
      COUNT(*)::bigint AS pc,
      COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    WHERE p.played_at >= start_date
      AND p.played_at <= end_date
      AND p.track_id IS NOT NULL
    GROUP BY p.track_id
  )
  SELECT
    a.track_id::text AS id,
    tr.name::text AS name,
    COALESCE(al.image_url, ar.image_url)::text AS image_url,
    ar.name::text AS artist_name,
    a.pc AS play_count,
    a.ms AS total_ms_played
  FROM agg a
  INNER JOIN public.tracks tr ON tr.id = a.track_id
  LEFT JOIN public.albums al ON al.id = tr.album_id
  LEFT JOIN public.artists ar ON ar.id = tr.artist_id
  WHERE (
    search_query IS NULL
    OR trim(search_query) = ''
    OR tr.name ILIKE '%' || trim(search_query) || '%'
    OR ar.name ILIKE '%' || trim(search_query) || '%'
  )
  ORDER BY a.pc DESC, a.ms DESC, tr.name ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tracks_leaderboard(
  timestamptz, timestamptz, text, integer, integer
) TO anon, authenticated, service_role;
