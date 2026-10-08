-- Schema for Israeli election betting pool
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  unique (league_id, user_id)
);

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  leader text,
  is_threshold_risk boolean default false,
  poll_average numeric(5,2) default 0,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.user_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id uuid references public.leagues(id),
  submitted_at timestamptz,
  is_locked boolean default false,
  bet_json jsonb not null default '{}'::jsonb,
  score numeric(10,2) default 0,
  unique (user_id, league_id)
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  poll_date timestamptz not null,
  poll_type text not null default 'poll',
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.election_results (
  id uuid primary key default gen_random_uuid(),
  final_result boolean default false,
  status text not null default 'preliminary',
  official_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create index if not exists idx_poll_date on public.polls(poll_date);
create index if not exists idx_league_members_league on public.league_members(league_id);
create index if not exists idx_user_bets_league on public.user_bets(league_id);

insert into public.parties (name, leader, is_threshold_risk, poll_average, sort_order)
values
  ('ישר!', 'גדי איזנקוט', false, 7.4, 1),
  ('הליכוד', 'בנימין נתניהו', false, 34.1, 2),
  ('ביחד', 'נפתלי בנט', false, 11.8, 3),
  ('ישראל ביתנו', 'אביגדור ליברמן', false, 10.3, 4),
  ('הדמוקרטים', 'יאיר גולן', false, 6.1, 5),
  ('הרשימה המשותפת / חד"ש-תע"ל', 'יוסף ג׳בארין', false, 5.9, 6),
  ('יהדות התורה', 'יעקב אשר', false, 8.2, 7),
  ('ש"ס', 'אריה דרעי', false, 10.1, 8),
  ('עוצמה יהודית', 'איתמר בן גביר', false, 8.9, 9),
  ('הציונות הדתית', 'בצלאל סמוטריץ׳ ומשה פייגלין', false, 7.6, 10),
  ('רע"ם', 'מנסור עבאס ויואב סגלוביץ׳', false, 5.2, 11),
  ('המילואימניקים', 'יועז הנדל וירון זליכה', false, 3.6, 12),
  ('עמך ישראל', 'עופר וינטר', true, 2.4, 13),
  ('הציבור החרדי', 'מוטי לייטנר', true, 1.8, 14),
  ('כחול לבן', 'בני גנץ', true, 1.2, 15)
on conflict do nothing;

-- Helper view for leaderboard
create or replace view public.leaderboard_snapshot as
select
  ub.user_id,
  p.nickname,
  ub.score,
  ub.submitted_at,
  ub.is_locked,
  ub.bet_json
from public.user_bets ub
left join public.profiles p on p.id = ub.user_id;
