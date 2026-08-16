-- REQUIRED before /projects/new can save.
--
-- The existing public.projects table has:
--   id, owner_id, title, problem_statement, objectives, components,
--   technologies, notes, status, created_at
--
-- The generated plan also carries architecture_overview, development_steps,
-- difficulty, and subjects_to_learn_first, which have nowhere to go. This adds
-- them. All nullable, so existing rows stay valid.
--
-- Run in SQL Editor → New query → Run. Safe to run more than once.

alter table public.projects
  add column if not exists architecture_overview   text,
  add column if not exists development_steps       text[] not null default '{}',
  add column if not exists difficulty              text,
  add column if not exists subjects_to_learn_first text[] not null default '{}';

-- Constrain difficulty to the three values the app produces. Added separately
-- so re-running does not fail on a duplicate constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_difficulty_check'
  ) then
    alter table public.projects
      add constraint projects_difficulty_check
      check (difficulty is null or difficulty in ('Easy', 'Medium', 'Hard'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
--
-- I could not verify from outside the database whether RLS is already enabled
-- on this table or what policies exist. Both statements below are safe if it is
-- already on. If you already have owner policies under different names, these
-- add alongside them — policies are OR'd, so review yours and drop whichever
-- set you do not want.

alter table public.projects enable row level security;

drop policy if exists projects_select_own on public.projects;
create policy projects_select_own
  on public.projects for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own
  on public.projects for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

-- Both clauses: `using` picks the targetable rows, `with check` validates the
-- row after the write. Without the second, a user could edit their own project
-- and reassign owner_id to someone else.
drop policy if exists projects_update_own on public.projects;
create policy projects_update_own
  on public.projects for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own
  on public.projects for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

notify pgrst, 'reload schema';
