import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { supabase } from '@/lib/supabase';
import { fetchRecentPolls } from '../../../scripts/poll-source.mjs';
import type { Poll, PollParty, ScrapedPoll } from '@/lib/types';

export const dynamic = 'force-dynamic';

const getCachedRecentPolls = unstable_cache(
  async () => ({ polls: await fetchRecentPolls(), fetchedAt: new Date().toISOString() }),
  ['recent-wikipedia-polls'],
  { revalidate: 60 * 60 * 12 },
);

type PollRecord = {
  id: string;
  source: string;
  poll_date: string;
  raw_data: {
    pollingFirm?: string;
    sampleSize?: number | null;
    sourceUrl?: string;
    fetchedAt?: string;
    parties?: PollParty[];
  };
};

export async function GET() {
  let polls: Poll[] = [];
  let sourceMode: 'stored' | 'live' = 'live';

  if (supabase) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 45);
    const { data, error } = await supabase
      .from('polls')
      .select('id, source, poll_date, raw_data')
      .eq('poll_type', 'poll')
      .gte('poll_date', cutoff.toISOString())
      .order('poll_date', { ascending: false })
      .limit(100);

    if (!error) {
      const records = (data ?? []) as unknown as PollRecord[];
      polls = records.flatMap((record) => {
        const rawData = record.raw_data;
        if (!rawData?.pollingFirm || !rawData.sourceUrl || !Array.isArray(rawData.parties)) return [];

        return [{
          id: record.id,
          source: record.source,
          date: record.poll_date.slice(0, 10).split('-').reverse().join('.'),
          pollingFirm: rawData.pollingFirm,
          sampleSize: rawData.sampleSize,
          sourceUrl: rawData.sourceUrl,
          lastChecked: rawData.fetchedAt,
          parties: rawData.parties,
        }];
      });

      if (polls.length > 0) sourceMode = 'stored';
    }
  }

  if (polls.length === 0) {
    const { polls: recentPolls, fetchedAt } = await getCachedRecentPolls();
    polls = recentPolls.map((poll: ScrapedPoll) => ({
      id: poll.sourceKey,
      source: poll.source,
      date: poll.date.split('-').reverse().join('.'),
      pollingFirm: poll.rawData.pollingFirm,
      sampleSize: poll.rawData.sampleSize,
      sourceUrl: poll.rawData.sourceUrl,
      lastChecked: fetchedAt,
      parties: poll.rawData.parties,
    }));
  }

  const totals = new Map<string, { sum: number; count: number }>();
  for (const poll of polls) {
    for (const party of poll.parties) {
      if (party.seats === null) continue;
      const current = totals.get(party.name) ?? { sum: 0, count: 0 };
      current.sum += party.seats;
      current.count += 1;
      totals.set(party.name, current);
    }
  }

  const aggregate = Object.fromEntries(
    Array.from(totals, ([name, values]) => [name, Number((values.sum / values.count).toFixed(1))]),
  );

  return NextResponse.json({ polls, aggregate, sourceMode });
}
