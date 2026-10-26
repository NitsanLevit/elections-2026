// Admin data export: dumps everything saved in the app (leagues, members, and
// bets) into one Excel file. Runs with the service-role key, so it bypasses RLS
// and works even before the reveal date — this is an owner/admin tool, never
// shipped to the browser.
//
// Usage:
//   node scripts/export-data.mjs                 # all leagues
//   node scripts/export-data.mjs "משפחת שטרק"    # one league (name contains / invite code / id)
//   node scripts/export-data.mjs --out C:\path\export.xlsx
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment or .env.local.

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import xlsxPkg from 'xlsx';

// In Node's ESM, this CJS module's API lives on the default export.
const XLSX = xlsxPkg?.utils ? xlsxPkg : xlsxPkg.default;

// Canonical party order (matches the app / lib/election-preview.ts).
const PARTY_ORDER = [
  'ישר!', 'הליכוד', 'ביחד', 'ישראל ביתנו', 'הדמוקרטים', 'הרשימה המשותפת', 'יהדות התורה',
  'ש"ס', 'עוצמה יהודית', 'הציונות הדתית וזהות', 'רע"ם', 'המילואימניקים והכלכלה החדשה',
  'עמך ישראל', 'הציבור החרדי', 'כחול לבן',
];

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].trim();
    }
  } catch {
    /* no .env.local — rely on process.env */
  }
  return env;
}

function parseArgs(argv) {
  let out = null;
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      out = argv[i + 1];
      i += 1;
    } else {
      rest.push(argv[i]);
    }
  }
  return { filter: rest.join(' ').trim(), out };
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function fmt(value) {
  return value ? new Date(value).toLocaleString('he-IL') : '';
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or put them in .env.local)');

  const { filter, out } = parseArgs(process.argv.slice(2));
  const supabase = createClient(url, key);

  // Pull everything (service role → no RLS).
  const [{ data: leaguesRaw }, { data: membersRaw }, { data: profilesRaw }, { data: betsRaw }, usersList] = await Promise.all([
    supabase.from('leagues').select('id, name, invite_code, created_at'),
    supabase.from('league_members').select('league_id, user_id, joined_at'),
    supabase.from('profiles').select('id, nickname'),
    supabase.from('user_bets').select('league_id, user_id, bet_json, submitted_at, is_locked'),
    supabase.auth.admin.listUsers().catch(() => ({ data: { users: [] } })),
  ]);

  const nickById = new Map((profilesRaw ?? []).map((p) => [p.id, p.nickname]));
  const emailById = new Map((usersList?.data?.users ?? []).map((u) => [u.id, u.email]));
  const who = (userId) => nickById.get(userId) || emailById.get(userId) || userId;

  let leagues = leaguesRaw ?? [];
  if (filter) {
    const needle = filter.toLowerCase();
    leagues = leagues.filter(
      (l) => l.id === filter || (l.invite_code || '').toLowerCase() === needle || (l.name || '').toLowerCase().includes(needle),
    );
    if (leagues.length === 0) throw new Error(`No league matched "${filter}"`);
  }
  const leagueIds = new Set(leagues.map((l) => l.id));
  const members = (membersRaw ?? []).filter((m) => leagueIds.has(m.league_id));
  const bets = (betsRaw ?? []).filter((b) => leagueIds.has(b.league_id));
  const nameById = new Map(leagues.map((l) => [l.id, l.name]));
  const betKey = (b) => `${b.league_id}:${b.user_id}`;
  const betByKey = new Map(bets.map((b) => [betKey(b), b]));

  // Sheet 1 — leagues summary
  const leaguesSheet = [
    ['קבוצה', 'קוד הזמנה', 'נוצרה', 'מספר חברים', 'מספר הצבעות'],
    ...leagues.map((l) => [
      l.name,
      l.invite_code,
      fmt(l.created_at),
      members.filter((m) => m.league_id === l.id).length,
      bets.filter((b) => b.league_id === l.id).length,
    ]),
  ];

  // Sheet 2 — members (who's in each league + whether they voted)
  const membersSheet = [
    ['קבוצה', 'שם', 'אימייל', 'הצטרף/ה', 'מילא/ה הצבעה', 'נשלח בתאריך'],
    ...members
      .map((m) => {
        const bet = betByKey.get(`${m.league_id}:${m.user_id}`);
        const submitted = Boolean(bet?.submitted_at);
        return [
          nameById.get(m.league_id),
          nickById.get(m.user_id) || '',
          emailById.get(m.user_id) || '',
          fmt(m.joined_at),
          submitted ? 'כן' : 'לא',
          fmt(bet?.submitted_at),
        ];
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1]))),
  ];

  // Sheet 3 — bets (one row per voter, a column per party)
  const betRows = bets.map((b) => {
    const seats = b.bet_json || {};
    const extraParties = Object.keys(seats).filter((p) => !PARTY_ORDER.includes(p));
    return { b, seats, extraParties };
  });
  const extraCols = Array.from(new Set(betRows.flatMap((r) => r.extraParties)));
  const partyCols = [...PARTY_ORDER, ...extraCols];
  const betsSheet = [
    ['קבוצה', 'שם', ...partyCols, 'סה"כ', 'נשלח בתאריך'],
    ...betRows
      .map(({ b, seats }) => [
        nameById.get(b.league_id),
        who(b.user_id),
        ...partyCols.map((p) => (typeof seats[p] === 'number' ? seats[p] : 0)),
        Object.values(seats).reduce((s, n) => s + (Number(n) || 0), 0),
        fmt(b.submitted_at),
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1]))),
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(leaguesSheet), 'קבוצות');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(membersSheet), 'משתתפים');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(betsSheet), 'הצבעות');

  const fileName = out || path.resolve(process.cwd(), `data-export_${stamp()}.xlsx`);
  XLSX.writeFile(workbook, fileName);
  console.log(`Exported ${leagues.length} league(s), ${members.length} member(s), ${bets.length} bet(s)`);
  console.log(`→ ${fileName}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
