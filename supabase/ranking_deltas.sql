-- Leaderboards con cambio de puesto vs. un corte anterior (p. ej. hace 7 días).
-- rank_delta > 0 = subió; < 0 = bajó; NULL = nuevo (sin prev_rank).
-- Ejecutar tras tracks/artists/albums_rpcs.sql

CREATE OR REPLACE FUNCTION public.get_tracks_leaderboard_with_delta(
  start_date timestamptz,
  end_date timestamptz,
  prev_end_date timestamptz,
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
  total_ms_played bigint,
  rank bigint,
  prev_rank bigint,
  rank_delta bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  RETURN QUERY
  WITH cur_agg AS (
    SELECT
      p.track_id,
      COUNT(*)::bigint AS pc,
      COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    WHERE p.played_at >= start_date
      AND p.played_at <= end_date
      AND p.track_id IS NOT NULL
    GROUP BY p.track_id
  ),
  cur_ranked AS (
    SELECT
      c.track_id,
      c.pc,
      c.ms,
      ROW_NUMBER() OVER (ORDER BY c.pc DESC, c.ms DESC, c.track_id ASC)::bigint AS rnk
    FROM cur_agg c
  ),
  prev_agg AS (
    SELECT
      p.track_id,
      COUNT(*)::bigint AS pc,
      COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    WHERE p.played_at >= start_date
      AND p.played_at <= prev_end_date
      AND p.track_id IS NOT NULL
    GROUP BY p.track_id
  ),
  prev_ranked AS (
    SELECT
      p.track_id,
      ROW_NUMBER() OVER (ORDER BY p.pc DESC, p.ms DESC, p.track_id ASC)::bigint AS prev_rnk
    FROM prev_agg p
  )
  SELECT
    cr.track_id::text AS id,
    tr.name::text AS name,
    COALESCE(al.image_url, ar.image_url)::text AS image_url,
    ar.name::text AS artist_name,
    cr.pc AS play_count,
    cr.ms AS total_ms_played,
    cr.rnk AS rank,
    pr.prev_rnk AS prev_rank,
    CASE
      WHEN pr.prev_rnk IS NULL THEN NULL
      ELSE (pr.prev_rnk - cr.rnk)::bigint
    END AS rank_delta
  FROM cur_ranked cr
  INNER JOIN public.tracks tr ON tr.id = cr.track_id
  LEFT JOIN public.albums al ON al.id = tr.album_id
  LEFT JOIN public.artists ar ON ar.id = tr.artist_id
  LEFT JOIN prev_ranked pr ON pr.track_id = cr.track_id
  WHERE (
    search_query IS NULL
    OR trim(search_query) = ''
    OR tr.name ILIKE '%' || trim(search_query) || '%'
    OR ar.name ILIKE '%' || trim(search_query) || '%'
  )
  ORDER BY cr.rnk ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tracks_leaderboard_with_delta(
  timestamptz, timestamptz, timestamptz, text, integer, integer
) TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_artists_leaderboard_with_delta(
  start_date timestamptz,
  end_date timestamptz,
  prev_end_date timestamptz,
  search_query text DEFAULT NULL,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 40
)
RETURNS TABLE (
  id text,
  name text,
  image_url text,
  play_count bigint,
  total_ms_played bigint,
  rank bigint,
  prev_rank bigint,
  rank_delta bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  RETURN QUERY
  WITH cur_agg AS (
    SELECT
      p.artist_id,
      COUNT(*)::bigint AS pc,
      COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    WHERE p.played_at >= start_date
      AND p.played_at <= end_date
      AND p.artist_id IS NOT NULL
    GROUP BY p.artist_id
  ),
  cur_ranked AS (
    SELECT
      c.artist_id,
      c.pc,
      c.ms,
      ROW_NUMBER() OVER (ORDER BY c.pc DESC, c.ms DESC, c.artist_id ASC)::bigint AS rnk
    FROM cur_agg c
  ),
  prev_agg AS (
    SELECT
      p.artist_id,
      COUNT(*)::bigint AS pc,
      COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    WHERE p.played_at >= start_date
      AND p.played_at <= prev_end_date
      AND p.artist_id IS NOT NULL
    GROUP BY p.artist_id
  ),
  prev_ranked AS (
    SELECT
      p.artist_id,
      ROW_NUMBER() OVER (ORDER BY p.pc DESC, p.ms DESC, p.artist_id ASC)::bigint AS prev_rnk
    FROM prev_agg p
  )
  SELECT
    cr.artist_id::text AS id,
    ar.name::text AS name,
    ar.image_url::text AS image_url,
    cr.pc AS play_count,
    cr.ms AS total_ms_played,
    cr.rnk AS rank,
    pr.prev_rnk AS prev_rank,
    CASE
      WHEN pr.prev_rnk IS NULL THEN NULL
      ELSE (pr.prev_rnk - cr.rnk)::bigint
    END AS rank_delta
  FROM cur_ranked cr
  INNER JOIN public.artists ar ON ar.id = cr.artist_id
  LEFT JOIN prev_ranked pr ON pr.artist_id = cr.artist_id
  WHERE (
    search_query IS NULL
    OR trim(search_query) = ''
    OR ar.name ILIKE '%' || trim(search_query) || '%'
  )
  ORDER BY cr.rnk ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_artists_leaderboard_with_delta(
  timestamptz, timestamptz, timestamptz, text, integer, integer
) TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_albums_leaderboard_with_delta(
  start_date timestamptz,
  end_date timestamptz,
  prev_end_date timestamptz,
  search_query text DEFAULT NULL,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 40
)
RETURNS TABLE (
  id text,
  name text,
  image_url text,
  play_count bigint,
  total_ms_played bigint,
  rank bigint,
  prev_rank bigint,
  rank_delta bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  RETURN QUERY
  WITH cur_agg AS (
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
  ),
  cur_ranked AS (
    SELECT
      c.album_id,
      c.pc,
      c.ms,
      ROW_NUMBER() OVER (ORDER BY c.pc DESC, c.ms DESC, c.album_id ASC)::bigint AS rnk
    FROM cur_agg c
  ),
  prev_agg AS (
    SELECT
      COALESCE(p.album_id, tr.album_id) AS album_id,
      COUNT(*)::bigint AS pc,
      COALESCE(SUM(p.ms_played), 0)::bigint AS ms
    FROM public.plays p
    LEFT JOIN public.tracks tr ON tr.id = p.track_id
    WHERE p.played_at >= start_date
      AND p.played_at <= prev_end_date
      AND COALESCE(p.album_id, tr.album_id) IS NOT NULL
    GROUP BY COALESCE(p.album_id, tr.album_id)
  ),
  prev_ranked AS (
    SELECT
      p.album_id,
      ROW_NUMBER() OVER (ORDER BY p.pc DESC, p.ms DESC, p.album_id ASC)::bigint AS prev_rnk
    FROM prev_agg p
  )
  SELECT
    cr.album_id::text AS id,
    ab.name::text AS name,
    ab.image_url::text AS image_url,
    cr.pc AS play_count,
    cr.ms AS total_ms_played,
    cr.rnk AS rank,
    pr.prev_rnk AS prev_rank,
    CASE
      WHEN pr.prev_rnk IS NULL THEN NULL
      ELSE (pr.prev_rnk - cr.rnk)::bigint
    END AS rank_delta
  FROM cur_ranked cr
  INNER JOIN public.albums ab ON ab.id = cr.album_id
  LEFT JOIN prev_ranked pr ON pr.album_id = cr.album_id
  WHERE (
    search_query IS NULL
    OR trim(search_query) = ''
    OR ab.name ILIKE '%' || trim(search_query) || '%'
  )
  ORDER BY cr.rnk ASC
  OFFSET greatest(result_offset, 0)
  LIMIT greatest(least(result_limit, 200), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_albums_leaderboard_with_delta(
  timestamptz, timestamptz, timestamptz, text, integer, integer
) TO anon, authenticated, service_role;


-- Rankings all-time completos (para snapshots / alertas push).
CREATE OR REPLACE FUNCTION public.get_all_time_ranks(
  entity_type text,
  as_of timestamptz DEFAULT now()
)
RETURNS TABLE (
  entity_id text,
  entity_name text,
  rank bigint,
  play_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('statement_timeout', '180s', true);

  IF entity_type = 'track' THEN
    RETURN QUERY
    WITH agg AS (
      SELECT
        p.track_id,
        COUNT(*)::bigint AS pc,
        COALESCE(SUM(p.ms_played), 0)::bigint AS ms
      FROM public.plays p
      WHERE p.played_at <= as_of
        AND p.track_id IS NOT NULL
      GROUP BY p.track_id
    )
    SELECT
      a.track_id::text,
      tr.name::text,
      ROW_NUMBER() OVER (ORDER BY a.pc DESC, a.ms DESC, a.track_id ASC)::bigint,
      a.pc
    FROM agg a
    INNER JOIN public.tracks tr ON tr.id = a.track_id
    ORDER BY 3 ASC;
  ELSIF entity_type = 'artist' THEN
    RETURN QUERY
    WITH agg AS (
      SELECT
        p.artist_id,
        COUNT(*)::bigint AS pc,
        COALESCE(SUM(p.ms_played), 0)::bigint AS ms
      FROM public.plays p
      WHERE p.played_at <= as_of
        AND p.artist_id IS NOT NULL
      GROUP BY p.artist_id
    )
    SELECT
      a.artist_id::text,
      ar.name::text,
      ROW_NUMBER() OVER (ORDER BY a.pc DESC, a.ms DESC, a.artist_id ASC)::bigint,
      a.pc
    FROM agg a
    INNER JOIN public.artists ar ON ar.id = a.artist_id
    ORDER BY 3 ASC;
  ELSIF entity_type = 'album' THEN
    RETURN QUERY
    WITH agg AS (
      SELECT
        COALESCE(p.album_id, tr.album_id) AS album_id,
        COUNT(*)::bigint AS pc,
        COALESCE(SUM(p.ms_played), 0)::bigint AS ms
      FROM public.plays p
      LEFT JOIN public.tracks tr ON tr.id = p.track_id
      WHERE p.played_at <= as_of
        AND COALESCE(p.album_id, tr.album_id) IS NOT NULL
      GROUP BY COALESCE(p.album_id, tr.album_id)
    )
    SELECT
      a.album_id::text,
      ab.name::text,
      ROW_NUMBER() OVER (ORDER BY a.pc DESC, a.ms DESC, a.album_id ASC)::bigint,
      a.pc
    FROM agg a
    INNER JOIN public.albums ab ON ab.id = a.album_id
    ORDER BY 3 ASC;
  ELSE
    RAISE EXCEPTION 'entity_type must be track, artist, or album';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_time_ranks(text, timestamptz)
  TO anon, authenticated, service_role;
