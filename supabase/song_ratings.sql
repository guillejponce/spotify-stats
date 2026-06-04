-- Tabla de valoraciones de canciones (1-10)
-- Los álbumes y artistas heredan su puntaje como promedio de sus canciones valoradas.

CREATE TABLE IF NOT EXISTS song_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id text NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 10),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT song_ratings_track_unique UNIQUE (track_id)
);

CREATE INDEX IF NOT EXISTS idx_song_ratings_rating ON song_ratings(rating DESC);
CREATE INDEX IF NOT EXISTS idx_song_ratings_updated ON song_ratings(updated_at DESC);
