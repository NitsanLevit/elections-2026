'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ChevronDown, Crown, Flame, Gauge, Lock, Medal, Search, ShieldCheck, Trophy, Wallet } from 'lucide-react';
import AccountLeaguePanel from '@/components/account-league-panel';
import { mockParties, mockPolls } from '@/lib/mock-data';
import type { Party } from '@/lib/types';

const TOTAL_SEATS = 120;
const LOCK_DATE = new Date('2026-10-26T23:59:59+03:00');

type TabKey = 'bet' | 'polls' | 'group' | 'admin';
type FilterMode = 'poll' | 'source' | 'party';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('bet');
  const [expandedBelowThreshold, setExpandedBelowThreshold] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('poll');
  const [selectedPollId, setSelectedPollId] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedParty, setSelectedParty] = useState<string>('all');
  const [bet, setBet] = useState<Record<string, number>>({
    'ישר!': 8,
    'הליכוד': 32,
    'ביחד': 12,
    'ישראל ביתנו': 10,
    'הדמוקרטים': 6,
    'הרשימה המשותפת / חד"ש-תע"ל': 6,
    'יהדות התורה': 8,
    'ש"ס': 11,
    'עוצמה יהודית': 8,
    'הציונות הדתית': 9,
    'רע"ם': 7,
    'המילואימניקים': 3,
    'עמך ישראל': 0,
    'הציבור החרדי': 0,
    'כחול לבן': 0,
  });

  const remaining = useMemo(
    () => TOTAL_SEATS - Object.values(bet).reduce((sum, value) => sum + value, 0),
    [bet],
  );

  const belowThreshold = mockParties.filter((party) => party.thresholdRisk);
  const thresholdParties = mockParties.filter((party) => !party.thresholdRisk);
  const groupRevealDate = new Date('2026-10-27T08:00:00+03:00');
  const revealGroupBets = new Date() >= groupRevealDate;

  const countdown = useCountdown(LOCK_DATE);

  const allSources = Array.from(new Set(mockPolls.map((poll) => poll.source)));
  const partyNames = mockParties.map((party) => party.name);

  const filteredPolls = mockPolls.filter((poll) => {
    if (filterMode === 'source') {
      return selectedSource === 'all' || poll.source === selectedSource;
    }

    if (filterMode === 'party') {
      return selectedParty === 'all' || poll.parties.some((party) => party.name === selectedParty);
    }

    return selectedPollId === 'all' || poll.id === selectedPollId;
  });

  const selectedPollDetails =
    selectedPollId !== 'all' ? mockPolls.find((poll) => poll.id === selectedPollId) ?? null : filteredPolls[0] ?? null;

  const selectedPartyResults =
    selectedParty !== 'all'
      ? mockPolls.map((poll) => {
          const match = poll.parties.find((party) => party.name === selectedParty);
          return { poll: poll.source, seats: match?.seats ?? null, date: poll.date };
        })
      : [];

  const chartData =
    selectedPollDetails?.parties ??
    (selectedParty !== 'all'
      ? mockPolls
          .filter((poll) => poll.parties.some((party) => party.name === selectedParty))
          .map((poll) => ({
            name: poll.source,
            value: poll.parties.find((party) => party.name === selectedParty)?.seats ?? 0,
          }))
      : []);

  const updateSeatValue = (partyName: string, value: number) => {
    const numericValue = Number.isFinite(value) ? value : 0;
    const next = Math.max(0, Math.min(TOTAL_SEATS, Math.round(numericValue)));
    setBet((current) => ({ ...current, [partyName]: next }));
  };

  const saveDisabled = remaining !== 0 || countdown.locked;
  const lockLabel = countdown.locked ? 'ההימור נעול' : 'ההימור פתוח';

  return (
    <main className="min-h-screen bg-sky-50 text-slate-900">
      <div className="mx-auto max-w-md bg-white shadow-card">
        <header className="border-b border-blue-200 bg-gradient-to-br from-blue-950 via-blue-900 to-cyan-900 px-4 py-4 text-white">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-100">הימורי בחירות</p>
              <h1 className="text-lg font-bold">הכנסת 2026</h1>
            </div>
            <div className="rounded-full border border-cyan-300/50 bg-cyan-400/10 px-2 py-1 text-[10px] font-medium text-cyan-200">
              {lockLabel}
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-blue-100">
              <span>נתון עד למועד נעילה</span>
              <ClockIcon />
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <StatBox label="ימים" value={countdown.days} />
              <StatBox label="ש" value={countdown.hours} />
              <StatBox label="דק" value={countdown.minutes} />
              <StatBox label="שנ" value={countdown.seconds} />
            </div>
          </div>
        </header>

        <AccountLeaguePanel />

        <div className="border-b border-blue-100 bg-white px-4 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { key: 'bet', label: 'ההימור שלי', icon: Wallet },
              { key: 'polls', label: 'סקרים', icon: BarChart3 },
              ...(revealGroupBets ? [{ key: 'group', label: 'ההימורים בקבוצה', icon: Trophy }] : []),
              { key: 'admin', label: 'ניהול', icon: ShieldCheck },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key as TabKey)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition ${
                  activeTab === key ? 'bg-blue-900 text-white shadow-sm' : 'bg-blue-50 text-blue-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'bet' && (
          <section className="space-y-4 bg-sky-50 p-4">
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">
              <div className="flex items-center justify-between">
                <span className="font-semibold">מנדטים שנותרו לחלוקה</span>
                <Gauge className="h-4 w-4" />
              </div>
              <div className="mt-2 flex items-end justify-between">
                <span className="text-2xl font-black text-blue-950">{remaining}</span>
                <span className="text-sm text-blue-800">מתוך 120</span>
              </div>
            </div>

            <div className="space-y-3">
              {thresholdParties.map((party) => (
                <PartyCard
                  key={party.name}
                  party={party}
                  value={bet[party.name] ?? 0}
                  onChange={updateSeatValue}
                />
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-right"
                onClick={() => setExpandedBelowThreshold((value) => !value)}
              >
                <span className="font-medium text-slate-700">מתחת לאחוז החסימה</span>
                <ChevronDown className={`h-4 w-4 transition ${expandedBelowThreshold ? 'rotate-180' : ''}`} />
              </button>

              {expandedBelowThreshold && (
                <div className="mt-3 space-y-3">
                  {belowThreshold.map((party) => (
                    <PartyCard
                      key={party.name}
                      party={party}
                      value={bet[party.name] ?? 0}
                      onChange={updateSeatValue}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={saveDisabled}
              className={`w-full rounded-2xl px-4 py-3 text-base font-bold text-white transition ${
                saveDisabled ? 'cursor-not-allowed bg-slate-300' : 'bg-gradient-to-r from-blue-900 to-cyan-700 hover:from-blue-800 hover:to-cyan-600'
              }`}
            >
              {countdown.locked ? 'ההימור נעול - לא ניתן לעריכה' : 'שמור / שלח הימור'}
            </button>
          </section>
        )}

        {activeTab === 'polls' && (
          <section className="space-y-4 bg-slate-50 p-4">
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-cyan-900">ממוצע סקרים אחרונים</span>
                <Flame className="h-4 w-4 text-cyan-600" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat label="ישר!" value="7.4" />
                <MiniStat label="הליכוד" value="34.1" />
                <MiniStat label="ביחד" value="11.8" />
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">סינון</span>
                <BarChart3 className="h-4 w-4 text-blue-700" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={filterMode}
                  onChange={(event) => setFilterMode(event.target.value as FilterMode)}
                  className="rounded-xl border border-blue-200 bg-sky-50 px-2 py-2 text-sm text-slate-700"
                >
                  <option value="poll">סקר</option>
                  <option value="source">ערוץ</option>
                  <option value="party">מפלגה</option>
                </select>

                {filterMode === 'poll' && (
                  <select
                    value={selectedPollId}
                    onChange={(event) => setSelectedPollId(event.target.value)}
                    className="col-span-2 rounded-xl border border-blue-200 bg-sky-50 px-2 py-2 text-sm text-slate-700"
                  >
                    <option value="all">כל הסקרים</option>
                    {mockPolls.map((poll) => (
                      <option key={poll.id} value={poll.id}>{poll.source}</option>
                    ))}
                  </select>
                )}

                {filterMode === 'source' && (
                  <select
                    value={selectedSource}
                    onChange={(event) => setSelectedSource(event.target.value)}
                    className="col-span-2 rounded-xl border border-blue-200 bg-sky-50 px-2 py-2 text-sm text-slate-700"
                  >
                    <option value="all">כל הערוצים</option>
                    {allSources.map((source) => (
                      <option key={source} value={source}>{source}</option>
                    ))}
                  </select>
                )}

                {filterMode === 'party' && (
                  <select
                    value={selectedParty}
                    onChange={(event) => setSelectedParty(event.target.value)}
                    className="col-span-2 rounded-xl border border-blue-200 bg-sky-50 px-2 py-2 text-sm text-slate-700"
                  >
                    <option value="all">כל המפלגות</option>
                    {partyNames.map((party) => (
                      <option key={party} value={party}>{party}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {(filterMode === 'poll' || filterMode === 'source') && (
              <div className="space-y-3">
                {filteredPolls.map((poll) => {
                  const pollParties = mockParties.map((party) => ({
                    name: party.name,
                    seats: poll.parties.find((result) => result.name === party.name)?.seats ?? null,
                  }));
                  const maxValue = Math.max(...pollParties.map((party) => party.seats ?? 0), 1);
                  return (
                    <article key={poll.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-800">{poll.source}</span>
                        <span className="text-xs text-slate-500">{poll.date}</span>
                      </div>

                      <div className="space-y-2">
                        {pollParties.map((party) => (
                          <div key={`${poll.id}-${party.name}`}>
                            <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                              <span>{party.name}</span>
                              <span className={party.seats === null ? 'text-slate-400' : 'font-bold text-slate-800'}>
                                {party.seats ?? 'לא פורסם'}
                              </span>
                            </div>
                            {party.seats !== null && (
                              <div className="h-2 w-full overflow-hidden rounded-full bg-sky-100">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-blue-700 to-cyan-500"
                                  style={{ width: `${(party.seats / maxValue) * 100}%` }}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {filterMode === 'party' && (
              <div className="space-y-3">
                {selectedParty === 'all' ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                    בחר מפלגה כדי לראות בכל הסקרים כמה היא קיבלה.
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-cyan-900">{selectedParty}</span>
                        <span className="text-xs text-cyan-800">הצגה לפי סקרים</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {selectedPartyResults.map((item) => (
                        <div key={`${item.poll}-${item.date}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-800">{item.poll}</span>
                            <span className="text-xs text-slate-500">{item.date}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">
                              {item.seats === null ? 'לא פורסם בסקר' : 'מנדטים'}
                            </span>
                            {item.seats === null ? (
                              <span className="text-sm text-slate-400">לא פורסם</span>
                            ) : (
                              <span className="text-lg font-black text-blue-900">{item.seats}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === 'group' && (
          <section className="space-y-4 bg-sky-50 p-4">
            <div className="rounded-2xl border border-blue-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">ההימורים בקבוצה</span>
                <Trophy className="h-4 w-4 text-blue-700" />
              </div>
              <p className="text-sm text-slate-600">לאחר סגירת ההצבעה, כאן יוצגו כל ההימורים של חברי הקבוצה.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              נתוני ההימורים של חברי הקבוצה יוצגו כאן לאחר חיבור שמירת ההימורים.
            </div>
          </section>
        )}

        {activeTab === 'admin' && (
          <section className="space-y-4 bg-slate-50 p-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-bold">סטטוס תוצאות</span>
              </div>
              <p>⚠️ תוצאות ביניים / טרם נקבעו תוצאות סופיות</p>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
              <h3 className="font-bold text-slate-800">הזנת תוצאות ידנית</h3>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right" placeholder="JSON raw / poll output" />
              <button type="button" className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white">
                עדכון תוצאות
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function PartyCard({ party, value, onChange }: { party: Party; value: number; onChange: (name: string, nextValue: number) => void }) {
  const inputValue = Number.isFinite(value) ? value : 0;

  return (
    <div className="rounded-2xl border border-blue-200 bg-white p-3 shadow-sm ring-1 ring-blue-50">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{party.name}</h3>
          <p className="text-[11px] text-slate-500">{party.leader}</p>
        </div>
        <div className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-800 ring-1 ring-blue-100">
          {party.pollAverage} מנדטים
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`הפחת למנדטים עבור ${party.name}`}
            onClick={() => onChange(party.name, inputValue - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-xl font-bold text-blue-900 transition hover:bg-blue-200"
          >
            −
          </button>
          <input
            type="number"
            min={0}
            max={120}
            value={inputValue}
            aria-label={`מנדטים עבור ${party.name}`}
            onChange={(event) => {
              const nextValue = Number.parseInt(event.target.value, 10);
              onChange(party.name, Number.isNaN(nextValue) ? 0 : nextValue);
            }}
            className="w-16 rounded-xl border border-blue-200 bg-sky-50 px-2 py-2 text-center text-base font-bold text-slate-800 outline-none"
          />
          <button
            type="button"
            aria-label={`הוסף למנדטים עבור ${party.name}`}
            onClick={() => onChange(party.name, inputValue + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500 text-xl font-bold text-white transition hover:bg-cyan-600"
          >
            +
          </button>
        </div>
        <div className="text-left">
          <p className="text-[10px] text-slate-500">ממוצע סקרים</p>
          <p className="text-sm font-bold text-slate-800">{party.pollAverage}</p>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-900/60 p-2">
      <div className="text-lg font-black text-white">{value}</div>
      <div className="text-[10px] text-slate-300">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-2">
      <div className="text-sm font-bold text-slate-800">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function ClockIcon() {
  return <div className="h-3.5 w-3.5 rounded-full border border-slate-300" />;
}

function useCountdown(targetDate: Date) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();

    const intervalId = window.setInterval(updateNow, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  if (now === null) {
    return { days: '--', hours: '--', minutes: '--', seconds: '--', locked: false };
  }

  const difference = Math.max(targetDate.getTime() - now, 0);

  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((difference / (1000 * 60)) % 60);
  const seconds = Math.floor((difference / 1000) % 60);

  return {
    days,
    hours,
    minutes,
    seconds,
    locked: difference === 0,
  };
}
