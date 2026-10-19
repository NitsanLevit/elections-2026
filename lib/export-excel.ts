// Client-side Excel (.xlsx) export with SheetJS. This module is only reached via
// the results view, which is lazy-loaded (next/dynamic), so xlsx stays out of the
// initial bundle.

import * as XLSX from 'xlsx';
import { aggregateByBloc, blocOf, BLOCS, OTHER_BLOC, betError, accuracyPct, type GroupEntry } from '@/lib/election-preview';

function stamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function blocName(party: string): string {
  const id = blocOf(party);
  return (BLOCS.find((bloc) => bloc.id === id) ?? OTHER_BLOC).name;
}

// Party column order: by result seats desc when a result is given, else by name.
function partyOrder(entries: GroupEntry[], result?: Record<string, number>): string[] {
  const names = new Set<string>();
  for (const entry of entries) for (const party of Object.keys(entry.bet)) names.add(party);
  if (result) for (const party of Object.keys(result)) names.add(party);
  return Array.from(names).sort((a, b) => (result ? (result[b] ?? 0) - (result[a] ?? 0) : a.localeCompare(b)));
}

function downloadWorkbook(sheets: { name: string; rows: (string | number)[][] }[], fileName: string) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(workbook, fileName);
}

export async function exportBetsToExcel(
  entries: GroupEntry[],
  options: { leagueName?: string; result?: Record<string, number> } = {},
) {
  const { leagueName, result } = options;
  const parties = partyOrder(entries, result);

  const header = ['משתתף', ...parties, 'סה"כ', ...(result ? ['דיוק %'] : [])];
  const rows: (string | number)[][] = [header];

  if (result) {
    rows.push(['תוצאה אמיתית', ...parties.map((party) => result[party] ?? 0), Object.values(result).reduce((s, n) => s + n, 0), 100]);
  }

  for (const entry of entries) {
    const total = Object.values(entry.bet).reduce((sum, seats) => sum + seats, 0);
    const row: (string | number)[] = [entry.nickname, ...parties.map((party) => entry.bet[party] ?? 0), total];
    if (result) row.push(accuracyPct(betError(entry.bet, result)));
    rows.push(row);
  }

  const title = leagueName ? `הצבעות-${leagueName}` : 'הצבעות-קבוצה';
  await downloadWorkbook([{ name: 'הצבעות', rows }], `${title}_${stamp()}.xlsx`);
}

export async function exportResultsToExcel(
  result: Record<string, number>,
  options: { kind?: string; updatedAt?: Date | string | null } = {},
) {
  const { kind = 'תוצאות', updatedAt } = options;
  const when = updatedAt ? (updatedAt instanceof Date ? updatedAt : new Date(updatedAt)) : new Date();

  const partyRows = Object.entries(result)
    .filter(([, seats]) => seats > 0)
    .sort((a, b) => b[1] - a[1]);

  const resultsSheet: (string | number)[][] = [
    ['סוג התוצאות', kind],
    ['נכון לתאריך/שעה', when.toLocaleString('he-IL')],
    [],
    ['מפלגה', 'מנדטים', 'גוש'],
    ...partyRows.map(([party, seats]) => [party, seats, blocName(party)]),
    [],
    ['סה"כ', partyRows.reduce((sum, [, seats]) => sum + seats, 0), ''],
  ];

  const blocsSheet: (string | number)[][] = [
    ['גוש', 'מנדטים'],
    ...aggregateByBloc(result).map((bloc) => [bloc.name, bloc.seats]),
  ];

  await downloadWorkbook(
    [
      { name: 'תוצאות', rows: resultsSheet },
      { name: 'גושים', rows: blocsSheet },
    ],
    `תוצאות-בחירות_${stamp(when)}.xlsx`,
  );
}
