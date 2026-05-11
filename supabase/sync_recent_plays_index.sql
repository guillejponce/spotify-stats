-- Paso 1: borrar duplicados (mismo track + mismo played_at), quedándonos con la fila más antigua.
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

-- Paso 2: índice único (sync / import duplicado queda en código como 23505 → skip).

CREATE UNIQUE INDEX IF NOT EXISTS plays_track_played_at_unique
  ON plays (track_id, played_at);
