-- Cron de alertas de ranking vía Supabase (pg_cron + pg_net).
-- Al ejecutar este script se crea el job solo (si las extensiones están ON).
--
-- Prerequisitos (Dashboard → Database → Extensions):
--   - pg_cron
--   - pg_net
--
-- Antes de correr: reemplazá SOLO __CRON_SECRET__ por el mismo valor
-- que CRON_SECRET en Vercel / .env de la app.
--
-- Endpoint: https://spotify-stats-pi.vercel.app/api/cron/ranking-alerts

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Quitar job previo si re-ejecutás este script
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'ranking-alerts-daily';

SELECT cron.schedule(
  'ranking-alerts-daily',
  -- 12:00 UTC ≈ 08:00 / 09:00 Chile según horario
  '0 12 * * *',
  $$
  SELECT net.http_get(
    url := 'https://spotify-stats-pi.vercel.app/api/cron/ranking-alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer __CRON_SECRET__',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );
  $$
);

-- Verificar:
--   SELECT * FROM cron.job WHERE jobname = 'ranking-alerts-daily';
-- Historial:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
