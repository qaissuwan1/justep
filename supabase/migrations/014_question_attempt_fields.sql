-- ============================================================================
-- JUstep — richer question attempt log (014)
-- Layer 1 data collection: capture more per-attempt detail on user_progress so
-- every question event is recorded from day one.
--
-- Adds three NULLABLE columns (existing rows keep NULL):
--   confidence          1-5 self-rated confidence
--   time_spent_seconds  seconds spent on the question
--   selected_answer     0-4 option index the student actually picked
--                       (enables distractor analysis of wrong choices)
--
-- Schema only — no data is read or written, and no other columns are touched.
-- Idempotent: columns use ADD COLUMN IF NOT EXISTS, and each CHECK constraint is
-- added inside a guard so re-running won't error on an already-present one.
-- (NULLs satisfy CHECK constraints, so nullable + bounded coexist fine.)
-- ============================================================================

-- 1. Columns ------------------------------------------------------------------
alter table public.user_progress
  add column if not exists confidence         smallint,
  add column if not exists time_spent_seconds  int,
  add column if not exists selected_answer      int;

-- 2. Bounds: confidence between 1 and 5 (guarded so it's safe to re-run) -------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_progress_confidence_check'
  ) then
    alter table public.user_progress
      add constraint user_progress_confidence_check
      check (confidence between 1 and 5);
  end if;
end $$;

-- 3. Bounds: selected_answer between 0 and 4 (5 options A-E) -------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_progress_selected_answer_check'
  ) then
    alter table public.user_progress
      add constraint user_progress_selected_answer_check
      check (selected_answer between 0 and 4);
  end if;
end $$;
