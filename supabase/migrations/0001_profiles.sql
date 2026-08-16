-- Profiles table, RLS, signup trigger, and photo storage.
--
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  -- `id` is both primary key and foreign key to auth.users: one profile per
  -- account, and the row disappears with the account.
  id          uuid primary key references auth.users (id) on delete cascade,

  username    text unique check (
                username is null
                or username ~ '^[a-zA-Z0-9_]{3,30}$'
              ),
  full_name   text check (char_length(full_name) <= 120),
  avatar_url  text,

  -- Profile fields the app's form and display page use.
  college     text check (char_length(college) <= 160),
  branch      text check (char_length(branch) <= 120),
  year        smallint check (year between 1 and 10),
  interests   text[] not null default '{}',
  skills      text[] not null default '{}',
  bio         text check (char_length(bio) <= 2000),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Every column except `id` is nullable, because the signup trigger in step 3
-- inserts a bare row before the user has filled anything in. Required-ness is
-- enforced in the form, not the schema.

-- ---------------------------------------------------------------------------
-- 2. Row-level security
-- ---------------------------------------------------------------------------
--
-- Without this line the policies below do nothing and the table is readable by
-- anyone holding the anon key. Enabling RLS with no policies denies everything,
-- which is the correct place to start from.

alter table public.profiles enable row level security;

-- `(select auth.uid())` rather than bare `auth.uid()` so Postgres evaluates it
-- once per statement instead of once per row.

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- Both `using` and `with check` are required. `using` picks which rows may be
-- targeted; `with check` validates the row after the update. With only `using`,
-- a user could edit their own row and rewrite `id` to someone else's, handing
-- their profile away. This is the classic RLS hole.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Not strictly needed once the trigger creates rows, but it keeps `upsert`
-- working and covers accounts created before the trigger existed.
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- 3. Auto-create a profile row on signup
-- ---------------------------------------------------------------------------
--
-- security definer: the function must write to public.profiles while running in
-- the context of an auth.users insert, where the caller has no such rights.
-- `set search_path = ''` is mandatory alongside it — without a pinned
-- search_path, a definer function can be hijacked by a shadowing object, so all
-- names below are fully qualified.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), '')
  )
  -- If this raised, the whole signup would fail with "Database error saving
  -- new user" and the account would never be created. Swallowing a duplicate
  -- is far better than blocking signup.
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed up before this trigger existed.
insert into public.profiles (id)
select u.id
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ---------------------------------------------------------------------------
-- 4. updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Storage bucket for avatars
-- ---------------------------------------------------------------------------
--
-- Private, matching the table's "own row only" rule. A public bucket would make
-- every photo readable by anyone with the URL, undoing that privacy. The app
-- stores the object PATH in avatar_url and mints a short-lived signed URL at
-- render time.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880, -- 5 MB, enforced by Storage itself
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are keyed "<user_id>/<random>.<ext>", so the first path segment is
-- the owner. storage.foldername(name) splits the path; [1] is that segment.

drop policy if exists profile_photos_select_own on storage.objects;
create policy profile_photos_select_own
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists profile_photos_insert_own on storage.objects;
create policy profile_photos_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists profile_photos_update_own on storage.objects;
create policy profile_photos_update_own
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'profile-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists profile_photos_delete_own on storage.objects;
create policy profile_photos_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- 6. Refresh the PostgREST schema cache
-- ---------------------------------------------------------------------------
--
-- This is what clears "Could not find the table 'public.profiles' in the schema
-- cache". PostgREST caches the schema and normally reloads on DDL, but this
-- makes it immediate.

notify pgrst, 'reload schema';
