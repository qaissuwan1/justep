-- ============================================================================
-- JUstep — Topic structure, SCHEMA ONLY (012)
-- Introduces a normalized Topic level between Subject and Lecture:
--   System → Subject → Topic → Lecture → (Questions / Flashcards)
--
-- This migration creates the `topics` table and adds NULLABLE topic_id foreign
-- keys to lectures / questions / flashcards. It deliberately writes NO data:
-- no topic rows are created and nothing is backfilled here. The free-text
-- questions.topic column is left untouched as the source for a later, manually
-- reviewed mapping (migration 013).
--
-- FUTURE INTENT: once 013 has created the approved topics and backfilled
-- topic_id everywhere, a later migration may tighten the most important of
-- these columns (e.g. questions.topic_id) to NOT NULL. They are intentionally
-- nullable for now so existing rows remain valid.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. topics table -------------------------------------------------------------
create table if not exists public.topics (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  name        text not null,
  order_index int not null default 0,
  created_at  timestamptz not null default now()
);

-- 2. Indexes ------------------------------------------------------------------
create index if not exists idx_topics_subject on public.topics (subject_id);

-- Prevent duplicate topic names within the same subject (case-insensitive).
create unique index if not exists topics_subject_lower_name_key
  on public.topics (subject_id, lower(name));

-- 3. Nullable topic_id foreign keys on content tables -------------------------
--    All NULLABLE for now. A future migration may set NOT NULL after backfill.
alter table public.lectures
  add column if not exists topic_id uuid references public.topics (id) on delete set null;

alter table public.questions
  add column if not exists topic_id uuid references public.topics (id) on delete set null;

alter table public.flashcards
  add column if not exists topic_id uuid references public.topics (id) on delete set null;

-- Helpful indexes for the new FKs (used by weakness-detection queries / joins).
create index if not exists idx_lectures_topic   on public.lectures (topic_id);
create index if not exists idx_questions_topic   on public.questions (topic_id);
create index if not exists idx_flashcards_topic on public.flashcards (topic_id);

-- 4. Row Level Security -------------------------------------------------------
alter table public.topics enable row level security;

-- any signed-in user can read topics (student-facing browser + weakness views)
drop policy if exists "topics_select_authenticated" on public.topics;
create policy "topics_select_authenticated"
  on public.topics for select
  to authenticated
  using (true);

-- only admins may add / edit / remove topics (is_admin() from migration 003)
drop policy if exists "topics_admin_write" on public.topics;
create policy "topics_admin_write"
  on public.topics for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
