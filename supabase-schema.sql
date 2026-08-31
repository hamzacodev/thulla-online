-- ============================================================
-- Thulla Online — Supabase schema
-- Run this once in your Supabase project: SQL Editor > New query
-- ============================================================

-- 1. Profiles: one row per signed-up user, holds their chosen username.
--    (auth.users is created automatically by Supabase Auth once email
--    sign-up is enabled — do not create it yourself.)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Profiles are publicly readable"
  on profiles for select using (true);

create policy "Users can insert their own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id);

-- Auto-create a blank profile row whenever someone signs up.
-- Username stays null until they pick one in the app.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Rooms: one row per game.
create table if not exists rooms (
  code text primary key,
  host_id uuid references auth.users(id),
  max_players int not null default 4 check (max_players between 4 and 8),
  state jsonb not null,
  created_at timestamptz not null default now()
);

alter table rooms enable row level security;

create policy "Rooms are publicly readable"
  on rooms for select using (true);

-- All writes to rooms go through the app's API routes using the
-- service-role key, which bypasses RLS — so no insert/update policy
-- is needed here.

-- 3. Realtime: let clients subscribe to live room state changes.
alter publication supabase_realtime add table rooms;

-- 4. Housekeeping — run manually now and then, or wire to a Supabase
--    scheduled job, to keep the free tier tidy:
-- delete from rooms where created_at < now() - interval '24 hours';
