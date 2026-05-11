-- Artist browser: /artists + /api/artists (run in Supabase SQL Editor after core tables + stats_rpcs).
-- play_count usa la misma lógica de sesión que stats_rpcs (plays_in_range_with_sessions).

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
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH per_session AS (
    SELECT s.artist_id,
           s.track_id,
           s.session_id,
           SUM(s.ms_played)::bigint AS session_ms
    FROM public.plays_in_range_with_sessions(start_date, end_date) s
    WHERE s.artist_id IS NOT NULL
    GROUP BY s.artist_id, s.track_id, s.session_id
  )
  SELECT ar.id AS id,
         ar.name AS name,
         ar.image_url,
         COUNT(*)::bigint AS play_count,
         COALESCE(SUM(per_session.session_ms), 0)::bigint AS total_ms_played
  FROM per_session
  INNER JOIN artists ar ON ar.id = per_session.artist_id
  WHERE (
    search_query IS NULL
    OR trim(search_query) = ''
    OR ar.name ILIKE '%' || trim(search_query) || '%'
  )
  GROUP BY ar.id, ar.name, ar.image_url
  ORDER BY play_count DESC, total_ms_played DESC, ar.name ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
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
  WITH per_session AS (
    SELECT s.track_id,
           s.session_id,
           SUM(s.ms_played)::bigint AS session_ms
    FROM public.plays_in_range_with_sessions(start_date, end_date) s
    INNER JOIN tracks tr ON tr.id = s.track_id
    INNER JOIN artists ar ON ar.id = s.artist_id
    WHERE s.track_id IS NOT NULL
      AND ar.id = artist_ref
    GROUP BY s.track_id, s.session_id
  )
  SELECT tr.id AS id,
         tr.name AS name,
         COALESCE(al.image_url, ar.image_url) AS image_url,
         COUNT(*)::bigint AS play_count,
         COALESCE(SUM(per_session.session_ms), 0)::bigint AS total_ms_played
  FROM per_session
  INNER JOIN tracks tr ON tr.id = per_session.track_id
  INNER JOIN artists ar ON ar.id = tr.artist_id
  LEFT JOIN albums al ON al.id = tr.album_id
  GROUP BY tr.id, tr.name, COALESCE(al.image_url, ar.image_url)
  ORDER BY play_count DESC, total_ms_played DESC, tr.name ASC
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
  WITH per_session AS (
    SELECT s.track_id,
           s.session_id,
           SUM(s.ms_played)::bigint AS session_ms
    FROM public.plays_in_range_with_sessions(start_date, end_date) s
    INNER JOIN tracks tr ON tr.id = s.track_id
    INNER JOIN artists ar ON ar.id = s.artist_id
    WHERE ar.id = artist_ref
    GROUP BY s.track_id, s.session_id
  )
  SELECT COUNT(*)::bigint AS play_count,
         COALESCE(SUM(per_session.session_ms), 0)::bigint AS total_ms_played
  FROM per_session;
$$;


GRANT EXECUTE ON FUNCTION public.get_artists_leaderboard(
  timestamptz, timestamptz, text, integer, integer
) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_artist_top_tracks_in_period(
  text, timestamptz, timestamptz, integer
) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_artist_period_stats(
  text, timestamptz, timestamptz
) TO service_role;
