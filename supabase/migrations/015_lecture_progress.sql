-- ============================================================================
-- JUstep — per-user lecture progress (015)
-- Layer 1 data collection: track when a student opens a lecture and when they
-- mark it complete. One row per (user, lecture).
-- ============================================================================

create table if not exists public.lecture_progress (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  lecture_id     uuid not null references public.lectures (id) on delete cascade,
  started_at     timestamptz,                     -- first open
  last_opened_at timestamptz,                     -- updated on every open
  completed_at   timestamptz,                     -- set when marked complete
  status         text not null default 'not_started'
                 check (status in ('not_started', 'in_progress', 'completed')),
  primary key (user_id, lecture_id)
);

-- Note: the PRIMARY KEY (user_id, lecture_id) already creates a unique btree
-- index on those columns, and because user_id is the leading column it also
-- serves "all my lecture progress" lookups. A separate index on the same tuple
-- would be redundant, so none is added. (Say the word if you want one anyway.)

-- Row Level Security: a user manages only their own rows. -----------------
alter table public.lecture_progress enable row level security;

drop policy if exists "lecture_progress_manage_own" on public.lecture_progress;
create policy "lecture_progress_manage_own"
  on public.lecture_progress for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
