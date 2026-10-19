import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type ResultRecord = {
  status: string | null;
  kind: string | null;
  source: string | null;
  updated_at: string | null;
  official_data: {
    parties?: Record<string, number>;
    totalSeats?: number;
    type?: string;
    source?: string;
    fetchedAt?: string;
  } | null;
};

// Latest captured election result (filled hourly by the result scraper). Public:
// election_results has a public-read RLS policy, so the anon client can read it.
export async function GET() {
  if (!supabase) {
    return NextResponse.json({ result: null });
  }

  const { data, error } = await supabase
    .from('election_results')
    .select('status, kind, source, updated_at, official_data')
    .order('updated_at', { ascending: false })
    .limit(1);

  const record = (data ?? [])[0] as ResultRecord | undefined;
  const parties = record?.official_data?.parties;

  if (error || !record || !parties || Object.keys(parties).length === 0) {
    return NextResponse.json({ result: null });
  }

  return NextResponse.json({
    result: parties,
    kind: record.kind ?? record.official_data?.type ?? 'official',
    updatedAt: record.updated_at,
    totalSeats: record.official_data?.totalSeats ?? Object.values(parties).reduce((sum, n) => sum + n, 0),
  });
}
