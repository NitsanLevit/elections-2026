// Election-day RESULT scraper — robust, name-anchored, self-validating.
//
// Goal: run unattended on election night. Instead of trusting a fixed table
// layout (brittle), it finds OUR party names in any table and picks the column
// whose values sum to ~120 seats (layout-independent). It tries several sources
// and only returns data that passes validation, so a changed page degrades to
// "no results yet" (the caller then keeps the last good capture) rather than
// writing garbage. There is nothing to fix by hand on the night.

import * as cheerio from 'cheerio';

const TOTAL_SEATS = 120;
const MIN_PARTIES = 7; // a valid Knesset table has well over this
const SEAT_SUM_TOLERANCE = 3; // seats always sum to 120; allow tiny slack

// Canonical Hebrew party names (must match lib/election-preview.ts / the bet),
// each with alias fragments (normalized) we may see in Hebrew or English tables.
const PARTIES = [
  { name: 'הליכוד', aliases: ['הליכוד', 'likud'] },
  { name: 'ישר!', aliases: ['ישר', 'yashar'] },
  { name: 'ביחד', aliases: ['ביחד', 'together'] },
  { name: 'ישראל ביתנו', aliases: ['ישראלביתנו', 'yisraelbeiteinu', 'yisraelbeytenu'] },
  { name: 'הדמוקרטים', aliases: ['הדמוקרטים', 'thedemocrats', 'democrats', 'dems'] },
  { name: 'הרשימה המשותפת', aliases: ['הרשימההמשותפת', 'חדשתעל', 'jointlist', 'hadashtaal'] },
  { name: 'יהדות התורה', aliases: ['יהדותהתורה', 'utj', 'unitedtorahjudaism'] },
  { name: 'ש"ס', aliases: ['שס', 'shas'] },
  { name: 'עוצמה יהודית', aliases: ['עוצמהיהודית', 'otzmayehudit', 'otzma'] },
  { name: 'הציונות הדתית וזהות', aliases: ['הציונותהדתיתוזהות', 'הציונותהדתית', 'religiouszionist', 'rzp'] },
  { name: 'רע"ם', aliases: ['רעם', 'raam', 'unitedarablist'] },
  { name: 'המילואימניקים והכלכלה החדשה', aliases: ['המילואימניקים', 'reservists', 'reservnep'] },
  { name: 'עמך ישראל', aliases: ['עמךישראל', 'amchayisrael'] },
  { name: 'הציבור החרדי', aliases: ['הציבורהחרדי', 'haredipublic'] },
  { name: 'כחול לבן', aliases: ['כחוללבן', 'blueandwhite', 'bluewhite'] },
];

const SOURCES = [
  { apiBase: 'https://he.wikipedia.org/w/api.php', page: 'הבחירות_לכנסת_ה-26' },
  { apiBase: 'https://en.wikipedia.org/w/api.php', page: '2026_Israeli_legislative_election' },
];

function normalizeText(value) {
  return value.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
}

// Strip quotes/geresh/punctuation/spaces and lowercase, for fuzzy name matching.
function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s"'`’״׳!().,\-–—/]/g, '');
}

// Which canonical party (if any) a row label refers to — longest alias wins.
function matchParty(label) {
  const key = normalizeKey(label);
  if (!key) return null;
  let best = null;
  let bestLen = 0;
  for (const party of PARTIES) {
    for (const alias of party.aliases) {
      if (alias.length > bestLen && (key.includes(alias) || alias.includes(key))) {
        best = party.name;
        bestLen = alias.length;
      }
    }
  }
  return best;
}

function parseSeatCell(text) {
  const value = normalizeText(text).replace(/,/g, '');
  if (!/^\d+$/.test(value)) return null; // integers only (no %, no +/- deltas, no vote counts with commas handled above)
  const n = Number(value);
  return n >= 0 && n <= TOTAL_SEATS ? n : null;
}

function detectType($, table) {
  const caption = normalizeKey(table.find('caption').first().text());
  let heading = '';
  const prev = table.prevAll('h2, h3, h4').first();
  if (prev.length) heading = normalizeKey(prev.text());
  const context = `${caption} ${heading}`;
  return /מדגם|exitpoll|sample|אומדן/.test(context) ? 'sample' : 'official';
}

// Try to extract {party: seats} from one table by anchoring on party names.
// The seats column is the only one that yields CLEAN small integers across party
// rows: vote counts are too large (→ null), percentages carry a decimal (→ null),
// and the +/- change column carries a sign (→ null). So the right column is the
// one with the most valid seat values; ties break toward a sum near 120.
function parseTable($, table) {
  const matchedRows = [];
  table.find('tr').each((_, row) => {
    const cells = $(row).find('th, td').toArray().map((cell) => $(cell));
    if (cells.length < 2) return;
    const party = matchParty(cells[0].text()) ?? matchParty(cells[1].text());
    if (!party) return;
    const values = cells.map((cell) => parseSeatCell(cell.text()));
    matchedRows.push({ party, values });
  });

  if (matchedRows.length < MIN_PARTIES) return null;

  const maxCols = Math.max(...matchedRows.map((row) => row.values.length));
  let bestCol = -1;
  let bestCount = 0;
  let bestScore = Infinity;
  for (let col = 1; col < maxCols; col += 1) {
    let sum = 0;
    let count = 0;
    for (const row of matchedRows) {
      const value = row.values[col];
      if (value !== null && value !== undefined && value <= 60) {
        sum += value;
        count += 1;
      }
    }
    const score = Math.abs(sum - TOTAL_SEATS);
    if (count > bestCount || (count === bestCount && score < bestScore)) {
      bestCount = count;
      bestScore = score;
      bestCol = col;
    }
  }

  if (bestCol < 0 || bestCount < MIN_PARTIES) return null;

  const parties = {};
  const seen = new Set();
  for (const row of matchedRows) {
    if (seen.has(row.party)) continue; // first occurrence wins
    const value = row.values[bestCol];
    if (value === null || value === undefined || value > 60) continue;
    parties[row.party] = value;
    seen.add(row.party);
  }

  const total = Object.values(parties).reduce((acc, seats) => acc + seats, 0);
  // Guard against historical / outgoing-Knesset tables (e.g. the 2022 results,
  // which sum to ≠120 under our map and never contain Yashar, a 2026-only party).
  // Accept only a full 120-seat allocation OR a table that contains ישר! — a
  // strong signal it is really the 2026 ballot — within a sane seat range.
  const hasYashar = parties['ישר!'] !== undefined;
  const sane = total >= TOTAL_SEATS - 20 && total <= TOTAL_SEATS + SEAT_SUM_TOLERANCE;
  if (Object.keys(parties).length < MIN_PARTIES || !sane) return null;
  if (total !== TOTAL_SEATS && !hasYashar) return null;

  return { type: detectType($, table), parties, totalSeats: total };
}

async function fetchFromSource(source) {
  const apiUrl = new URL(source.apiBase);
  apiUrl.search = new URLSearchParams({ action: 'parse', page: source.page, prop: 'text', format: 'json' });

  const response = await fetch(apiUrl, {
    headers: { 'User-Agent': 'Elections2026ResultTracker/1.0 (result ingestion)' },
  });
  if (!response.ok) return [];

  const payload = await response.json();
  const html = payload?.parse?.text?.['*'];
  if (typeof html !== 'string') return [];

  const $ = cheerio.load(html);
  const found = [];
  $('table.wikitable, table.toccolours').each((_, element) => {
    const parsed = parseTable($, $(element));
    if (parsed) found.push({ ...parsed, source: `${source.apiBase} · ${source.page}` });
  });
  return found;
}

/**
 * Latest validated election result across all sources, or throws if none yet.
 * Prefers official (counted) results over exit-poll samples.
 * @returns {Promise<{type:'sample'|'official', parties:Record<string,number>, totalSeats:number, source:string, fetchedAt:string}>}
 */
export async function fetchElectionResults() {
  const candidates = [];
  for (const source of SOURCES) {
    try {
      candidates.push(...(await fetchFromSource(source)));
    } catch {
      // A failed/changed source must not abort the others.
    }
  }

  if (candidates.length === 0) {
    throw new Error('No validated results/exit-poll table found yet (the vote may not have happened).');
  }

  const chosen = candidates.find((entry) => entry.type === 'official') ?? candidates[0];
  return { ...chosen, fetchedAt: new Date().toISOString() };
}
