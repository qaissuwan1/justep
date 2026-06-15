-- ============================================================================
-- JUstep — persistent "marked" questions (009)
-- Lets the in-test Mark/Flag button persist across sessions so the Question
-- Bank's "Marked" status filter is real. One row per (user, question).
-- ============================================================================

create table if not exists public.question_marks (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index if not exists idx_question_marks_user on public.question_marks (user_id);

alter table public.question_marks enable row level security;

-- Users manage only their own marks.
drop policy if exists "question_marks_manage_own" on public.question_marks;
create policy "question_marks_manage_own"
  on public.question_marks for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
