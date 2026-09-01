-- ============================================================
-- Bhabhi — did supabase-schema.sql land?
-- Paste this into the Supabase SQL editor AFTER running
-- supabase-schema.sql. Every row should read OK.
-- Read-only: this changes nothing.
-- ============================================================

with checks as (
  select 'profiles.display_name column' as check_name,
         exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles'
             and column_name = 'display_name'
         ) as ok

  union all
  select 'game_results table',
         to_regclass('public.game_results') is not null

  union all
  select 'game_results idempotency constraint (owner_id, game_id)',
         exists (
           select 1 from pg_constraint
           where conname = 'game_results_unique_per_owner'
         )

  union all
  select 'game_results history index',
         exists (
           select 1 from pg_indexes
           where schemaname = 'public'
             and indexname = 'game_results_owner_completed_idx'
         )

  union all
  select 'game_results row-level security enabled',
         coalesce((
           select relrowsecurity from pg_class
           where oid = to_regclass('public.game_results')
         ), false)

  union all
  select 'game_results read policy (own rows only)',
         exists (
           select 1 from pg_policies
           where schemaname = 'public' and tablename = 'game_results'
             and cmd = 'SELECT'
         )

  union all
  select 'game_results has NO client insert policy (writes go via the server)',
         not exists (
           select 1 from pg_policies
           where schemaname = 'public' and tablename = 'game_results'
             and cmd = 'INSERT'
         )

  union all
  select 'get_player_stats() function',
         exists (
           select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'get_player_stats'
         )

  union all
  select 'rooms allows 2-8 players',
         exists (
           select 1 from pg_constraint
           where conname = 'rooms_max_players_check'
             and pg_get_constraintdef(oid) like '%2%8%'
         )

  union all
  select 'rooms is in the realtime publication',
         exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public' and tablename = 'rooms'
         )
)
select
  case when ok then 'OK' else 'MISSING' end as status,
  check_name
from checks
order by ok, check_name;
