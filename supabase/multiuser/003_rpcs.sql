-- ============================================================================
-- 003 — RPCs por usuario. Correr después de 001_tenancy.sql.
--
-- Todas reciben `p_user_id uuid DEFAULT NULL` (último parámetro) y filtran con
-- `public.req_uid(p_user_id)`:
--   - sesión de usuario: p_user_id opcional, debe coincidir con auth.uid();
--   - service role (servidor / crons): p_user_id obligatorio.
-- Se borran las firmas viejas para que PostgREST no tenga overloads ambiguos.
-- Reemplaza: stats_rpcs, dashboard_bundle, stats_rollups (get_dashboard_bundle_rollups),
-- tracks/artists/albums_rpcs, ranking_deltas, calendar_rpcs, kurt_streak, song_ratings,
-- song_charts (search_tracks_for_chart).
-- ============================================================================

DROP FUNCTION IF EXISTS public.plays_in_range_with_sessions(timestamptz, timestamptz, interval);
DROP FUNCTION IF EXISTS public.get_total_listening_time(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_top_tracks(timestamptz, timestamptz, integer);
DROP FUNCTION IF EXISTS public.get_top_artists(timestamptz, timestamptz, integer);
DROP FUNCTION IF EXISTS public.get_top_albums(timestamptz, timestamptz, integer);
DROP FUNCTION IF EXISTS public.get_listening_over_time(timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.get_hourly_distribution(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_platform_breakdown(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_heatmap_data(integer);
DROP FUNCTION IF EXISTS public._dashboard_bundle_series_json(timestamptz, timestamptz, integer);
DROP FUNCTION IF EXISTS public.get_dashboard_bundle_fast(timestamptz, timestamptz, integer);
DROP FUNCTION IF EXISTS public.get_dashboard_bundle(timestamptz, timestamptz, integer);
DROP FUNCTION IF EXISTS public.get_dashboard_bundle_rollups(timestamptz, timestamptz, integer);
DROP FUNCTION IF EXISTS public.get_tracks_leaderboard(timestamptz, timestamptz, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_artists_leaderboard(timestamptz, timestamptz, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_albums_leaderboard(timestamptz, timestamptz, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_artist_top_tracks_in_period(text, timestamptz, timestamptz, integer);
DROP FUNCTION IF EXISTS public.get_artist_period_stats(text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_album_period_stats(text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_track_play_counts_in_period(text[], timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_tracks_leaderboard_with_delta(timestamptz, timestamptz, timestamptz, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_artists_leaderboard_with_delta(timestamptz, timestamptz, timestamptz, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_albums_leaderboard_with_delta(timestamptz, timestamptz, timestamptz, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_all_time_ranks(text, timestamptz);
DROP FUNCTION IF EXISTS public.get_calendar_available_years();
DROP FUNCTION IF EXISTS public.get_calendar_memories(integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_listen_days();
DROP FUNCTION IF EXISTS public.get_kurt_status();
DROP FUNCTION IF EXISTS public.get_logical_track_rating(text, text);
DROP FUNCTION IF EXISTS public.get_ratings_dashboard();
DROP FUNCTION IF EXISTS public.get_rated_tracks(text, integer, integer);
DROP FUNCTION IF EXISTS public.search_tracks_for_rating(text, integer);
DROP FUNCTION IF EXISTS public.search_albums_for_rating(text, integer);
DROP FUNCTION IF EXISTS public.get_album_tracks_for_rating(text, integer);
DROP FUNCTION IF EXISTS public.get_unrated_random_tracks(integer, text[]);
DROP FUNCTION IF EXISTS public.get_track_rating(text);
DROP FUNCTION IF EXISTS public.search_tracks_for_chart(text, integer);

-- ═══════════════════════════════════════════════════════════════════════════
-- STATS BÁSICAS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.plays_in_range_with_sessions(
  start_date timestamptz,
  end_date timestamptz,
  max_gap interval DEFAULT INTERVAL '15 minutes',
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  play_id uuid,
  track_id text,
  artist_id text,
  album_id text,
  played_at timestamptz,
  ms_played bigint,
  session_id bigint,
  is_session_start boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      p.id AS bid,
      p.track_id AS tid,
      COALESCE(p.artist_id, tr.artist_id) AS aid,
      COALESCE(p.album_id, tr.album_id) AS albid,
      p.played_at AS pat,
      p.ms_played::bigint AS msp
    FROM plays p
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE p.user_id = (SELECT public.req_uid(p_user_id))
      AND p.played_at >= start_date
      AND p.played_at <= end_date
      AND p.track_id IS NOT NULL
  ),
  marked AS (
    SELECT b.*,
      CASE
        WHEN lag(b.pat) OVER (PARTITION BY b.tid ORDER BY b.pat) IS NULL THEN 1
        WHEN b.pat - lag(b.pat) OVER (PARTITION BY b.tid ORDER BY b.pat) > max_gap THEN 1
        ELSE 0
      END::integer AS new_s
    FROM base b
  ),
  keyed AS (
    SELECT m.*,
      SUM(m.new_s) OVER (PARTITION BY m.tid ORDER BY m.pat)::bigint AS sid
    FROM marked m
  )
  SELECT k.bid, k.tid, k.aid, k.albid, k.pat, k.msp, k.sid, (k.new_s = 1)
  FROM keyed k;
$$;

CREATE OR REPLACE FUNCTION public.get_total_listening_time(
  start_date timestamptz,
  end_date timestamptz,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (total_ms bigint, play_count bigint, session_count bigint)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM(p.ms_played)::bigint FROM plays p
      WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
    ), 0)::bigint,
    COALESCE((
      SELECT COUNT(*)::bigint FROM plays p
      WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
    ), 0)::bigint,
    (
      COALESCE((
        SELECT COUNT(*)::bigint FROM (
          SELECT DISTINCT s.track_id, s.session_id
          FROM public.plays_in_range_with_sessions(start_date, end_date, INTERVAL '15 minutes', v_uid) s
        ) x
      ), 0)
      + COALESCE((
        SELECT COUNT(*)::bigint FROM plays p
        WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
          AND p.track_id IS NULL
      ), 0)
    )::bigint;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_top_tracks(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 50,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (id text, name text, image_url text, play_count bigint, total_ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH agg AS (
    SELECT s.track_id,
           COUNT(DISTINCT s.session_id)::bigint AS play_count,
           COALESCE(SUM(s.ms_played), 0)::bigint AS total_ms_played
    FROM public.plays_in_range_with_sessions(start_date, end_date, INTERVAL '15 minutes', p_user_id) s
    GROUP BY s.track_id
  )
  SELECT tr.id, tr.name, COALESCE(al.image_url, ar.image_url), a.play_count, a.total_ms_played
  FROM agg a
  INNER JOIN tracks tr ON tr.id = a.track_id
  LEFT JOIN albums al ON al.id = tr.album_id
  LEFT JOIN artists ar ON ar.id = tr.artist_id
  ORDER BY a.play_count DESC, tr.name ASC
  LIMIT result_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_top_artists(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 50,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (id text, name text, image_url text, play_count bigint, total_ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH per_session AS (
    SELECT s.artist_id, s.track_id, s.session_id, SUM(s.ms_played)::bigint AS session_ms
    FROM public.plays_in_range_with_sessions(start_date, end_date, INTERVAL '15 minutes', p_user_id) s
    WHERE s.artist_id IS NOT NULL
    GROUP BY s.artist_id, s.track_id, s.session_id
  ),
  joined AS (
    SELECT ps.artist_id, ps.session_ms, ar.name AS ar_name, ar.image_url AS ar_img, cover.fallback_img
    FROM per_session ps
    INNER JOIN artists ar ON ar.id = ps.artist_id
    LEFT JOIN LATERAL (
      SELECT al2.image_url AS fallback_img
      FROM albums al2
      WHERE al2.artist_id = ar.id AND al2.image_url IS NOT NULL
      LIMIT 1
    ) cover ON TRUE
  )
  SELECT j.artist_id, j.ar_name, COALESCE(j.ar_img, j.fallback_img),
         COUNT(*)::bigint AS play_count,
         COALESCE(SUM(j.session_ms), 0)::bigint AS total_ms_played
  FROM joined j
  GROUP BY j.artist_id, j.ar_name, COALESCE(j.ar_img, j.fallback_img)
  ORDER BY play_count DESC, total_ms_played DESC, j.ar_name ASC
  LIMIT result_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_top_albums(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 50,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (id text, name text, image_url text, play_count bigint, total_ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH per_session AS (
    SELECT s.album_id, s.track_id, s.session_id, SUM(s.ms_played)::bigint AS session_ms
    FROM public.plays_in_range_with_sessions(start_date, end_date, INTERVAL '15 minutes', p_user_id) s
    WHERE s.album_id IS NOT NULL
    GROUP BY s.album_id, s.track_id, s.session_id
  )
  SELECT ab.id, ab.name, ab.image_url,
         COUNT(*)::bigint AS play_count,
         COALESCE(SUM(ps.session_ms), 0)::bigint AS total_ms_played
  FROM per_session ps
  INNER JOIN albums ab ON ab.id = ps.album_id
  GROUP BY ab.id, ab.name, ab.image_url
  ORDER BY play_count DESC, total_ms_played DESC, ab.name ASC
  LIMIT result_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_listening_over_time(
  start_date timestamptz,
  end_date timestamptz,
  group_by text DEFAULT 'day',
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (date text, ms_played bigint, play_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH granular AS (
    SELECT
      date_trunc(
        CASE lower(coalesce(group_by, 'day'))
          WHEN 'week' THEN 'week'::text
          WHEN 'month' THEN 'month'::text
          ELSE 'day'::text
        END,
        (p.played_at AT TIME ZONE 'America/Santiago')
      ) AS chile_bucket,
      p.ms_played
    FROM plays p
    WHERE p.user_id = (SELECT public.req_uid(p_user_id))
      AND p.played_at >= start_date AND p.played_at <= end_date
  )
  SELECT to_char(g.chile_bucket, 'YYYY-MM-DD'), SUM(g.ms_played)::bigint, COUNT(*)::bigint
  FROM granular g
  GROUP BY g.chile_bucket
  ORDER BY g.chile_bucket ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_hourly_distribution(
  start_date timestamptz,
  end_date timestamptz,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (hour integer, ms_played bigint, play_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXTRACT(HOUR FROM (p.played_at AT TIME ZONE 'America/Santiago'))::integer,
         COALESCE(SUM(p.ms_played), 0)::bigint,
         COUNT(*)::bigint
  FROM plays p
  WHERE p.user_id = (SELECT public.req_uid(p_user_id))
    AND p.played_at >= start_date AND p.played_at <= end_date
  GROUP BY 1
  ORDER BY 1 ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_breakdown(
  start_date timestamptz,
  end_date timestamptz,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (platform text, play_count bigint, ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(trim(BOTH FROM p.platform::text), ''), '(unknown)')::text,
         COUNT(*)::bigint,
         COALESCE(SUM(p.ms_played), 0)::bigint AS ms
  FROM plays p
  WHERE p.user_id = (SELECT public.req_uid(p_user_id))
    AND p.played_at >= start_date AND p.played_at <= end_date
  GROUP BY 1
  ORDER BY ms DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_heatmap_data(
  target_year integer,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (date text, count bigint, ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (p.played_at AT TIME ZONE 'America/Santiago')::date::text AS d,
         COUNT(*)::bigint,
         COALESCE(SUM(p.ms_played), 0)::bigint
  FROM plays p
  WHERE p.user_id = (SELECT public.req_uid(p_user_id))
    AND p.played_at >= make_timestamptz(target_year, 1, 1, 0, 0, 0, 'America/Santiago')
    AND p.played_at < make_timestamptz(target_year + 1, 1, 1, 0, 0, 0, 'America/Santiago')
  GROUP BY 1
  ORDER BY 1;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DASHBOARD BUNDLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._dashboard_bundle_series_json(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
  v_listening jsonb;
  v_hourly jsonb;
  v_platform jsonb;
  v_months jsonb;
  v_years jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.date), '[]'::jsonb)
  INTO v_listening
  FROM (
    SELECT to_char(g.b, 'YYYY-MM-DD') AS date,
           SUM(g.ms_played)::bigint AS ms_played,
           COUNT(*)::bigint AS play_count
    FROM (
      SELECT date_trunc('day', (p.played_at AT TIME ZONE 'America/Santiago')) AS b, p.ms_played
      FROM plays p
      WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
    ) g
    GROUP BY g.b
  ) d;

  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.hour), '[]'::jsonb)
  INTO v_hourly
  FROM (
    SELECT EXTRACT(HOUR FROM (p.played_at AT TIME ZONE 'America/Santiago'))::integer AS hour,
           COALESCE(SUM(p.ms_played), 0)::bigint AS ms_played,
           COUNT(*)::bigint AS play_count
    FROM plays p
    WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
    GROUP BY 1
  ) h;

  SELECT COALESCE(jsonb_agg(to_jsonb(pl) ORDER BY pl.ms_played DESC), '[]'::jsonb)
  INTO v_platform
  FROM (
    SELECT COALESCE(NULLIF(trim(BOTH FROM p.platform::text), ''), '(unknown)')::text AS platform,
           COUNT(*)::bigint AS play_count,
           COALESCE(SUM(p.ms_played), 0)::bigint AS ms_played
    FROM plays p
    WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
    GROUP BY 1
  ) pl;

  SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
  INTO v_months
  FROM (
    SELECT to_char(mb.b, 'YYYY-MM') AS period,
           SUM(mb.ms_played)::bigint AS ms_played,
           COUNT(*)::bigint AS play_count
    FROM (
      SELECT date_trunc('month', (p.played_at AT TIME ZONE 'America/Santiago')) AS b, p.ms_played
      FROM plays p
      WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
    ) mb
    GROUP BY mb.b
    ORDER BY play_count DESC NULLS LAST
    LIMIT 36
  ) m;

  SELECT COALESCE(jsonb_agg(to_jsonb(y) ORDER BY y.year), '[]'::jsonb)
  INTO v_years
  FROM (
    SELECT EXTRACT(YEAR FROM (p.played_at AT TIME ZONE 'America/Santiago'))::integer AS year,
           COALESCE(SUM(p.ms_played), 0)::bigint AS ms_played,
           COUNT(*)::bigint AS play_count
    FROM plays p
    WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
    GROUP BY 1
  ) y;

  RETURN jsonb_build_object(
    'listening_by_day', v_listening,
    'hourly', v_hourly,
    'platform', v_platform,
    'months_top', v_months,
    'years', v_years
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_bundle_fast(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 50,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
  series jsonb;
  totals jsonb;
  v_tracks jsonb;
  v_artists jsonb;
  v_albums jsonb;
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  series := public._dashboard_bundle_series_json(start_date, end_date, result_limit, v_uid);

  SELECT jsonb_build_object(
    'total_ms', COALESCE(SUM(p.ms_played), 0),
    'play_count', COUNT(*)::bigint,
    'session_count', 0::bigint
  )
  INTO totals
  FROM plays p
  WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO v_tracks
  FROM (
    SELECT tr.id, tr.name, COALESCE(al.image_url, ar.image_url) AS image_url,
           a.play_count, a.total_ms_played
    FROM (
      SELECT p.track_id, COUNT(*)::bigint AS play_count,
             COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
      FROM plays p
      WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
        AND p.track_id IS NOT NULL
      GROUP BY p.track_id
    ) a
    INNER JOIN tracks tr ON tr.id = a.track_id
    LEFT JOIN albums al ON al.id = tr.album_id
    LEFT JOIN artists ar ON ar.id = tr.artist_id
    ORDER BY a.play_count DESC, tr.name ASC
    LIMIT result_limit
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO v_artists
  FROM (
    SELECT ar.id, ar.name, COALESCE(ar.image_url, cover.fallback_img) AS image_url,
           ag.play_count, ag.total_ms_played
    FROM (
      SELECT COALESCE(p.artist_id, tr.artist_id) AS artist_id,
             COUNT(*)::bigint AS play_count,
             COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
      FROM plays p
      LEFT JOIN tracks tr ON tr.id = p.track_id
      WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
        AND COALESCE(p.artist_id, tr.artist_id) IS NOT NULL
      GROUP BY 1
    ) ag
    INNER JOIN artists ar ON ar.id = ag.artist_id
    LEFT JOIN LATERAL (
      SELECT al2.image_url AS fallback_img FROM albums al2
      WHERE al2.artist_id = ar.id AND al2.image_url IS NOT NULL LIMIT 1
    ) cover ON TRUE
    ORDER BY ag.play_count DESC, ag.total_ms_played DESC, ar.name ASC
    LIMIT result_limit
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO v_albums
  FROM (
    SELECT ab.id, ab.name, ab.image_url, x.play_count, x.total_ms_played
    FROM (
      SELECT COALESCE(p.album_id, tr.album_id) AS album_id,
             COUNT(*)::bigint AS play_count,
             COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
      FROM plays p
      LEFT JOIN tracks tr ON tr.id = p.track_id
      WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
        AND COALESCE(p.album_id, tr.album_id) IS NOT NULL
      GROUP BY 1
    ) x
    INNER JOIN albums ab ON ab.id = x.album_id
    ORDER BY x.play_count DESC, x.total_ms_played DESC, ab.name ASC
    LIMIT result_limit
  ) q;

  RETURN jsonb_build_object(
    'total', totals,
    'top_tracks', v_tracks,
    'top_artists', v_artists,
    'top_albums', v_albums,
    'listening_by_day', series -> 'listening_by_day',
    'hourly', series -> 'hourly',
    'platform', series -> 'platform',
    'months_top', series -> 'months_top',
    'years', series -> 'years'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_bundle_rollups(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 50,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
  d_start date := (start_date AT TIME ZONE 'America/Santiago')::date;
  d_end date := (end_date AT TIME ZONE 'America/Santiago')::date;
  global_tops boolean := start_date < timestamptz '1971-01-01 UTC';
  rollup_play_max date;
  plays_play_max timestamptz;
  total_json jsonb;
  tracks_json jsonb;
  artists_json jsonb;
  albums_json jsonb;
  listening_json jsonb;
  hourly_json jsonb;
  platform_json jsonb;
  months_json jsonb;
  years_json jsonb;
BEGIN
  SELECT MAX(d.bucket_date) INTO rollup_play_max
  FROM public.stats_daily_segments d WHERE d.user_id = v_uid;
  SELECT MAX(p.played_at) INTO plays_play_max
  FROM public.plays p WHERE p.user_id = v_uid;

  IF rollup_play_max IS NULL OR plays_play_max IS NULL
     OR rollup_play_max < (plays_play_max AT TIME ZONE 'America/Santiago')::date THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(t) INTO total_json
  FROM (
    SELECT COALESCE(SUM(d.total_ms), 0)::bigint AS total_ms,
           COALESCE(SUM(d.segment_count), 0)::bigint AS play_count,
           COALESCE(SUM(d.segment_count), 0)::bigint AS session_count
    FROM public.stats_daily_segments d
    WHERE d.user_id = v_uid AND d.bucket_date >= d_start AND d.bucket_date <= d_end
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.date), '[]'::jsonb) INTO listening_json
  FROM (
    SELECT to_char(d.bucket_date, 'YYYY-MM-DD') AS date, d.total_ms AS ms_played, d.segment_count AS play_count
    FROM public.stats_daily_segments d
    WHERE d.user_id = v_uid AND d.bucket_date >= d_start AND d.bucket_date <= d_end
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.hour), '[]'::jsonb) INTO hourly_json
  FROM (
    SELECT h.hour_chile::integer AS hour,
           COALESCE(SUM(h.total_ms), 0)::bigint AS ms_played,
           COALESCE(SUM(h.segment_count), 0)::bigint AS play_count
    FROM public.stats_daily_hour_segments h
    WHERE h.user_id = v_uid AND h.bucket_date >= d_start AND h.bucket_date <= d_end
    GROUP BY h.hour_chile
  ) h;

  SELECT COALESCE(jsonb_agg(to_jsonb(pl) ORDER BY pl.ms_played DESC), '[]'::jsonb) INTO platform_json
  FROM (
    SELECT p.platform,
           COALESCE(SUM(p.segment_count), 0)::bigint AS play_count,
           COALESCE(SUM(p.total_ms), 0)::bigint AS ms_played
    FROM public.stats_daily_platform_segments p
    WHERE p.user_id = v_uid AND p.bucket_date >= d_start AND p.bucket_date <= d_end
    GROUP BY p.platform
  ) pl;

  SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb) INTO months_json
  FROM (
    SELECT to_char(date_trunc('month', d.bucket_date), 'YYYY-MM') AS period,
           COALESCE(SUM(d.total_ms), 0)::bigint AS ms_played,
           COALESCE(SUM(d.segment_count), 0)::bigint AS play_count
    FROM public.stats_daily_segments d
    WHERE d.user_id = v_uid AND d.bucket_date >= d_start AND d.bucket_date <= d_end
    GROUP BY date_trunc('month', d.bucket_date)
    ORDER BY play_count DESC NULLS LAST
    LIMIT 36
  ) m;

  SELECT COALESCE(jsonb_agg(to_jsonb(y) ORDER BY y.year), '[]'::jsonb) INTO years_json
  FROM (
    SELECT EXTRACT(YEAR FROM d.bucket_date)::integer AS year,
           COALESCE(SUM(d.total_ms), 0)::bigint AS ms_played,
           COALESCE(SUM(d.segment_count), 0)::bigint AS play_count
    FROM public.stats_daily_segments d
    WHERE d.user_id = v_uid AND d.bucket_date >= d_start AND d.bucket_date <= d_end
    GROUP BY 1
  ) y;

  IF global_tops THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO tracks_json
    FROM (
      SELECT tr.id, tr.name, COALESCE(al.image_url, ar.image_url) AS image_url,
             sts.segment_count AS play_count, sts.total_ms AS total_ms_played
      FROM public.stats_track_segments sts
      INNER JOIN tracks tr ON tr.id = sts.track_id
      LEFT JOIN albums al ON al.id = tr.album_id
      LEFT JOIN artists ar ON ar.id = tr.artist_id
      WHERE sts.user_id = v_uid
      ORDER BY sts.segment_count DESC, tr.name ASC
      LIMIT result_limit
    ) q;

    SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO artists_json
    FROM (
      SELECT ar.id, ar.name, COALESCE(ar.image_url, cover.fallback_img) AS image_url,
             sas.segment_count AS play_count, sas.total_ms AS total_ms_played
      FROM public.stats_artist_segments sas
      INNER JOIN artists ar ON ar.id = sas.artist_id
      LEFT JOIN LATERAL (
        SELECT al2.image_url AS fallback_img FROM albums al2
        WHERE al2.artist_id = ar.id AND al2.image_url IS NOT NULL LIMIT 1
      ) cover ON TRUE
      WHERE sas.user_id = v_uid
      ORDER BY sas.segment_count DESC, sas.total_ms DESC, ar.name ASC
      LIMIT result_limit
    ) q;

    SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO albums_json
    FROM (
      SELECT ab.id, ab.name, ab.image_url,
             sal.segment_count AS play_count, sal.total_ms AS total_ms_played
      FROM public.stats_album_segments sal
      INNER JOIN albums ab ON ab.id = sal.album_id
      WHERE sal.user_id = v_uid
      ORDER BY sal.segment_count DESC, sal.total_ms DESC, ab.name ASC
      LIMIT result_limit
    ) q;
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO tracks_json
    FROM (
      SELECT tr.id, tr.name, COALESCE(al.image_url, ar.image_url) AS image_url,
             a.play_count, a.total_ms_played
      FROM (
        SELECT p.track_id, COUNT(*)::bigint AS play_count,
               COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
        FROM public.plays p
        WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
          AND p.track_id IS NOT NULL
        GROUP BY p.track_id
      ) a
      INNER JOIN tracks tr ON tr.id = a.track_id
      LEFT JOIN albums al ON al.id = tr.album_id
      LEFT JOIN artists ar ON ar.id = tr.artist_id
      ORDER BY a.play_count DESC, tr.name ASC
      LIMIT result_limit
    ) q;

    SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO artists_json
    FROM (
      SELECT ar.id, ar.name, COALESCE(ar.image_url, cover.fallback_img) AS image_url,
             ag.play_count, ag.total_ms_played
      FROM (
        SELECT COALESCE(p.artist_id, tr.artist_id) AS artist_id,
               COUNT(*)::bigint AS play_count,
               COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
        FROM public.plays p
        LEFT JOIN tracks tr ON tr.id = p.track_id
        WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
          AND COALESCE(p.artist_id, tr.artist_id) IS NOT NULL
        GROUP BY 1
      ) ag
      INNER JOIN artists ar ON ar.id = ag.artist_id
      LEFT JOIN LATERAL (
        SELECT al2.image_url AS fallback_img FROM albums al2
        WHERE al2.artist_id = ar.id AND al2.image_url IS NOT NULL LIMIT 1
      ) cover ON TRUE
      ORDER BY ag.play_count DESC, ag.total_ms_played DESC, ar.name ASC
      LIMIT result_limit
    ) q;

    SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO albums_json
    FROM (
      SELECT ab.id, ab.name, ab.image_url, x.play_count, x.total_ms_played
      FROM (
        SELECT COALESCE(p.album_id, tr.album_id) AS album_id,
               COUNT(*)::bigint AS play_count,
               COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
        FROM public.plays p
        LEFT JOIN tracks tr ON tr.id = p.track_id
        WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
          AND COALESCE(p.album_id, tr.album_id) IS NOT NULL
        GROUP BY 1
      ) x
      INNER JOIN albums ab ON ab.id = x.album_id
      ORDER BY x.play_count DESC, x.total_ms_played DESC, ab.name ASC
      LIMIT result_limit
    ) q;
  END IF;

  RETURN jsonb_build_object(
    'total', total_json,
    'top_tracks', tracks_json,
    'top_artists', artists_json,
    'top_albums', albums_json,
    'listening_by_day', listening_json,
    'hourly', hourly_json,
    'platform', platform_json,
    'months_top', months_json,
    'years', years_json
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_bundle(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 50,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE -- usa tabla temporal para no recalcular sesiones 3 veces
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
  roll jsonb;
  series jsonb;
  v_total jsonb;
  v_tracks jsonb;
  v_artists jsonb;
  v_albums jsonb;
BEGIN
  PERFORM set_config('statement_timeout', '180s', true);

  roll := public.get_dashboard_bundle_rollups(start_date, end_date, result_limit, v_uid);
  IF roll IS NOT NULL THEN
    RETURN roll;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _bundle_sessions ON COMMIT DROP AS
  SELECT * FROM public.plays_in_range_with_sessions(start_date, end_date, INTERVAL '15 minutes', v_uid)
  WITH NO DATA;
  TRUNCATE _bundle_sessions;
  INSERT INTO _bundle_sessions
  SELECT * FROM public.plays_in_range_with_sessions(start_date, end_date, INTERVAL '15 minutes', v_uid);

  SELECT jsonb_build_object(
    'total_ms', COALESCE((
      SELECT SUM(p.ms_played)::bigint FROM plays p
      WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
    ), 0),
    'play_count', COALESCE((
      SELECT COUNT(*)::bigint FROM plays p
      WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
    ), 0),
    'session_count',
      COALESCE((SELECT COUNT(*)::bigint FROM (SELECT DISTINCT s.track_id, s.session_id FROM _bundle_sessions s) x), 0)
      + COALESCE((
        SELECT COUNT(*)::bigint FROM plays p
        WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
          AND p.track_id IS NULL
      ), 0)
  ) INTO v_total;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO v_tracks
  FROM (
    SELECT tr.id, tr.name, COALESCE(al.image_url, ar.image_url) AS image_url,
           a.play_count, a.total_ms_played
    FROM (
      SELECT s.track_id, COUNT(DISTINCT s.session_id)::bigint AS play_count,
             COALESCE(SUM(s.ms_played), 0)::bigint AS total_ms_played
      FROM _bundle_sessions s
      GROUP BY s.track_id
    ) a
    INNER JOIN tracks tr ON tr.id = a.track_id
    LEFT JOIN albums al ON al.id = tr.album_id
    LEFT JOIN artists ar ON ar.id = tr.artist_id
    ORDER BY a.play_count DESC, tr.name ASC
    LIMIT result_limit
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO v_artists
  FROM (
    SELECT ps.artist_id AS id, ar.name, COALESCE(ar.image_url, cover.fallback_img) AS image_url,
           COUNT(*)::bigint AS play_count,
           COALESCE(SUM(ps.session_ms), 0)::bigint AS total_ms_played
    FROM (
      SELECT s.artist_id, s.track_id, s.session_id, SUM(s.ms_played)::bigint AS session_ms
      FROM _bundle_sessions s
      WHERE s.artist_id IS NOT NULL
      GROUP BY s.artist_id, s.track_id, s.session_id
    ) ps
    INNER JOIN artists ar ON ar.id = ps.artist_id
    LEFT JOIN LATERAL (
      SELECT al2.image_url AS fallback_img FROM albums al2
      WHERE al2.artist_id = ar.id AND al2.image_url IS NOT NULL LIMIT 1
    ) cover ON TRUE
    GROUP BY ps.artist_id, ar.name, COALESCE(ar.image_url, cover.fallback_img)
    ORDER BY play_count DESC, total_ms_played DESC, ar.name ASC
    LIMIT result_limit
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO v_albums
  FROM (
    SELECT ab.id, ab.name, ab.image_url,
           COUNT(*)::bigint AS play_count,
           COALESCE(SUM(psa.session_ms), 0)::bigint AS total_ms_played
    FROM (
      SELECT s.album_id, s.track_id, s.session_id, SUM(s.ms_played)::bigint AS session_ms
      FROM _bundle_sessions s
      WHERE s.album_id IS NOT NULL
      GROUP BY s.album_id, s.track_id, s.session_id
    ) psa
    INNER JOIN albums ab ON ab.id = psa.album_id
    GROUP BY ab.id, ab.name, ab.image_url
    ORDER BY play_count DESC, total_ms_played DESC, ab.name ASC
    LIMIT result_limit
  ) q;

  series := public._dashboard_bundle_series_json(start_date, end_date, result_limit, v_uid);

  RETURN jsonb_build_object(
    'total', v_total,
    'top_tracks', v_tracks,
    'top_artists', v_artists,
    'top_albums', v_albums,
    'listening_by_day', series -> 'listening_by_day',
    'hourly', series -> 'hourly',
    'platform', series -> 'platform',
    'months_top', series -> 'months_top',
    'years', series -> 'years'
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- LEADERBOARDS (/tracks, /artists, /albums)
-- ═══════════════════════════════════════════════════════════════════════════

-- true si los rollups del usuario están al día y el rango es "todo el tiempo".
CREATE OR REPLACE FUNCTION public._user_rollups_fresh(v_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT MAX(d.bucket_date) FROM public.stats_daily_segments d WHERE d.user_id = v_uid)
    >= (
      SELECT (MAX(p.played_at) AT TIME ZONE 'America/Santiago')::date
      FROM public.plays p WHERE p.user_id = v_uid
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.get_tracks_leaderboard(
  start_date timestamptz,
  end_date timestamptz,
  search_query text DEFAULT NULL,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 40,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (id text, name text, image_url text, artist_name text, play_count bigint, total_ms_played bigint)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  IF start_date < timestamptz '1971-01-01 UTC' AND public._user_rollups_fresh(v_uid) THEN
    RETURN QUERY
    SELECT sts.track_id::text, tr.name::text, COALESCE(al.image_url, ar.image_url)::text,
           ar.name::text, sts.segment_count::bigint, sts.total_ms::bigint
    FROM public.stats_track_segments sts
    INNER JOIN public.tracks tr ON tr.id = sts.track_id
    LEFT JOIN public.albums al ON al.id = tr.album_id
    LEFT JOIN public.artists ar ON ar.id = tr.artist_id
    WHERE sts.user_id = v_uid
      AND (
        search_query IS NULL OR trim(search_query) = ''
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
    SELECT p.track_id, COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
      AND p.track_id IS NOT NULL
    GROUP BY p.track_id
  )
  SELECT a.track_id::text, tr.name::text, COALESCE(al.image_url, ar.image_url)::text,
         ar.name::text, a.pc, a.ms
  FROM agg a
  INNER JOIN public.tracks tr ON tr.id = a.track_id
  LEFT JOIN public.albums al ON al.id = tr.album_id
  LEFT JOIN public.artists ar ON ar.id = tr.artist_id
  WHERE (
    search_query IS NULL OR trim(search_query) = ''
    OR tr.name ILIKE '%' || trim(search_query) || '%'
    OR ar.name ILIKE '%' || trim(search_query) || '%'
  )
  ORDER BY a.pc DESC, a.ms DESC, tr.name ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_artists_leaderboard(
  start_date timestamptz,
  end_date timestamptz,
  search_query text DEFAULT NULL,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 40,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (id text, name text, image_url text, play_count bigint, total_ms_played bigint)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  IF start_date < timestamptz '1971-01-01 UTC' AND public._user_rollups_fresh(v_uid) THEN
    RETURN QUERY
    SELECT sas.artist_id::text, ar.name::text, COALESCE(ar.image_url, cover.fallback_img)::text,
           sas.segment_count::bigint, sas.total_ms::bigint
    FROM public.stats_artist_segments sas
    INNER JOIN public.artists ar ON ar.id = sas.artist_id
    LEFT JOIN LATERAL (
      SELECT al2.image_url AS fallback_img FROM public.albums al2
      WHERE al2.artist_id = ar.id AND al2.image_url IS NOT NULL LIMIT 1
    ) cover ON TRUE
    WHERE sas.user_id = v_uid
      AND (search_query IS NULL OR trim(search_query) = '' OR ar.name ILIKE '%' || trim(search_query) || '%')
    ORDER BY sas.segment_count DESC, sas.total_ms DESC, ar.name ASC
    OFFSET greatest(result_offset, 0)
    LIMIT greatest(least(result_limit, 200), 1);
    RETURN;
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT COALESCE(p.artist_id, tr.artist_id) AS artist_id,
           COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    LEFT JOIN public.tracks tr ON tr.id = p.track_id
    WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
      AND COALESCE(p.artist_id, tr.artist_id) IS NOT NULL
    GROUP BY 1
  )
  SELECT a.artist_id::text, ar.name::text, COALESCE(ar.image_url, cover.fallback_img)::text, a.pc, a.ms
  FROM agg a
  INNER JOIN public.artists ar ON ar.id = a.artist_id
  LEFT JOIN LATERAL (
    SELECT al2.image_url AS fallback_img FROM public.albums al2
    WHERE al2.artist_id = ar.id AND al2.image_url IS NOT NULL LIMIT 1
  ) cover ON TRUE
  WHERE (search_query IS NULL OR trim(search_query) = '' OR ar.name ILIKE '%' || trim(search_query) || '%')
  ORDER BY a.pc DESC, a.ms DESC, ar.name ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_albums_leaderboard(
  start_date timestamptz,
  end_date timestamptz,
  search_query text DEFAULT NULL,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 40,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (id text, name text, image_url text, play_count bigint, total_ms_played bigint)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  IF start_date < timestamptz '1971-01-01 UTC' AND public._user_rollups_fresh(v_uid) THEN
    RETURN QUERY
    SELECT sal.album_id::text, ab.name::text, ab.image_url::text,
           sal.segment_count::bigint, sal.total_ms::bigint
    FROM public.stats_album_segments sal
    INNER JOIN public.albums ab ON ab.id = sal.album_id
    WHERE sal.user_id = v_uid
      AND (search_query IS NULL OR trim(search_query) = '' OR ab.name ILIKE '%' || trim(search_query) || '%')
    ORDER BY sal.segment_count DESC, sal.total_ms DESC, ab.name ASC
    OFFSET greatest(result_offset, 0)
    LIMIT greatest(least(result_limit, 200), 1);
    RETURN;
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT COALESCE(p.album_id, tr.album_id) AS album_id,
           COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    LEFT JOIN public.tracks tr ON tr.id = p.track_id
    WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
      AND COALESCE(p.album_id, tr.album_id) IS NOT NULL
    GROUP BY 1
  )
  SELECT a.album_id::text, ab.name::text, ab.image_url::text, a.pc, a.ms
  FROM agg a
  INNER JOIN public.albums ab ON ab.id = a.album_id
  WHERE (search_query IS NULL OR trim(search_query) = '' OR ab.name ILIKE '%' || trim(search_query) || '%')
  ORDER BY a.pc DESC, a.ms DESC, ab.name ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_artist_top_tracks_in_period(
  artist_ref text,
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 80,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (id text, name text, image_url text, play_count bigint, total_ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT tr.id, tr.name, COALESCE(al.image_url, ar.image_url),
         COUNT(*)::bigint, COALESCE(SUM(p.ms_played), 0)::bigint
  FROM public.plays p
  INNER JOIN public.tracks tr ON tr.id = p.track_id
  INNER JOIN public.artists ar ON ar.id = tr.artist_id
  LEFT JOIN public.albums al ON al.id = tr.album_id
  WHERE p.user_id = (SELECT public.req_uid(p_user_id))
    AND ar.id = artist_ref
    AND p.played_at >= start_date AND p.played_at <= end_date
    AND p.track_id IS NOT NULL
  GROUP BY tr.id, tr.name, COALESCE(al.image_url, ar.image_url)
  ORDER BY COUNT(*) DESC, tr.name ASC
  LIMIT greatest(least(result_limit, 200), 1);
$$;

CREATE OR REPLACE FUNCTION public.get_artist_period_stats(
  artist_ref text,
  start_date timestamptz,
  end_date timestamptz,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (play_count bigint, total_ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint, COALESCE(SUM(p.ms_played), 0)::bigint
  FROM public.plays p
  INNER JOIN public.tracks tr ON tr.id = p.track_id
  WHERE p.user_id = (SELECT public.req_uid(p_user_id))
    AND tr.artist_id = artist_ref
    AND p.played_at >= start_date AND p.played_at <= end_date;
$$;

CREATE OR REPLACE FUNCTION public.get_album_period_stats(
  album_ref text,
  start_date timestamptz,
  end_date timestamptz,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (play_count bigint, total_ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint, COALESCE(SUM(p.ms_played), 0)::bigint
  FROM public.plays p
  INNER JOIN public.tracks tr ON tr.id = p.track_id
  WHERE p.user_id = (SELECT public.req_uid(p_user_id))
    AND p.played_at >= start_date AND p.played_at <= end_date
    AND COALESCE(tr.album_id, p.album_id) = album_ref;
$$;

CREATE OR REPLACE FUNCTION public.get_track_play_counts_in_period(
  track_ids text[],
  start_date timestamptz,
  end_date timestamptz,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (track_id text, play_count bigint, total_ms_played bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT u.tid, u.ord FROM unnest(track_ids) WITH ORDINALITY AS u(tid, ord)
  ),
  agg AS (
    SELECT r.tid AS ranked_tid, COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS tm
    FROM ranked r
    INNER JOIN public.tracks tr ON tr.spotify_id = r.tid OR tr.id = r.tid
    INNER JOIN public.plays p ON p.track_id = tr.id
    WHERE p.user_id = (SELECT public.req_uid(p_user_id))
      AND p.played_at >= start_date AND p.played_at <= end_date
    GROUP BY r.tid
  )
  SELECT ranked.tid, COALESCE(agg.pc, 0)::bigint, COALESCE(agg.tm, 0)::bigint
  FROM ranked
  LEFT JOIN agg ON agg.ranked_tid = ranked.tid
  ORDER BY ranked.ord ASC;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- LEADERBOARDS CON DELTA + RANKS ALL-TIME
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_tracks_leaderboard_with_delta(
  start_date timestamptz,
  end_date timestamptz,
  prev_end_date timestamptz,
  search_query text DEFAULT NULL,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 40,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id text, name text, image_url text, artist_name text,
  play_count bigint, total_ms_played bigint, rank bigint, prev_rank bigint, rank_delta bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  RETURN QUERY
  WITH cur_agg AS (
    SELECT p.track_id, COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
      AND p.track_id IS NOT NULL
    GROUP BY p.track_id
  ),
  cur_ranked AS (
    SELECT c.track_id, c.pc, c.ms,
           ROW_NUMBER() OVER (ORDER BY c.pc DESC, c.ms DESC, c.track_id ASC)::bigint AS rnk
    FROM cur_agg c
  ),
  prev_agg AS (
    SELECT p.track_id, COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= prev_end_date
      AND p.track_id IS NOT NULL
    GROUP BY p.track_id
  ),
  prev_ranked AS (
    SELECT pa.track_id,
           ROW_NUMBER() OVER (ORDER BY pa.pc DESC, pa.ms DESC, pa.track_id ASC)::bigint AS prev_rnk
    FROM prev_agg pa
  )
  SELECT cr.track_id::text, tr.name::text, COALESCE(al.image_url, ar.image_url)::text, ar.name::text,
         cr.pc, cr.ms, cr.rnk, pr.prev_rnk,
         CASE WHEN pr.prev_rnk IS NULL THEN NULL ELSE (pr.prev_rnk - cr.rnk)::bigint END
  FROM cur_ranked cr
  INNER JOIN public.tracks tr ON tr.id = cr.track_id
  LEFT JOIN public.albums al ON al.id = tr.album_id
  LEFT JOIN public.artists ar ON ar.id = tr.artist_id
  LEFT JOIN prev_ranked pr ON pr.track_id = cr.track_id
  WHERE (
    search_query IS NULL OR trim(search_query) = ''
    OR tr.name ILIKE '%' || trim(search_query) || '%'
    OR ar.name ILIKE '%' || trim(search_query) || '%'
  )
  ORDER BY cr.rnk ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_artists_leaderboard_with_delta(
  start_date timestamptz,
  end_date timestamptz,
  prev_end_date timestamptz,
  search_query text DEFAULT NULL,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 40,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id text, name text, image_url text,
  play_count bigint, total_ms_played bigint, rank bigint, prev_rank bigint, rank_delta bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  RETURN QUERY
  WITH cur_agg AS (
    SELECT COALESCE(p.artist_id, tr.artist_id) AS artist_id,
           COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    LEFT JOIN public.tracks tr ON tr.id = p.track_id
    WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
      AND COALESCE(p.artist_id, tr.artist_id) IS NOT NULL
    GROUP BY 1
  ),
  cur_ranked AS (
    SELECT c.artist_id, c.pc, c.ms,
           ROW_NUMBER() OVER (ORDER BY c.pc DESC, c.ms DESC, c.artist_id ASC)::bigint AS rnk
    FROM cur_agg c
  ),
  prev_agg AS (
    SELECT COALESCE(p.artist_id, tr.artist_id) AS artist_id,
           COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    LEFT JOIN public.tracks tr ON tr.id = p.track_id
    WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= prev_end_date
      AND COALESCE(p.artist_id, tr.artist_id) IS NOT NULL
    GROUP BY 1
  ),
  prev_ranked AS (
    SELECT pa.artist_id,
           ROW_NUMBER() OVER (ORDER BY pa.pc DESC, pa.ms DESC, pa.artist_id ASC)::bigint AS prev_rnk
    FROM prev_agg pa
  ),
  page AS (
    SELECT cr.artist_id, ar.name AS ar_name, ar.image_url AS ar_img, cr.pc, cr.ms, cr.rnk, pr.prev_rnk
    FROM cur_ranked cr
    INNER JOIN public.artists ar ON ar.id = cr.artist_id
    LEFT JOIN prev_ranked pr ON pr.artist_id = cr.artist_id
    WHERE (search_query IS NULL OR trim(search_query) = '' OR ar.name ILIKE '%' || trim(search_query) || '%')
    ORDER BY cr.rnk ASC
    OFFSET greatest(result_offset, 0)
    LIMIT greatest(least(result_limit, 200), 1)
  )
  SELECT
    pg.artist_id::text,
    pg.ar_name::text,
    COALESCE(
      pg.ar_img,
      (
        SELECT al2.image_url
        FROM public.plays p2
        INNER JOIN public.tracks t2 ON t2.id = p2.track_id
        INNER JOIN public.albums al2 ON al2.id = t2.album_id
        WHERE p2.user_id = v_uid
          AND COALESCE(p2.artist_id, t2.artist_id) = pg.artist_id
          AND al2.image_url IS NOT NULL
        ORDER BY p2.played_at DESC
        LIMIT 1
      ),
      (
        SELECT al3.image_url FROM public.albums al3
        WHERE al3.artist_id = pg.artist_id AND al3.image_url IS NOT NULL LIMIT 1
      ),
      (
        SELECT al4.image_url
        FROM public.tracks t4
        INNER JOIN public.albums al4 ON al4.id = t4.album_id
        WHERE t4.artist_id = pg.artist_id AND al4.image_url IS NOT NULL
        LIMIT 1
      )
    )::text,
    pg.pc, pg.ms, pg.rnk, pg.prev_rnk,
    CASE WHEN pg.prev_rnk IS NULL THEN NULL ELSE (pg.prev_rnk - pg.rnk)::bigint END
  FROM page pg;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_albums_leaderboard_with_delta(
  start_date timestamptz,
  end_date timestamptz,
  prev_end_date timestamptz,
  search_query text DEFAULT NULL,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 40,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id text, name text, image_url text,
  play_count bigint, total_ms_played bigint, rank bigint, prev_rank bigint, rank_delta bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  RETURN QUERY
  WITH cur_agg AS (
    SELECT COALESCE(p.album_id, tr.album_id) AS album_id,
           COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    LEFT JOIN public.tracks tr ON tr.id = p.track_id
    WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= end_date
      AND COALESCE(p.album_id, tr.album_id) IS NOT NULL
    GROUP BY 1
  ),
  cur_ranked AS (
    SELECT c.album_id, c.pc, c.ms,
           ROW_NUMBER() OVER (ORDER BY c.pc DESC, c.ms DESC, c.album_id ASC)::bigint AS rnk
    FROM cur_agg c
  ),
  prev_agg AS (
    SELECT COALESCE(p.album_id, tr.album_id) AS album_id,
           COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    LEFT JOIN public.tracks tr ON tr.id = p.track_id
    WHERE p.user_id = v_uid AND p.played_at >= start_date AND p.played_at <= prev_end_date
      AND COALESCE(p.album_id, tr.album_id) IS NOT NULL
    GROUP BY 1
  ),
  prev_ranked AS (
    SELECT pa.album_id,
           ROW_NUMBER() OVER (ORDER BY pa.pc DESC, pa.ms DESC, pa.album_id ASC)::bigint AS prev_rnk
    FROM prev_agg pa
  )
  SELECT cr.album_id::text, ab.name::text, ab.image_url::text,
         cr.pc, cr.ms, cr.rnk, pr.prev_rnk,
         CASE WHEN pr.prev_rnk IS NULL THEN NULL ELSE (pr.prev_rnk - cr.rnk)::bigint END
  FROM cur_ranked cr
  INNER JOIN public.albums ab ON ab.id = cr.album_id
  LEFT JOIN prev_ranked pr ON pr.album_id = cr.album_id
  WHERE (search_query IS NULL OR trim(search_query) = '' OR ab.name ILIKE '%' || trim(search_query) || '%')
  ORDER BY cr.rnk ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_time_ranks(
  entity_type text,
  as_of timestamptz DEFAULT now(),
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (entity_id text, entity_name text, rank bigint, play_count bigint)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  PERFORM set_config('statement_timeout', '180s', true);

  IF entity_type = 'track' THEN
    RETURN QUERY
    WITH agg AS (
      SELECT p.track_id, COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS ms
      FROM public.plays p
      WHERE p.user_id = v_uid AND p.played_at <= as_of AND p.track_id IS NOT NULL
      GROUP BY p.track_id
    )
    SELECT a.track_id::text, tr.name::text,
           ROW_NUMBER() OVER (ORDER BY a.pc DESC, a.ms DESC, a.track_id ASC)::bigint, a.pc
    FROM agg a
    INNER JOIN public.tracks tr ON tr.id = a.track_id
    ORDER BY 3 ASC;
  ELSIF entity_type = 'artist' THEN
    RETURN QUERY
    WITH agg AS (
      SELECT COALESCE(p.artist_id, tr.artist_id) AS artist_id,
             COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS ms
      FROM public.plays p
      LEFT JOIN public.tracks tr ON tr.id = p.track_id
      WHERE p.user_id = v_uid AND p.played_at <= as_of
        AND COALESCE(p.artist_id, tr.artist_id) IS NOT NULL
      GROUP BY 1
    )
    SELECT a.artist_id::text, ar.name::text,
           ROW_NUMBER() OVER (ORDER BY a.pc DESC, a.ms DESC, a.artist_id ASC)::bigint, a.pc
    FROM agg a
    INNER JOIN public.artists ar ON ar.id = a.artist_id
    ORDER BY 3 ASC;
  ELSIF entity_type = 'album' THEN
    RETURN QUERY
    WITH agg AS (
      SELECT COALESCE(p.album_id, tr.album_id) AS album_id,
             COUNT(*)::bigint AS pc, COALESCE(SUM(p.ms_played), 0)::bigint AS ms
      FROM public.plays p
      LEFT JOIN public.tracks tr ON tr.id = p.track_id
      WHERE p.user_id = v_uid AND p.played_at <= as_of
        AND COALESCE(p.album_id, tr.album_id) IS NOT NULL
      GROUP BY 1
    )
    SELECT a.album_id::text, ab.name::text,
           ROW_NUMBER() OVER (ORDER BY a.pc DESC, a.ms DESC, a.album_id ASC)::bigint, a.pc
    FROM agg a
    INNER JOIN public.albums ab ON ab.id = a.album_id
    ORDER BY 3 ASC;
  ELSE
    RAISE EXCEPTION 'entity_type must be track, artist, or album';
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CALENDARIO
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_calendar_available_years(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (year integer, play_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXTRACT(YEAR FROM p.played_at AT TIME ZONE 'America/Santiago')::integer,
         COUNT(*)::bigint
  FROM plays p
  WHERE p.user_id = (SELECT public.req_uid(p_user_id))
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.get_calendar_memories(
  target_year integer,
  target_month integer,
  target_day integer DEFAULT 0,
  result_limit integer DEFAULT 15,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
  period_start timestamptz;
  period_end timestamptz;
  v_summary jsonb;
  v_tracks jsonb;
  v_artists jsonb;
  v_albums jsonb;
BEGIN
  IF target_day > 0 THEN
    period_start := make_timestamptz(target_year, target_month, target_day, 0, 0, 0, 'America/Santiago');
    period_end := period_start + interval '1 day';
  ELSE
    period_start := make_timestamptz(target_year, target_month, 1, 0, 0, 0, 'America/Santiago');
    IF target_month = 12 THEN
      period_end := make_timestamptz(target_year + 1, 1, 1, 0, 0, 0, 'America/Santiago');
    ELSE
      period_end := make_timestamptz(target_year, target_month + 1, 1, 0, 0, 0, 'America/Santiago');
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'play_count', COUNT(*)::bigint,
    'total_ms', COALESCE(SUM(p.ms_played), 0)::bigint,
    'unique_tracks', COUNT(DISTINCT p.track_id)::bigint,
    'unique_artists', COUNT(DISTINCT tr.artist_id)::bigint
  )
  INTO v_summary
  FROM plays p
  LEFT JOIN tracks tr ON tr.id = p.track_id
  WHERE p.user_id = v_uid AND p.played_at >= period_start AND p.played_at < period_end;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO v_tracks
  FROM (
    SELECT tr.id, tr.name, COALESCE(al.image_url, ar.image_url) AS image_url,
           ar.name AS artist_name, tr.spotify_url,
           COUNT(*)::bigint AS play_count,
           COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
    FROM plays p
    JOIN tracks tr ON tr.id = p.track_id
    LEFT JOIN albums al ON al.id = tr.album_id
    LEFT JOIN artists ar ON ar.id = tr.artist_id
    WHERE p.user_id = v_uid AND p.played_at >= period_start AND p.played_at < period_end
      AND p.track_id IS NOT NULL
    GROUP BY tr.id, tr.name, al.image_url, ar.image_url, ar.name, tr.spotify_url
    ORDER BY COUNT(*) DESC, SUM(p.ms_played) DESC, tr.name ASC
    LIMIT greatest(least(result_limit, 50), 1)
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb), '[]'::jsonb)
  INTO v_artists
  FROM (
    SELECT ar.id, ar.name,
      COALESCE(
        ar.image_url,
        (
          SELECT al2.image_url
          FROM public.plays p2
          INNER JOIN public.tracks t2 ON t2.id = p2.track_id
          INNER JOIN public.albums al2 ON al2.id = t2.album_id
          WHERE p2.user_id = v_uid
            AND COALESCE(p2.artist_id, t2.artist_id) = ar.id
            AND al2.image_url IS NOT NULL
          ORDER BY p2.played_at DESC
          LIMIT 1
        ),
        (
          SELECT al3.image_url FROM public.albums al3
          WHERE al3.artist_id = ar.id AND al3.image_url IS NOT NULL LIMIT 1
        )
      ) AS image_url,
      ar.spotify_url,
      COUNT(*)::bigint AS play_count,
      COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
    FROM plays p
    JOIN tracks tr ON tr.id = p.track_id
    JOIN artists ar ON ar.id = tr.artist_id
    WHERE p.user_id = v_uid AND p.played_at >= period_start AND p.played_at < period_end
      AND p.track_id IS NOT NULL AND tr.artist_id IS NOT NULL
    GROUP BY ar.id, ar.name, ar.image_url, ar.spotify_url
    ORDER BY COUNT(*) DESC, SUM(p.ms_played) DESC, ar.name ASC
    LIMIT greatest(least(result_limit, 50), 1)
  ) a;

  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb), '[]'::jsonb)
  INTO v_albums
  FROM (
    SELECT al.id, al.name, al.image_url, ar.name AS artist_name, al.spotify_url,
           COUNT(*)::bigint AS play_count,
           COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
    FROM plays p
    JOIN tracks tr ON tr.id = p.track_id
    JOIN albums al ON al.id = tr.album_id
    LEFT JOIN artists ar ON ar.id = tr.artist_id
    WHERE p.user_id = v_uid AND p.played_at >= period_start AND p.played_at < period_end
      AND tr.album_id IS NOT NULL
    GROUP BY al.id, al.name, al.image_url, ar.name, al.spotify_url
    ORDER BY COUNT(*) DESC, SUM(p.ms_played) DESC, al.name ASC
    LIMIT greatest(least(result_limit, 50), 1)
  ) a;

  RETURN jsonb_build_object('summary', v_summary, 'tracks', v_tracks, 'artists', v_artists, 'albums', v_albums);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- KURT (racha)
-- ═══════════════════════════════════════════════════════════════════════════

-- PostgREST recorta RPCs tabulares a 1000 filas: ORDER BY d DESC para quedarnos con lo reciente.
CREATE OR REPLACE FUNCTION public.get_listen_days(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (d date, play_count bigint, total_ms bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (p.played_at AT TIME ZONE 'America/Santiago')::date,
         COUNT(*)::bigint,
         COALESCE(SUM(p.ms_played), 0)::bigint
  FROM plays p
  WHERE p.user_id = (SELECT public.req_uid(p_user_id)) AND p.ms_played >= 30000
  GROUP BY 1
  ORDER BY 1 DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_kurt_status(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH days AS (
    SELECT DISTINCT (p.played_at AT TIME ZONE 'America/Santiago')::date AS d
    FROM plays p
    WHERE p.user_id = (SELECT public.req_uid(p_user_id)) AND p.ms_played >= 30000
  ),
  today AS (
    SELECT (timezone('America/Santiago', now()))::date AS d
  ),
  numbered AS (
    SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::integer AS grp FROM days
  ),
  streaks AS (
    SELECT MIN(d) AS start_d, MAX(d) AS end_d, COUNT(*)::integer AS len
    FROM numbered GROUP BY grp
  ),
  meta AS (
    SELECT
      t.d AS today,
      (t.d - 1) AS yesterday,
      EXISTS (SELECT 1 FROM days x WHERE x.d = t.d) AS listened_today,
      EXISTS (SELECT 1 FROM days x WHERE x.d = t.d - 1) AS listened_yesterday,
      (SELECT MAX(d) FROM days) AS last_listen_day,
      COALESCE((SELECT MAX(len) FROM streaks), 0) AS longest_streak,
      GREATEST(COALESCE((SELECT COUNT(*) FROM streaks), 0) - 1, 0) AS incidents,
      COALESCE((SELECT COUNT(*) FROM days), 0) AS total_listen_days
    FROM today t
  ),
  current AS (
    SELECT CASE
      WHEN m.listened_today THEN COALESCE((SELECT s.len FROM streaks s WHERE s.end_d = m.today), 0)
      WHEN m.listened_yesterday THEN COALESCE((SELECT s.len FROM streaks s WHERE s.end_d = m.yesterday), 0)
      ELSE 0
    END AS current_streak
    FROM meta m
  ),
  recent AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(g::date, 'YYYY-MM-DD'),
          'listened', EXISTS (SELECT 1 FROM days x WHERE x.d = g::date)
        )
        ORDER BY g
      ),
      '[]'::jsonb
    ) AS grid
    FROM meta m, generate_series(m.today - 27, m.today, interval '1 day') g
  )
  SELECT jsonb_build_object(
    'today', to_char(m.today, 'YYYY-MM-DD'),
    'listened_today', m.listened_today,
    'listened_yesterday', m.listened_yesterday,
    'current_streak', c.current_streak,
    'longest_streak', GREATEST(m.longest_streak, c.current_streak),
    'last_listen_day', CASE WHEN m.last_listen_day IS NULL THEN NULL ELSE to_char(m.last_listen_day, 'YYYY-MM-DD') END,
    'incidents', m.incidents,
    'total_listen_days', m.total_listen_days,
    'at_risk', (NOT m.listened_today AND m.listened_yesterday AND c.current_streak > 0),
    'kurt_down', (c.current_streak = 0),
    'recent', r.grid
  )
  FROM meta m, current c, recent r;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RATINGS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_logical_track_rating(
  p_track_name text,
  p_artist_id text,
  p_user_id uuid DEFAULT NULL
)
RETURNS smallint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT sr.rating
  FROM song_ratings sr
  INNER JOIN tracks t ON t.id = sr.track_id
  WHERE sr.user_id = (SELECT public.req_uid(p_user_id))
    AND public.rating_song_key(t.name, t.artist_id) = public.rating_song_key(p_track_name, p_artist_id)
  ORDER BY sr.updated_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_track_rating(p_track_id text, p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT sr.rating
  FROM song_ratings sr
  WHERE sr.user_id = (SELECT public.req_uid(p_user_id)) AND sr.track_id = p_track_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_ratings_dashboard(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE -- usa tabla temporal

SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
  total_rated bigint;
  avg_rating numeric;
  top_tracks_json jsonb;
  top_albums_json jsonb;
  top_artists_json jsonb;
  recent_json jsonb;
  distribution_json jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _my_logical_ratings ON COMMIT DROP AS
  SELECT NULL::text AS song_key, NULL::text AS track_id, NULL::smallint AS rating,
         NULL::timestamptz AS updated_at, NULL::text AS track_name, NULL::text AS artist_id,
         NULL::text AS album_id, NULL::text AS artist_name, NULL::text AS album_name,
         NULL::text AS image_url
  WITH NO DATA;
  TRUNCATE _my_logical_ratings;

  INSERT INTO _my_logical_ratings
  SELECT DISTINCT ON (public.rating_song_key(t.name, t.artist_id))
    public.rating_song_key(t.name, t.artist_id),
    sr.track_id, sr.rating, sr.updated_at, t.name, t.artist_id, t.album_id,
    ar.name, al.name, COALESCE(al.image_url, ar.image_url)
  FROM song_ratings sr
  INNER JOIN tracks t ON t.id = sr.track_id
  LEFT JOIN artists ar ON ar.id = t.artist_id
  LEFT JOIN albums al ON al.id = t.album_id
  WHERE sr.user_id = v_uid
  ORDER BY public.rating_song_key(t.name, t.artist_id), sr.updated_at DESC;

  SELECT COUNT(*), COALESCE(ROUND(AVG(l.rating)::numeric, 1), 0)
  INTO total_rated, avg_rating
  FROM _my_logical_ratings l;

  -- Top: entre versiones de la misma canción se queda con el rating más alto.
  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO top_tracks_json
  FROM (
    SELECT l.track_id, l.rating, l.updated_at, l.track_name, l.artist_name, l.album_name,
           l.album_id, l.artist_id, l.image_url
    FROM (
      SELECT DISTINCT ON (public.rating_song_key(t.name, t.artist_id))
        sr.track_id, sr.rating, sr.updated_at, t.name AS track_name, ar.name AS artist_name,
        al.name AS album_name, t.album_id, t.artist_id, COALESCE(al.image_url, ar.image_url) AS image_url
      FROM song_ratings sr
      INNER JOIN tracks t ON t.id = sr.track_id
      LEFT JOIN artists ar ON ar.id = t.artist_id
      LEFT JOIN albums al ON al.id = t.album_id
      WHERE sr.user_id = v_uid
      ORDER BY public.rating_song_key(t.name, t.artist_id), sr.rating DESC, sr.updated_at DESC
    ) l
    ORDER BY l.rating DESC, l.updated_at DESC
    LIMIT 100
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO top_albums_json
  FROM (
    SELECT
      al.id AS album_id,
      al.name AS album_name,
      ar.name AS artist_name,
      al.image_url,
      AVG(lr.rating)::numeric AS avg_rating,
      COUNT(DISTINCT CASE WHEN lr.rating IS NOT NULL THEN lr.song_key END)::integer AS rated_tracks,
      COUNT(DISTINCT public.rating_song_key(t.name, t.artist_id))::integer AS total_tracks
    FROM albums al
    LEFT JOIN artists ar ON ar.id = al.artist_id
    INNER JOIN tracks t ON t.album_id = al.id
    LEFT JOIN _my_logical_ratings lr ON lr.song_key = public.rating_song_key(t.name, t.artist_id)
    WHERE al.id IN (
      SELECT DISTINCT t0.album_id FROM _my_logical_ratings l0
      INNER JOIN tracks t0 ON public.rating_song_key(t0.name, t0.artist_id) = l0.song_key
      WHERE t0.album_id IS NOT NULL
    )
    AND (
      al.album_type = 'album'
      OR al.album_type = 'compilation'
      OR (al.album_type IS NULL AND (SELECT COUNT(*) FROM tracks t2 WHERE t2.album_id = al.id) >= 4)
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
    HAVING COUNT(DISTINCT CASE WHEN lr.rating IS NOT NULL THEN lr.song_key END)
         = COUNT(DISTINCT public.rating_song_key(t.name, t.artist_id))
    ORDER BY AVG(lr.rating) DESC, COUNT(DISTINCT CASE WHEN lr.rating IS NOT NULL THEN lr.song_key END) DESC
    LIMIT 100
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO top_artists_json
  FROM (
    SELECT l.artist_id, ar.name AS artist_name,
           COALESCE(ar.image_url, cover.fallback_img) AS image_url,
           ROUND(AVG(l.rating)::numeric, 1) AS avg_rating,
           COUNT(*)::integer AS rated_tracks
    FROM _my_logical_ratings l
    INNER JOIN artists ar ON ar.id = l.artist_id
    LEFT JOIN LATERAL (
      SELECT al2.image_url AS fallback_img FROM albums al2
      WHERE al2.artist_id = ar.id AND al2.image_url IS NOT NULL LIMIT 1
    ) cover ON TRUE
    WHERE l.artist_id IS NOT NULL
    GROUP BY l.artist_id, ar.name, COALESCE(ar.image_url, cover.fallback_img)
    HAVING COUNT(*) > 10
    ORDER BY AVG(l.rating) DESC, COUNT(*) DESC
    LIMIT 100
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO recent_json
  FROM (
    SELECT l.track_id, l.rating, l.updated_at, l.track_name, l.artist_name, l.album_name,
           l.album_id, l.artist_id, l.image_url
    FROM _my_logical_ratings l
    ORDER BY l.updated_at DESC
    LIMIT 10
  ) q;

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.rating), '[]'::jsonb)
  INTO distribution_json
  FROM (
    SELECT gs.r AS rating, COALESCE(c.cnt, 0)::integer AS count
    FROM generate_series(1, 10) gs(r)
    LEFT JOIN (
      SELECT l.rating, COUNT(*)::integer AS cnt FROM _my_logical_ratings l GROUP BY l.rating
    ) c ON c.rating = gs.r
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

CREATE OR REPLACE FUNCTION public.get_rated_tracks(
  sort_mode text DEFAULT 'rating_desc',
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 36,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  track_id text, rating smallint, created_at timestamptz, updated_at timestamptz,
  track_name text, artist_name text, album_name text, album_id text, artist_id text, image_url text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH logical AS (
    SELECT DISTINCT ON (public.rating_song_key(t.name, t.artist_id))
      sr.track_id, sr.rating, sr.created_at, sr.updated_at,
      t.name AS track_name, ar.name AS artist_name, al.name AS album_name,
      t.album_id, t.artist_id, COALESCE(al.image_url, ar.image_url) AS image_url
    FROM song_ratings sr
    INNER JOIN tracks t ON t.id = sr.track_id
    LEFT JOIN artists ar ON ar.id = t.artist_id
    LEFT JOIN albums al ON al.id = t.album_id
    WHERE sr.user_id = (SELECT public.req_uid(p_user_id))
    ORDER BY public.rating_song_key(t.name, t.artist_id), sr.updated_at DESC
  )
  SELECT l.track_id, l.rating, l.created_at, l.updated_at, l.track_name, l.artist_name,
         l.album_name, l.album_id, l.artist_id, l.image_url
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

-- Solo canciones que el usuario escuchó o valoró (el catálogo es compartido).
CREATE OR REPLACE FUNCTION public.search_tracks_for_rating(
  search_query text,
  result_limit integer DEFAULT 20,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id text, name text, artist_id text, artist_name text, album_name text,
  image_url text, current_rating smallint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT t.id, t.name, t.artist_id, ar.name AS artist_name, al.name AS album_name,
           COALESCE(al.image_url, ar.image_url) AS image_url,
           public.get_logical_track_rating(t.name, t.artist_id, v_uid) AS current_rating
    FROM tracks t
    LEFT JOIN artists ar ON ar.id = t.artist_id
    LEFT JOIN albums al ON al.id = t.album_id
    WHERE (t.name ILIKE '%' || trim(search_query) || '%' OR ar.name ILIKE '%' || trim(search_query) || '%')
      AND (
        EXISTS (SELECT 1 FROM plays p WHERE p.user_id = v_uid AND p.track_id = t.id)
        OR EXISTS (SELECT 1 FROM song_ratings sr WHERE sr.user_id = v_uid AND sr.track_id = t.id)
      )
  ),
  deduped AS (
    SELECT DISTINCT ON (public.rating_song_key(c.name, c.artist_id)) c.*
    FROM candidates c
    ORDER BY public.rating_song_key(c.name, c.artist_id), (c.current_rating IS NOT NULL) DESC, c.name ASC
  )
  SELECT d.id, d.name, d.artist_id, d.artist_name, d.album_name, d.image_url, d.current_rating
  FROM deduped d
  ORDER BY (d.current_rating IS NOT NULL) DESC, d.name ASC
  LIMIT greatest(least(result_limit, 50), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.search_albums_for_rating(
  search_query text,
  result_limit integer DEFAULT 20,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (id text, name text, artist_name text, image_url text, track_count bigint)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  RETURN QUERY
  SELECT al.id, al.name, ar.name, al.image_url,
         COUNT(DISTINCT public.rating_song_key(t.name, t.artist_id))::bigint
  FROM albums al
  LEFT JOIN artists ar ON ar.id = al.artist_id
  LEFT JOIN tracks t ON t.album_id = al.id
  WHERE (al.name ILIKE '%' || trim(search_query) || '%' OR ar.name ILIKE '%' || trim(search_query) || '%')
    AND EXISTS (
      SELECT 1 FROM plays p
      INNER JOIN tracks tp ON tp.id = p.track_id
      WHERE p.user_id = v_uid AND COALESCE(p.album_id, tp.album_id) = al.id
    )
  GROUP BY al.id, al.name, ar.name, al.image_url
  ORDER BY al.name ASC
  LIMIT greatest(least(result_limit, 40), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_album_tracks_for_rating(
  p_album_id text,
  result_limit integer DEFAULT 200,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id text, name text, artist_id text, artist_name text, album_name text,
  image_url text, current_rating smallint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  RETURN QUERY
  SELECT d.id, d.name, d.artist_id, d.artist_name, d.album_name, d.image_url, d.current_rating
  FROM (
    SELECT DISTINCT ON (public.rating_song_key(t.name, t.artist_id))
      t.id, t.name, t.artist_id, ar.name AS artist_name, al.name AS album_name,
      COALESCE(al.image_url, ar.image_url) AS image_url,
      public.get_logical_track_rating(t.name, t.artist_id, v_uid) AS current_rating
    FROM tracks t
    INNER JOIN albums al ON al.id = t.album_id
    LEFT JOIN artists ar ON ar.id = t.artist_id
    WHERE t.album_id = p_album_id
    ORDER BY public.rating_song_key(t.name, t.artist_id), t.id
  ) d
  ORDER BY d.name ASC
  LIMIT greatest(least(result_limit, 300), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_unrated_random_tracks(
  result_limit integer DEFAULT 10,
  p_exclude_ids text[] DEFAULT ARRAY['__none__']::text[],
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id text, name text, artist_id text, artist_name text, album_name text,
  image_url text, play_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  RETURN QUERY
  SELECT t.id::text, t.name, t.artist_id::text, ar.name, al.name,
         COALESCE(al.image_url, ar.image_url), COUNT(p.id)
  FROM plays p
  JOIN tracks t ON t.id = p.track_id
  LEFT JOIN artists ar ON ar.id = t.artist_id
  LEFT JOIN albums al ON al.id = t.album_id
  LEFT JOIN song_ratings sr ON sr.track_id = t.id AND sr.user_id = v_uid
  WHERE p.user_id = v_uid
    AND sr.track_id IS NULL
    AND t.id::text != ALL(p_exclude_ids)
  GROUP BY t.id, t.name, t.artist_id, ar.name, al.name, al.image_url, ar.image_url
  ORDER BY random()
  LIMIT result_limit;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CANCIONERO (compartido): búsqueda = canciones con cifra + las que escuchaste.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.search_tracks_for_chart(
  search_query text,
  result_limit integer DEFAULT 20,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id text, name text, artist_id text, artist_name text, album_name text,
  image_url text, has_chart boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.req_uid(p_user_id);
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT t.id, t.name, t.artist_id, ar.name AS artist_name, al.name AS album_name,
           COALESCE(al.image_url, ar.image_url) AS image_url,
           EXISTS (
             SELECT 1 FROM public.song_charts sc
             INNER JOIN public.tracks t2 ON t2.id = sc.track_id
             WHERE sc.track_id = t.id
                OR public.rating_song_key(t2.name, t2.artist_id) = public.rating_song_key(t.name, t.artist_id)
           ) AS has_chart
    FROM public.tracks t
    LEFT JOIN public.artists ar ON ar.id = t.artist_id
    LEFT JOIN public.albums al ON al.id = t.album_id
    WHERE t.name ILIKE '%' || trim(search_query) || '%'
       OR ar.name ILIKE '%' || trim(search_query) || '%'
  ),
  visible AS (
    SELECT c.* FROM candidates c
    WHERE c.has_chart
       OR EXISTS (SELECT 1 FROM public.plays p WHERE p.user_id = v_uid AND p.track_id = c.id)
  ),
  deduped AS (
    SELECT DISTINCT ON (public.rating_song_key(v.name, v.artist_id)) v.*
    FROM visible v
    ORDER BY public.rating_song_key(v.name, v.artist_id), v.has_chart DESC, v.name ASC
  )
  SELECT d.id, d.name, d.artist_id, d.artist_name, d.album_name, d.image_url, d.has_chart
  FROM deduped d
  ORDER BY d.has_chart DESC, d.name ASC
  LIMIT greatest(least(result_limit, 50), 1);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PERMISOS: nada para anon; usuarios autenticados y service role.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    INNER JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'plays_in_range_with_sessions', 'get_total_listening_time', 'get_top_tracks',
        'get_top_artists', 'get_top_albums', 'get_listening_over_time', 'get_hourly_distribution',
        'get_platform_breakdown', 'get_heatmap_data', '_dashboard_bundle_series_json',
        'get_dashboard_bundle_fast', 'get_dashboard_bundle_rollups', 'get_dashboard_bundle',
        '_user_rollups_fresh', 'get_tracks_leaderboard', 'get_artists_leaderboard',
        'get_albums_leaderboard', 'get_artist_top_tracks_in_period', 'get_artist_period_stats',
        'get_album_period_stats', 'get_track_play_counts_in_period',
        'get_tracks_leaderboard_with_delta', 'get_artists_leaderboard_with_delta',
        'get_albums_leaderboard_with_delta', 'get_all_time_ranks', 'get_calendar_available_years',
        'get_calendar_memories', 'get_listen_days', 'get_kurt_status', 'get_logical_track_rating',
        'get_track_rating', 'get_ratings_dashboard', 'get_rated_tracks', 'search_tracks_for_rating',
        'search_albums_for_rating', 'get_album_tracks_for_rating', 'get_unrated_random_tracks',
        'search_tracks_for_chart', 'get_song_chart', 'get_equivalent_track_ids', 'rating_song_key'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;
