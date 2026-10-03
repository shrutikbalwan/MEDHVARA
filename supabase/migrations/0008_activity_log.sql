-- Daily activity log: one row per user per day they were active. Powers
-- current_streak in getUserStats() and the streak_7 badge.
--
-- The app writes:  insert (user_id, activity_date) ... on conflict do nothing
-- so it is safe to call many times a day; the primary key keeps one row per day.
--
-- Run in SQL Editor → New query → Run. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Table (created only if it does not exist yet)
-- ---------------------------------------------------------------------------

create table if not exists public.activity_log (
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- The student's calendar day (Asia/Kolkata), computed by the app — not the
  -- UTC day, so evening activity in India counts for the right date.
  activity_date date not null,
  primary key (user_id, activity_date)
);

-- ---------------------------------------------------------------------------
-- 2. Guard: if activity_log already existed with different columns, stop here
--    with a clear message instead of letting the app's writes fail silently.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_log'
      and column_name = 'user_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_log'
      and column_name = 'activity_date' and data_type = 'date'
  ) then
    raise exception
      'public.activity_log exists but does not have user_id (uuid) and activity_date (date) columns. Send its column list to whoever maintains the app before continuing.';
  end if;

  -- The upsert needs a unique key on exactly (user_id, activity_date).
  if not exists (
    select 1
    from pg_index i
    join pg_attribute a1 on a1.attrelid = i.indrelid and a1.attnum = i.indkey[0]
    join pg_attribute a2 on a2.attrelid = i.indrelid and a2.attnum = i.indkey[1]
    where i.indrelid = 'public.activity_log'::regclass
      and i.indisunique
      and i.indnatts = 2
      and a1.attname = 'user_id'
      and a2.attname = 'activity_date'
  ) then
    alter table public.activity_log
      add constraint activity_log_user_date_key unique (user_id, activity_date);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Row-level security: each user reads and inserts only their own days.
--    No update or delete policy: a logged day stays logged.
-- ---------------------------------------------------------------------------

alter table public.activity_log enable row level security;

drop policy if exists activity_log_select_own on public.activity_log;
create policy activity_log_select_own
  on public.activity_log for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists activity_log_insert_own on public.activity_log;
create policy activity_log_insert_own
  on public.activity_log for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 4. streak_7 counts any active day (quiz, project, or opening the
--    dashboard), not only learning. Reword its description to match — but
--    only if it still has the original seeded text, so a custom one is kept.
-- ---------------------------------------------------------------------------

update public.badges
   set description = 'Active on MEDHVARA seven days in a row.'
 where id = 'streak_7'
   and description = 'Learned on seven days in a row.';
