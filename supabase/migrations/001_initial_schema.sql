-- ============================================================================
-- JUstep — initial schema (001)
-- Run in the Supabase SQL editor, or via `supabase db push` with the CLI.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto (already available on Supabase, but be safe)
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. profiles  (one row per auth user, populated by the signup trigger below)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  full_name                text,
  email                    text,
  streak                   int not null default 0,
  best_streak              int not null default 0,
  total_questions_answered int not null default 0,
  created_at               timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. subjects
-- ----------------------------------------------------------------------------
create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  color       text,
  icon        text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. questions
-- ----------------------------------------------------------------------------
create table if not exists public.questions (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid references public.subjects (id) on delete cascade,
  topic          text,
  difficulty     text check (difficulty in ('easy', 'medium', 'hard')),
  stem           text not null,
  options        jsonb not null default '[]'::jsonb,
  correct_answer int not null,
  explanation    text,
  board_trap     text,
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. flashcards
-- ----------------------------------------------------------------------------
create table if not exists public.flashcards (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects (id) on delete cascade,
  front      text not null,
  back       text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. user_progress  (one row per answered question)
-- ----------------------------------------------------------------------------
create table if not exists public.user_progress (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete cascade,
  question_id uuid references public.questions (id) on delete cascade,
  is_correct  boolean,
  answered_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. flashcard_progress  (spaced-repetition state per card)
-- ----------------------------------------------------------------------------
create table if not exists public.flashcard_progress (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete cascade,
  flashcard_id uuid references public.flashcards (id) on delete cascade,
  status       text check (status in ('learning', 'known')) default 'learning',
  next_review  timestamptz,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Helpful indexes for the foreign keys we filter/join on
-- ----------------------------------------------------------------------------
create index if not exists idx_questions_subject          on public.questions (subject_id);
create index if not exists idx_flashcards_subject          on public.flashcards (subject_id);
create index if not exists idx_user_progress_user          on public.user_progress (user_id);
create index if not exists idx_user_progress_question      on public.user_progress (question_id);
create index if not exists idx_flashcard_progress_user     on public.flashcard_progress (user_id);
create index if not exists idx_flashcard_progress_card     on public.flashcard_progress (flashcard_id);

-- ============================================================================
-- Trigger: create a profile row automatically when a new auth user signs up.
-- SECURITY DEFINER so the insert runs as the function owner and bypasses RLS.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security
-- The app uses the public anon key in the browser, so RLS must be ON and
-- backed by explicit policies for the data to be both reachable and safe.
-- ============================================================================
alter table public.profiles           enable row level security;
alter table public.subjects           enable row level security;
alter table public.questions          enable row level security;
alter table public.flashcards         enable row level security;
alter table public.user_progress      enable row level security;
alter table public.flashcard_progress enable row level security;

-- profiles: any signed-in user can read profiles (needed for the leaderboard),
-- but can only modify their own row. Inserts are handled by the trigger above.
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Shared content (subjects / questions / flashcards): readable by any signed-in
-- user. Writes are left to admins via the service-role key / dashboard.
create policy "subjects_select_authenticated"
  on public.subjects for select
  to authenticated
  using (true);

create policy "questions_select_authenticated"
  on public.questions for select
  to authenticated
  using (true);

create policy "flashcards_select_authenticated"
  on public.flashcards for select
  to authenticated
  using (true);

-- Per-user progress: a user may read and write only their own rows.
create policy "user_progress_manage_own"
  on public.user_progress for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "flashcard_progress_manage_own"
  on public.flashcard_progress for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
