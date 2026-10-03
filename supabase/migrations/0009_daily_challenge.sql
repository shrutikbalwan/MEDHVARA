-- Daily Challenge: one answer per student per day, plus the challenge_7 badge.
--
-- The app writes:  insert (user_id, challenge_date, question_id, answer, correct)
-- The question and its answer key are computed by the app from the date
-- (src/lib/challenge.ts), so nothing about the questions is stored here.
--
-- Run in SQL Editor → New query → Run. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Table (created only if it does not exist yet)
-- ---------------------------------------------------------------------------

create table if not exists public.daily_challenge_attempts (
  user_id        uuid not null references auth.users (id) on delete cascade,
  -- The student's calendar day (Asia/Kolkata), computed by the app.
  challenge_date date not null,
  -- Which bank question that day had, e.g. 'ohm' — for reference only.
  question_id    text not null,
  -- What the student typed, e.g. '4.7k'.
  answer         text not null,
  correct        boolean not null,
  created_at     timestamptz not null default now(),
  -- One attempt per day: a second insert fails with 23505.
  primary key (user_id, challenge_date)
);

-- ---------------------------------------------------------------------------
-- 2. Row-level security: each user reads and inserts only their own rows.
--    No update or delete policy: an answer, once given, stays given.
--
--    Note: as with quiz scores, a student could insert a row directly with
--    the public API key and claim `correct = true`. That only affects their
--    own Daily Solver badge, which is acceptable for a self-study app.
-- ---------------------------------------------------------------------------

alter table public.daily_challenge_attempts enable row level security;

drop policy if exists daily_challenge_select_own on public.daily_challenge_attempts;
create policy daily_challenge_select_own
  on public.daily_challenge_attempts for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists daily_challenge_insert_own on public.daily_challenge_attempts;
create policy daily_challenge_insert_own
  on public.daily_challenge_attempts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. The badge. An existing row is left as it is, so a customised name or
--    icon is kept.
-- ---------------------------------------------------------------------------

insert into public.badges (id, name, description, icon) values
  ('challenge_7', 'Daily Solver', 'Solved seven Daily Challenges.', '🧮')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
