-- Sudoku game state. Run once in Supabase → SQL Editor → New query → Run.
--
-- The app keeps its whole game database (players, rooms, tournaments,
-- match results) as one JSONB document, written with optimistic
-- concurrency on `version`. Only the server touches it, using the secret
-- (service_role) key, which bypasses row-level security.

create table if not exists public.sudoku_state (
  id text primary key,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Lock the table down: RLS on with no policies means the public (anon /
-- publishable) key used in the browser can neither read nor write it.
alter table public.sudoku_state enable row level security;
revoke all on public.sudoku_state from anon, authenticated;
-- Newer Supabase projects don't grant new tables to any role automatically.
grant usage on schema public to service_role;
grant all on table public.sudoku_state to service_role;

-- Make the Data API notice the new table immediately.
notify pgrst, 'reload schema';
