import { createClient } from '@supabase/supabase-js';
import { fetchElectionResults } from './result-source.mjs';

async function persistResult(result) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to write results');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  // Insert a new row per capture so each hourly snapshot is kept; the app shows
  // the latest by updated_at, and an export can reflect any stage of the night.
  const { error } = await supabase.from('election_results').insert({
    final_result: result.type === 'official' && result.totalSeats === 120,
    status: result.type,
    kind: result.type,
    source: result.source,
    official_data: {
      parties: result.parties,
      totalSeats: result.totalSeats,
      type: result.type,
      source: result.source,
      fetchedAt: result.fetchedAt,
    },
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  let result;
  try {
    result = await fetchElectionResults();
  } catch (error) {
    // Expected before election night (no results/exit polls published yet).
    // Exit 0 so the scheduled hourly job doesn't report a failure.
    console.log(`No results available yet: ${error.message}`);
    return;
  }

  console.log(JSON.stringify(
    { type: result.type, totalSeats: result.totalSeats, source: result.source, parties: result.parties },
    null,
    2,
  ));

  if (dryRun) {
    console.log('Dry run only. No database writes were made.');
    return;
  }

  await persistResult(result);
  console.log(`Stored ${result.type} results (${result.totalSeats} seats).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
