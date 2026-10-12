# CLAUDE.md — AI assistant guide for `elections-2026`

> Context file for Claude Code / Cursor / any AI assistant working on this repo.
> Read this first. It explains what the app is, how data flows, and the known
> traps (especially around poll data) so you don't reintroduce bugs.

הערה בעברית: זהו מסמך הקשר ל-AI. הממשק של האפליקציה בעברית ו-RTL, אבל המסמך הזה
כתוב באנגלית כדי שכל כלי AI יפרש אותו נכון. סעיף "Known issues" בסוף מסביר למה
מפלגות כמו **ישר!** הופיעו בעבר כ"לא פורסם" — זה היה באג של נתוני mock, לא בעיה אמיתית בנתונים.

---

## 1. What this is

A Hebrew-first, mobile-first **election betting pool** for the 2026 Israeli
Knesset election. Users predict how many of the 120 seats each party wins,
inside private "leagues" (groups), before a lock date. After lock, bets are
revealed and scored against the real result.

- **Betting lock:** `2026-10-26T23:59:59+03:00`
- **Group reveal:** `2026-10-27T08:00:00+03:00`
- **Total seats:** 120

## 2. Stack

| Layer      | Tech |
|------------|------|
| Framework  | Next.js 14 (App Router), React 18, TypeScript |
| Styling    | Tailwind CSS (RTL, mobile-first, `max-w-md` phone frame) |
| Icons      | `lucide-react` |
| Backend    | Supabase (Postgres + Auth + RLS) |
| Scraping   | Node script + GitHub Actions cron |
| Hosting    | Vercel (frontend), Supabase (DB), GitHub Actions (scraper) |

Package manager: **npm**. Node 20.

## 3. Commands

```bash
npm install          # install deps
npm run dev          # dev server on http://localhost:3000
npm run build        # next build + copy standalone assets
npm start            # run the standalone server
npm run lint         # eslint (next lint)
npm run scrape -- --dry-run   # preview scraped polls WITHOUT writing to DB
npm run scrape                # scrape + upsert into Supabase (needs service-role key)
```

Always use `--dry-run` first when touching the scraper.

## 4. Directory map

```
app/
  layout.tsx              # root layout, RTL + PWA metadata
  page.tsx                # THE whole UI — tabs: bet / polls / group / admin
  globals.css
  api/polls/route.ts      # GET /api/polls — serves poll data (see §5)
components/
  account-league-panel.tsx  # auth + league join/create panel
lib/
  types.ts                # Party, PollParty, Poll, ScrapedPoll, LeaderboardEntry
  supabase.ts             # browser client (null if env vars missing)
  mock-data.ts            # mockParties + mockPolls  ⚠ see Known issues
scripts/
  poll-source.mjs         # REAL scraper: parses English Wikipedia polling table
  poll-source.d.mts       # type decl so the route can import the .mjs
  scraper.mjs             # CLI wrapper: fetch -> upsert into Supabase
  copy-standalone-assets.mjs
supabase/
  schema.sql              # full schema: tables, RLS, functions, seed data
.github/workflows/
  election-scraper.yml    # daily cron (05:00 UTC) + manual dispatch
```

## 5. Poll data flow (IMPORTANT — read before touching polls)

Poll data is **real and live**, sourced from the English Wikipedia article
*"Opinion polling for the 2026 Israeli legislative election"* (section 5, the
current seat-projection table). It is **not** mock/fictitious in the current code.

```
Wikipedia table
      │  (scripts/poll-source.mjs → fetchRecentPolls())
      │  parses last 45 days of cited poll rows, maps EN party labels → Hebrew
      ▼
  ┌───────────────────────────── two consumers ─────────────────────────────┐
  │                                                                          │
GitHub Actions (daily)                         app/api/polls/route.ts (GET)
  scripts/scraper.mjs                             1. if Supabase has rows in
  → upsert into Supabase `polls`                     the last 45 days → use them
     (onConflict: source_key)                        (sourceMode: 'stored')
                                                   2. else → call fetchRecentPolls()
                                                      live, cached 12h
                                                      (sourceMode: 'live')
      │
      ▼
 app/page.tsx  fetch('/api/polls') → { polls, aggregate, sourceMode }
```

Key facts:
- `fetchRecentPolls()` returns only poll rows that are **dated 2026**, **within
  45 days**, and have a **citation URL** to the original publisher.
- Party column labels are mapped EN→HE via the `partyNames` map in
  `poll-source.mjs`. An **unmapped** label falls through as its raw English text.
- A party cell that is empty / non-numeric parses to `seats: null`, which the UI
  renders as **"לא פורסם"** (not published). This is correct — it means that
  specific poll didn't include that party.
- `aggregate` in the API = mean seats per party across all returned polls,
  ignoring `null`s.

### How to verify poll data is real (do this when in doubt)
```bash
npm run scrape -- --dry-run      # prints live-parsed polls as JSON
```
As of 2026-10-12 this returns ~46 polls (2026-09-06 → 2026-10-08) and **ישר!**
appears in all of them (live average ≈ 22 seats, 2nd only to הליכוד ≈ 23).

## 6. Supabase

- Apply `supabase/schema.sql` in the Supabase SQL editor.
- Tables: `profiles`, `leagues`, `league_members`, `parties`, `user_bets`,
  `polls`, `election_results`.
- **RLS is on everywhere.** Bets are insert/update only before the lock
  timestamp, and only readable by their owner — or by league members **after**
  the reveal timestamp. These timestamps are hardcoded in the SQL policies, so
  changing the lock date means editing BOTH the SQL and the frontend.
- League create/join go through SECURITY DEFINER functions
  (`create_league`, `join_league_by_code`).
- The `polls` table may be **empty** — that's fine, the API falls back to live.

## 7. Environment variables

`.env.local` (and Vercel / GitHub secrets):

| Var | Where | Purpose |
|-----|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | client | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | public anon key |
| `SUPABASE_URL` | scraper / CI | same URL, server-side name |
| `SUPABASE_SERVICE_ROLE_KEY` | scraper / CI **only** | write access — never expose client-side |
| `NEXT_PUBLIC_APP_NAME` | client | app title |
| `NEXT_PUBLIC_LOCK_DATETIME` | client | ⚠ currently **not read** by the code (lock date is hardcoded in `page.tsx`) |
| `NEXT_PUBLIC_USE_MOCKS` | — | ⚠ **dead flag** — not referenced anywhere in current code |

The service-role key must stay server-side (GitHub Actions secret / Vercel
server env), never in a `NEXT_PUBLIC_*` var.

## 8. Conventions

- **Hebrew + RTL.** All user-facing copy is Hebrew. Party names are the canonical
  key across the app — keep spelling identical everywhere (`page.tsx` bet state,
  `mock-data.ts`, `schema.sql` seed, and the `partyNames` map in the scraper).
- Mobile frame: everything lives inside `mx-auto max-w-md`.
- `app/page.tsx` is a single large client component with 4 tabs
  (`bet`, `polls`, `group`, `admin`). The `group` tab only shows after reveal.
- Dates in the UI are `dd.mm.yyyy`; the API converts ISO → that format.

## 9. Known issues / gotchas (fix carefully, don't regress)

1. **"ישר!" (and other parties) showed as "לא פורסם" in older runs.**
   Root cause: the **committed** `scripts/scraper.mjs` (HEAD) and
   `lib/mock-data.ts` `mockPolls` contained **hardcoded sample polls listing only
   4 parties** (הליכוד / ש"ס / ביחד / ישראל ביתנו) — ישר! was absent, so it
   rendered as "לא פורסם". The current working tree replaces this with the real
   live Wikipedia scraper (`poll-source.mjs`), where ישר! is present everywhere.
   → If polls ever look wrong again, check you're on the live path, not mock data.

2. **[FIXED] Bet tab now uses live averages.** `PartyCard` prefers the live
   `pollAggregate[party.name]` and falls back to the static `pollAverage` only
   when live data is missing. `mockParties` (and the `schema.sql` seed) were
   realigned to the scraper's canonical party names and refreshed to live
   values. ⚠ **Invariant to preserve:** party `name` strings must stay identical
   across `page.tsx` bet state, `lib/mock-data.ts`, `supabase/schema.sql`, and
   the `partyNames` map in `scripts/poll-source.mjs` — otherwise live averages
   won't line up with the cards.

3. **[FIXED] `NEXT_PUBLIC_LOCK_DATETIME` is now wired in.** `page.tsx`
   `resolveLockDate()` reads the env var and falls back to
   `2026-10-26T23:59:59+03:00` if it's missing or an invalid date. Changing the
   lock date still requires editing the RLS policy timestamps in `schema.sql`
   too (they are hardcoded there).

4. **[FIXED] `NEXT_PUBLIC_USE_MOCKS` removed** from `.env.local` / `.env.example`
   (it was never read by any code).

5. **Scraper is Wikipedia-structure-dependent.** `isCurrentPollTable()` matches
   on a fixed set of column headers. If Wikipedia renames columns or adds/removes
   a party, parsing can silently drop rows or mislabel a party. The scraper
   throws if it can't find the table or any valid row — treat a thrown scrape as
   "Wikipedia changed", and update `partyNames` / header checks.

## 10. Good first tasks for an AI assistant here

- Wire up actual bet saving (the "שמור / שלח הימור" button → `user_bets`).
- Add a test / assertion that every party name in `mock-data.ts`, `schema.sql`,
  and the bet state matches a scraper output name (guards invariant in #2).
- Implement the admin "update results" form (`election_results`) + scoring.
- Populate the `group` tab from `user_bets` after the reveal timestamp.
```

> When you change poll logic, always run `npm run scrape -- --dry-run` and
> confirm the leading parties (הליכוד, ישר!, ביחד) appear with sane seat counts.
