import { NextResponse } from 'next/server';
import { mockPolls } from '@/lib/mock-data';

export async function GET() {
  const aggregate = {
    'הליכוד': 34.1,
    'ביחד': 11.8,
    'ישר!': 7.4,
    'ש"ס': 10.5,
  };

  return NextResponse.json({ polls: mockPolls, aggregate });
}
