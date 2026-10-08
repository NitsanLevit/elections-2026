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

## Deployment

- Frontend: Vercel
- Database/Auth: Supabase
- Scraping: GitHub Actions + scheduled cron job

## Database schema

See `supabase/schema.sql` for tables and seed data.

## Scraper

See `.github/workflows/election-scraper.yml` and `scripts/scraper.mjs`.

## Notes

This project is fully scaffolded and works with mock data by default. To connect to Supabase, add your project URL and anon key in `.env.local` and run the SQL in the Supabase dashboard.
# elections-2026
