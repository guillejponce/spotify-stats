-- Album browser: /albums — `play_count` = segmentos (filas en `plays`).
-- “Todo el tiempo” usa stats_album_segments si los rollups están al día.

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
    AND EXISTS (SELECT 1 FROM public.stats_album_segments LIMIT 1)
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
      sal.album_id::text AS id,
      ab.name::text AS name,
      ab.image_url::text AS image_url,
      sal.segment_count::bigint AS play_count,
      sal.total_ms::bigint AS total_ms_played
    FROM public.stats_album_segments sal
    INNER JOIN public.albums ab ON ab.id = sal.album_id
    WHERE (
      search_query IS NULL
      OR trim(search_query) = ''
      OR ab.name ILIKE '%' || trim(search_query) || '%'
    )
    ORDER BY sal.segment_count DESC, sal.total_ms DESC, ab.name ASC
    OFFSET greatest(result_offset, 0)
    LIMIT greatest(least(result_limit, 200), 1);
    RETURN;
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      COALESCE(p.album_id, tr.album_id) AS album_id,
      COUNT(*)::bigint AS pc,
      COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    LEFT JOIN public.tracks tr ON tr.id = p.track_id
    WHERE p.played_at >= start_date
      AND p.played_at <= end_date
      AND COALESCE(p.album_id, tr.album_id) IS NOT NULL
    GROUP BY COALESCE(p.album_id, tr.album_id)
  )
  SELECT
    a.album_id::text AS id,
    ab.name::text AS name,
    ab.image_url::text AS image_url,
    a.pc AS play_count,
    a.ms AS total_ms_played
  FROM agg a
  INNER JOIN public.albums ab ON ab.id = a.album_id
  WHERE (
    search_query IS NULL
    OR trim(search_query) = ''
    OR ab.name ILIKE '%' || trim(search_query) || '%'
  )
  ORDER BY a.pc DESC, a.ms DESC, ab.name ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
END;
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
  SELECT
    COUNT(*)::bigint AS play_count,
    COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
  FROM public.plays p
  INNER JOIN public.tracks tr ON tr.id = p.track_id
  WHERE p.played_at >= start_date
    AND p.played_at <= end_date
    AND COALESCE(tr.album_id, p.album_id) = album_ref;
$$;


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
  -- `plays.track_id` referencia `tracks.id` (UUID tras import con spotify_id).
  -- Este RPC recibe IDs de Spotify (tracklist del API) o PK internos: resolvemos vía tracks.spotify_id / tracks.id.
  WITH ranked AS (
    SELECT u.tid AS track_id,
           u.ord
    FROM unnest(track_ids) WITH ORDINALITY AS u(tid, ord)
  ),
  agg AS (
    SELECT
      r.track_id AS ranked_tid,
      COUNT(*)::bigint AS pc,
      COALESCE(SUM(p.ms_played), 0)::bigint AS tm
    FROM ranked r
    INNER JOIN public.tracks tr
      ON tr.spotify_id = r.track_id
      OR tr.id = r.track_id
    INNER JOIN public.plays p ON p.track_id = tr.id
    WHERE p.played_at >= start_date
      AND p.played_at <= end_date
    GROUP BY r.track_id
  )
  SELECT
    ranked.track_id,
    COALESCE(agg.pc, 0)::bigint AS play_count,
    COALESCE(agg.tm, 0)::bigint AS total_ms_played
  FROM ranked
  LEFT JOIN agg ON agg.ranked_tid = ranked.track_id
  ORDER BY ranked.ord ASC;
$$;


GRANT EXECUTE ON FUNCTION public.get_albums_leaderboard(
  timestamptz, timestamptz, text, integer, integer
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_album_period_stats(
  text, timestamptz, timestamptz
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_track_play_counts_in_period(
  text[], timestamptz, timestamptz
) TO anon, authenticated, service_role;
