import * as cheerio from 'cheerio';

const WIKIPEDIA_PAGE = 'Opinion_polling_for_the_2026_Israeli_legislative_election';
const WIKIPEDIA_URL = `https://en.wikipedia.org/wiki/${WIKIPEDIA_PAGE}`;
const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';
const RECENT_DAYS = 45;

const outletNames = new Map([
  ['Channel 11', 'כאן 11'],
  ['Kan 11', 'כאן 11'],
  ['Channel 12', 'חדשות 12'],
  ['HaHadashot 12', 'חדשות 12'],
  ['Channel 13', 'ערוץ 13'],
  ['Channel 14', 'ערוץ 14'],
  ['i24 News', 'i24NEWS'],
  ['Maariv', 'מעריב'],
  ['Israel Hayom', 'ישראל היום'],
  ['Zman Yisrael', 'זמן ישראל'],
]);

const partyNames = new Map([
  ['Likud', 'הליכוד'],
  ['Together', 'ביחד'],
  ['RZP-Zehut', 'הציונות הדתית וזהות'],
  ['Otzma', 'עוצמה יהודית'],
  ['Blue & White', 'כחול לבן'],
  ['Shas', 'ש"ס'],
  ['UTJ', 'יהדות התורה'],
  ['Yisrael Beiteinu', 'ישראל ביתנו'],
  ["Ra'am", "רע\"ם"],
  ['Joint List', 'הרשימה המשותפת'],
  ['Dems', 'הדמוקרטים'],
  ['Yashar', 'ישר!'],
  ['Reserv.-NEP', 'המילואימניקים והכלכלה החדשה'],
  ['Amcha Yisrael', 'עמך ישראל'],
  ['Haredi Public', 'הציבור החרדי'],
]);

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function parseInteger(value, maximum) {
  const normalized = normalizeText(value).replace(/,/g, '');
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return parsed >= 0 && parsed <= maximum ? parsed : null;
}

function parseSeats(value) {
  return parseInteger(value, 120);
}

function getHeaders($, table) {
  const firstRow = table.find('tr').first();
  let column = 0;
  const headers = [];

  firstRow.find('th').each((_, element) => {
    const cell = $(element);
    const width = Number(cell.attr('colspan') || 1);
    const label = normalizeText(cell.text().replace(/\[[^\]]+\]/g, ''));
    headers.push({ start: column, end: column + width, label });
    column += width;
  });

  return headers;
}

function isCurrentPollTable(headers) {
  const labels = headers.map(({ label }) => label).join(' | ');
  return [
    'Fieldworkdate',
    'Polling firm',
    'Publisher',
    'Samplesize',
    'Likud',
    'Together',
    'RZP-Zehut',
    'Joint List',
    'Reserv.-NEP',
    'Amcha Yisrael',
    'Haredi Public',
    'Gov.',
  ].every((label) => labels.includes(label));
}

function findCitationUrl($, publisherCell) {
  const citationHref = publisherCell.find('sup.reference a[href^="#cite_note-"]').first().attr('href');
  if (!citationHref) return null;

  const citationId = citationHref.slice(1);
  const citation = $('li').filter((_, element) => $(element).attr('id') === citationId).first();
  const url = citation.find('.reference-text a.external').first().attr('href');
  return url ? new URL(url, WIKIPEDIA_URL).toString() : null;
}

function parsePollRow($, row, headers, cutoff) {
  const cells = $(row).children('td').toArray();
  if (cells.length < 6) return null;

  const dateCell = $(cells[0]);
  const pollDate = dateCell.attr('data-sort-value');
  if (!pollDate || !/^2026-\d{2}-\d{2}$/.test(pollDate) || new Date(`${pollDate}T00:00:00Z`) < cutoff) {
    return null;
  }

  const metadata = cells.slice(0, 4).map((element) => $(element));
  if (metadata.some((cell) => Number(cell.attr('colspan') || 1) !== 1)) return null;

  const pollingFirm = normalizeText(metadata[1].text());
  const publisherCell = metadata[2];
  const publisher = normalizeText(publisherCell.clone().find('sup').remove().end().text());
  if (!pollingFirm || !publisher) return null;

  const sourceUrl = findCitationUrl($, publisherCell);
  if (!sourceUrl) return null;

  let column = 4;
  const parties = [];

  for (const element of cells.slice(4)) {
    const cell = $(element);
    const width = Number(cell.attr('colspan') || 1);
    const overlappingHeaders = headers.filter(
      (header) => header.start >= column && header.start < column + width && header.start >= 4,
    );
    const labels = [...new Set(overlappingHeaders.map(({ label }) => label))];
    const label = labels.join(' / ');
    const partyName = partyNames.get(label) ?? label;

    if (partyName && partyName !== 'Others' && partyName !== 'Gov.') {
      parties.push({ name: partyName, seats: parseSeats(cell.text()) });
    }

    column += width;
  }

  if (parties.length === 0 || parties.every(({ seats }) => seats === null)) return null;

  const sampleSize = parseInteger(metadata[3].text(), 100000);
  const sourceName = outletNames.get(publisher) ?? publisher;
  const sourceKey = [pollDate, pollingFirm, publisher, sourceUrl].join('|');

  return {
    source: sourceName,
    date: pollDate,
    sourceKey,
    rawData: {
      pollingFirm,
      publisher,
      sourceUrl,
      wikipediaUrl: WIKIPEDIA_URL,
      fieldworkLabel: normalizeText(dateCell.text()),
      sampleSize,
      parties,
    },
  };
}

export async function fetchRecentPolls() {
  const apiUrl = new URL(WIKIPEDIA_API_URL);
  apiUrl.search = new URLSearchParams({
    action: 'parse',
    page: WIKIPEDIA_PAGE,
    prop: 'text',
    format: 'json',
    section: '5',
  });

  const response = await fetch(apiUrl, {
    headers: { 'User-Agent': 'Elections2026PollTracker/1.0 (poll ingestion)' },
  });
  if (!response.ok) throw new Error(`Wikipedia API returned HTTP ${response.status}`);

  const payload = await response.json();
  const html = payload?.parse?.text?.['*'];
  if (typeof html !== 'string') throw new Error('Wikipedia API response did not include parsed page HTML');

  const $ = cheerio.load(html);
  const table = $('table.wikitable').toArray().map((element) => $(element)).find((candidate) => {
    return isCurrentPollTable(getHeaders($, candidate));
  });
  if (!table) throw new Error('Could not find the current 2026 seat-projection table');

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RECENT_DAYS);
  const polls = [];

  table.find('tr').slice(1).each((_, row) => {
    const poll = parsePollRow($, row, getHeaders($, table), cutoff);
    if (poll) polls.push(poll);
  });

  if (polls.length === 0) throw new Error('No recent, cited poll rows could be parsed');
  return polls;
}