-- Cron de Last.fm vía Supabase (pg_cron + pg_net): cada 5 minutos trae los
-- scrobbles nuevos de todas las cuentas conectadas.
--
-- Prerequisitos (Dashboard → Database → Extensions): pg_cron y pg_net.
-- Antes de correr: reemplaza __CRON_SECRET__ por el mismo valor de CRON_SECRET
-- en Vercel. Si pruebas en un preview, cambia también la URL.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'lastfm-sync';

SELECT cron.schedule(
  'lastfm-sync',
  '*/5 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://spotify-stats-pi.vercel.app/api/cron/lastfm',
    headers := jsonb_build_object(
      'Authorization', 'Bearer __CRON_SECRET__',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );
  $$
);

-- Verificar:
--   SELECT * FROM cron.job WHERE jobname = 'lastfm-sync';
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
