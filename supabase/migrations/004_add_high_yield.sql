-- ============================================================================
-- JUstep — add high-yield teaching point to questions (004)
-- Used by the UWorld-style question interface (src/pages/Questions.jsx).
-- ============================================================================

alter table public.questions
  add column if not exists high_yield text;
