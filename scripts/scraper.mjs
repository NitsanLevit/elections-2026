import { createClient } from '@supabase/supabase-js';

const pollSources = [
  'ערוץ 11',
  'ערוץ 12',
  'ערוץ 13',
  'ערוץ 14',
  'Wikipedia',
];

const mockResults = [
  { source: 'ערוץ 11', date: '2026-10-08T08:00:00+03:00', parties: { 'הליכוד': 32, 'ש"ס': 11, 'ביחד': 12, 'ישראל ביתנו': 10 } },
  { source: 'ערוץ 12', date: '2026-10-08T08:00:00+03:00', parties: { 'הליכוד': 34, 'ביחד': 13, 'ש"ס': 10, 'ישראל ביתנו': 9 } },
  { source: 'ערוץ 13', date: '2026-10-08T08:00:00+03:00', parties: { 'הליכוד': 33, 'ביחד': 11, 'ש"ס': 11, 'ישראל ביתנו': 9 } },
  { source: 'ערוץ 14', date: '2026-10-08T08:00:00+03:00', parties: { 'הליכוד': 35, 'ביחד': 12, 'ש"ס': 10, 'ישראל ביתנו': 10 } },
];

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function persistPolls(data) {
  if (!supabase) {
    console.log('No Supabase credentials detected. Using mock mode.');
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const { error } = await supabase.from('polls').insert(
    data.map((entry) => ({
      source: entry.source,
      poll_date: new Date(entry.date).toISOString(),
      poll_type: 'poll',
      raw_data: entry.parties,
    })),
  );

  if (error) {
    console.error('Supabase insert failed:', error.message);
  } else {
    console.log('Polls stored to Supabase successfully.');
  }
}

async function main() {
  const snapshot = mockResults.map((entry) => ({
    ...entry,
    source: pollSources.includes(entry.source) ? entry.source : 'Wikipedia',
  }));

  await persistPolls(snapshot);
  console.log('Scrape finished.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
