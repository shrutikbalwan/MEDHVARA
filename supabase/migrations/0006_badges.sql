-- Badge catalogue rows and row-level security for badges / user_badges.
--
-- The tables already exist:
--   badges      (id text primary key, name text, description text, icon text)
--   user_badges (user_id uuid, badge_id text -> badges.id, earned_at timestamptz)
--
-- user_badges.badge_id references badges.id, so the app can only award a
-- badge whose row exists here. Run in SQL Editor → New query → Run. Safe to
-- run more than once: existing badge rows are left exactly as they are, so
-- names or icons you have already customised are kept.

-- ---------------------------------------------------------------------------
-- 1. Catalogue
-- ---------------------------------------------------------------------------

insert into public.badges (id, name, description, icon) values
  ('first_profile',     'Hello, World',      'Added your name to your profile.',                 '👋'),
  ('first_lesson',      'First Lesson',      'Completed your first topic.',                      '📘'),
  ('first_quiz',        'Quiz Taker',        'Finished your first quiz.',                        '📝'),
  ('five_lessons',      'Five Down',         'Completed five topics.',                           '🏅'),
  ('circuit_explorer',  'Circuit Explorer',  'Completed a Basic Electronics topic.',             '⚡'),
  ('embedded_explorer', 'Embedded Explorer', 'Completed an Embedded Systems topic.',             '🔧'),
  ('iot_explorer',      'IoT Explorer',      'Completed an IoT topic.',                          '📡'),
  ('first_project',     'First Project',     'Planned your first project.',                      '💡'),
  ('project_builder',   'Project Builder',   'Planned three projects.',                          '🛠️'),
  ('project_finisher',  'Project Finisher',  'Marked a project as Completed.',                   '🏁'),
  -- Placeholder: not awarded yet; needs daily login tracking.
  ('streak_7',          '7-Day Streak',      'Learned on seven days in a row.',                  '🔥')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. badges: a shared catalogue, readable by every signed-in user. No write
--    policies, so only the dashboard can change it.
-- ---------------------------------------------------------------------------

alter table public.badges enable row level security;

drop policy if exists badges_select_authenticated on public.badges;
create policy badges_select_authenticated
  on public.badges for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 3. user_badges: each user reads and inserts only their own rows.
--    Deliberately no update or delete policy: an earned badge stays earned.
-- ---------------------------------------------------------------------------

alter table public.user_badges enable row level security;

drop policy if exists user_badges_select_own on public.user_badges;
create policy user_badges_select_own
  on public.user_badges for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_badges_insert_own on public.user_badges;
create policy user_badges_insert_own
  on public.user_badges for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- earned_at is filled by the database, not the app. Harmless if it already
-- has a default.
alter table public.user_badges alter column earned_at set default now();

notify pgrst, 'reload schema';
