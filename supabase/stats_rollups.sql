-- Precálculo de estadísticas: tablas pequeñas + trigger por STATEMENT en INSERT a `plays`.
-- Ejecutar después de `base_script.sql` / tener tabla `plays`.
-- Luego: SELECT public.refresh_stats_rollups_full(); una vez para backfill.
-- `get_dashboard_bundle` (dashboard_bundle.sql) usa este camino si los rollups están al día.
--
-- Semántica: mismos números que contar filas en `plays` (segmentos). Los tops desde rollups
-- globales solo aplican a “todo el tiempo”; con filtros de fechas se agrupa `plays` en rango
-- (mucho menos datos que full scan + ventanas de sesión).

CREATE TABLE IF NOT EXISTS public.stats_daily_segments (
  bucket_date date NOT NULL PRIMARY KEY,
  segment_count bigint NOT NULL DEFAULT 0,
  total_ms bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.stats_daily_hour_segments (
  bucket_date date NOT NULL,
  hour_chile smallint NOT NULL CHECK (hour_chile >= 0 AND hour_chile <= 23),
  segment_count bigint NOT NULL DEFAULT 0,
  total_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_date, hour_chile)
);

CREATE TABLE IF NOT EXISTS public.stats_daily_platform_segments (
  bucket_date date NOT NULL,
  platform text NOT NULL,
  segment_count bigint NOT NULL DEFAULT 0,
  total_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_date, platform)
);

CREATE TABLE IF NOT EXISTS public.stats_track_segments (
  track_id text PRIMARY KEY,
  segment_count bigint NOT NULL DEFAULT 0,
  total_ms bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.stats_artist_segments (
  artist_id text PRIMARY KEY,
  segment_count bigint NOT NULL DEFAULT 0,
  total_ms bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.stats_album_segments (
  album_id text PRIMARY KEY,
  segment_count bigint NOT NULL DEFAULT 0,
  total_ms bigint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS stats_daily_segments_bucket_desc_idx
  ON public.stats_daily_segments (bucket_date DESC);

-- Una sola pasada sobre `plays` para poblar todo (post-import o primera vez).
CREATE OR REPLACE FUNCTION public.refresh_stats_rollups_full()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE public.stats_daily_segments;
  TRUNCATE public.stats_daily_hour_segments;
  TRUNCATE public.stats_daily_platform_segments;
  TRUNCATE public.stats_track_segments;
  TRUNCATE public.stats_artist_segments;
  TRUNCATE public.stats_album_segments;

  INSERT INTO public.stats_daily_segments (bucket_date, segment_count, total_ms)
  SELECT
    (p.played_at AT TIME ZONE 'America/Santiago')::date,
    COUNT(*)::bigint,
    COALESCE(SUM(p.ms_played), 0)::bigint
  FROM plays p
  GROUP BY 1;

  INSERT INTO public.stats_daily_hour_segments (
    bucket_date,
    hour_chile,
    segment_count,
    total_ms
  )
  SELECT
    (p.played_at AT TIME ZONE 'America/Santiago')::date,
    (
      EXTRACT(
        HOUR FROM (p.played_at AT TIME ZONE 'America/Santiago')
      )
    )::smallint,
    COUNT(*)::bigint,
    COALESCE(SUM(p.ms_played), 0)::bigint
  FROM plays p
  GROUP BY 1, 2;

  INSERT INTO public.stats_daily_platform_segments (
    bucket_date,
    platform,
    segment_count,
    total_ms
  )
  SELECT
    (p.played_at AT TIME ZONE 'America/Santiago')::date,
    COALESCE(
      NULLIF(trim(BOTH FROM p.platform::text), ''),
      '(unknown)'
    )::text,
    COUNT(*)::bigint,
    COALESCE(SUM(p.ms_played), 0)::bigint
  FROM plays p
  GROUP BY 1, 2;

  INSERT INTO public.stats_track_segments (track_id, segment_count, total_ms)
  SELECT
    p.track_id,
    COUNT(*)::bigint,
    COALESCE(SUM(p.ms_played), 0)::bigint
  FROM plays p
  WHERE p.track_id IS NOT NULL
  GROUP BY p.track_id;

  INSERT INTO public.stats_artist_segments (artist_id, segment_count, total_ms)
  SELECT
    COALESCE(p.artist_id, tr.artist_id),
    COUNT(*)::bigint,
    COALESCE(SUM(p.ms_played), 0)::bigint
  FROM plays p
  LEFT JOIN tracks tr ON tr.id = p.track_id
  WHERE COALESCE(p.artist_id, tr.artist_id) IS NOT NULL
  GROUP BY 1;

  INSERT INTO public.stats_album_segments (album_id, segment_count, total_ms)
  SELECT
    COALESCE(p.album_id, tr.album_id),
    COUNT(*)::bigint,
    COALESCE(SUM(p.ms_played), 0)::bigint
  FROM plays p
  LEFT JOIN tracks tr ON tr.id = p.track_id
  WHERE COALESCE(p.album_id, tr.album_id) IS NOT NULL
  GROUP BY 1;
END;
$$;

-- Trigger: un batch por statement INSERT (eficiente en imports masivos).
CREATE OR REPLACE FUNCTION public.stats_rollups_after_plays_insert_stmt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM new_rows LIMIT 1) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.stats_daily_segments (bucket_date, segment_count, total_ms)
  SELECT
    (nr.played_at AT TIME ZONE 'America/Santiago')::date,
    COUNT(*)::bigint,
    COALESCE(SUM(nr.ms_played), 0)::bigint
  FROM new_rows nr
  GROUP BY 1
  ON CONFLICT (bucket_date) DO UPDATE SET
    segment_count = public.stats_daily_segments.segment_count + EXCLUDED.segment_count,
    total_ms = public.stats_daily_segments.total_ms + EXCLUDED.total_ms;

  INSERT INTO public.stats_daily_hour_segments (
    bucket_date,
    hour_chile,
    segment_count,
    total_ms
  )
  SELECT
    (nr.played_at AT TIME ZONE 'America/Santiago')::date,
    (
      EXTRACT(
        HOUR FROM (nr.played_at AT TIME ZONE 'America/Santiago')
      )
    )::smallint,
    COUNT(*)::bigint,
    COALESCE(SUM(nr.ms_played), 0)::bigint
  FROM new_rows nr
  GROUP BY 1, 2
  ON CONFLICT (bucket_date, hour_chile) DO UPDATE SET
    segment_count =
      public.stats_daily_hour_segments.segment_count + EXCLUDED.segment_count,
    total_ms = public.stats_daily_hour_segments.total_ms + EXCLUDED.total_ms;

  INSERT INTO public.stats_daily_platform_segments (
    bucket_date,
    platform,
    segment_count,
    total_ms
  )
  SELECT
    (nr.played_at AT TIME ZONE 'America/Santiago')::date,
    COALESCE(
      NULLIF(trim(BOTH FROM nr.platform::text), ''),
      '(unknown)'
    )::text,
    COUNT(*)::bigint,
    COALESCE(SUM(nr.ms_played), 0)::bigint
  FROM new_rows nr
  GROUP BY 1, 2
  ON CONFLICT (bucket_date, platform) DO UPDATE SET
    segment_count =
      public.stats_daily_platform_segments.segment_count + EXCLUDED.segment_count,
    total_ms = public.stats_daily_platform_segments.total_ms + EXCLUDED.total_ms;

  INSERT INTO public.stats_track_segments (track_id, segment_count, total_ms)
  SELECT
    nr.track_id,
    COUNT(*)::bigint,
    COALESCE(SUM(nr.ms_played), 0)::bigint
  FROM new_rows nr
  WHERE nr.track_id IS NOT NULL
  GROUP BY nr.track_id
  ON CONFLICT (track_id) DO UPDATE SET
    segment_count = public.stats_track_segments.segment_count + EXCLUDED.segment_count,
    total_ms = public.stats_track_segments.total_ms + EXCLUDED.total_ms;

  INSERT INTO public.stats_artist_segments (artist_id, segment_count, total_ms)
  SELECT
    COALESCE(nr.artist_id, tr.artist_id),
    COUNT(*)::bigint,
    COALESCE(SUM(nr.ms_played), 0)::bigint
  FROM new_rows nr
  LEFT JOIN tracks tr ON tr.id = nr.track_id
  WHERE COALESCE(nr.artist_id, tr.artist_id) IS NOT NULL
  GROUP BY 1
  ON CONFLICT (artist_id) DO UPDATE SET
    segment_count =
      public.stats_artist_segments.segment_count + EXCLUDED.segment_count,
    total_ms = public.stats_artist_segments.total_ms + EXCLUDED.total_ms;

  INSERT INTO public.stats_album_segments (album_id, segment_count, total_ms)
  SELECT
    COALESCE(nr.album_id, tr.album_id),
    COUNT(*)::bigint,
    COALESCE(SUM(nr.ms_played), 0)::bigint
  FROM new_rows nr
  LEFT JOIN tracks tr ON tr.id = nr.track_id
  WHERE COALESCE(nr.album_id, tr.album_id) IS NOT NULL
  GROUP BY 1
  ON CONFLICT (album_id) DO UPDATE SET
    segment_count =
      public.stats_album_segments.segment_count + EXCLUDED.segment_count,
    total_ms = public.stats_album_segments.total_ms + EXCLUDED.total_ms;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS plays_stats_rollups_stmt ON public.plays;

CREATE TRIGGER plays_stats_rollups_stmt
AFTER INSERT ON public.plays
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.stats_rollups_after_plays_insert_stmt();

GRANT SELECT ON public.stats_daily_segments TO anon, authenticated, service_role;
GRANT SELECT ON public.stats_daily_hour_segments TO anon, authenticated, service_role;
GRANT SELECT ON public.stats_daily_platform_segments TO anon, authenticated, service_role;
GRANT SELECT ON public.stats_track_segments TO anon, authenticated, service_role;
GRANT SELECT ON public.stats_artist_segments TO anon, authenticated, service_role;
GRANT SELECT ON public.stats_album_segments TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.refresh_stats_rollups_full() TO service_role;

-- Dashboard rápido desde rollups (+ tops globales o agrupación acotada en `plays`).
CREATE OR REPLACE FUNCTION public.get_dashboard_bundle_rollups(
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
  d_start date := (start_date AT TIME ZONE 'America/Santiago')::date;
  d_end date := (end_date AT TIME ZONE 'America/Santiago')::date;
  global_tops boolean := start_date < timestamptz '1971-01-01 UTC';
  rollup_play_max date;
  plays_play_max date;
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
  SELECT MAX(bucket_date) INTO rollup_play_max FROM public.stats_daily_segments;
  SELECT MAX((p.played_at AT TIME ZONE 'America/Santiago')::date)
  INTO plays_play_max
  FROM public.plays p;

  IF rollup_play_max IS NULL OR plays_play_max IS NULL OR rollup_play_max < plays_play_max THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(t)
  INTO total_json
  FROM (
    SELECT
      COALESCE(SUM(d.total_ms), 0)::bigint AS total_ms,
      COALESCE(SUM(d.segment_count), 0)::bigint AS play_count,
      COALESCE(SUM(d.segment_count), 0)::bigint AS session_count
    FROM public.stats_daily_segments d
    WHERE d.bucket_date >= d_start AND d.bucket_date <= d_end
  ) t;

  SELECT COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.date)
      FROM (
        SELECT
          to_char(d.bucket_date, 'YYYY-MM-DD') AS date,
          d.total_ms AS ms_played,
          d.segment_count AS play_count
        FROM public.stats_daily_segments d
        WHERE d.bucket_date >= d_start AND d.bucket_date <= d_end
        ORDER BY d.bucket_date ASC
      ) x
    ),
    '[]'::jsonb
  )
  INTO listening_json;

  SELECT COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h.hour)
      FROM (
        SELECT
          h.hour_chile::integer AS hour,
          COALESCE(SUM(h.total_ms), 0)::bigint AS ms_played,
          COALESCE(SUM(h.segment_count), 0)::bigint AS play_count
        FROM public.stats_daily_hour_segments h
        WHERE h.bucket_date >= d_start AND h.bucket_date <= d_end
        GROUP BY h.hour_chile
        ORDER BY h.hour_chile ASC
      ) h
    ),
    '[]'::jsonb
  )
  INTO hourly_json;

  SELECT COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(pl) ORDER BY pl.ms_played DESC)
      FROM (
        SELECT
          p.platform,
          COALESCE(SUM(p.segment_count), 0)::bigint AS play_count,
          COALESCE(SUM(p.total_ms), 0)::bigint AS ms_played
        FROM public.stats_daily_platform_segments p
        WHERE p.bucket_date >= d_start AND p.bucket_date <= d_end
        GROUP BY p.platform
      ) pl
    ),
    '[]'::jsonb
  )
  INTO platform_json;

  SELECT COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(m))
      FROM (
        SELECT
          to_char(date_trunc('month', d.bucket_date), 'YYYY-MM') AS period,
          COALESCE(SUM(d.total_ms), 0)::bigint AS ms_played,
          COALESCE(SUM(d.segment_count), 0)::bigint AS play_count
        FROM public.stats_daily_segments d
        WHERE d.bucket_date >= d_start AND d.bucket_date <= d_end
        GROUP BY date_trunc('month', d.bucket_date)
        ORDER BY play_count DESC NULLS LAST
        LIMIT 36
      ) m
    ),
    '[]'::jsonb
  )
  INTO months_json;

  SELECT COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(y) ORDER BY y.year)
      FROM (
        SELECT
          EXTRACT(YEAR FROM d.bucket_date)::integer AS year,
          COALESCE(SUM(d.total_ms), 0)::bigint AS ms_played,
          COALESCE(SUM(d.segment_count), 0)::bigint AS play_count
        FROM public.stats_daily_segments d
        WHERE d.bucket_date >= d_start AND d.bucket_date <= d_end
        GROUP BY EXTRACT(YEAR FROM d.bucket_date)
        ORDER BY year ASC
      ) y
    ),
    '[]'::jsonb
  )
  INTO years_json;

  IF global_tops THEN
    SELECT COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(q))
        FROM (
          SELECT
            tr.id,
            tr.name,
            COALESCE(al.image_url, ar.image_url) AS image_url,
            sts.segment_count AS play_count,
            sts.total_ms AS total_ms_played
          FROM public.stats_track_segments sts
          INNER JOIN tracks tr ON tr.id = sts.track_id
          LEFT JOIN albums al ON al.id = tr.album_id
          LEFT JOIN artists ar ON ar.id = tr.artist_id
          ORDER BY sts.segment_count DESC, tr.name ASC
          LIMIT result_limit
        ) q
      ),
      '[]'::jsonb
    )
    INTO tracks_json;

    SELECT COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(q))
        FROM (
          SELECT
            ar.id,
            ar.name,
            COALESCE(ar.image_url, cover.fallback_img) AS image_url,
            sas.segment_count AS play_count,
            sas.total_ms AS total_ms_played
          FROM public.stats_artist_segments sas
          INNER JOIN artists ar ON ar.id = sas.artist_id
          LEFT JOIN LATERAL (
            SELECT al2.image_url AS fallback_img
            FROM albums al2
            WHERE al2.artist_id = ar.id
              AND al2.image_url IS NOT NULL
            LIMIT 1
          ) cover ON TRUE
          ORDER BY sas.segment_count DESC, sas.total_ms DESC, ar.name ASC
          LIMIT result_limit
        ) q
      ),
      '[]'::jsonb
    )
    INTO artists_json;

    SELECT COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(q))
        FROM (
          SELECT
            ab.id,
            ab.name,
            ab.image_url,
            sal.segment_count AS play_count,
            sal.total_ms AS total_ms_played
          FROM public.stats_album_segments sal
          INNER JOIN albums ab ON ab.id = sal.album_id
          ORDER BY sal.segment_count DESC, sal.total_ms DESC, ab.name ASC
          LIMIT result_limit
        ) q
      ),
      '[]'::jsonb
    )
    INTO albums_json;
  ELSE
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
          FROM (
            SELECT
              p.track_id,
              COUNT(*)::bigint AS play_count,
              COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
            FROM public.plays p
            WHERE p.played_at >= start_date
              AND p.played_at <= end_date
              AND p.track_id IS NOT NULL
            GROUP BY p.track_id
          ) a
          INNER JOIN tracks tr ON tr.id = a.track_id
          LEFT JOIN albums al ON al.id = tr.album_id
          LEFT JOIN artists ar ON ar.id = tr.artist_id
          ORDER BY a.play_count DESC, tr.name ASC
          LIMIT result_limit
        ) q
      ),
      '[]'::jsonb
    )
    INTO tracks_json;

    SELECT COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(q))
        FROM (
          SELECT
            ar.id,
            ar.name,
            COALESCE(ar.image_url, cover.fallback_img) AS image_url,
            ag.play_count,
            ag.total_ms_played
          FROM (
            SELECT
              COALESCE(p.artist_id, tr.artist_id) AS artist_id,
              COUNT(*)::bigint AS play_count,
              COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
            FROM public.plays p
            LEFT JOIN tracks tr ON tr.id = p.track_id
            WHERE p.played_at >= start_date
              AND p.played_at <= end_date
              AND COALESCE(p.artist_id, tr.artist_id) IS NOT NULL
            GROUP BY COALESCE(p.artist_id, tr.artist_id)
          ) ag
          INNER JOIN artists ar ON ar.id = ag.artist_id
          LEFT JOIN LATERAL (
            SELECT al2.image_url AS fallback_img
            FROM albums al2
            WHERE al2.artist_id = ar.id
              AND al2.image_url IS NOT NULL
            LIMIT 1
          ) cover ON TRUE
          ORDER BY ag.play_count DESC, ag.total_ms_played DESC, ar.name ASC
          LIMIT result_limit
        ) q
      ),
      '[]'::jsonb
    )
    INTO artists_json;

    SELECT COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(q))
        FROM (
          SELECT
            ab.id,
            ab.name,
            ab.image_url,
            x.play_count,
            x.total_ms_played
          FROM (
            SELECT
              COALESCE(p.album_id, tr.album_id) AS album_id,
              COUNT(*)::bigint AS play_count,
              COALESCE(SUM(p.ms_played), 0)::bigint AS total_ms_played
            FROM public.plays p
            LEFT JOIN tracks tr ON tr.id = p.track_id
            WHERE p.played_at >= start_date
              AND p.played_at <= end_date
              AND COALESCE(p.album_id, tr.album_id) IS NOT NULL
            GROUP BY COALESCE(p.album_id, tr.album_id)
          ) x
          INNER JOIN albums ab ON ab.id = x.album_id
          ORDER BY x.play_count DESC, x.total_ms_played DESC, ab.name ASC
          LIMIT result_limit
        ) q
      ),
      '[]'::jsonb
    )
    INTO albums_json;
  END IF;

  RETURN jsonb_build_object(
    'total',
    total_json,
    'top_tracks',
    tracks_json,
    'top_artists',
    artists_json,
    'top_albums',
    albums_json,
    'listening_by_day',
    listening_json,
    'hourly',
    hourly_json,
    'platform',
    platform_json,
    'months_top',
    months_json,
    'years',
    years_json
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_bundle_rollups(timestamptz, timestamptz, integer)
TO anon, authenticated, service_role;
