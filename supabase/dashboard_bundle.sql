-- Dashboard: una sola RPC que calcula sesiones una vez y devuelve KPIs + tops + series.
-- Ejecutar después de `stats_rpcs.sql`. Para lecturas rápidas: aplicá `stats_rollups.sql` y
-- `SELECT public.refresh_stats_rollups_full();` una vez; `get_dashboard_bundle` usará rollups si están al día.
--
-- Si ves 57014 "statement timeout": reaplicá este archivo (timeout extendido + índice + modo rápido).

-- Ventanas por track_id + played_at (CTE `plays_in_range_with_sessions`).
CREATE INDEX IF NOT EXISTS plays_track_id_played_at_idx
  ON public.plays (track_id, played_at)
  WHERE track_id IS NOT NULL;

-- Historial / orden por fecha.
CREATE INDEX IF NOT EXISTS plays_played_at_id_desc_idx
  ON public.plays (played_at DESC, id DESC);

-- Cuerpo común: series sin sesiones (solo lectura por rango en plays).
CREATE OR REPLACE FUNCTION public._dashboard_bundle_series_json(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH listening_by_day_json AS (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(d) ORDER BY d.date)
        FROM (
          SELECT
            to_char(g.chile_bucket, 'YYYY-MM-DD') AS date,
            SUM(g.ms_played)::bigint AS ms_played,
            COUNT(*)::bigint AS play_count
          FROM (
            SELECT
              date_trunc(
                'day',
                (p.played_at AT TIME ZONE 'America/Santiago')
              ) AS chile_bucket,
              p.ms_played
            FROM plays p
            WHERE p.played_at >= start_date AND p.played_at <= end_date
          ) g
          GROUP BY g.chile_bucket
          ORDER BY g.chile_bucket ASC
        ) d
      ),
      '[]'::jsonb
    ) AS j
  ),
  hourly_json AS (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hour)
        FROM (
          SELECT
            (
              EXTRACT(
                HOUR FROM (p.played_at AT TIME ZONE 'America/Santiago')
              )
            )::integer AS hour,
            COALESCE(SUM(p.ms_played), 0)::bigint AS ms_played,
            COUNT(*)::bigint AS play_count
          FROM plays p
          WHERE p.played_at >= start_date AND p.played_at <= end_date
          GROUP BY
            EXTRACT(
              HOUR FROM (p.played_at AT TIME ZONE 'America/Santiago')
            )
          ORDER BY 1 ASC
        ) h
      ),
      '[]'::jsonb
    ) AS j
  ),
  platform_json AS (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(pl) ORDER BY pl.ms_played DESC)
        FROM (
          SELECT
            COALESCE(
              NULLIF(trim(BOTH FROM p.platform::text), ''),
              '(unknown)'
            )::text AS platform,
            COUNT(*)::bigint AS play_count,
            COALESCE(SUM(p.ms_played), 0)::bigint AS ms_played
          FROM plays p
          WHERE p.played_at >= start_date AND p.played_at <= end_date
          GROUP BY
            COALESCE(
              NULLIF(trim(BOTH FROM p.platform::text), ''),
              '(unknown)'
            )
        ) pl
      ),
      '[]'::jsonb
    ) AS j
  ),
  months_top_json AS (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(m))
        FROM (
          SELECT
            to_char(mb.bucket, 'YYYY-MM') AS period,
            SUM(mb.ms_played)::bigint AS ms_played,
            COUNT(*)::bigint AS play_count
          FROM (
            SELECT
              date_trunc(
                'month',
                (p.played_at AT TIME ZONE 'America/Santiago')
              ) AS bucket,
              p.ms_played
            FROM plays p
            WHERE p.played_at >= start_date AND p.played_at <= end_date
          ) mb
          GROUP BY mb.bucket
          ORDER BY play_count DESC NULLS LAST
          LIMIT 36
        ) m
      ),
      '[]'::jsonb
    ) AS j
  ),
  years_json AS (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(y) ORDER BY y.year)
        FROM (
          SELECT
            EXTRACT(
              YEAR FROM (p.played_at AT TIME ZONE 'America/Santiago')
            )::integer AS year,
            COALESCE(SUM(p.ms_played), 0)::bigint AS ms_played,
            COUNT(*)::bigint AS play_count
          FROM plays p
          WHERE p.played_at >= start_date AND p.played_at <= end_date
          GROUP BY
            EXTRACT(
              YEAR FROM (p.played_at AT TIME ZONE 'America/Santiago')
            )
          ORDER BY year ASC
        ) y
      ),
      '[]'::jsonb
    ) AS j
  )
  SELECT jsonb_build_object(
    'listening_by_day',
    (SELECT j FROM listening_by_day_json),
    'hourly',
    (SELECT j FROM hourly_json),
    'platform',
    (SELECT j FROM platform_json),
    'months_top',
    (SELECT j FROM months_top_json),
    'years',
    (SELECT j FROM years_json)
  );
$$;

-- Modo rápido: sin `plays_in_range_with_sessions` (tops = segmentos por track/artist/album).
CREATE OR REPLACE FUNCTION public.get_dashboard_bundle_fast(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  series jsonb;
  totals jsonb;
  tops jsonb;
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  series := public._dashboard_bundle_series_json(start_date, end_date, result_limit);

  SELECT jsonb_build_object(
    'total_ms',
    COALESCE(SUM(p.ms_played), 0),
    'play_count',
    COUNT(*)::bigint,
    'session_count',
    0::bigint
  )
  INTO totals
  FROM plays p
  WHERE p.played_at >= start_date AND p.played_at <= end_date;

  WITH track_agg AS (
    SELECT
      p.track_id,
      COUNT(*)::bigint AS play_count,
      COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
    FROM plays p
    WHERE p.played_at >= start_date
      AND p.played_at <= end_date
      AND p.track_id IS NOT NULL
    GROUP BY p.track_id
  ),
  top_tracks_json AS (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(q))
        FROM (
          SELECT
            tr.id,
            tr.name,
            COALESCE(al.image_url, ar.image_url) AS image_url,
            a.play_count,
            a.total_ms_played
          FROM track_agg a
          INNER JOIN tracks tr ON tr.id = a.track_id
          LEFT JOIN albums al ON al.id = tr.album_id
          LEFT JOIN artists ar ON ar.id = tr.artist_id
          ORDER BY a.play_count DESC, tr.name ASC
          LIMIT result_limit
        ) q
      ),
      '[]'::jsonb
    ) AS j
  ),
  artist_seg AS (
    SELECT
      COALESCE(p.artist_id, tr.artist_id) AS artist_id,
      COUNT(*)::bigint AS play_count,
      COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
    FROM plays p
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE p.played_at >= start_date
      AND p.played_at <= end_date
      AND COALESCE(p.artist_id, tr.artist_id) IS NOT NULL
    GROUP BY COALESCE(p.artist_id, tr.artist_id)
  ),
  joined_artists AS (
    SELECT
      ag.artist_id,
      ag.play_count,
      ag.total_ms_played,
      ar.name AS ar_name,
      ar.image_url AS ar_img,
      cover.fallback_img
    FROM artist_seg ag
    INNER JOIN artists ar ON ar.id = ag.artist_id
    LEFT JOIN LATERAL (
      SELECT al2.image_url AS fallback_img
      FROM albums al2
      WHERE al2.artist_id = ar.id
        AND al2.image_url IS NOT NULL
      LIMIT 1
    ) cover ON TRUE
  ),
  artist_agg AS (
    SELECT
      j.artist_id AS id,
      j.ar_name AS name,
      COALESCE(j.ar_img, j.fallback_img) AS image_url,
      j.play_count,
      j.total_ms_played
    FROM joined_artists j
    ORDER BY j.play_count DESC, j.total_ms_played DESC, j.ar_name ASC
    LIMIT result_limit
  ),
  top_artists_json AS (
    SELECT COALESCE(
      (SELECT jsonb_agg(to_jsonb(a)) FROM artist_agg a),
      '[]'::jsonb
    ) AS j
  ),
  album_seg AS (
    SELECT
      COALESCE(p.album_id, tr.album_id) AS album_id,
      COUNT(*)::bigint AS play_count,
      COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
    FROM plays p
    LEFT JOIN tracks tr ON tr.id = p.track_id
    WHERE p.played_at >= start_date
      AND p.played_at <= end_date
      AND COALESCE(p.album_id, tr.album_id) IS NOT NULL
    GROUP BY COALESCE(p.album_id, tr.album_id)
  ),
  album_agg AS (
    SELECT
      ab.id,
      ab.name,
      ab.image_url,
      s.play_count,
      s.total_ms_played
    FROM album_seg s
    INNER JOIN albums ab ON ab.id = s.album_id
    ORDER BY s.play_count DESC, s.total_ms_played DESC, ab.name ASC
    LIMIT result_limit
  ),
  top_albums_json AS (
    SELECT COALESCE(
      (SELECT jsonb_agg(to_jsonb(ab)) FROM album_agg ab),
      '[]'::jsonb
    ) AS j
  )
  SELECT jsonb_build_object(
    'top_tracks',
    (SELECT j FROM top_tracks_json),
    'top_artists',
    (SELECT j FROM top_artists_json),
    'top_albums',
    (SELECT j FROM top_albums_json)
  )
  INTO STRICT tops;

  RETURN jsonb_build_object(
    'total',
    totals,
    'top_tracks',
    tops -> 'top_tracks',
    'top_artists',
    tops -> 'top_artists',
    'top_albums',
    tops -> 'top_albums',
    'listening_by_day',
    series -> 'listening_by_day',
    'hourly',
    series -> 'hourly',
    'platform',
    series -> 'platform',
    'months_top',
    series -> 'months_top',
    'years',
    series -> 'years'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_bundle(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  result jsonb;
  roll jsonb;
BEGIN
  /* Defaults del proyecto suelen ser ~8s; esta statement puede tardar mucho en “all time”. */
  PERFORM set_config('statement_timeout', '180s', true);

  /* Precálculo: lectura en tablas chicas (días / horas / plataforma / tops globales). */
  IF to_regclass('public.stats_daily_segments') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_proc p
       INNER JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'get_dashboard_bundle_rollups'
         AND pg_function_is_visible(p.oid)
     )
  THEN
    roll := public.get_dashboard_bundle_rollups(start_date, end_date, result_limit);
    IF roll IS NOT NULL THEN
      RETURN roll;
    END IF;
  END IF;

  WITH s AS (
    SELECT *
    FROM public.plays_in_range_with_sessions(start_date, end_date)
  ),
  totals_row AS (
    SELECT
      COALESCE(
        (
          SELECT SUM(p.ms_played)::bigint
          FROM plays p
          WHERE p.played_at >= start_date AND p.played_at <= end_date
        ),
        0
      ) AS total_ms,
      COALESCE(
        (
          SELECT COUNT(*)::bigint
          FROM plays p
          WHERE p.played_at >= start_date AND p.played_at <= end_date
        ),
        0
      ) AS play_count,
      (
        COALESCE(
          (
            SELECT COUNT(*)::bigint
            FROM (
              SELECT DISTINCT s2.track_id, s2.session_id
              FROM s s2
            ) x
          ),
          0
        )
        + COALESCE(
          (
            SELECT COUNT(*)::bigint
            FROM plays p
            WHERE p.played_at >= start_date
              AND p.played_at <= end_date
              AND p.track_id IS NULL
          ),
          0
        )
      )::bigint AS session_count
  ),
  track_agg AS (
    SELECT
      s3.track_id,
      COUNT(DISTINCT s3.session_id)::bigint AS play_count,
      COALESCE(SUM(s3.ms_played), 0)::bigint AS total_ms_played
    FROM s s3
    GROUP BY s3.track_id
  ),
  top_tracks_json AS (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(q))
        FROM (
          SELECT
            tr.id,
            tr.name,
            COALESCE(al.image_url, ar.image_url) AS image_url,
            a.play_count,
            a.total_ms_played
          FROM track_agg a
          INNER JOIN tracks tr ON tr.id = a.track_id
          LEFT JOIN albums al ON al.id = tr.album_id
          LEFT JOIN artists ar ON ar.id = tr.artist_id
          ORDER BY a.play_count DESC, tr.name ASC
          LIMIT result_limit
        ) q
      ),
      '[]'::jsonb
    ) AS j
  ),
  per_session AS (
    SELECT
      s4.artist_id,
      s4.track_id,
      s4.session_id,
      SUM(s4.ms_played)::bigint AS session_ms
    FROM s s4
    WHERE s4.artist_id IS NOT NULL
    GROUP BY s4.artist_id, s4.track_id, s4.session_id
  ),
  joined_artists AS (
    SELECT
      ps.artist_id,
      ps.session_ms,
      ar.name AS ar_name,
      ar.image_url AS ar_img,
      cover.fallback_img
    FROM per_session ps
    INNER JOIN artists ar ON ar.id = ps.artist_id
    LEFT JOIN LATERAL (
      SELECT al2.image_url AS fallback_img
      FROM albums al2
      WHERE al2.artist_id = ar.id
        AND al2.image_url IS NOT NULL
      LIMIT 1
    ) cover ON TRUE
  ),
  artist_agg AS (
    SELECT
      j.artist_id AS id,
      j.ar_name AS name,
      COALESCE(j.ar_img, j.fallback_img) AS image_url,
      COUNT(*)::bigint AS play_count,
      COALESCE(SUM(j.session_ms), 0)::bigint AS total_ms_played
    FROM joined_artists j
    GROUP BY j.artist_id, j.ar_name, COALESCE(j.ar_img, j.fallback_img)
    ORDER BY play_count DESC, total_ms_played DESC, j.ar_name ASC
    LIMIT result_limit
  ),
  top_artists_json AS (
    SELECT COALESCE(
      (SELECT jsonb_agg(to_jsonb(a)) FROM artist_agg a),
      '[]'::jsonb
    ) AS j
  ),
  per_session_album AS (
    SELECT
      s5.album_id,
      s5.track_id,
      s5.session_id,
      SUM(s5.ms_played)::bigint AS session_ms
    FROM s s5
    WHERE s5.album_id IS NOT NULL
    GROUP BY s5.album_id, s5.track_id, s5.session_id
  ),
  album_agg AS (
    SELECT
      ab.id,
      ab.name,
      ab.image_url,
      COUNT(*)::bigint AS play_count,
      COALESCE(SUM(psa.session_ms), 0)::bigint AS total_ms_played
    FROM per_session_album psa
    INNER JOIN albums ab ON ab.id = psa.album_id
    GROUP BY ab.id, ab.name, ab.image_url
    ORDER BY play_count DESC, total_ms_played DESC, ab.name ASC
    LIMIT result_limit
  ),
  top_albums_json AS (
    SELECT COALESCE(
      (SELECT jsonb_agg(to_jsonb(ab)) FROM album_agg ab),
      '[]'::jsonb
    ) AS j
  ),
  series AS (
    SELECT public._dashboard_bundle_series_json(start_date, end_date, result_limit) AS j
  )
  SELECT jsonb_build_object(
    'total',
    (SELECT to_jsonb(tr) FROM totals_row tr),
    'top_tracks',
    (SELECT j FROM top_tracks_json),
    'top_artists',
    (SELECT j FROM top_artists_json),
    'top_albums',
    (SELECT j FROM top_albums_json),
    'listening_by_day',
    (SELECT j -> 'listening_by_day' FROM series),
    'hourly',
    (SELECT j -> 'hourly' FROM series),
    'platform',
    (SELECT j -> 'platform' FROM series),
    'months_top',
    (SELECT j -> 'months_top' FROM series),
    'years',
    (SELECT j -> 'years' FROM series)
  )
  INTO STRICT result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public._dashboard_bundle_series_json(timestamptz, timestamptz, integer)
TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_dashboard_bundle_fast(timestamptz, timestamptz, integer)
TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_dashboard_bundle(timestamptz, timestamptz, integer)
TO anon, authenticated, service_role;

-- Fallback del servidor / cliente sin service_role.
GRANT EXECUTE ON FUNCTION public.plays_in_range_with_sessions(timestamptz, timestamptz, interval)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_listening_time(timestamptz, timestamptz)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_tracks(timestamptz, timestamptz, integer)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_artists(timestamptz, timestamptz, integer)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_albums(timestamptz, timestamptz, integer)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_listening_over_time(timestamptz, timestamptz, text)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_hourly_distribution(timestamptz, timestamptz)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_breakdown(timestamptz, timestamptz)
TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_heatmap_data(integer)
TO anon, authenticated;
