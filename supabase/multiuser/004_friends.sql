-- ============================================================================
-- 004 — Amigos y datos públicos de Spotify en el perfil.
-- Correr después de 001–003. Idempotente.
--
-- La app lee y escribe todo desde el servidor (service role) y verifica la
-- amistad antes de devolver stats de otra persona. Las políticas de abajo son
-- la segunda barrera para clientes con sesión.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS followers integer,
  ADD COLUMN IF NOT EXISTS product text,
  ADD COLUMN IF NOT EXISTS spotify_url text;

CREATE INDEX IF NOT EXISTS profiles_display_name_idx
  ON public.profiles (lower(display_name));

-- Una fila por par. `requester_id` mandó la solicitud; `addressee_id` la acepta.
CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (requester_id <> addressee_id)
);

-- Impide A→B y B→A a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_unique
  ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS friendships_addressee_idx
  ON public.friendships (addressee_id, status);
CREATE INDEX IF NOT EXISTS friendships_requester_idx
  ON public.friendships (requester_id, status);

CREATE OR REPLACE FUNCTION public.are_friends(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = a AND f.addressee_id = b)
        OR (f.requester_id = b AND f.addressee_id = a))
  );
$$;

GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.are_friends(uuid, uuid) FROM anon, public;

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friendships FROM anon;

DROP POLICY IF EXISTS friendships_select_own ON public.friendships;
CREATE POLICY friendships_select_own ON public.friendships
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_user())
    AND (SELECT auth.uid()) IN (requester_id, addressee_id)
  );

DROP POLICY IF EXISTS friendships_insert_own ON public.friendships;
CREATE POLICY friendships_insert_own ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_active_user())
    AND requester_id = (SELECT auth.uid())
    AND status = 'pending'
  );

-- Solo quien recibe puede aceptar.
DROP POLICY IF EXISTS friendships_update_addressee ON public.friendships;
CREATE POLICY friendships_update_addressee ON public.friendships
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_active_user()) AND addressee_id = (SELECT auth.uid()))
  WITH CHECK (addressee_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS friendships_delete_own ON public.friendships;
CREATE POLICY friendships_delete_own ON public.friendships
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_active_user())
    AND (SELECT auth.uid()) IN (requester_id, addressee_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
