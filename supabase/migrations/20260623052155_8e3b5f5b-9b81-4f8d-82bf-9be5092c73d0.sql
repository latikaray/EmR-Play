
-- ============================================================
-- 1. parent_child_links: tighten "Children can accept links"
-- ============================================================
DROP POLICY IF EXISTS "Children can accept links" ON public.parent_child_links;
CREATE POLICY "Children can accept links"
  ON public.parent_child_links
  FOR UPDATE
  TO authenticated
  USING (status = 'pending' AND (child_user_id IS NULL OR child_user_id = auth.uid()))
  WITH CHECK (child_user_id = auth.uid());

-- ============================================================
-- 2. user_roles: prevent arbitrary self role assignment
-- ============================================================
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;

-- Allow self-insert only for valid app roles and only when user has no role yet
CREATE POLICY "Users can claim their initial role"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role IN ('child'::user_role, 'parent'::user_role)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. Gamification: move writes to SECURITY DEFINER functions
-- ============================================================
-- Drop client-side write policies
DROP POLICY IF EXISTS "Users can insert their own XP" ON public.user_xp;
DROP POLICY IF EXISTS "Users can update their own XP" ON public.user_xp;
DROP POLICY IF EXISTS "Users can insert their own badges" ON public.user_badges;
DROP POLICY IF EXISTS "Users can insert their own avatars" ON public.unlocked_avatars;

-- Ensure a user_xp row exists for the calling user
CREATE OR REPLACE FUNCTION public.ensure_user_xp()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  INSERT INTO public.user_xp (user_id, total_xp, current_streak, longest_streak)
  VALUES (auth.uid(), 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- Award XP with a hard per-call cap, and bump streak based on today's date
CREATE OR REPLACE FUNCTION public.award_xp(p_amount integer)
RETURNS public.user_xp
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_amount integer;
  v_row public.user_xp;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_new_streak integer;
  v_new_longest integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid XP amount';
  END IF;
  -- Hard cap to prevent abuse
  v_amount := LEAST(p_amount, 100);

  INSERT INTO public.user_xp (user_id, total_xp, current_streak, longest_streak)
  VALUES (v_uid, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.user_xp WHERE user_id = v_uid FOR UPDATE;

  IF v_row.last_active_date = v_today THEN
    v_new_streak := v_row.current_streak;
  ELSIF v_row.last_active_date = v_today - 1 THEN
    v_new_streak := COALESCE(v_row.current_streak, 0) + 1;
  ELSE
    v_new_streak := 1;
  END IF;
  v_new_longest := GREATEST(COALESCE(v_row.longest_streak, 0), v_new_streak);

  UPDATE public.user_xp
  SET total_xp = COALESCE(total_xp, 0) + v_amount,
      current_streak = v_new_streak,
      longest_streak = v_new_longest,
      last_active_date = v_today,
      updated_at = now()
  WHERE user_id = v_uid
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Grant a badge: idempotent, server-side controlled
CREATE OR REPLACE FUNCTION public.grant_badge(p_badge_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_badge_id IS NULL OR length(p_badge_id) = 0 OR length(p_badge_id) > 100 THEN
    RAISE EXCEPTION 'Invalid badge id';
  END IF;
  INSERT INTO public.user_badges (user_id, badge_id)
  VALUES (auth.uid(), p_badge_id)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Unlock avatar: server verifies XP threshold before granting
CREATE OR REPLACE FUNCTION public.unlock_avatar(p_avatar_id text, p_xp_required integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_avatar_id IS NULL OR length(p_avatar_id) = 0 OR length(p_avatar_id) > 100 THEN
    RAISE EXCEPTION 'Invalid avatar id';
  END IF;
  IF p_xp_required IS NULL OR p_xp_required < 0 THEN
    RAISE EXCEPTION 'Invalid xp threshold';
  END IF;

  SELECT COALESCE(total_xp, 0) INTO v_total FROM public.user_xp WHERE user_id = auth.uid();
  IF v_total IS NULL OR v_total < p_xp_required THEN
    RETURN false;
  END IF;

  INSERT INTO public.unlocked_avatars (user_id, avatar_id)
  VALUES (auth.uid(), p_avatar_id)
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

-- Safe role-claim function (called once at signup)
CREATE OR REPLACE FUNCTION public.claim_user_role(p_role user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_role NOT IN ('child'::user_role, 'parent'::user_role) THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), p_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- ============================================================
-- 4. Function privileges: lock down SECURITY DEFINER functions
-- ============================================================
-- Trigger helper should not be DEFINER and not exposed
ALTER FUNCTION public.update_updated_at_column() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Revoke anon execution of internal helpers
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, user_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- New functions: authenticated only
REVOKE ALL ON FUNCTION public.ensure_user_xp() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.award_xp(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.grant_badge(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlock_avatar(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_user_role(user_role) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.ensure_user_xp() TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_badge(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_avatar(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_user_role(user_role) TO authenticated;

-- get_user_role is unused server-side; revoke broadly
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM authenticated;

-- ============================================================
-- 5. Realtime: restrict channel subscriptions
-- ============================================================
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can only access own realtime topics"
  ON realtime.messages;

-- Default-deny: only allow subscriptions to a topic that matches the user's own id
CREATE POLICY "Authenticated users can only access own realtime topics"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    (realtime.topic())::text = (auth.uid())::text
  );

-- ============================================================
-- 6. Storage: avatars bucket — disallow public listing
-- ============================================================
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- Direct public URL access still works (bucket is public); we just disallow API listing
CREATE POLICY "Authenticated users can read avatar objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- ============================================================
-- 7. pg_graphql: hide schema from anon and authenticated
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphql_public') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphql') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated';
  END IF;
END $$;
