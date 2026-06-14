-- ============================================================================
-- JUstep — organ systems / blocks (005)
-- Groups subjects under a "system" for the UWorld-style block builder.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. systems table ------------------------------------------------------------
create table if not exists public.systems (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text default '#3B82F6',
  created_at timestamptz default now()
);

-- 2. link subjects to a system ------------------------------------------------
alter table public.subjects
  add column if not exists system_id uuid references public.systems (id) on delete set null;

create index if not exists idx_subjects_system on public.subjects (system_id);

-- 3. Row Level Security -------------------------------------------------------
alter table public.systems enable row level security;

-- any signed-in user can read systems (used by the block builder)
drop policy if exists "systems_select_authenticated" on public.systems;
create policy "systems_select_authenticated"
  on public.systems for select
  to authenticated
  using (true);

-- only admins may add / edit / remove systems (is_admin() from migration 003)
drop policy if exists "systems_admin_write" on public.systems;
create policy "systems_admin_write"
  on public.systems for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
