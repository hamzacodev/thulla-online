-- ============================================================
-- Bhabhi (Thulla) Online — Supabase schema
-- Run this in your Supabase project: SQL Editor > New query.
-- Safe to re-run: every statement is idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Profiles — one row per signed-up user.
--    auth.users is managed by Supabase Auth; don't create it.
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  created_at timestamptz not null default now()
);

alter table profiles add column if not exists display_name text;

alter table profiles enable row level security;

drop policy if exists "Profiles are publicly readable" on profiles;
create policy "Profiles are publicly readable"
  on profiles for select using (true);

drop policy if exists "Users can insert their own profile" on profiles;
create policy "Users can insert their own profile"
  on profiles for insert with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id);

-- Auto-create a blank profile row on sign-up. Username stays null until
-- they pick one in the app.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 2. Rooms — one row per online game.
-- ------------------------------------------------------------
create table if not exists rooms (
  code text primary key,
  host_id uuid references auth.users(id),
  max_players int not null default 4,
  state jsonb not null,
  created_at timestamptz not null default now()
);

-- The game supports 2–8 players now, not 4–8.
alter table rooms drop constraint if exists rooms_max_players_check;
alter table rooms add constraint rooms_max_players_check
  check (max_players between 2 and 8);

alter table rooms enable row level security;

drop policy if exists "Rooms are publicly readable" on rooms;
create policy "Rooms are publicly readable"
  on rooms for select using (true);

-- All writes to rooms go through the app's API routes with the service-role
-- key, which bypasses RLS — so no insert/update policy is needed.

-- ------------------------------------------------------------
-- 3. Game results — the permanent record of every COMPLETED game.
--    Statistics are derived from this table, never stored separately,
--    so the two can't drift apart.
-- ------------------------------------------------------------
create table if not exists game_results (
  id uuid primary key default gen_random_uuid(),

  -- Identity of the deal itself. Unique per owner, which is what makes
  -- recording idempotent across re-renders, refreshes and retries.
  game_id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,

  mode text not null check (mode in ('cpu', 'friends')),
  player_count int not null check (player_count between 2 and 8),
  cpu_difficulty text check (cpu_difficulty in ('easy', 'medium', 'hard')),

  -- Full final table: [{ playerId, name, type, position, result }]
  -- Kept whole so head-to-head records and leaderboards can be built later
  -- without a schema change.
  players jsonb not null,

  winner_id uuid,
  winner_name text,
  bhabhi_id uuid,
  bhabhi_name text,

  -- This owner's own outcome, denormalised so stats need no jsonb digging.
  my_position int not null,
  is_win boolean not null,
  is_bhabhi boolean not null,

  duration_ms integer check (duration_ms >= 0),
  started_at timestamptz,
  completed_at timestamptz not null default now(),

  constraint game_results_unique_per_owner unique (owner_id, game_id)
);

-- History is always read newest-first for one owner; this index serves both
-- the listing and the stats scan.
create index if not exists game_results_owner_completed_idx
  on game_results (owner_id, completed_at desc, id desc);

create index if not exists game_results_owner_mode_idx
  on game_results (owner_id, mode, completed_at desc);

alter table game_results enable row level security;

-- A user can read only their own record.
drop policy if exists "Players read their own results" on game_results;
create policy "Players read their own results"
  on game_results for select using (auth.uid() = owner_id);

-- Rows are written by the app's API route using the service-role key after
-- it has verified the caller. No client-side insert policy exists, so a
-- browser cannot fabricate wins by writing here directly.

-- ------------------------------------------------------------
-- 4. Aggregated statistics.
--    One indexed scan per call, computed in the database — the client never
--    downloads a full history just to show a number.
-- ------------------------------------------------------------
create or replace function public.get_player_stats(p_user uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_games int := 0;
  v_wins int := 0;
  v_bhabhi int := 0;
  v_cpu int := 0;
  v_friends int := 0;
  v_best_win int := 0;
  v_best_loss int := 0;
  v_run_win int := 0;
  v_run_loss int := 0;
  v_current_run int := 0;
  v_current_is_win boolean := null;
  v_current_closed boolean := false;
  r record;
begin
  -- Statistics are private. security definer lets this read game_results
  -- past RLS, so the ownership check has to happen here explicitly —
  -- otherwise any signed-in user could read anyone's record by passing a
  -- different id. Server-side callers query the table directly instead.
  if auth.uid() is distinct from p_user then
    raise exception 'not authorised';
  end if;

  -- Newest first, so the leading run is the *current* streak.
  for r in
    select is_win, is_bhabhi, mode
    from game_results
    where owner_id = p_user
    order by completed_at desc, id desc
  loop
    v_games := v_games + 1;
    if r.is_win then v_wins := v_wins + 1; end if;
    if r.is_bhabhi then v_bhabhi := v_bhabhi + 1; end if;
    if r.mode = 'cpu' then v_cpu := v_cpu + 1; else v_friends := v_friends + 1; end if;

    if v_current_is_win is null then
      v_current_is_win := r.is_win;
    end if;
    if not v_current_closed then
      if r.is_win = v_current_is_win then
        v_current_run := v_current_run + 1;
      else
        v_current_closed := true;
      end if;
    end if;

    -- Longest run of each kind. Run length is order-independent, so
    -- scanning backwards finds the same maximum.
    if r.is_win then
      v_run_win := v_run_win + 1;
      v_run_loss := 0;
      if v_run_win > v_best_win then v_best_win := v_run_win; end if;
    else
      v_run_loss := v_run_loss + 1;
      v_run_win := 0;
      if v_run_loss > v_best_loss then v_best_loss := v_run_loss; end if;
    end if;
  end loop;

  return json_build_object(
    'games', v_games,
    'wins', v_wins,
    'losses', v_games - v_wins,
    'bhabhi', v_bhabhi,
    'cpuGames', v_cpu,
    'friendGames', v_friends,
    'currentWinStreak', case when coalesce(v_current_is_win, false) then v_current_run else 0 end,
    'currentLossStreak', case when v_current_is_win is false then v_current_run else 0 end,
    'bestWinStreak', v_best_win,
    'bestLossStreak', v_best_loss
  );
end;
$$;

revoke all on function public.get_player_stats(uuid) from public;
grant execute on function public.get_player_stats(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Realtime for live room state.
-- ------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table rooms;
exception
  when duplicate_object then null;
end
$$;

-- ------------------------------------------------------------
-- 6. Housekeeping — run occasionally, or wire to a scheduled job.
--    Only rooms are disposable; game_results is the permanent record.
-- ------------------------------------------------------------
-- delete from rooms where created_at < now() - interval '24 hours';
