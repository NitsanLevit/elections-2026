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
  source_key text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.polls add column if not exists source_key text;

create table if not exists public.election_results (
  id uuid primary key default gen_random_uuid(),
  final_result boolean default false,
  status text not null default 'preliminary',
  official_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Election-day capture metadata (each hourly snapshot is a new row; the app reads
-- the latest by updated_at). kind = 'sample' (exit poll) or 'official' (counted).
alter table public.election_results add column if not exists kind text;
alter table public.election_results add column if not exists source text;
create index if not exists idx_election_results_updated on public.election_results(updated_at desc);

create index if not exists idx_poll_date on public.polls(poll_date);
create unique index if not exists idx_polls_source_key on public.polls(source_key);
create index if not exists idx_league_members_league on public.league_members(league_id);
create index if not exists idx_user_bets_league on public.user_bets(league_id);

insert into public.parties (name, leader, is_threshold_risk, poll_average, sort_order)
values
  -- party names must match the scraper's canonical names (scripts/poll-source.mjs)
  ('ישר!', 'גדי איזנקוט', false, 22.3, 1),
  ('הליכוד', 'בנימין נתניהו', false, 22.7, 2),
  ('ביחד', 'נפתלי בנט', false, 11.5, 3),
  ('ישראל ביתנו', 'אביגדור ליברמן', false, 7.9, 4),
  ('הדמוקרטים', 'יאיר גולן', false, 9.2, 5),
  ('הרשימה המשותפת', 'יוסף ג׳בארין', false, 7.3, 6),
  ('יהדות התורה', 'יעקב אשר', false, 7.6, 7),
  ('ש"ס', 'אריה דרעי', false, 8.0, 8),
  ('עוצמה יהודית', 'איתמר בן גביר', false, 7.6, 9),
  ('הציונות הדתית וזהות', 'בצלאל סמוטריץ׳ ומשה פייגלין', false, 5.9, 10),
  ('רע"ם', 'מנסור עבאס ויואב סגלוביץ׳', false, 5.1, 11),
  ('המילואימניקים והכלכלה החדשה', 'יועז הנדל וירון זליכה', false, 4.1, 12),
  ('עמך ישראל', 'עופר וינטר', true, 4.3, 13),
  ('הציבור החרדי', 'מוטי לייטנר', true, 1.8, 14),
  ('כחול לבן', 'בני גנץ', true, 4.0, 15)
on conflict do nothing;

-- Helper view for leaderboard
create or replace view public.leaderboard_snapshot with (security_invoker = true) as
select
  ub.user_id,
  p.nickname,
  ub.score,
  ub.submitted_at,
  ub.is_locked,
  ub.bet_json
from public.user_bets ub
left join public.profiles p on p.id = ub.user_id;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'משתמש'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_league_member(target_league uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.league_members as membership
    where membership.league_id = target_league
      and membership.user_id = (select auth.uid())
  );
$$;

create or replace function public.create_league(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_league_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if length(btrim(coalesce(p_name, ''))) < 2 or length(btrim(p_name)) > 50 then
    raise exception 'League name must be between 2 and 50 characters';
  end if;

  insert into public.leagues (name, invite_code, created_by)
  values (
    btrim(p_name),
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    (select auth.uid())
  )
  returning id into new_league_id;

  insert into public.league_members (league_id, user_id)
  values (new_league_id, (select auth.uid()));

  return new_league_id;
end;
$$;

create or replace function public.join_league_by_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_league_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select league.id
    into target_league_id
    from public.leagues as league
    where upper(league.invite_code) = upper(btrim(coalesce(p_invite_code, '')))
    limit 1;

  if target_league_id is null then
    raise exception 'Invite code not found';
  end if;

  insert into public.league_members (league_id, user_id)
  values (target_league_id, (select auth.uid()))
  on conflict (league_id, user_id) do nothing;

  return target_league_id;
end;
$$;

-- Participants of a league the caller belongs to: nickname + whether they
-- submitted a bet. Intentionally does NOT expose bet content, so it is safe to
-- call before the reveal date. SECURITY DEFINER is needed to read co-members'
-- nicknames (profiles RLS is self-only) and submission status.
create or replace function public.league_participants(target_league uuid)
returns table (nickname text, has_submitted boolean, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(nullif(btrim(p.nickname), ''), 'משתמש') as nickname,
    exists (
      select 1
      from public.user_bets ub
      where ub.league_id = target_league
        and ub.user_id = lm.user_id
        and ub.submitted_at is not null
    ) as has_submitted,
    (lm.user_id = (select auth.uid())) as is_me
  from public.league_members lm
  left join public.profiles p on p.id = lm.user_id
  where lm.league_id = target_league
    and public.is_league_member(target_league)
  order by has_submitted desc, nickname;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_league_member(uuid) from public, anon;
revoke all on function public.create_league(text) from public, anon;
revoke all on function public.join_league_by_code(text) from public, anon;
revoke all on function public.league_participants(uuid) from public, anon;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.create_league(text) to authenticated;
grant execute on function public.join_league_by_code(text) to authenticated;
grant execute on function public.league_participants(uuid) to authenticated;

revoke all on public.profiles, public.leagues, public.league_members,
  public.parties, public.user_bets, public.polls, public.election_results
  from anon, authenticated;
revoke all on public.leaderboard_snapshot from anon, authenticated;

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.parties enable row level security;
alter table public.user_bets enable row level security;
alter table public.polls enable row level security;
alter table public.election_results enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists leagues_select_member on public.leagues;
create policy leagues_select_member on public.leagues
  for select to authenticated
  using (public.is_league_member(id));

drop policy if exists league_members_select_member on public.league_members;
create policy league_members_select_member on public.league_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_league_member(league_id));

drop policy if exists parties_public_read on public.parties;
create policy parties_public_read on public.parties
  for select to anon, authenticated
  using (true);

drop policy if exists polls_public_read on public.polls;
create policy polls_public_read on public.polls
  for select to anon, authenticated
  using (true);

drop policy if exists election_results_public_read on public.election_results;
create policy election_results_public_read on public.election_results
  for select to anon, authenticated
  using (true);

drop policy if exists user_bets_select_own_or_revealed on public.user_bets;
create policy user_bets_select_own_or_revealed on public.user_bets
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      league_id is not null
      and public.is_league_member(league_id)
      and statement_timestamp() >= '2026-10-27T08:00:00+03:00'::timestamptz
    )
  );

drop policy if exists user_bets_insert_own_before_lock on public.user_bets;
create policy user_bets_insert_own_before_lock on public.user_bets
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and league_id is not null
    and public.is_league_member(league_id)
    and statement_timestamp() < '2026-10-26T23:59:59+03:00'::timestamptz
  );

drop policy if exists user_bets_update_own_before_lock on public.user_bets;
create policy user_bets_update_own_before_lock on public.user_bets
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and league_id is not null
    and public.is_league_member(league_id)
    and statement_timestamp() < '2026-10-26T23:59:59+03:00'::timestamptz
  )
  with check (
    user_id = (select auth.uid())
    and league_id is not null
    and public.is_league_member(league_id)
    and statement_timestamp() < '2026-10-26T23:59:59+03:00'::timestamptz
  );

grant select, update (nickname, avatar_url) on public.profiles to authenticated;
grant select on public.leagues, public.league_members to authenticated;
grant select on public.parties, public.polls, public.election_results to anon, authenticated;
grant select on public.user_bets to authenticated;
grant insert (user_id, league_id, submitted_at, bet_json),
  update (submitted_at, bet_json) on public.user_bets to authenticated;
grant select on public.leaderboard_snapshot to authenticated;
