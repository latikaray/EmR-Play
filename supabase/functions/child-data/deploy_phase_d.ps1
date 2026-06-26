# Deploy child-data edge function and apply Phase D migration

$SR  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjYWltZHNkdWd4b3V6YWV5ZnViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjY3MjI1OSwiZXhwIjoyMDY4MjQ4MjU5fQ.9zBNLpYHRFtNJfHxngDIG9BKs57AJ2ees83m_MI-Ixs"
$URL = "https://ecaimdsdugxouzaeyfub.supabase.co"

Write-Host ""
Write-Host "Step 1: Deploying child-data edge function..." -ForegroundColor Yellow
$d = npx supabase functions deploy child-data --no-verify-jwt 2>&1
Write-Host $d

Write-Host ""
Write-Host "Step 2: Also re-deploying child-auth (login fix)..." -ForegroundColor Yellow
$d2 = npx supabase functions deploy child-auth --no-verify-jwt 2>&1
Write-Host $d2

Write-Host ""
Write-Host "Step 3: Applying Phase D SQL migration via REST API..." -ForegroundColor Yellow

$sql = @"
ALTER TABLE public.activity_completions
  ADD COLUMN IF NOT EXISTS child_account_id uuid
    REFERENCES public.child_accounts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_activity_completions_child_account_id
  ON public.activity_completions(child_account_id);

ALTER TABLE public.mood_entries
  ADD COLUMN IF NOT EXISTS child_account_id uuid
    REFERENCES public.child_accounts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_mood_entries_child_account_id
  ON public.mood_entries(child_account_id);

CREATE TABLE IF NOT EXISTS public.child_xp (
  child_account_id  uuid        PRIMARY KEY
                                REFERENCES public.child_accounts(id) ON DELETE CASCADE,
  total_xp          integer     NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  current_streak    integer     NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak    integer     NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_active_date  date,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.child_xp ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.child_badges (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_account_id  uuid        NOT NULL
                                REFERENCES public.child_accounts(id) ON DELETE CASCADE,
  badge_id          text        NOT NULL,
  earned_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE(child_account_id, badge_id)
);
ALTER TABLE public.child_badges ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_child_badges_child_account_id
  ON public.child_badges(child_account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_xp     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_badges  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_completions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mood_entries  TO service_role;
"@

$h = @{
    "apikey"        = $SR
    "Authorization" = "Bearer $SR"
    "Content-Type"  = "application/json"
}

# Use Supabase SQL execution via the management API
# The SQL endpoint is: POST /rest/v1/rpc/exec_sql (if available) or via pg_dump
# Actually, use the direct SQL editor API:
$sqlBody = @{ query = $sql } | ConvertTo-Json
try {
    $r = Invoke-RestMethod `
        -Uri "$URL/rest/v1/rpc/exec_sql" `
        -Method POST -Headers $h -Body $sqlBody
    Write-Host "  -> SQL applied via RPC" -ForegroundColor Green
    Write-Host ($r | ConvertTo-Json -Compress)
} catch {
    # exec_sql RPC may not exist; try direct Postgres connection via supabase CLI
    Write-Host "  -> exec_sql RPC not available, trying supabase db push..." -ForegroundColor DarkYellow
    $push = npx supabase db push 2>&1
    Write-Host $push
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
