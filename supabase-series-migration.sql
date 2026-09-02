-- ============================================================
-- Best-of series: a parent record that owns several games.
--
-- Run this in your Supabase project: SQL Editor > New query.
-- Safe to re-run — every statement is idempotent.
-- Additive only: nothing is dropped, no existing row is rewritten,
-- and single games keep working exactly as they do today.
--
-- NOT RUN BY ME. The only database this project is configured against
-- is the one holding your real results, and the brief said to apply
-- migrations to a local or development database only. There isn't one.
--
-- Without this, series still work — they're kept in the browser, so a
-- series survives a refresh but not a change of device, and series
-- history has nothing to read.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The series itself.
--    Shared by every game on the platform: `game` says which one, the
--    same way game_results does. One table, not one per game.
-- ------------------------------------------------------------
create table if not exists game_series (
  id uuid primary key default gen_random_uuid(),

  -- 'thulla' | 'bluff' | whatever comes next.
  game text not null,
  -- The room this was played in, when it was played online.
  room_code text references rooms(code) on delete set null,

  -- Odd, and 1 means a single game. wins_required is stored rather than
  -- derived so a reader never recomputes it, and the check keeps the two
  -- from ever disagreeing.
  best_of int not null,
  wins_required int not null,

  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  current_game_number int not null default 1,
  games_played int not null default 0,

  winner_player_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint game_series_best_of_odd check (best_of >= 1 and best_of <= 99 and best_of % 2 = 1),
  constraint game_series_wins_required check (wins_required = (best_of / 2) + 1),
  constraint game_series_games_played check (games_played >= 0 and games_played <= best_of),
  constraint game_series_game_number check (current_game_number >= 1 and current_game_number <= best_of + 1)
);

create index if not exists game_series_creator_idx
  on game_series (created_by, game, created_at desc);

-- ------------------------------------------------------------
-- 2. Who is in it, and how they're doing.
--    A player appears once per series — the unique constraint is what
--    stops a double-join adding a second scoreline.
-- ------------------------------------------------------------
create table if not exists game_series_players (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references game_series(id) on delete cascade,
  player_id uuid references auth.users(id) on delete cascade,
  -- CPU seats have no account, so they're identified by name and seat.
  seat int not null,
  name text not null,
  wins int not null default 0,
  result text check (result in ('winner', 'loser')),
  joined_at timestamptz not null default now(),

  constraint game_series_players_wins check (wins >= 0),
  constraint game_series_players_unique_seat unique (series_id, seat)
);

-- A signed-in player can only hold one seat in a series.
create unique index if not exists game_series_players_unique_player
  on game_series_players (series_id, player_id)
  where player_id is not null;

create index if not exists game_series_players_player_idx
  on game_series_players (player_id, series_id);

-- ------------------------------------------------------------
-- 3. Each game's place in its series.
--    Added to the existing results table rather than a new one — a game
--    already has a full record, and a series only adds where it sat.
-- ------------------------------------------------------------
alter table game_results add column if not exists series_id uuid references game_series(id) on delete set null;
alter table game_results add column if not exists game_number int;

alter table game_results drop constraint if exists game_results_game_number_check;
alter table game_results add constraint game_results_game_number_check
  check (game_number is null or game_number >= 1);

-- One game number per series, per owner's copy of the row. This is the
-- constraint that makes two clients clicking "next game" produce one game
-- rather than two: the second insert loses.
create unique index if not exists game_results_series_game_number
  on game_results (owner_id, series_id, game_number)
  where series_id is not null;

create index if not exists game_results_series_idx
  on game_results (series_id, game_number);

-- ------------------------------------------------------------
-- 4. Row-level security, matching the platform's existing conventions:
--    you can read your own record and nothing else, and the app's API
--    routes write with the service-role key.
-- ------------------------------------------------------------
alter table game_series enable row level security;
alter table game_series_players enable row level security;

drop policy if exists "Players read series they were in" on game_series;
create policy "Players read series they were in"
  on game_series for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from game_series_players p
      where p.series_id = game_series.id and p.player_id = auth.uid()
    )
  );

drop policy if exists "Players read their own series lines" on game_series_players;
create policy "Players read their own series lines"
  on game_series_players for select to authenticated
  using (
    player_id = auth.uid()
    or exists (
      select 1 from game_series s
      where s.id = game_series_players.series_id and s.created_by = auth.uid()
    )
  );

-- No client insert or update policy anywhere: series scoring is written
-- server-side with the service-role key, so a browser cannot award itself
-- a series, change best_of after the first game, or set winner_player_id.

-- ------------------------------------------------------------
-- 5. updated_at, kept honest by a trigger rather than by every caller.
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists game_series_touch on game_series;
create trigger game_series_touch
  before update on game_series
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 6. Series statistics for one game, kept apart from lifetime game stats.
--    A series win is not an individual game win and this never conflates
--    them: it counts series rows, never game_results rows.
-- ------------------------------------------------------------
create or replace function public.get_series_stats(p_user uuid, p_game text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_won int := 0;
  v_bo3 int := 0;
  v_bo5 int := 0;
  v_bo7 int := 0;
  r record;
begin
  if auth.uid() is distinct from p_user then
    raise exception 'not authorised';
  end if;

  for r in
    select s.best_of, s.winner_player_id
    from game_series s
    join game_series_players p on p.series_id = s.id
    where p.player_id = p_user and s.game = p_game and s.status = 'completed'
  loop
    v_total := v_total + 1;
    if r.winner_player_id = p_user then
      v_won := v_won + 1;
      if r.best_of = 3 then v_bo3 := v_bo3 + 1;
      elsif r.best_of = 5 then v_bo5 := v_bo5 + 1;
      elsif r.best_of = 7 then v_bo7 := v_bo7 + 1;
      end if;
    end if;
  end loop;

  return json_build_object(
    'seriesPlayed', v_total,
    'seriesWon', v_won,
    'seriesLost', v_total - v_won,
    'bestOf3Wins', v_bo3,
    'bestOf5Wins', v_bo5,
    'bestOf7Wins', v_bo7
  );
end;
$$;

revoke all on function public.get_series_stats(uuid, text) from public;
grant execute on function public.get_series_stats(uuid, text) to authenticated, service_role;
