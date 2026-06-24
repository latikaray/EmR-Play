
-- ============================================================
-- 1. Move SECURITY DEFINER functions to a private (non-API) schema
--    and expose SECURITY INVOKER wrappers in public.
-- ============================================================
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- ---------- has_role ----------
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.user_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.has_role(_user_id, _role)
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_role) TO authenticated, service_role;

-- ---------- get_user_role ----------
CREATE OR REPLACE FUNCTION private.get_user_role(_user_id uuid)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;
REVOKE ALL ON FUNCTION private.get_user_role(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_user_role(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.get_user_role(uuid);

-- ---------- delete_user_account ----------
CREATE OR REPLACE FUNCTION private.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM public.activity_completions WHERE user_id = auth.uid() OR child_user_id = auth.uid();
  DELETE FROM public.mood_entries        WHERE user_id = auth.uid() OR child_user_id = auth.uid();
  DELETE FROM public.journal_entries     WHERE user_id = auth.uid();
  DELETE FROM public.parent_child_links  WHERE parent_user_id = auth.uid() OR child_user_id = auth.uid();
  DELETE FROM public.parent_profiles     WHERE user_id = auth.uid();
  DELETE FROM public.child_profiles      WHERE user_id = auth.uid();
  DELETE FROM public.user_roles          WHERE user_id = auth.uid();
  DELETE FROM public.profiles            WHERE user_id = auth.uid();
  DELETE FROM public.user_xp             WHERE user_id = auth.uid();
  DELETE FROM public.user_badges         WHERE user_id = auth.uid();
  DELETE FROM public.unlocked_avatars    WHERE user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION private.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.delete_user_account() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.delete_user_account();
$$;
REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated, service_role;

-- ---------- ensure_user_xp ----------
CREATE OR REPLACE FUNCTION private.ensure_user_xp()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.user_xp (user_id, total_xp, current_streak, longest_streak)
  VALUES (auth.uid(), 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION private.ensure_user_xp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.ensure_user_xp() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_user_xp()
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.ensure_user_xp();
$$;
REVOKE ALL ON FUNCTION public.ensure_user_xp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_user_xp() TO authenticated, service_role;

-- ---------- award_xp ----------
CREATE OR REPLACE FUNCTION private.award_xp(p_amount integer)
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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Invalid XP amount'; END IF;
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
REVOKE ALL ON FUNCTION private.award_xp(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.award_xp(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.award_xp(p_amount integer)
RETURNS public.user_xp
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM private.award_xp(p_amount);
$$;
REVOKE ALL ON FUNCTION public.award_xp(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_xp(integer) TO authenticated, service_role;

-- ---------- grant_badge ----------
CREATE OR REPLACE FUNCTION private.grant_badge(p_badge_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_badge_id IS NULL OR length(p_badge_id) = 0 OR length(p_badge_id) > 100 THEN
    RAISE EXCEPTION 'Invalid badge id';
  END IF;
  INSERT INTO public.user_badges (user_id, badge_id)
  VALUES (auth.uid(), p_badge_id)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION private.grant_badge(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.grant_badge(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.grant_badge(p_badge_id text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.grant_badge(p_badge_id);
$$;
REVOKE ALL ON FUNCTION public.grant_badge(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_badge(text) TO authenticated, service_role;

-- ---------- unlock_avatar ----------
CREATE OR REPLACE FUNCTION private.unlock_avatar(p_avatar_id text, p_xp_required integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_total integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_avatar_id IS NULL OR length(p_avatar_id) = 0 OR length(p_avatar_id) > 100 THEN
    RAISE EXCEPTION 'Invalid avatar id';
  END IF;
  IF p_xp_required IS NULL OR p_xp_required < 0 THEN
    RAISE EXCEPTION 'Invalid xp threshold';
  END IF;
  SELECT COALESCE(total_xp, 0) INTO v_total FROM public.user_xp WHERE user_id = auth.uid();
  IF v_total IS NULL OR v_total < p_xp_required THEN RETURN false; END IF;
  INSERT INTO public.unlocked_avatars (user_id, avatar_id)
  VALUES (auth.uid(), p_avatar_id)
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.unlock_avatar(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.unlock_avatar(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unlock_avatar(p_avatar_id text, p_xp_required integer)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.unlock_avatar(p_avatar_id, p_xp_required);
$$;
REVOKE ALL ON FUNCTION public.unlock_avatar(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_avatar(text, integer) TO authenticated, service_role;

-- ---------- claim_user_role ----------
CREATE OR REPLACE FUNCTION private.claim_user_role(p_role public.user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_role NOT IN ('child'::public.user_role, 'parent'::public.user_role) THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), p_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION private.claim_user_role(public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.claim_user_role(public.user_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_user_role(p_role public.user_role)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.claim_user_role(p_role);
$$;
REVOKE ALL ON FUNCTION public.claim_user_role(public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_user_role(public.user_role) TO authenticated, service_role;

-- ============================================================
-- 2. Disable pg_graphql so no tables are discoverable via GraphQL
-- ============================================================
DROP EXTENSION IF EXISTS pg_graphql CASCADE;
