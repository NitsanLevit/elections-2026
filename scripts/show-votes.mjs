// Print the votes/bets saved in the app, grouped by league, to the terminal.
// Admin tool (service-role key → bypasses RLS, works before the reveal).
//
// Usage:
//   npm run votes                 # all leagues
//   npm run votes -- "שטרק"       # one league (name contains / invite code / id)

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim();
    }
  } catch {
    /* rely on process.env */
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or put them in .env.local)');

  const filter = process.argv.slice(2).join(' ').trim().toLowerCase();
  const supabase = createClient(url, key);

  const [{ data: leaguesRaw }, { data: members }, { data: profiles }, { data: bets }] = await Promise.all([
    supabase.from('leagues').select('id, name, invite_code'),
    supabase.from('league_members').select('league_id, user_id'),
    supabase.from('profiles').select('id, nickname'),
    supabase.from('user_bets').select('league_id, user_id, bet_json, submitted_at'),
  ]);

  const nick = new Map((profiles ?? []).map((p) => [p.id, p.nickname]));
  const betOf = new Map((bets ?? []).map((b) => [`${b.league_id}:${b.user_id}`, b]));

  let leagues = leaguesRaw ?? [];
  if (filter) {
    leagues = leagues.filter(
      (l) => l.id === filter || (l.invite_code || '').toLowerCase() === filter || (l.name || '').toLowerCase().includes(filter),
    );
    if (leagues.length === 0) {
      console.log(`No league matched "${filter}"`);
      return;
    }
  }

  for (const l of leagues) {
    const mem = (members ?? []).filter((m) => m.league_id === l.id);
    const voted = mem.filter((m) => betOf.get(`${l.id}:${m.user_id}`)?.submitted_at).length;
    console.log('\n============================================');
    console.log(`קבוצה: ${l.name}  (קוד ${l.invite_code})  —  ${voted}/${mem.length} הצביעו`);
    console.log('============================================');
    for (const m of mem) {
      const name = nick.get(m.user_id) || m.user_id.slice(0, 8);
      const b = betOf.get(`${l.id}:${m.user_id}`);
      if (!b || !b.submitted_at) {
        console.log(`  • ${name} — טרם הצביע/ה`);
        continue;
      }
      const seats = Object.entries(b.bet_json || {})
        .filter(([, n]) => n > 0)
        .sort((a, b2) => b2[1] - a[1]);
      console.log(`  • ${name}  (${new Date(b.submitted_at).toLocaleString('he-IL')}):`);
      console.log(`      ${seats.map(([p, n]) => `${p} ${n}`).join(' · ')}`);
    }
  }
  console.log('');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
