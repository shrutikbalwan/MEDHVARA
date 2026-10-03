-- READ-ONLY diagnostic for "chat works for my account but not for new ones".
-- Changes nothing. Run in SQL Editor → New query → Run, and read each result.

-- 1. Foreign keys on the tables a chat request writes to. A row pointing at
--    public.profiles means a user with no profiles row cannot write there —
--    the 23503 that /api/chat now guards against.
select
  conrelid::regclass  as table_name,
  conname             as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and conrelid in ('public.daily_usage'::regclass, 'public.messages'::regclass);

-- 2. RLS policies on the same tables. daily_usage needs select, insert, AND
--    update for the authenticated role; messages needs select and insert.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('daily_usage', 'messages', 'profiles')
order by tablename, cmd;

-- 3. Which accounts have no profiles row. Every account listed here would
--    have failed to chat before the fix.
select u.id, u.email, u.created_at
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null
order by u.created_at desc;

-- 4. profiles columns, to confirm id has a default and which columns are
--    NOT NULL (a NOT NULL column without a default blocks the bare-row insert).
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;
