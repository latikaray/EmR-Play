-- ============================================================
-- Phase D: Child data layer tables
-- Adds child_account_id to existing progress tables and
-- creates new child_xp + child_badges tables.
--
-- ADDITIVE ONLY — zero changes to existing columns or policies.
-- Parent data (user_id paths) is completely unaffected.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add child_account_id to activity_completions
-- ------------------------------------------------------------
ALTER TABLE public.activity_completions
  ADD COLUMN IF NOT EXISTS child_account_id uuid
    REFERENCES public.child_accounts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_activity_completions_child_account_id
  ON public.activity_completions(child_account_id);

-- ------------------------------------------------------------
-- 2. Add child_account_id to mood_entries
-- ------------------------------------------------------------
ALTER TABLE public.mood_entries
  ADD COLUMN IF NOT EXISTS child_account_id uuid
    REFERENCES public.child_accounts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_mood_entries_child_account_id
  ON public.mood_entries(child_account_id);

-- ------------------------------------------------------------
-- 3. Create child_xp table (separate from user_xp)
--    One row per child_account.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.child_xp (
  child_account_id  uuid        PRIMARY KEY
                                REFERENCES public.child_accounts(id) ON DELETE CASCADE,
  total_xp          integer     NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  current_streak    integer     NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak    integer     NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_active_date  date,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Only service_role (edge function) can read/write child_xp.
-- RLS is enabled but no policies allow anon/authenticated roles.
ALTER TABLE public.child_xp ENABLE ROW LEVEL SECURITY;

-- Deny anon and authenticated direct access (service_role bypasses RLS).
-- No explicit policy = deny by default for authenticated/anon.

-- ------------------------------------------------------------
-- 4. Create child_badges table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.child_badges (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_account_id  uuid        NOT NULL
                                REFERENCES public.child_accounts(id) ON DELETE CASCADE,
  badge_id          text        NOT NULL,
  earned_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE(child_account_id, badge_id)
);

ALTER TABLE public.child_badges ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 5. Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_child_badges_child_account_id
  ON public.child_badges(child_account_id);

-- ------------------------------------------------------------
-- 6. Grant service_role insert/select on new tables
--    (service_role already bypasses RLS, but explicit grants
--     are needed for PostgREST to expose the tables to the
--     service_role key)
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_xp      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_badges   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_completions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mood_entries   TO service_role;
