-- Public (signed-in) profiles at /profile/<user_id>.
--
-- What this opens up, to SIGNED-IN users only (never anonymous visitors):
--   * every profiles row  — name, college, branch, year, skills, interests,
--                           bio, photo. There is no email column here; email
--                           lives in auth.users, which stays private.
--   * profile photos      — read access to the profile-photos bucket.
--   * Completed projects  — other students' projects with status 'Completed'
--                           (all columns of those rows, including notes).
--   * earned badges       — every user_badges row.
--   * stats               — COUNTS ONLY, through public_profile_stats(); no
--                           one else's topic_progress rows become readable.
--
-- What stays owner-only: editing profiles, every non-Completed project,
-- topic_progress rows, daily_usage, messages.
--
-- Run in SQL Editor → New query → Run. Safe to run more than once. Policies
-- are OR'd, so after running, use the check at the bottom to make sure no
-- older policy grants more than intended.

-- ---------------------------------------------------------------------------
-- 1. profiles: any signed-in user can read; only the owner can write.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

-- Owner-only writes, keyed on user_id (the column the app filters and writes
-- on). Both clauses on update: `using` picks the rows you may target,
-- `with check` stops you rewriting user_id to hand the row to someone else.
drop policy if exists profiles_update_owner on public.profiles;
create policy profiles_update_owner
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists profiles_insert_owner on public.profiles;
create policy profiles_insert_owner
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. Profile photos: readable by any signed-in user (uploads stay
--    owner-only via the existing insert/update/delete policies).
-- ---------------------------------------------------------------------------

drop policy if exists profile_photos_select_authenticated on storage.objects;
create policy profile_photos_select_authenticated
  on storage.objects for select
  to authenticated
  using (bucket_id = 'profile-photos');

-- ---------------------------------------------------------------------------
-- 3. projects: Completed ones readable by any signed-in user. Owners still
--    see all of their own through projects_select_own, and only owners can
--    update or delete (no change to those policies).
-- ---------------------------------------------------------------------------

drop policy if exists projects_select_completed on public.projects;
create policy projects_select_completed
  on public.projects for select
  to authenticated
  using (status = 'Completed');

-- ---------------------------------------------------------------------------
-- 4. user_badges: earned badges readable by any signed-in user. Inserting
--    stays owner-only (user_badges_insert_own from 0006).
-- ---------------------------------------------------------------------------

drop policy if exists user_badges_select_authenticated on public.user_badges;
create policy user_badges_select_authenticated
  on public.user_badges for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 5. Stats as counts only.
--
-- security definer so it can count rows the caller cannot read; it returns
-- nothing but four numbers, and nothing at all to an anonymous caller.
-- search_path is pinned and every name qualified, as definer functions need.
-- ---------------------------------------------------------------------------

create or replace function public.public_profile_stats(p_user_id uuid)
returns table (
  topics_completed   integer,
  quizzes_taken      integer,
  projects_created   integer,
  projects_completed integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.topic_progress
      where user_id = p_user_id and completed)::integer,
    (select count(*) from public.topic_progress
      where user_id = p_user_id and quiz_score is not null)::integer,
    (select count(*) from public.projects
      where owner_id = p_user_id)::integer,
    (select count(*) from public.projects
      where owner_id = p_user_id and status = 'Completed')::integer
  where (select auth.uid()) is not null;
$$;

revoke execute on function public.public_profile_stats(uuid) from public, anon;
grant execute on function public.public_profile_stats(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 6. CHECK (read the output): every policy on the affected tables.
--    For "only the owner can edit", every UPDATE/INSERT/DELETE row on
--    profiles must compare auth.uid() to user_id. Drop any that do not, e.g.
--      drop policy "<name>" on public.profiles;
-- ---------------------------------------------------------------------------

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in ('profiles', 'projects', 'user_badges'))
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'profile_photos%')
order by tablename, cmd, policyname;
