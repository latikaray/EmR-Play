-- ============================================================
-- Phase E: Retire legacy child Supabase-auth tables
-- ============================================================
-- Children are now authenticated exclusively via child_accounts +
-- child-auth edge function. The old parent_child_links linking flow
-- and child_profiles table are no longer used anywhere in the
-- frontend and are safe to drop.
-- ============================================================

-- 1. Drop parent_child_links and all dependent objects
-- ============================================================
-- Remove from realtime publication first (required before DROP)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'parent_child_links'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.parent_child_links;
  END IF;
END $$;

DROP TABLE IF EXISTS public.parent_child_links CASCADE;

-- 2. Drop child_profiles
-- ============================================================
-- child_profiles was the old Supabase-auth profile table for
-- children. All child identity data now lives in child_accounts.
DROP TABLE IF EXISTS public.child_profiles CASCADE;

-- 3. Clean up stale 'child' role entries from user_roles
-- ============================================================
-- Children no longer live in auth.users, so any user_roles rows
-- with role = 'child' are orphans. Remove them defensively.
-- (This is a no-op if no rows match.)
DELETE FROM public.user_roles WHERE role = 'child';
