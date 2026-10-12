import { createClient } from '@supabase/supabase-js';
import { fetchRecentPolls } from './poll-source.mjs';

async function persistPolls(polls) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to write polls');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const records = polls.map((poll) => ({
    source: poll.source,
    poll_date: `${poll.date}T12:00:00.000Z`,
    poll_type: 'poll',
    source_key: poll.sourceKey,
    raw_data: { ...poll.rawData, fetchedAt: new Date().toISOString() },
  }));

  const { error } = await supabase.from('polls').upsert(records, { onConflict: 'source_key' });
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
}

async function main() {
  const polls = await fetchRecentPolls();
  const dryRun = process.argv.includes('--dry-run');
  const preview = polls.slice(0, 10).map(({ source, date, rawData }) => ({
    source,
    date,
    pollingFirm: rawData.pollingFirm,
    sampleSize: rawData.sampleSize,
    sourceUrl: rawData.sourceUrl,
    parties: rawData.parties,
  }));

  console.log(JSON.stringify({ count: polls.length, preview }, null, 2));
  if (dryRun) {
    console.log('Dry run only. No database writes were made.');
    return;
  }

  await persistPolls(polls);
  console.log(`Stored ${polls.length} recent polls.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
