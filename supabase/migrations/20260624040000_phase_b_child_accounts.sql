-- ============================================================
-- Phase B: child_accounts table for DB-backed child auth
-- ============================================================
-- Children no longer live in auth.users. This table stores all
-- child account data. Password hashes are stored here and are
-- protected via column-level grants so no anon/authenticated
-- client can ever SELECT the hash column.
-- ============================================================

-- 1. Create the table
-- ============================================================
CREATE TABLE public.child_accounts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username        text        NOT NULL,
  display_name    text,
  -- password_hash stores a bcrypt hash (cost 12). Column-level
  -- SELECT is revoked from anon and authenticated below so no
  -- client query can ever retrieve it. Only service_role (used
  -- exclusively by the child-auth edge function) can read it.
  password_hash   text        NOT NULL,
  avatar_url      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Username is unique per parent, not globally. Two children
  -- under different parents can share the same username (e.g.
  -- "alex"). The parent_user_id is the login scope discriminator.
  UNIQUE (parent_user_id, username)
);

-- 2. Indexes for common access patterns
-- ============================================================
-- Parent listing their children
CREATE INDEX idx_child_accounts_parent ON public.child_accounts (parent_user_id);
-- Child login: look up by username across all parents (used when
-- parent email is provided to resolve parent_user_id first)
CREATE INDEX idx_child_accounts_username ON public.child_accounts (username);
-- Combined lookup: resolve child by (parent_user_id, username)
-- already covered by the UNIQUE constraint index above.

-- 3. updated_at trigger — reuses the project-standard function
-- ============================================================
CREATE TRIGGER update_child_accounts_updated_at
  BEFORE UPDATE ON public.child_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Enable RLS
-- ============================================================
ALTER TABLE public.child_accounts ENABLE ROW LEVEL SECURITY;

-- Parents can read their own children's metadata.
-- password_hash is excluded via column-level grant below,
-- so this policy is safe to be broad for other columns.
CREATE POLICY "Parents can view their own children"
  ON public.child_accounts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = parent_user_id);

-- No client-side INSERT / UPDATE / DELETE policies are created.
-- All writes go through the child-auth edge function which uses
-- the service_role key (bypasses RLS) and is the only trusted
-- write path.

-- 5. Column-level grants: hide password_hash from all clients
-- ============================================================
-- First, establish what authenticated users CAN see (everything
-- except password_hash). We do this by granting only the safe
-- columns explicitly, then revoking the sensitive column.

-- Revoke the default broad SELECT that Supabase grants on public tables
REVOKE SELECT ON public.child_accounts FROM anon, authenticated;

-- Grant only the safe columns back to authenticated (parents)
GRANT SELECT (
  id,
  parent_user_id,
  username,
  display_name,
  avatar_url,
  created_at,
  updated_at
) ON public.child_accounts TO authenticated;

-- anon users get nothing at all
-- (No GRANT to anon — table is not accessible without a session)

-- 6. Private-schema helper functions (called by the edge function
--    via service_role; never directly callable by clients)
-- ============================================================

-- private.create_child_account:
-- Inserts a new child row. The edge function passes an already-
-- hashed password. Returns the safe child record (no hash).
CREATE OR REPLACE FUNCTION private.create_child_account(
  p_parent_user_id  uuid,
  p_username        text,
  p_display_name    text,
  p_password_hash   text
)
RETURNS TABLE (
  id            uuid,
  parent_user_id uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Basic input validation
  IF p_parent_user_id IS NULL THEN
    RAISE EXCEPTION 'parent_user_id is required';
  END IF;
  IF p_username IS NULL OR length(trim(p_username)) < 3 THEN
    RAISE EXCEPTION 'username must be at least 3 characters';
  END IF;
  IF length(p_username) > 30 THEN
    RAISE EXCEPTION 'username must be at most 30 characters';
  END IF;
  IF p_username !~ '^[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'username may only contain letters, numbers, and underscores';
  END IF;
  IF p_password_hash IS NULL OR length(p_password_hash) < 20 THEN
    RAISE EXCEPTION 'password_hash is invalid';
  END IF;

  RETURN QUERY
    INSERT INTO public.child_accounts (
      parent_user_id,
      username,
      display_name,
      password_hash
    )
    VALUES (
      p_parent_user_id,
      lower(trim(p_username)),
      trim(p_display_name),
      p_password_hash
    )
    RETURNING
      public.child_accounts.id,
      public.child_accounts.parent_user_id,
      public.child_accounts.username,
      public.child_accounts.display_name,
      public.child_accounts.avatar_url,
      public.child_accounts.created_at;
END;
$$;

-- private.get_child_for_login:
-- Resolves a child by (parent_user_id, username) and returns the
-- full row including password_hash so the edge function can verify.
-- Returns SETOF to handle zero rows gracefully (returns empty set
-- instead of raising an exception).
CREATE OR REPLACE FUNCTION private.get_child_for_login(
  p_parent_user_id  uuid,
  p_username        text
)
RETURNS SETOF public.child_accounts
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
  FROM public.child_accounts
  WHERE parent_user_id = p_parent_user_id
    AND username = lower(trim(p_username))
  LIMIT 1;
$$;

-- private.resolve_parent_by_email:
-- Given a parent email, returns their auth.users.id.
-- Used during child login when the caller supplies parentEmail
-- as the scope discriminator.
CREATE OR REPLACE FUNCTION private.resolve_parent_by_email(
  p_email text
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT id FROM auth.users
  WHERE email = lower(trim(p_email))
  LIMIT 1;
$$;

-- 7. Lock down private functions: service_role access only
-- ============================================================
REVOKE ALL ON FUNCTION private.create_child_account(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_child_account(uuid, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION private.get_child_for_login(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_child_for_login(uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION private.resolve_parent_by_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_parent_by_email(text)
  TO service_role;

-- 8. service_role full table access (needed for edge function writes)
-- ============================================================
-- Supabase's service_role bypasses RLS by default, but we also
-- ensure it has the DML grants at the table level.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_accounts TO service_role;
