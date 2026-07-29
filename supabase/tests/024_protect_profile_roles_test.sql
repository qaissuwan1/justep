-- ============================================================================
-- JUStep - local verification for profile role protection (024)
--
-- Run only after migration 024 in a disposable/local Supabase database, as a
-- role allowed to SET ROLE authenticated. All test-only DML is rolled back.
--
-- Prerequisites:
--   * At least one public.profiles row whose role is student.
--   * At least one public.profiles row whose role is admin.
-- ============================================================================

begin;

-- Fail loudly if the disposable database does not contain usable fixtures.
do $verify$
begin
  if not exists (
    select 1
    from public.profiles
    where role = 'student'
  ) then
    raise exception 'verification requires a student profile';
  end if;

  if not exists (
    select 1
    from public.profiles
    where role = 'admin'
  ) then
    raise exception 'verification requires an admin profile';
  end if;
end;
$verify$;

-- Migration 003 supplies this CHECK on a fresh migration replay. Match by
-- definition rather than constraint name so equivalent remote names are valid.
do $verify$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint as c
    where c.conrelid = 'public.profiles'::regclass
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%role%'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%student%'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%instructor%'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%admin%'
  ) then
    raise exception 'profiles.role CHECK constraint is missing';
  end if;
end;
$verify$;

-- Assert the intended security modes, owners, and empty search paths.
do $verify$
declare
  v_guard_definer boolean;
  v_guard_owner text;
  v_guard_config text[];
  v_rpc_definer boolean;
  v_rpc_owner text;
  v_rpc_config text[];
begin
  select p.prosecdef, r.rolname, p.proconfig
  into v_guard_definer, v_guard_owner, v_guard_config
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_roles as r on r.oid = p.proowner
  where p.oid = 'public.guard_profile_role_update()'::regprocedure;

  if v_guard_definer
     or v_guard_owner <> 'postgres'
     or not (
       'search_path=' = any(coalesce(v_guard_config, array[]::text[]))
       or 'search_path=""' = any(coalesce(v_guard_config, array[]::text[]))
     ) then
    raise exception
      'guard_profile_role_update must be SECURITY INVOKER, owned by postgres, with empty search_path';
  end if;

  select p.prosecdef, r.rolname, p.proconfig
  into v_rpc_definer, v_rpc_owner, v_rpc_config
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_roles as r on r.oid = p.proowner
  where p.oid = 'public.set_profile_role(uuid,text)'::regprocedure;

  if not v_rpc_definer
     or v_rpc_owner <> 'postgres'
     or not (
       'search_path=' = any(coalesce(v_rpc_config, array[]::text[]))
       or 'search_path=""' = any(coalesce(v_rpc_config, array[]::text[]))
     ) then
    raise exception
      'set_profile_role must be SECURITY DEFINER, owned by postgres, with empty search_path';
  end if;
end;
$verify$;

-- Retain fixture IDs in transaction-local settings without printing user data.
select pg_catalog.set_config(
  'justep_test.student_id',
  (
    select id::text
    from public.profiles
    where role = 'student'
    order by id
    limit 1
  ),
  true
);
select pg_catalog.set_config(
  'justep_test.admin_id',
  (
    select id::text
    from public.profiles
    where role = 'admin'
    order by id
    limit 1
  ),
  true
);

-- Simulate a PostgREST request authenticated as the student.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.json_build_object(
    'sub', pg_catalog.current_setting('justep_test.student_id'),
    'role', 'authenticated'
  )::text,
  true
);

-- PASS: the existing own-row policy still permits a real username change.
update public.profiles
set username = 'role_guard_test_' || left(replace(id::text, '-', ''), 8)
where id = auth.uid();

do $verify$
declare
  v_username text;
  v_expected text;
begin
  v_expected := 'role_guard_test_'
    || left(replace(auth.uid()::text, '-', ''), 8);

  select username
  into v_username
  from public.profiles
  where id = auth.uid();

  if v_username is distinct from v_expected then
    raise exception
      'verification failed: student could not update own username';
  end if;
end;
$verify$;

-- PASS: a direct table update, equivalent to the PostgREST table path, fails.
do $verify$
begin
  begin
    update public.profiles
    set role = 'admin'
    where id = auth.uid();

    raise exception 'verification failed: student changed profile role';
  exception
    when sqlstate '42501' then
      raise notice 'PASS: direct student role change rejected';
  end;
end;
$verify$;

-- PASS: the narrow role-management RPC also rejects a student caller.
do $verify$
begin
  begin
    perform public.set_profile_role(auth.uid(), 'admin');

    raise exception 'verification failed: student called role-management RPC';
  exception
    when sqlstate '42501' then
      raise notice 'PASS: student role-management RPC rejected';
  end;
end;
$verify$;

-- Existing own-profile reads and is_admin() behavior remain unchanged.
do $verify$
declare
  v_role text;
begin
  select role
  into v_role
  from public.profiles
  where id = auth.uid();

  if v_role <> 'student' or public.is_admin() then
    raise exception 'verification failed: student read/is_admin behavior changed';
  end if;
end;
$verify$;

-- Simulate a PostgREST request authenticated as the existing admin.
reset role;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.json_build_object(
    'sub', pg_catalog.current_setting('justep_test.admin_id'),
    'role', 'authenticated'
  )::text,
  true
);

do $verify$
begin
  if not public.is_admin() then
    raise exception 'verification failed: existing admin no longer passes is_admin()';
  end if;
end;
$verify$;

-- PASS: an authorized admin cannot assign NULL, and the target is unchanged.
do $verify$
declare
  v_before text;
  v_after text;
begin
  select role
  into v_before
  from public.profiles
  where id = pg_catalog.current_setting('justep_test.student_id')::uuid;

  begin
    perform public.set_profile_role(
      pg_catalog.current_setting('justep_test.student_id')::uuid,
      null
    );

    raise exception 'verification failed: NULL profile role was accepted';
  exception
    when sqlstate '22023' then
      raise notice 'PASS: NULL profile role rejected';
  end;

  select role
  into v_after
  from public.profiles
  where id = pg_catalog.current_setting('justep_test.student_id')::uuid;

  if v_after is distinct from v_before then
    raise exception 'verification failed: NULL role call changed the profile';
  end if;
end;
$verify$;

-- PASS: the RPC authorizes the JWT actor, then its postgres execution identity
-- satisfies the SECURITY INVOKER trigger's trusted-role branch.
select public.set_profile_role(
  pg_catalog.current_setting('justep_test.student_id')::uuid,
  'instructor'
);

do $verify$
declare
  v_role text;
begin
  select role
  into v_role
  from public.profiles
  where id = pg_catalog.current_setting('justep_test.student_id')::uuid;

  if v_role <> 'instructor' then
    raise exception 'verification failed: authorized admin RPC did not update role';
  end if;
end;
$verify$;

-- PASS: trusted postgres operations retain the direct maintenance path.
reset role;
update public.profiles
set role = 'student'
where id = pg_catalog.current_setting('justep_test.student_id')::uuid;

rollback;

-- Idempotency check: apply migration 024 a second time in the disposable
-- database, then run this test again.
