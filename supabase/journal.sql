-- 盈亏日历 (journal.html) cloud storage.
-- Run once: Supabase dashboard → SQL Editor → New query → paste all of this → Run. Running it again is harmless.
-- Every row belongs to the signed-in user who wrote it; row level security lets each user see and change only their own.

-- One row per trade: the amount won (+) or lost (−), and what the page's "更多" fields hold.
create table if not exists public.pnl_trades (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id      text not null check (char_length(id) <= 64),
  d       date not null,                                     -- the trading day
  amt     numeric(14, 2) not null,                           -- profit (+) or loss (−)
  sym     text check (char_length(sym) <= 16),
  side    text check (side in ('long', 'short')),
  lots    numeric,
  risk    numeric,                                           -- what the trade was planned to lose at most
  rule    boolean,                                           -- taken by the gold page's rule?
  plat    text check (char_length(plat) <= 40),              -- broker / platform
  note    text check (char_length(note) <= 500),
  t       bigint,                                            -- when it was written down (ms since 1970)
  u       bigint,                                            -- when it last changed (ms)
  primary key (user_id, id)
);

-- Money taken out of (or put into) a platform.
create table if not exists public.pnl_cash (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id      text not null check (char_length(id) <= 64),
  d       date not null,
  kind    text not null default 'withdraw' check (kind in ('withdraw', 'deposit')),
  amt     numeric(14, 2) not null check (amt >= 0),
  plat    text check (char_length(plat) <= 40),
  note    text check (char_length(note) <= 500),
  t       bigint,
  u       bigint,
  primary key (user_id, id)
);

-- Profit targets: the progress bar counts trades from start_d / at; done_at is set when the goal is claimed.
create table if not exists public.pnl_goals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id      text not null check (char_length(id) <= 64),
  name    text check (char_length(name) <= 40),
  target  numeric(14, 2) not null check (target > 0),
  start_d date not null,
  at      bigint not null,                                   -- trades written on start_d count from this moment
  done_d  date,                                              -- the day the running total first reached the target
  done_at bigint,
  reached numeric(14, 2),                                    -- the total when the goal was claimed
  u       bigint,
  primary key (user_id, id)
);

-- Remarks: one per day, typed in the 备注 card (added 2026-11-14; running this whole file again adds it and keeps the rest).
create table if not exists public.pnl_notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id      text not null check (char_length(id) <= 64),   -- the day, YYYY-MM-DD
  d       date not null,
  text    text not null check (char_length(text) <= 2000),
  u       bigint,
  primary key (user_id, id)
);

-- Page settings: currency sign, month-start balance, the platform list.
create table if not exists public.pnl_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  cur     text check (char_length(cur) <= 4),
  start   numeric,
  plats   jsonb,
  u       bigint
);

alter table public.pnl_trades   enable row level security;
alter table public.pnl_cash     enable row level security;
alter table public.pnl_goals    enable row level security;
alter table public.pnl_settings enable row level security;
alter table public.pnl_notes    enable row level security;

drop policy if exists "own rows" on public.pnl_trades;
drop policy if exists "own rows" on public.pnl_cash;
drop policy if exists "own rows" on public.pnl_goals;
drop policy if exists "own rows" on public.pnl_settings;
drop policy if exists "own rows" on public.pnl_notes;
create policy "own rows" on public.pnl_trades   for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.pnl_cash     for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.pnl_goals    for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.pnl_settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.pnl_notes    for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.pnl_trades, public.pnl_cash, public.pnl_goals, public.pnl_settings, public.pnl_notes from anon;
grant select, insert, update, delete on public.pnl_trades, public.pnl_cash, public.pnl_goals, public.pnl_settings, public.pnl_notes to authenticated;

-- make the API see new tables at once (otherwise it can take a while)
notify pgrst, 'reload schema';
