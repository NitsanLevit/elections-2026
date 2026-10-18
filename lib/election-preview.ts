// Election-day data model: bloc definitions, scoring, and demo data used by the
// local preview mode (?preview=1). The bloc mapping is the single place to edit
// political groupings — change `parties` here and every chart updates.

export type Bloc = { id: string; name: string; color: string; parties: string[] };

// Main blocs. Any party not listed here falls into the neutral "other" group.
// Colors are the dataviz validated categorical slots 1/2/3 (blue/orange/aqua);
// "other" uses the muted ink so it never competes with a real bloc.
export const BLOCS: Bloc[] = [
  {
    id: 'netanyahu',
    name: 'גוש נתניהו',
    color: '#2a78d6',
    parties: ['הליכוד', 'ש"ס', 'יהדות התורה', 'עוצמה יהודית', 'הציונות הדתית וזהות', 'עמך ישראל', 'הציבור החרדי'],
  },
  {
    id: 'change',
    name: 'גוש השינוי',
    color: '#eb6834',
    parties: ['ישר!', 'ביחד', 'הדמוקרטים', 'ישראל ביתנו', 'המילואימניקים והכלכלה החדשה', 'כחול לבן'],
  },
  {
    id: 'arab',
    name: 'מפלגות ערביות',
    color: '#1baf7a',
    parties: ['הרשימה המשותפת', 'רע"ם'],
  },
];

export const OTHER_BLOC = { id: 'other', name: 'אחר / לא משויכות', color: '#898781' };

export type BlocTotals = { id: string; name: string; color: string; seats: number }[];

export function blocOf(party: string): string {
  const bloc = BLOCS.find((candidate) => candidate.parties.includes(party));
  return bloc ? bloc.id : OTHER_BLOC.id;
}

export function aggregateByBloc(seats: Record<string, number>): BlocTotals {
  const totals = new Map<string, number>([...BLOCS.map((bloc) => [bloc.id, 0] as const), [OTHER_BLOC.id, 0]]);
  for (const [party, value] of Object.entries(seats)) {
    const id = blocOf(party);
    totals.set(id, (totals.get(id) ?? 0) + (value || 0));
  }
  return [...BLOCS, OTHER_BLOC]
    .map((bloc) => ({ id: bloc.id, name: bloc.name, color: bloc.color, seats: totals.get(bloc.id) ?? 0 }))
    .filter((bloc) => bloc.seats > 0);
}

// Total absolute deviation between a bet and the result (lower = closer).
export function betError(bet: Record<string, number>, result: Record<string, number>): number {
  const names = Array.from(new Set([...Object.keys(bet), ...Object.keys(result)]));
  let error = 0;
  for (const name of names) error += Math.abs((bet[name] ?? 0) - (result[name] ?? 0));
  return error;
}

// Map the 0..240 error range (two 120-sum vectors) to a 0..100 accuracy score.
export function accuracyPct(error: number): number {
  return Math.max(0, Math.round(100 * (1 - error / 240)));
}

export type GroupEntry = { nickname: string; bet: Record<string, number> };

export function groupAverage(entries: GroupEntry[]): Record<string, number> {
  if (entries.length === 0) return {};
  const sums: Record<string, number> = {};
  for (const entry of entries) {
    for (const [party, value] of Object.entries(entry.bet)) {
      sums[party] = (sums[party] ?? 0) + (value || 0);
    }
  }
  return Object.fromEntries(Object.entries(sums).map(([party, total]) => [party, total / entries.length]));
}

export type RankedEntry = GroupEntry & { error: number; accuracy: number; rank: number };

export function rankEntries(entries: GroupEntry[], result: Record<string, number>): RankedEntry[] {
  return entries
    .map((entry) => {
      const error = betError(entry.bet, result);
      return { ...entry, error, accuracy: accuracyPct(error) };
    })
    .sort((a, b) => a.error - b.error)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

// ---- Demo data for the preview mode (never shown to real users) ----

// A plausible final result (sums to 120; below-threshold parties get 0 seats).
export const mockFinalResult: Record<string, number> = {
  'הליכוד': 23,
  'ישר!': 20,
  'ביחד': 12,
  'הדמוקרטים': 10,
  'ש"ס': 8,
  'ישראל ביתנו': 8,
  'עוצמה יהודית': 8,
  'יהדות התורה': 7,
  'המילואימניקים והכלכלה החדשה': 7,
  'הרשימה המשותפת': 6,
  'הציונות הדתית וזהות': 6,
  'רע"ם': 5,
  'עמך ישראל': 0,
  'כחול לבן': 0,
  'הציבור החרדי': 0,
};

// Several participants with full 120-seat bets (varied, for a lively leaderboard).
export const mockGroupBets: GroupEntry[] = [
  {
    nickname: 'נטע',
    bet: {
      'הליכוד': 22, 'ישר!': 21, 'ביחד': 12, 'הדמוקרטים': 10, 'ש"ס': 8, 'ישראל ביתנו': 8,
      'עוצמה יהודית': 8, 'יהדות התורה': 7, 'המילואימניקים והכלכלה החדשה': 6, 'הרשימה המשותפת': 6,
      'הציונות הדתית וזהות': 5, 'רע"ם': 5, 'עמך ישראל': 2, 'כחול לבן': 0, 'הציבור החרדי': 0,
    },
  },
  {
    nickname: 'דני',
    bet: {
      'הליכוד': 26, 'ישר!': 18, 'ביחד': 10, 'הדמוקרטים': 8, 'ש"ס': 9, 'ישראל ביתנו': 7,
      'עוצמה יהודית': 9, 'יהדות התורה': 8, 'המילואימניקים והכלכלה החדשה': 4, 'הרשימה המשותפת': 6,
      'הציונות הדתית וזהות': 6, 'רע"ם': 5, 'עמך ישראל': 4, 'כחול לבן': 0, 'הציבור החרדי': 0,
    },
  },
  {
    nickname: 'מאיה',
    bet: {
      'הליכוד': 20, 'ישר!': 24, 'ביחד': 13, 'הדמוקרטים': 11, 'ש"ס': 7, 'ישראל ביתנו': 9,
      'עוצמה יהודית': 6, 'יהדות התורה': 6, 'המילואימניקים והכלכלה החדשה': 5, 'הרשימה המשותפת': 5,
      'הציונות הדתית וזהות': 5, 'רע"ם': 5, 'עמך ישראל': 0, 'כחול לבן': 4, 'הציבור החרדי': 0,
    },
  },
  {
    nickname: 'יוסי',
    bet: {
      'הליכוד': 28, 'ישר!': 16, 'ביחד': 9, 'הדמוקרטים': 7, 'ש"ס': 10, 'ישראל ביתנו': 6,
      'עוצמה יהודית': 10, 'יהדות התורה': 9, 'המילואימניקים והכלכלה החדשה': 3, 'הרשימה המשותפת': 5,
      'הציונות הדתית וזהות': 7, 'רע"ם': 4, 'עמך ישראל': 6, 'כחול לבן': 0, 'הציבור החרדי': 0,
    },
  },
  {
    nickname: 'שירה',
    bet: {
      'הליכוד': 24, 'ישר!': 19, 'ביחד': 12, 'הדמוקרטים': 10, 'ש"ס': 8, 'ישראל ביתנו': 8,
      'עוצמה יהודית': 7, 'יהדות התורה': 7, 'המילואימניקים והכלכלה החדשה': 7, 'הרשימה המשותפת': 6,
      'הציונות הדתית וזהות': 6, 'רע"ם': 5, 'עמך ישראל': 1, 'כחול לבן': 0, 'הציבור החרדי': 0,
    },
  },
];
