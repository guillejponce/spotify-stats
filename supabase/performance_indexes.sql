-- ============================================================================
-- ÍNDICES DE PERFORMANCE — ejecutar una vez en Supabase SQL Editor.
-- Cubre: plays, tracks, artists, albums, song_ratings.
-- Algunos ya existen en otros archivos (CREATE IF NOT EXISTS es idempotente).
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════
-- PLAYS — tabla más grande, critical path para todo
-- ═══════════════════════════════════════════════════════════════════

-- Filtro temporal principal (played_at range scans)
CREATE INDEX IF NOT EXISTS idx_plays_played_at
  ON plays (played_at DESC);

-- Leaderboard por track dentro de rango temporal
CREATE INDEX IF NOT EXISTS idx_plays_track_played_at
  ON plays (track_id, played_at)
  WHERE track_id IS NOT NULL;

-- Opcional: consultas que excluyan skips (< 30s); el leaderboard /tracks usa todos los segmentos
CREATE INDEX IF NOT EXISTS idx_plays_track_played_at_no_skip
  ON plays (track_id, played_at)
  WHERE track_id IS NOT NULL AND ms_played >= 30000;

-- Leaderboard por artista dentro de rango temporal
CREATE INDEX IF NOT EXISTS idx_plays_artist_played_at
  ON plays (artist_id, played_at)
  WHERE artist_id IS NOT NULL;

-- Leaderboard por álbum dentro de rango temporal
CREATE INDEX IF NOT EXISTS idx_plays_album_played_at
  ON plays (album_id, played_at)
  WHERE album_id IS NOT NULL;

-- Covering index para las agregaciones del dashboard (evita heap access)
CREATE INDEX IF NOT EXISTS idx_plays_played_at_covering
  ON plays (played_at)
  INCLUDE (track_id, artist_id, album_id, ms_played);

-- Covering index solo plays >= 30s (consultas opcionales, no el leaderboard /tracks)
CREATE INDEX IF NOT EXISTS idx_plays_played_at_no_skip_covering
  ON plays (played_at)
  INCLUDE (track_id, ms_played)
  WHERE ms_played >= 30000;

-- Heatmap / hourly: bucket por fecha Chile (expresión precalculada)
CREATE INDEX IF NOT EXISTS idx_plays_chile_date
  ON plays (((played_at AT TIME ZONE 'America/Santiago')::date));

-- Para el historial paginado
CREATE INDEX IF NOT EXISTS idx_plays_played_at_id_desc
  ON plays (played_at DESC, id DESC);

-- ═══════════════════════════════════════════════════════════════════
-- TRACKS — joins frecuentes con plays
-- ═══════════════════════════════════════════════════════════════════

-- Búsqueda textual (ILIKE '%query%' usa seq scan; trigram index lo mejora)
-- Requiere: CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Si tenés la extensión habilitada, descomentar:
-- CREATE INDEX IF NOT EXISTS idx_tracks_name_trgm ON tracks USING gin (name gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_artists_name_trgm ON artists USING gin (name gin_trgm_ops);

-- FK lookups desde plays
CREATE INDEX IF NOT EXISTS idx_tracks_artist_id ON tracks (artist_id);
CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks (album_id);

-- Búsqueda por nombre (para ratings search, B-tree prefix no sirve con ILIKE %x% pero sí con ILIKE 'x%')
CREATE INDEX IF NOT EXISTS idx_tracks_name_lower ON tracks (lower(name));

-- ═══════════════════════════════════════════════════════════════════
-- ALBUMS — FK desde tracks + image fallback
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_albums_artist_id ON albums (artist_id);
CREATE INDEX IF NOT EXISTS idx_albums_artist_image
  ON albums (artist_id)
  INCLUDE (image_url)
  WHERE image_url IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- SONG_RATINGS — queries del módulo de valoraciones
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_song_ratings_rating_desc
  ON song_ratings (rating DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_song_ratings_updated_desc
  ON song_ratings (updated_at DESC);

-- Join track_id → tracks (ya cubierto por UNIQUE constraint, pero explicitamos)
CREATE INDEX IF NOT EXISTS idx_song_ratings_track_id
  ON song_ratings (track_id);

-- ═══════════════════════════════════════════════════════════════════
-- STATS ROLLUP TABLES — mejorar sorts
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_stats_track_segments_count_desc
  ON stats_track_segments (segment_count DESC, total_ms DESC);

CREATE INDEX IF NOT EXISTS idx_stats_artist_segments_count_desc
  ON stats_artist_segments (segment_count DESC, total_ms DESC);

CREATE INDEX IF NOT EXISTS idx_stats_album_segments_count_desc
  ON stats_album_segments (segment_count DESC, total_ms DESC);

-- ═══════════════════════════════════════════════════════════════════
-- EXTENSIONES RECOMENDADAS (ejecutar si tenés permisos)
-- ═══════════════════════════════════════════════════════════════════

-- pg_trgm: búsqueda ILIKE '%texto%' eficiente con GIN indexes
-- Descomenta si no la tenés:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Después de habilitar pg_trgm, crear estos GIN indexes:
-- CREATE INDEX IF NOT EXISTS idx_tracks_name_trgm ON tracks USING gin (name gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_artists_name_trgm ON artists USING gin (name gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_albums_name_trgm ON albums USING gin (name gin_trgm_ops);
