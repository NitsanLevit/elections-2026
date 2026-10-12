# הימורי בחירות 2026

A Hebrew-first, mobile-responsive election betting pool for the Israeli Knesset election. Built with Next.js, Tailwind CSS, and Supabase-ready data models.

## Features

- RTL Hebrew UI for mobile-first use
- Live countdown to the betting lock
- Party mandate budget tracking with 120-seat cap
- Blind betting before lock, reveal after lock
- Poll average aggregation and exit-poll comparison
- League / group leaderboard support
- PWA metadata and manifest
- GitHub Actions scraper workflow for scheduled poll ingestion

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Run the app:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000

## Poll data

Recent 2026 seat-projection polls are read from the English Wikipedia polling table, with each entry linking to the original publisher. The GitHub Actions workflow refreshes the stored snapshot daily at 05:00 UTC and can also be run manually. The scraper supports a no-write preview:

```bash
npm run scrape -- --dry-run
```

Apply `supabase/schema.sql` in the Supabase SQL editor. The website needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in its deployment environment. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as GitHub Actions repository secrets for scheduled writes; the service-role key must remain server-side.

## Deployment

- Frontend: Vercel
- Database/Auth: Supabase
- Scraping: GitHub Actions + scheduled cron job

## Database schema

See `supabase/schema.sql` for tables and seed data.

## Notes

The poll UI shows stored source records and does not mix mock polls into the feed. Wikipedia is a community-maintained aggregator, not an official polling authority; use the linked publisher article as the primary source.
# elections-2026
