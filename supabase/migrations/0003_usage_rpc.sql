-- OPTIONAL upgrade. The app works without this file.
--
-- /api/chat currently reserves a daily message slot with read → insert-or-
-- update plus a compare-and-swap retry (src/lib/supabase/usage.ts). That is
-- correct under concurrency but costs 2–3 round trips and can, in the worst
-- case, exhaust its retries under heavy parallel load.
--
-- This function does the same work in ONE atomic statement: concurrent callers
-- serialise on the row lock, so no retry loop is needed and the limit cannot be
-- exceeded. To adopt it, run this file and switch reserveDailySlot() to:
--     supabase.rpc("reserve_daily_message", { p_limit: DAILY_MESSAGE_LIMIT })
-- which returns the new count, or -1 when the user is over the limit.
--
-- Column names here match the live table: user_id, usage_date, message_count.

create or replace function public.reserve_daily_message(p_limit integer default 30)
returns integer
language plpgsql
-- security invoker: runs as the calling user, so RLS still applies and this
-- cannot be used to touch another user's quota.
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

  insert into public.daily_usage as d (user_id, usage_date, message_count)
  values (v_uid, current_date, 1)
  on conflict (user_id, usage_date)
    do update set message_count = d.message_count + 1
  returning d.message_count into v_count;

  -- Over quota: undo the increment so repeated retries do not inflate the
  -- counter, and report refusal.
  if v_count > p_limit then
    update public.daily_usage
       set message_count = message_count - 1
     where user_id = v_uid
       and usage_date = current_date;
    return -1;
  end if;

  return v_count;
end;
$$;

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
     and usage_date = current_date;
end;
$$;

notify pgrst, 'reload schema';

-- NOTE: the ON CONFLICT above requires a unique constraint on
-- (user_id, usage_date). If your table lacks one, add it first:
--   alter table public.daily_usage
--     add constraint daily_usage_user_date_key unique (user_id, usage_date);
