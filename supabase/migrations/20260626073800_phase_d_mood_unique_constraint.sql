-- Add unique constraint for child mood upsert on (child_account_id, date)
-- This is required for the child-data save_mood action to upsert correctly.
-- We use a DO block to skip if the constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_mood_entries_child_date'
      AND conrelid = 'public.mood_entries'::regclass
  ) THEN
    ALTER TABLE public.mood_entries
      ADD CONSTRAINT uq_mood_entries_child_date
      UNIQUE (child_account_id, date);
  END IF;
END $$;
