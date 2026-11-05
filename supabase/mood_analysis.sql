-- ============================================================================
-- MOOD ANALYSIS: Audio features + mood tracking
-- Basado en audio features de Spotify (valence, energy, etc)
-- ============================================================================

-- 1) AUDIO FEATURES por track
CREATE TABLE IF NOT EXISTS track_audio_features (
  track_id text PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  danceability float CHECK (danceability >= 0 AND danceability <= 1),
  energy float CHECK (energy >= 0 AND energy <= 1),
  valence float CHECK (valence >= 0 AND valence <= 1),
  acousticness float CHECK (acousticness >= 0 AND acousticness <= 1),
  instrumentalness float CHECK (instrumentalness >= 0 AND instrumentalness <= 1),
  speechiness float CHECK (speechiness >= 0 AND speechiness <= 1),
  tempo float,
  loudness float,
  mode integer CHECK (mode IN (0, 1)), -- 0 = minor, 1 = major
  key integer CHECK (key >= 0 AND key <= 11),
  time_signature integer,
  duration_ms integer,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS track_audio_features_valence_idx ON track_audio_features(valence);
CREATE INDEX IF NOT EXISTS track_audio_features_energy_idx ON track_audio_features(energy);
CREATE INDEX IF NOT EXISTS track_audio_features_updated_idx ON track_audio_features(updated_at);

-- 2) MOOD SNAPSHOTS agregados por período
CREATE TABLE IF NOT EXISTS mood_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('day', 'week', 'month', 'year')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  
  -- Mood metrics (promedios ponderados por ms_played)
  avg_valence float,
  avg_energy float,
  avg_danceability float,
  avg_acousticness float,
  
  -- Mood classification
  mood_label text, -- 'euphoric', 'energetic', 'chill', 'melancholic', 'focused', 'party'
  mood_intensity float, -- 0-1: qué tan fuerte es el mood
  
  -- Context
  total_plays integer,
  total_ms_played bigint,
  unique_tracks integer,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(user_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS mood_snapshots_user_period_idx 
  ON mood_snapshots(user_id, period_type, period_start DESC);
CREATE INDEX IF NOT EXISTS mood_snapshots_mood_label_idx 
  ON mood_snapshots(user_id, mood_label);

-- 3) FUNCIÓN: Clasificar mood basado en valence + energy
CREATE OR REPLACE FUNCTION classify_mood(
  p_valence float,
  p_energy float,
  p_acousticness float DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Matriz de mood basada en Russell's Circumplex Model of Affect
  
  IF p_valence IS NULL OR p_energy IS NULL THEN
    RETURN 'unknown';
  END IF;
  
  -- High energy, high valence = EUPHORIC/PARTY
  IF p_energy > 0.7 AND p_valence > 0.7 THEN
    RETURN 'euphoric';
  END IF;
  
  -- High energy, mid-high valence = ENERGETIC
  IF p_energy > 0.6 AND p_valence > 0.5 THEN
    RETURN 'energetic';
  END IF;
  
  -- High energy, low valence = ANGRY/INTENSE
  IF p_energy > 0.7 AND p_valence < 0.4 THEN
    RETURN 'intense';
  END IF;
  
  -- Low energy, high valence = CHILL/PEACEFUL
  IF p_energy < 0.5 AND p_valence > 0.5 THEN
    RETURN 'chill';
  END IF;
  
  -- Low energy, low valence = MELANCHOLIC/SAD
  IF p_energy < 0.5 AND p_valence < 0.4 THEN
    RETURN 'melancholic';
  END IF;
  
  -- Acoustic + low energy = FOCUSED
  IF p_acousticness IS NOT NULL AND p_acousticness > 0.6 AND p_energy < 0.6 THEN
    RETURN 'focused';
  END IF;
  
  -- Default: BALANCED
  RETURN 'balanced';
END;
$$;

-- 4) FUNCIÓN: Calcular mood snapshot para un período
CREATE OR REPLACE FUNCTION calculate_mood_snapshot(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_period_type text DEFAULT 'week'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_avg_valence float;
  v_avg_energy float;
  v_avg_danceability float;
  v_avg_acousticness float;
  v_mood_label text;
  v_mood_intensity float;
  v_total_plays integer;
  v_total_ms bigint;
  v_unique_tracks integer;
BEGIN
  -- Calcular promedios ponderados por ms_played
  SELECT
    COALESCE(
      SUM(taf.valence * p.ms_played) / NULLIF(SUM(p.ms_played), 0),
      NULL
    ),
    COALESCE(
      SUM(taf.energy * p.ms_played) / NULLIF(SUM(p.ms_played), 0),
      NULL
    ),
    COALESCE(
      SUM(taf.danceability * p.ms_played) / NULLIF(SUM(p.ms_played), 0),
      NULL
    ),
    COALESCE(
      SUM(taf.acousticness * p.ms_played) / NULLIF(SUM(p.ms_played), 0),
      NULL
    ),
    COUNT(*)::integer,
    SUM(p.ms_played)::bigint,
    COUNT(DISTINCT p.track_id)::integer
  INTO
    v_avg_valence,
    v_avg_energy,
    v_avg_danceability,
    v_avg_acousticness,
    v_total_plays,
    v_total_ms,
    v_unique_tracks
  FROM plays p
  INNER JOIN track_audio_features taf ON taf.track_id = p.track_id
  WHERE p.user_id = p_user_id
    AND p.played_at >= p_period_start
    AND p.played_at < p_period_end
    AND p.ms_played >= 30000; -- solo counts, no skips
  
  -- Si no hay datos, retornar null
  IF v_total_plays IS NULL OR v_total_plays = 0 THEN
    RETURN jsonb_build_object(
      'mood_label', 'no_data',
      'message', 'No plays with audio features in this period'
    );
  END IF;
  
  -- Clasificar mood
  v_mood_label := classify_mood(v_avg_valence, v_avg_energy, v_avg_acousticness);
  
  -- Calcular intensidad del mood (qué tan "extremo" es)
  -- Basado en distancia del centro (0.5, 0.5)
  v_mood_intensity := SQRT(
    POWER(COALESCE(v_avg_valence, 0.5) - 0.5, 2) + 
    POWER(COALESCE(v_avg_energy, 0.5) - 0.5, 2)
  ) / 0.707; -- normalizado 0-1
  
  v_result := jsonb_build_object(
    'user_id', p_user_id,
    'period_type', p_period_type,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'avg_valence', v_avg_valence,
    'avg_energy', v_avg_energy,
    'avg_danceability', v_avg_danceability,
    'avg_acousticness', v_avg_acousticness,
    'mood_label', v_mood_label,
    'mood_intensity', v_mood_intensity,
    'total_plays', v_total_plays,
    'total_ms_played', v_total_ms,
    'unique_tracks', v_unique_tracks
  );
  
  RETURN v_result;
END;
$$;

-- 5) FUNCIÓN: Obtener mood timeline
CREATE OR REPLACE FUNCTION get_mood_timeline(
  p_user_id uuid,
  p_period_type text DEFAULT 'week',
  p_limit integer DEFAULT 12
) RETURNS TABLE (
  period_start timestamptz,
  period_end timestamptz,
  avg_valence float,
  avg_energy float,
  mood_label text,
  mood_intensity float,
  total_plays integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interval interval;
  v_start timestamptz;
  v_end timestamptz;
  v_current timestamptz;
BEGIN
  -- Determinar intervalo
  v_interval := CASE p_period_type
    WHEN 'day' THEN '1 day'::interval
    WHEN 'week' THEN '1 week'::interval
    WHEN 'month' THEN '1 month'::interval
    WHEN 'year' THEN '1 year'::interval
    ELSE '1 week'::interval
  END;
  
  -- Calcular rango
  v_end := date_trunc(p_period_type, now());
  v_start := v_end - (v_interval * p_limit);
  
  -- Generar series de períodos y calcular mood para cada uno
  RETURN QUERY
  WITH periods AS (
    SELECT 
      gs AS period_start,
      gs + v_interval AS period_end
    FROM generate_series(v_start, v_end - v_interval, v_interval) gs
  )
  SELECT
    p.period_start,
    p.period_end,
    (calculate_mood_snapshot(p_user_id, p.period_start, p.period_end, p_period_type)->>'avg_valence')::float,
    (calculate_mood_snapshot(p_user_id, p.period_start, p.period_end, p_period_type)->>'avg_energy')::float,
    (calculate_mood_snapshot(p_user_id, p.period_start, p.period_end, p_period_type)->>'mood_label')::text,
    (calculate_mood_snapshot(p_user_id, p.period_start, p.period_end, p_period_type)->>'mood_intensity')::float,
    (calculate_mood_snapshot(p_user_id, p.period_start, p.period_end, p_period_type)->>'total_plays')::integer
  FROM periods p
  ORDER BY p.period_start DESC;
END;
$$;

-- 6) FUNCIÓN: Recomendar tracks por mood
CREATE OR REPLACE FUNCTION recommend_tracks_by_mood(
  p_user_id uuid,
  p_target_mood text,
  p_limit integer DEFAULT 20
) RETURNS TABLE (
  track_id text,
  track_name text,
  artist_name text,
  valence float,
  energy float,
  mood_match_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_valence float;
  v_target_energy float;
BEGIN
  -- Mapear mood a valores target de valence/energy
  CASE p_target_mood
    WHEN 'euphoric' THEN
      v_target_valence := 0.85;
      v_target_energy := 0.85;
    WHEN 'energetic' THEN
      v_target_valence := 0.65;
      v_target_energy := 0.75;
    WHEN 'party' THEN
      v_target_valence := 0.80;
      v_target_energy := 0.80;
    WHEN 'chill' THEN
      v_target_valence := 0.65;
      v_target_energy := 0.35;
    WHEN 'melancholic' THEN
      v_target_valence := 0.25;
      v_target_energy := 0.35;
    WHEN 'intense' THEN
      v_target_valence := 0.35;
      v_target_energy := 0.85;
    WHEN 'focused' THEN
      v_target_valence := 0.50;
      v_target_energy := 0.40;
    ELSE
      v_target_valence := 0.50;
      v_target_energy := 0.50;
  END CASE;
  
  -- Buscar tracks del usuario con audio features similares al mood target
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    a.name,
    taf.valence,
    taf.energy,
    -- Score basado en distancia euclidiana al target
    (1.0 - SQRT(
      POWER(taf.valence - v_target_valence, 2) + 
      POWER(taf.energy - v_target_energy, 2)
    ) / 1.414)::float AS mood_match_score
  FROM tracks t
  INNER JOIN artists a ON a.id = t.artist_id
  INNER JOIN track_audio_features taf ON taf.track_id = t.id
  WHERE EXISTS (
    SELECT 1 FROM plays p
    WHERE p.track_id = t.id
      AND p.user_id = p_user_id
      AND p.ms_played >= 30000
  )
  ORDER BY mood_match_score DESC
  LIMIT p_limit;
END;
$$;

-- 7) FUNCIÓN: Diversity score
CREATE OR REPLACE FUNCTION calculate_diversity_score(
  p_user_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artist_count integer;
  v_total_plays integer;
  v_top_artist_plays integer;
  v_artist_diversity float;
  v_genre_count integer;
  v_genre_diversity float;
  v_overall_score float;
BEGIN
  -- Contar artistas únicos y total de plays
  SELECT 
    COUNT(DISTINCT p.artist_id),
    COUNT(*),
    MAX(artist_plays)
  INTO v_artist_count, v_total_plays, v_top_artist_plays
  FROM plays p
  LEFT JOIN LATERAL (
    SELECT COUNT(*) as artist_plays
    FROM plays p2
    WHERE p2.artist_id = p.artist_id
      AND p2.user_id = p_user_id
      AND p2.played_at >= p_start_date
      AND p2.played_at < p_end_date
  ) ap ON true
  WHERE p.user_id = p_user_id
    AND p.played_at >= p_start_date
    AND p.played_at < p_end_date;
  
  -- Artist diversity: ratio artistas únicos / total plays
  -- Ajustado por concentración en top artist
  v_artist_diversity := CASE
    WHEN v_total_plays = 0 THEN 0
    ELSE (v_artist_count::float / SQRT(v_total_plays::float)) * 
         (1 - (v_top_artist_plays::float / v_total_plays::float) * 0.5)
  END;
  
  -- Genre diversity: contar géneros únicos
  SELECT COUNT(DISTINCT genre)
  INTO v_genre_count
  FROM plays p
  INNER JOIN artists a ON a.id = p.artist_id
  CROSS JOIN LATERAL unnest(a.genres) AS genre
  WHERE p.user_id = p_user_id
    AND p.played_at >= p_start_date
    AND p.played_at < p_end_date;
  
  -- Genre diversity score (normalizado, asumiendo ~50 géneros es muy diverso)
  v_genre_diversity := LEAST(v_genre_count::float / 50.0, 1.0);
  
  -- Overall score: promedio ponderado
  v_overall_score := (v_artist_diversity * 0.6 + v_genre_diversity * 0.4);
  v_overall_score := LEAST(v_overall_score, 1.0);
  
  RETURN jsonb_build_object(
    'overall_score', ROUND(v_overall_score::numeric, 3),
    'artist_diversity', ROUND(v_artist_diversity::numeric, 3),
    'genre_diversity', ROUND(v_genre_diversity::numeric, 3),
    'unique_artists', v_artist_count,
    'unique_genres', v_genre_count,
    'total_plays', v_total_plays
  );
END;
$$;

-- 8) Row Level Security
ALTER TABLE track_audio_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_snapshots ENABLE ROW LEVEL SECURITY;

-- Service role puede leer/escribir todo
GRANT ALL ON track_audio_features TO service_role;
GRANT ALL ON mood_snapshots TO service_role;

-- Comentarios
COMMENT ON TABLE track_audio_features IS 'Audio features de Spotify por track';
COMMENT ON TABLE mood_snapshots IS 'Snapshots de mood agregados por período';
COMMENT ON FUNCTION classify_mood IS 'Clasificar mood basado en valence/energy (Circumplex Model)';
COMMENT ON FUNCTION calculate_mood_snapshot IS 'Calcular mood para un período específico';
COMMENT ON FUNCTION get_mood_timeline IS 'Timeline de mood por período';
COMMENT ON FUNCTION recommend_tracks_by_mood IS 'Recomendar tracks que matcheen un mood target';
COMMENT ON FUNCTION calculate_diversity_score IS 'Calcular diversity score (artistas, géneros)';
