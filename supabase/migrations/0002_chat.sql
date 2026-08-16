-- Chat messages, per-day usage quota, and the RPCs the /api/chat route uses.
--
-- Run AFTER 0001_profiles.sql, in SQL Editor → New query → Run.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. messages
-- ---------------------------------------------------------------------------

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now()
);

-- Chat history is always read as "my messages, newest first".
create index if not exists messages_user_created_idx
  on public.messages (user_id, created_at desc);

alter table public.messages enable row level security;

drop policy if exists messages_select_own on public.messages;
create policy messages_select_own
  on public.messages for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own
  on public.messages for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Deliberately no update or delete policy: a chat log nobody can rewrite is
-- easier to trust. Add one later if the product needs message deletion.

-- ---------------------------------------------------------------------------
-- 2. daily_usage
-- ---------------------------------------------------------------------------

create table if not exists public.daily_usage (
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- Calendar day in the database's timezone (UTC on Supabase). "Tomorrow" in
  -- the user-facing message means the next UTC day, not the user's local one.
  day           date not null default current_date,
  message_count integer not null default 0 check (message_count >= 0),
  primary key (user_id, day)
);

alter table public.daily_usage enable row level security;

drop policy if exists daily_usage_select_own on public.daily_usage;
create policy daily_usage_select_own
  on public.daily_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists daily_usage_insert_own on public.daily_usage;
create policy daily_usage_insert_own
  on public.daily_usage for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists daily_usage_update_own on public.daily_usage;
create policy daily_usage_update_own
  on public.daily_usage for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. Quota RPCs
-- ---------------------------------------------------------------------------
--
-- Why a function instead of "select count, then update" from the app: those are
-- two statements with a gap between them. Two requests arriving together would
-- both read 29 and both proceed, letting a user exceed the cap. The upsert
-- below increments and returns the new value in one atomic statement, so
-- concurrent calls serialise on the row lock.
--
-- security invoker (the default, stated explicitly): the function runs as the
-- calling user, so the RLS policies above still apply and it cannot be used to
-- touch somebody else's quota.

create or replace function public.reserve_daily_message(p_limit integer default 30)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.daily_usage as d (user_id, day, message_count)
  values (v_uid, current_date, 1)
  on conflict (user_id, day)
    do update set message_count = d.message_count + 1
  returning d.message_count into v_count;

  -- Over quota: undo the increment we just made and report refusal, so a user
  -- who keeps retrying does not inflate their own counter.
  if v_count > p_limit then
    update public.daily_usage
       set message_count = message_count - 1
     where user_id = v_uid
       and day = current_date;
    return -1;
  end if;

  return v_count;
end;
$$;

-- Called when the AI request fails after a slot was reserved, so a provider
-- outage does not silently burn the user's daily allowance.
create or replace function public.release_daily_message()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return;
  end if;

  update public.daily_usage
     set message_count = greatest(message_count - 1, 0)
   where user_id = v_uid
     and day = current_date;
end;
$$;

notify pgrst, 'reload schema';
