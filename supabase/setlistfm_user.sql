-- Usuario público de setlist.fm, uno por cuenta de la app.
-- Correr en el SQL editor de Supabase.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS setlist_fm_user text;
