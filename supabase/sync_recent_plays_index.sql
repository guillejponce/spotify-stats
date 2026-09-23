-- Paso 1: borrar duplicados exactos (mismo track + mismo played_at), quedándonos con la fila más antigua.
-- Si el CREATE UNIQUE INDEX falló con 23505, ejecutá primero el DELETE y luego el CREATE.

DELETE FROM plays p
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY track_id, played_at
           ORDER BY created_at ASC NULLS LAST, id ASC
         ) AS rn
  FROM plays
  WHERE track_id IS NOT NULL
) d
WHERE p.id = d.id
  AND d.rn > 1;

-- Paso 2: borrar "near-duplicates" — mismo track_id con played_at dentro de ±3 minutos.
-- Esto pasa cuando creditLiveListenIfNeeded inserta un play con timestamp estimado
-- (Date.now() − progress_ms) y luego el sync inserta otro con el timestamp oficial de Spotify.
-- Se queda con la fila más antigua (created_at).

DELETE FROM plays p
USING (
  SELECT p2.id
  FROM plays p1
  JOIN plays p2
    ON p2.track_id = p1.track_id
   AND p2.id <> p1.id
   AND ABS(EXTRACT(EPOCH FROM (p2.played_at - p1.played_at))) < 180
   AND p2.created_at > p1.created_at
  WHERE p1.source = 'live'
    AND p2.source = 'live'
) dup
WHERE p.id = dup.id;

-- Paso 3: índice único (sync / import duplicado queda en código como 23505 → skip).

CREATE UNIQUE INDEX IF NOT EXISTS plays_track_played_at_unique
  ON plays (track_id, played_at);
