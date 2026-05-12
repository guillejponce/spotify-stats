-- Dashboard: una sola RPC que calcula sesiones una vez y devuelve KPIs + tops + series.
-- Ejecutar en Supabase SQL Editor después de `stats_rpcs.sql` (requiere `plays_in_range_with_sessions`).
-- Reduce round-trips y evita recomputar la CTE de sesiones en paralelo.

CREATE OR REPLACE FUNCTION public.get_dashboard_bundle(
  start_date timestamptz,
  end_date timestamptz,
  result_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
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
  listening_by_day_json AS (
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
    'total',
    (SELECT to_jsonb(tr) FROM totals_row tr),
    'top_tracks',
    (SELECT j FROM top_tracks_json),
    'top_artists',
    (SELECT j FROM top_artists_json),
    'top_albums',
    (SELECT j FROM top_albums_json),
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

GRANT EXECUTE ON FUNCTION public.get_dashboard_bundle(timestamptz, timestamptz, integer)
TO service_role;

-- Historial / orden por fecha: ayuda al planner con rangos LIMIT+OFFSET.
CREATE INDEX IF NOT EXISTS plays_played_at_id_desc_idx
  ON public.plays (played_at DESC, id DESC);
