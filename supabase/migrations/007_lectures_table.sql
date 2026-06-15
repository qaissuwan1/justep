-- ============================================================================
-- JUstep — lectures (007)
-- Adds a Lecture level between Subject and content:
--   System → Subject → Lecture → (Questions + Flashcards)
-- Lecture assignment is OPTIONAL: questions/flashcards may have lecture_id NULL.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. lectures table -----------------------------------------------------------
create table if not exists public.lectures (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  title       text not null,
  description text,
  order_index int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_lectures_subject on public.lectures (subject_id);
create index if not exists idx_lectures_order    on public.lectures (subject_id, order_index);

-- 2. link questions + flashcards to a lecture (nullable) ----------------------
alter table public.questions
  add column if not exists lecture_id uuid references public.lectures (id) on delete set null;

alter table public.flashcards
  add column if not exists lecture_id uuid references public.lectures (id) on delete set null;

create index if not exists idx_questions_lecture  on public.questions (lecture_id);
create index if not exists idx_flashcards_lecture on public.flashcards (lecture_id);

-- 3. Row Level Security -------------------------------------------------------
alter table public.lectures enable row level security;

-- any signed-in user can read lectures (used by the student-facing browser)
drop policy if exists "lectures_select_authenticated" on public.lectures;
create policy "lectures_select_authenticated"
  on public.lectures for select
  to authenticated
  using (true);

-- only admins may add / edit / remove lectures (is_admin() from migration 003)
drop policy if exists "lectures_admin_write" on public.lectures;
create policy "lectures_admin_write"
  on public.lectures for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
