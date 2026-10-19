// Election-day RESULT scraper (scaffold).
//
// ⚠️ VERIFY ON ELECTION NIGHT (2026-10-27). The real results / exit-poll tables
// do not exist until the vote, so the selectors below are a best-effort guess at
// the standard Wikipedia election-results table layout. When live data appears,
// run `npm run scrape:results -- --dry-run`, compare to the page, and adjust the
// header/column heuristics in `parseResultsTable` + the `partyNames` map.
//
// It reads the English Wikipedia article for the election and returns seats per
// party, tagged as a "sample" (exit poll) or "official" (counted) result. News
// sites publish exit polls at 22:00; Wikipedia fills the results table as votes
// are counted. The manual admin entry is the reliable fallback.

import * as cheerio from 'cheerio';

const WIKIPEDIA_PAGE = '2026_Israeli_legislative_election';
const WIKIPEDIA_URL = `https://en.wikipedia.org/wiki/${WIKIPEDIA_PAGE}`;
const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';

// EN → HE party names. Keep in sync with scripts/poll-source.mjs `partyNames`.
// Results tables use fuller names than the polling table, so both forms are here;
// unknown labels fall through as their raw text (and should be added on the night).
const partyNames = new Map([
  ['Likud', 'הליכוד'],
  ['Together', 'ביחד'],
  ['RZP-Zehut', 'הציונות הדתית וזהות'],
  ['Religious Zionist Party', 'הציונות הדתית וזהות'],
  ['Otzma', 'עוצמה יהודית'],
  ['Otzma Yehudit', 'עוצמה יהודית'],
  ['Blue & White', 'כחול לבן'],
  ['Blue and White', 'כחול לבן'],
  ['Shas', 'ש"ס'],
  ['UTJ', 'יהדות התורה'],
  ['United Torah Judaism', 'יהדות התורה'],
  ['Yisrael Beiteinu', 'ישראל ביתנו'],
  ["Ra'am", 'רע"ם'],
  ['Ra’am', 'רע"ם'],
  ['United Arab List', 'רע"ם'],
  ['Joint List', 'הרשימה המשותפת'],
  ['Hadash-Taal', 'הרשימה המשותפת'],
  ['Dems', 'הדמוקרטים'],
  ['The Democrats', 'הדמוקרטים'],
  ['Yashar', 'ישר!'],
  ['Reserv.-NEP', 'המילואימניקים והכלכלה החדשה'],
  ['Amcha Yisrael', 'עמך ישראל'],
  ['Haredi Public', 'הציבור החרדי'],
]);

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function parseSeats(value) {
  const normalized = normalizeText(value).replace(/,/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return parsed >= 0 && parsed <= 120 ? parsed : null;
}

async function fetchPageHtml() {
  const apiUrl = new URL(WIKIPEDIA_API_URL);
  apiUrl.search = new URLSearchParams({
    action: 'parse',
    page: WIKIPEDIA_PAGE,
    prop: 'text',
    format: 'json',
  });

  const response = await fetch(apiUrl, {
    headers: { 'User-Agent': 'Elections2026ResultTracker/1.0 (result ingestion)' },
  });
  if (!response.ok) throw new Error(`Wikipedia API returned HTTP ${response.status}`);

  const payload = await response.json();
  const html = payload?.parse?.text?.['*'];
  if (typeof html !== 'string') throw new Error('Wikipedia API response did not include parsed page HTML');
  return html;
}

// Heuristic: a results/exit-poll table has a header cell for seats and a party column.
function classifyTable($, table) {
  const headerText = normalizeText(table.find('tr').first().text()).toLowerCase();
  const caption = normalizeText(table.find('caption').first().text()).toLowerCase();
  const context = `${caption} ${headerText}`;
  const hasSeats = /seats|mandates/.test(headerText);
  const hasParty = /party|list|alliance/.test(headerText);
  if (!hasSeats || !hasParty) return null;
  const isSample = /exit poll|sample|מדגם/.test(context);
  return isSample ? 'sample' : 'official';
}

function seatsColumnIndex($, table) {
  const headers = table.find('tr').first().find('th, td').toArray().map((el) => normalizeText($(el).text()).toLowerCase());
  // Prefer an exact "seats"/"mandates" header; fall back to the last numeric-ish column.
  const index = headers.findIndex((label) => /^seats$|^mandates$|seats|mandates/.test(label));
  return index;
}

function parseResultsTable($, table) {
  const seatsIndex = seatsColumnIndex($, table);
  if (seatsIndex < 0) return {};

  const parties = {};
  table.find('tr').slice(1).each((_, row) => {
    const cells = $(row).find('th, td').toArray();
    if (cells.length <= seatsIndex) return;

    const partyLabel = normalizeText($(cells[0]).text().replace(/\[[^\]]+\]/g, ''));
    if (!partyLabel) return;

    const seats = parseSeats($(cells[seatsIndex]).text());
    if (seats === null) return;

    const name = partyNames.get(partyLabel) ?? partyLabel;
    if (/total|others|turnout|invalid|valid votes/i.test(partyLabel)) return;
    parties[name] = seats;
  });

  return parties;
}

/**
 * Returns the latest election result found on the page, or throws if none yet.
 * @returns {Promise<{type: 'sample'|'official', parties: Record<string, number>, totalSeats: number, source: string, fetchedAt: string}>}
 */
export async function fetchElectionResults() {
  const html = await fetchPageHtml();
  const $ = cheerio.load(html);

  const candidates = $('table.wikitable')
    .toArray()
    .map((el) => $(el))
    .map((table) => ({ table, type: classifyTable($, table) }))
    .filter((entry) => entry.type !== null);

  if (candidates.length === 0) {
    throw new Error('No results/exit-poll table found yet (the vote may not have happened).');
  }

  // Prefer official results over samples when both are present.
  const chosen = candidates.find((entry) => entry.type === 'official') ?? candidates[0];
  const parties = parseResultsTable($, chosen.table);
  const totalSeats = Object.values(parties).reduce((sum, seats) => sum + seats, 0);

  if (totalSeats === 0) {
    throw new Error('A results table was found but no seats could be parsed — verify the layout.');
  }

  return {
    type: chosen.type,
    parties,
    totalSeats,
    source: WIKIPEDIA_URL,
    fetchedAt: new Date().toISOString(),
  };
}
