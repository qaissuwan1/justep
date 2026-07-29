-- ============================================================================
-- JUStep - local verification for append-only question attempts (025)
--
-- Run only after migration 025 in a disposable/local Supabase database, as a
-- role allowed to SET ROLE authenticated and service_role. All test-only DML
-- is enclosed in this transaction and rolled back.
--
-- Prerequisites:
--   * At least one public.profiles row whose role is student.
--   * At least one public.profiles row whose role is admin.
-- ============================================================================

begin;

-- Fail loudly if the disposable database does not contain usable identities.
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

-- Retain fixture identities without returning or printing user data.
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

-- Assert the durable privilege boundary before behavioral tests.
do $verify$
begin
  if not pg_catalog.has_table_privilege(
    'authenticated',
    'public.user_progress',
    'SELECT'
  ) or not pg_catalog.has_table_privilege(
    'authenticated',
    'public.user_progress',
    'INSERT'
  ) then
    raise exception 'authenticated must have SELECT and INSERT';
  end if;

  if pg_catalog.has_table_privilege(
    'authenticated',
    'public.user_progress',
    'UPDATE'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'public.user_progress',
    'DELETE'
  ) then
    raise exception 'authenticated unexpectedly has UPDATE or DELETE';
  end if;

  if pg_catalog.has_table_privilege(
    'anon',
    'public.user_progress',
    'SELECT'
  ) or pg_catalog.has_table_privilege(
    'anon',
    'public.user_progress',
    'INSERT'
  ) or pg_catalog.has_table_privilege(
    'anon',
    'public.user_progress',
    'UPDATE'
  ) or pg_catalog.has_table_privilege(
    'anon',
    'public.user_progress',
    'DELETE'
  ) then
    raise exception 'anon unexpectedly has access to user_progress';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'user_progress'
      and grantee = 'PUBLIC'
  ) then
    raise exception 'PUBLIC unexpectedly has access to user_progress';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.user_progress',
    'SELECT'
  ) or not pg_catalog.has_table_privilege(
    'service_role',
    'public.user_progress',
    'INSERT'
  ) or not pg_catalog.has_table_privilege(
    'service_role',
    'public.user_progress',
    'UPDATE'
  ) or not pg_catalog.has_table_privilege(
    'service_role',
    'public.user_progress',
    'DELETE'
  ) then
    raise exception 'service_role trusted table access was not preserved';
  end if;
end;
$verify$;

-- Create another user's attempt through the trusted owner path. A NULL
-- question_id is valid for preserved history whose content was removed.
do $verify$
declare
  v_attempt_id uuid;
begin
  insert into public.user_progress (
    user_id,
    question_id,
    is_correct,
    answered_at
  )
  values (
    pg_catalog.current_setting('justep_test.admin_id')::uuid,
    null,
    true,
    pg_catalog.clock_timestamp()
  )
  returning id into v_attempt_id;

  perform pg_catalog.set_config(
    'justep_test.other_attempt_id',
    v_attempt_id::text,
    true
  );
end;
$verify$;

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

-- PASS: a student can append an attempt for their own user_id.
do $verify$
declare
  v_attempt_id uuid;
begin
  insert into public.user_progress (
    user_id,
    question_id,
    is_correct,
    time_spent_seconds,
    answered_at
  )
  values (
    auth.uid(),
    null,
    false,
    25,
    pg_catalog.clock_timestamp()
  )
  returning id into v_attempt_id;

  perform pg_catalog.set_config(
    'justep_test.student_attempt_id',
    v_attempt_id::text,
    true
  );
end;
$verify$;

-- PASS: the student can read their own attempt.
do $verify$
begin
  if not exists (
    select 1
    from public.user_progress
    where id = pg_catalog.current_setting(
      'justep_test.student_attempt_id'
    )::uuid
      and user_id = auth.uid()
  ) then
    raise exception 'verification failed: student cannot read own attempt';
  end if;
end;
$verify$;

-- PASS: table privileges prevent rewriting an existing attempt.
do $verify$
begin
  begin
    update public.user_progress
    set is_correct = true
    where id = pg_catalog.current_setting(
      'justep_test.student_attempt_id'
    )::uuid;

    raise exception 'verification failed: student updated an attempt';
  exception
    when sqlstate '42501' then
      raise notice 'PASS: student UPDATE rejected';
  end;
end;
$verify$;

-- PASS: table privileges prevent deleting an existing attempt.
do $verify$
begin
  begin
    delete from public.user_progress
    where id = pg_catalog.current_setting(
      'justep_test.student_attempt_id'
    )::uuid;

    raise exception 'verification failed: student deleted an attempt';
  exception
    when sqlstate '42501' then
      raise notice 'PASS: student DELETE rejected';
  end;
end;
$verify$;

-- PASS: INSERT policy rejects another user's user_id.
do $verify$
begin
  begin
    insert into public.user_progress (
      user_id,
      question_id,
      is_correct,
      answered_at
    )
    values (
      pg_catalog.current_setting('justep_test.admin_id')::uuid,
      null,
      true,
      pg_catalog.clock_timestamp()
    );

    raise exception
      'verification failed: student inserted for another user';
  exception
    when sqlstate '42501' then
      raise notice 'PASS: cross-user INSERT rejected';
  end;
end;
$verify$;

-- PASS: SELECT policy hides another user's attempt.
do $verify$
begin
  if exists (
    select 1
    from public.user_progress
    where id = pg_catalog.current_setting(
      'justep_test.other_attempt_id'
    )::uuid
  ) then
    raise exception 'verification failed: student read another user''s attempt';
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

-- PASS: user_progress_admin_read still exposes both users' test attempts.
do $verify$
declare
  v_visible integer;
begin
  select count(*)
  into v_visible
  from public.user_progress
  where id in (
    pg_catalog.current_setting('justep_test.student_attempt_id')::uuid,
    pg_catalog.current_setting('justep_test.other_attempt_id')::uuid
  );

  if v_visible <> 2 then
    raise exception 'verification failed: admin cannot read all attempts';
  end if;
end;
$verify$;

-- PASS: service_role retains trusted INSERT, UPDATE, and DELETE maintenance.
reset role;
set local role service_role;
do $verify$
declare
  v_attempt_id uuid;
begin
  insert into public.user_progress (
    user_id,
    question_id,
    is_correct,
    answered_at
  )
  values (
    pg_catalog.current_setting('justep_test.student_id')::uuid,
    null,
    false,
    pg_catalog.clock_timestamp()
  )
  returning id into v_attempt_id;

  update public.user_progress
  set is_correct = true
  where id = v_attempt_id;

  if not found then
    raise exception 'verification failed: service_role UPDATE failed';
  end if;

  delete from public.user_progress
  where id = v_attempt_id;

  if not found then
    raise exception 'verification failed: service_role DELETE failed';
  end if;
end;
$verify$;

-- PASS: the postgres owner path also remains available.
reset role;
update public.user_progress
set time_spent_seconds = 26
where id = pg_catalog.current_setting(
  'justep_test.student_attempt_id'
)::uuid;

rollback;

-- Idempotency check: apply migration 025 a second time in the disposable
-- database, then run this rollback-only test again.
