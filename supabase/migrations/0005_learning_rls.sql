-- Row-level security for the learning pages (/learn).
--
-- The topics and topic_progress tables already exist; this only sets who may
-- read and write them. Run it if /learn shows no topics, or if finishing a
-- quiz says the database refused to save progress.
--
-- Run in SQL Editor → New query → Run. Safe to run more than once. As with
-- 0004, if you already have policies under other names these add alongside
-- them (policies are OR'd), so review and drop whichever set you do not want.

-- ---------------------------------------------------------------------------
-- topics: shared catalogue, readable by every signed-in user. No write
-- policies, so topics are managed from the dashboard, not by students.
-- ---------------------------------------------------------------------------

alter table public.topics enable row level security;

drop policy if exists topics_select_authenticated on public.topics;
create policy topics_select_authenticated
  on public.topics for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- topic_progress: each user sees and writes only their own rows. Saving uses
-- an upsert, which needs BOTH insert (first attempt) and update (retake).
-- ---------------------------------------------------------------------------

alter table public.topic_progress enable row level security;

drop policy if exists topic_progress_select_own on public.topic_progress;
create policy topic_progress_select_own
  on public.topic_progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists topic_progress_insert_own on public.topic_progress;
create policy topic_progress_insert_own
  on public.topic_progress for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Both clauses, as on projects: without `with check` a user could rewrite
-- user_id on their own row and hand it to someone else.
drop policy if exists topic_progress_update_own on public.topic_progress;
create policy topic_progress_update_own
  on public.topic_progress for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
