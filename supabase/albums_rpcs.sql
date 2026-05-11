-- Album browser: /albums — ejecutá en SQL Editor después de stats_rpcs.sql (necesita plays_in_range_with_sessions).

CREATE OR REPLACE FUNCTION public.get_albums_leaderboard(
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
    SELECT s.album_id,
           s.track_id,
           s.session_id,
           SUM(s.ms_played)::bigint AS session_ms
    FROM public.plays_in_range_with_sessions(start_date, end_date) s
    WHERE s.album_id IS NOT NULL
    GROUP BY s.album_id, s.track_id, s.session_id
  ),
  joined AS (
    SELECT ps.album_id,
           ps.session_ms,
           ab.name AS ab_name,
           ab.image_url AS ab_img
    FROM per_session ps
    INNER JOIN albums ab ON ab.id = ps.album_id
    WHERE (
      search_query IS NULL
      OR trim(search_query) = ''
      OR ab.name ILIKE '%' || trim(search_query) || '%'
    )
  )
  SELECT j.album_id AS id,
         j.ab_name AS name,
         j.ab_img AS image_url,
         COUNT(*)::bigint AS play_count,
         COALESCE(SUM(j.session_ms), 0)::bigint AS total_ms_played
  FROM joined j
  GROUP BY j.album_id, j.ab_name, j.ab_img
  ORDER BY play_count DESC, total_ms_played DESC, j.ab_name ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
$$;


CREATE OR REPLACE FUNCTION public.get_album_period_stats(
  album_ref text,
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
    WHERE s.track_id IS NOT NULL
      AND COALESCE(tr.album_id, s.album_id) = album_ref
    GROUP BY s.track_id, s.session_id
  )
  SELECT COUNT(*)::bigint AS play_count,
         COALESCE(SUM(per_session.session_ms), 0)::bigint AS total_ms_played
  FROM per_session;
$$;


-- Play counts por track (sesiones) en el período; una fila por id en track_ids preservando orden.
CREATE OR REPLACE FUNCTION public.get_track_play_counts_in_period(
  track_ids text[],
  start_date timestamptz,
  end_date timestamptz
)
RETURNS TABLE (track_id text, play_count bigint, total_ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT u.tid AS track_id,
           u.ord
    FROM unnest(track_ids) WITH ORDINALITY AS u(tid, ord)
  ),
  agg AS (
    SELECT s.track_id AS tid,
           COUNT(DISTINCT s.session_id)::bigint AS pc,
           COALESCE(SUM(s.ms_played), 0)::bigint AS tm
    FROM public.plays_in_range_with_sessions(start_date, end_date) s
    INNER JOIN ranked r ON r.track_id = s.track_id
    GROUP BY s.track_id
  )
  SELECT ranked.track_id,
         COALESCE(agg.pc, 0)::bigint AS play_count,
         COALESCE(agg.tm, 0)::bigint AS total_ms_played
  FROM ranked
  LEFT JOIN agg ON agg.tid = ranked.track_id
  ORDER BY ranked.ord ASC;
$$;


GRANT EXECUTE ON FUNCTION public.get_albums_leaderboard(
  timestamptz, timestamptz, text, integer, integer
) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_album_period_stats(
  text, timestamptz, timestamptz
) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_track_play_counts_in_period(
  text[], timestamptz, timestamptz
) TO service_role;
