'use client';

import { BarChart3, Crown, Medal, PieChart, Trophy, Users } from 'lucide-react';
import {
  aggregateByBloc,
  groupAverage,
  rankEntries,
  type BlocTotals,
  type GroupEntry,
} from '@/lib/election-preview';

// dataviz: slot 1 (blue) = the real result, slot 2 (orange) = the prediction.
const RESULT_COLOR = '#2a78d6';
const PREDICTION_COLOR = '#eb6834';

type ResultsViewProps = {
  result: Record<string, number>;
  entries: GroupEntry[];
  isPreview?: boolean;
};

export default function ResultsView({ result, entries, isPreview }: ResultsViewProps) {
  const ranked = rankEntries(entries, result);
  const winner = ranked[0] ?? null;
  const prediction = groupAverage(entries);

  const resultBlocs = aggregateByBloc(result);
  const predictionBlocs = aggregateByBloc(prediction);

  const partyOrder = Array.from(new Set([...Object.keys(result), ...Object.keys(prediction)]))
    .map((name) => ({ name, result: result[name] ?? 0, prediction: prediction[name] ?? 0 }))
    .filter((row) => row.result > 0 || row.prediction > 0)
    .sort((a, b) => b.result - a.result || b.prediction - a.prediction);
  const maxSeat = Math.max(1, ...partyOrder.map((row) => Math.max(row.result, row.prediction)));

  return (
    <section className="space-y-4 bg-sky-50 p-4">
      {isPreview && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900">
          מצב תצוגה מקדימה — נתוני דמה להדגמת מסך יום הבחירות. לא נתונים אמיתיים.
        </div>
      )}

      {/* Winner */}
      {winner && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-400 via-amber-300 to-yellow-200 p-4 text-amber-950 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold">
                <span className="animate-bounce">🎉</span> המנצח/ת בקבוצה
              </p>
              <p className="mt-1 text-2xl font-black">{winner.nickname}</p>
              <p className="text-sm font-semibold">דיוק {winner.accuracy}% · סטייה {winner.error} מנדטים</p>
            </div>
            <Crown className="h-12 w-12 animate-pulse text-amber-700" />
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="rounded-2xl border border-blue-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">טבלת מובילים</span>
          <Trophy className="h-4 w-4 text-blue-700" />
        </div>
        <ul className="space-y-2">
          {ranked.map((entry) => (
            <li key={`${entry.nickname}-${entry.rank}`} className="rounded-xl bg-slate-50 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <RankBadge rank={entry.rank} />
                  {entry.nickname}
                </span>
                <span className="text-sm font-black text-blue-900">{entry.accuracy}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-sky-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-700 to-cyan-500"
                    style={{ width: `${entry.accuracy}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500">סטייה {entry.error}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Bloc pies */}
      <div className="rounded-2xl border border-blue-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">חלוקת הגושים</span>
          <PieChart className="h-4 w-4 text-blue-700" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <BlocDonut title="תוצאה אמיתית" blocs={resultBlocs} />
          <BlocDonut title="ממוצע הקבוצה" blocs={predictionBlocs} />
        </div>
        <BlocLegend blocs={resultBlocs} />
      </div>

      {/* Prediction vs result bars */}
      <div className="rounded-2xl border border-blue-200 bg-white p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">תחזית מול תוצאה</span>
          <BarChart3 className="h-4 w-4 text-blue-700" />
        </div>
        <div className="mb-3 flex items-center gap-4 text-[11px] text-slate-600">
          <LegendDot color={RESULT_COLOR} label="תוצאה" />
          <LegendDot color={PREDICTION_COLOR} label="תחזית ממוצעת" />
        </div>
        <div className="space-y-3">
          {partyOrder.map((row) => (
            <div key={row.name}>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-700">
                <span className="font-medium">{row.name}</span>
                <span className="tabular-nums text-slate-500">
                  {row.result} / <span style={{ color: PREDICTION_COLOR }}>{row.prediction.toFixed(1)}</span>
                </span>
              </div>
              <div className="space-y-1">
                <Bar value={row.result} max={maxSeat} color={RESULT_COLOR} />
                <Bar value={row.prediction} max={maxSeat} color={PREDICTION_COLOR} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Everyone's bets — comparison table */}
      <div className="rounded-2xl border border-blue-200 bg-white p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">ההצבעות של כולם</span>
          <Users className="h-4 w-4 text-blue-700" />
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
          <span>גללו לצדדים לכל המשתתפים</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-100" /> קרוב לתוצאה</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-50" /> רחוק</span>
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="sticky right-0 z-10 border-b border-slate-200 bg-white px-2 py-2 text-right font-semibold">מפלגה</th>
                <th className="border-b border-slate-200 px-2 py-2 text-center font-bold text-blue-900">תוצאה</th>
                {ranked.map((entry) => (
                  <th key={`h-${entry.nickname}-${entry.rank}`} className="border-b border-slate-200 px-2 py-2 text-center font-semibold">
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                      <RankBadge rank={entry.rank} />
                      {entry.nickname}
                    </div>
                    <div className="font-normal text-[10px] text-slate-400">{entry.accuracy}%</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {partyOrder.map((row) => (
                <tr key={`r-${row.name}`}>
                  <th className="sticky right-0 z-10 border-b border-slate-100 bg-white px-2 py-1.5 text-right font-medium text-slate-700 whitespace-nowrap">
                    {row.name}
                  </th>
                  <td className="border-b border-slate-100 px-2 py-1.5 text-center font-bold tabular-nums text-blue-900">
                    {row.result}
                  </td>
                  {ranked.map((entry) => {
                    const value = entry.bet[row.name] ?? 0;
                    const diff = Math.abs(value - row.result);
                    return (
                      <td
                        key={`c-${entry.nickname}-${row.name}`}
                        className={`border-b border-slate-100 px-2 py-1.5 text-center tabular-nums text-slate-700 ${closenessClass(diff)}`}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="font-bold text-slate-800">
                <th className="sticky right-0 z-10 bg-white px-2 py-2 text-right">סה״כ</th>
                <td className="px-2 py-2 text-center tabular-nums">120</td>
                {ranked.map((entry) => (
                  <td key={`t-${entry.nickname}-${entry.rank}`} className="px-2 py-2 text-center tabular-nums">
                    {Object.values(entry.bet).reduce((sum, seats) => sum + seats, 0)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const tone = rank === 1 ? 'text-amber-500' : rank === 2 ? 'text-slate-400' : 'text-orange-700';
    return <Medal className={`h-4 w-4 ${tone}`} aria-label={`מקום ${rank}`} />;
  }
  return <span className="w-4 text-center text-xs font-bold text-slate-500">{rank}</span>;
}

function closenessClass(diff: number): string {
  if (diff === 0) return 'bg-emerald-100';
  if (diff <= 1) return 'bg-emerald-50';
  if (diff <= 3) return '';
  if (diff <= 5) return 'bg-amber-50';
  return 'bg-red-50';
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
    </div>
  );
}

function BlocDonut({ title, blocs, size = 128, stroke = 22 }: { title: string; blocs: BlocTotals; size?: number; stroke?: number }) {
  const total = blocs.reduce((sum, bloc) => sum + bloc.seats, 0) || 1;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-28 w-28" role="img" aria-label={title}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {blocs.map((bloc) => {
            const length = (bloc.seats / total) * circumference;
            const dash = Math.max(length - 2, 0); // 2px gap between segments
            const circle = (
              <circle
                key={bloc.id}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={bloc.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              >
                <title>{`${bloc.name}: ${bloc.seats}`}</title>
              </circle>
            );
            offset += length;
            return circle;
          })}
        </g>
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-slate-800 text-[18px] font-black">
          {total}
        </text>
      </svg>
      <figcaption className="mt-1 text-[11px] font-medium text-slate-600">{title}</figcaption>
    </figure>
  );
}

function BlocLegend({ blocs }: { blocs: BlocTotals }) {
  const total = blocs.reduce((sum, bloc) => sum + bloc.seats, 0) || 1;
  return (
    <ul className="mt-3 space-y-1">
      {blocs.map((bloc) => (
        <li key={bloc.id} className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: bloc.color }} />
            {bloc.name}
          </span>
          <span className="tabular-nums text-slate-500">
            {bloc.seats} מנדטים · {Math.round((bloc.seats / total) * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}
