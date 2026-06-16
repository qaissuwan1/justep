-- ============================================================================
-- JUstep — case-insensitive unique usernames (010)
-- profiles.username already exists (added manually). This enforces uniqueness
-- across non-null values, case-insensitively, so "Qais" and "qais" collide
-- but multiple NULLs (users who haven't set one) are allowed.
-- ============================================================================

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;
