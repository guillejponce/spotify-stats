-- Tracks browser: /tracks — leaderboard con búsqueda, paginación y rollup.
-- Ejecutar después de base_script.sql + stats_rollups.sql
-- NOTA: filtra plays con ms_played >= 30000 (ignora skips/plays < 30s).

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
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

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
      AND p.ms_played >= 30000
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
