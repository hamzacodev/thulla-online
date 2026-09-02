-- ============================================================
-- Adding Bluff: per-game results, statistics and history.
--
-- Run this in your Supabase project: SQL Editor > New query.
-- Safe to re-run — every statement is idempotent.
-- Additive only: nothing is dropped, no Thulla data is touched, and
-- every existing row keeps working exactly as it does today.
--
-- Without this, Bluff still plays; results just save to the browser
-- instead of your account, and the Bluff stats page says so.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Which game a result belongs to.
--    Defaulted to 'thulla', so every row already in the table is
--    correctly labelled the moment this runs. Nothing to backfill.
-- ------------------------------------------------------------
alter table game_results add column if not exists game text not null default 'thulla';

-- ------------------------------------------------------------
-- 2. Whatever only one game tracks.
--    Bluff keeps its deck count and challenge counters here rather than
--    adding five columns that mean nothing to Thulla — and 3 Patti will
--    want a different five again.
-- ------------------------------------------------------------
alter table game_results add column if not exists details jsonb;

-- ------------------------------------------------------------
-- 3. The index the per-game screens actually use: one player, one game,
--    newest first. Serves both the stats scan and the history listing.
-- ------------------------------------------------------------
create index if not exists game_results_owner_game_idx
  on game_results (owner_id, game, completed_at desc);

-- ------------------------------------------------------------
-- 4. Statistics for one game.
--
--    Same arithmetic as get_player_stats(), with a game filter. The
--    original function is left alone and still works, so anything still
--    calling it is unaffected.
--
--    `is_thulla` means "finished last" here. The column is named after
--    Thulla's loser, but every game on the platform has one, and the
--    Bluff screens label it "Last place".
-- ------------------------------------------------------------
create or replace function public.get_game_stats(p_user uuid, p_game text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_games int := 0;
  v_wins int := 0;
  v_last int := 0;
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
  -- security definer reads past row-level security, so the ownership check
  -- has to happen here explicitly — otherwise any signed-in user could read
  -- anyone's record by passing a different id.
  if auth.uid() is distinct from p_user then
    raise exception 'not authorised';
  end if;

  for r in
    select is_win, is_thulla, mode
    from game_results
    where owner_id = p_user and game = p_game
    order by completed_at desc, id desc
  loop
    v_games := v_games + 1;
    if r.is_win then v_wins := v_wins + 1; end if;
    if r.is_thulla then v_last := v_last + 1; end if;
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
    'thulla', v_last,
    'cpuGames', v_cpu,
    'friendGames', v_friends,
    'currentWinStreak', case when coalesce(v_current_is_win, false) then v_current_run else 0 end,
    'currentLossStreak', case when v_current_is_win is false then v_current_run else 0 end,
    'bestWinStreak', v_best_win,
    'bestLossStreak', v_best_loss
  );
end;
$$;

revoke all on function public.get_game_stats(uuid, text) from public;
grant execute on function public.get_game_stats(uuid, text) to authenticated, service_role;
