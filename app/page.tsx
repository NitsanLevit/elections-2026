'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, BarChart3, Check, ChevronDown, Clock3, Crown, Flame, Gauge, Lock, Medal, Search, ShieldCheck, Trophy, Users, Wallet } from 'lucide-react';
import AccountLeaguePanel from '@/components/account-league-panel';
import { supabase } from '@/lib/supabase';
import { mockParties } from '@/lib/mock-data';
import { mockFinalResult, mockGroupBets } from '@/lib/election-preview';
import type { Party, Poll } from '@/lib/types';

// Lazy-load the results view (and its xlsx dependency) only when needed.
const ResultsView = dynamic(() => import('@/components/results-view'), { ssr: false });

type ActiveLeague = { id: string; name: string; invite_code: string };
type Participant = { nickname: string; has_submitted: boolean; is_me: boolean };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const DEFAULT_BET: Record<string, number> = {
  'ישר!': 8,
  'הליכוד': 32,
  'ביחד': 12,
  'ישראל ביתנו': 10,
  'הדמוקרטים': 6,
  'הרשימה המשותפת': 6,
  'יהדות התורה': 8,
  'ש"ס': 11,
  'עוצמה יהודית': 8,
  'הציונות הדתית וזהות': 9,
  'רע"ם': 7,
  'המילואימניקים והכלכלה החדשה': 3,
  'עמך ישראל': 0,
  'הציבור החרדי': 0,
  'כחול לבן': 0,
};

const TOTAL_SEATS = 120;
const FALLBACK_LOCK_DATETIME = '2026-10-26T23:59:59+03:00';

function resolveLockDate() {
  const configured = process.env.NEXT_PUBLIC_LOCK_DATETIME?.trim();
  const candidate = configured ? new Date(configured) : null;
  if (candidate && !Number.isNaN(candidate.getTime())) return candidate;
  return new Date(FALLBACK_LOCK_DATETIME);
}

const LOCK_DATE = resolveLockDate();

// Build a suggested bet from the live poll averages, normalised to exactly
// TOTAL_SEATS using the largest-remainder (Hamilton) method so the values stay
// proportional to the averages shown on each card and still sum to 120.
function buildSuggestedBet(aggregate: Record<string, number>): Record<string, number> {
  const entries = Object.keys(DEFAULT_BET).map((name) => ({
    name,
    weight: typeof aggregate[name] === 'number' ? aggregate[name] : DEFAULT_BET[name],
  }));
  const totalWeight = entries.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return { ...DEFAULT_BET };

  const allocated = entries.map((item) => {
    const raw = (item.weight / totalWeight) * TOTAL_SEATS;
    const seats = Math.floor(raw);
    return { name: item.name, seats, frac: raw - seats };
  });

  let remainder = TOTAL_SEATS - allocated.reduce((sum, item) => sum + item.seats, 0);
  for (const item of [...allocated].sort((a, b) => b.frac - a.frac)) {
    if (remainder <= 0) break;
    item.seats += 1;
    remainder -= 1;
  }

  return Object.fromEntries(allocated.map((item) => [item.name, item.seats]));
}

type TabKey = 'bet' | 'polls' | 'group' | 'results' | 'admin';
type FilterMode = 'poll' | 'source' | 'party';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('bet');
  const [previewMode, setPreviewMode] = useState(false);
  const [expandedBelowThreshold, setExpandedBelowThreshold] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('poll');
  const [selectedPollId, setSelectedPollId] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedParty, setSelectedParty] = useState<string>('all');
  const [polls, setPolls] = useState<Poll[]>([]);
  const [pollAggregate, setPollAggregate] = useState<Record<string, number>>({});
  const [pollSourceMode, setPollSourceMode] = useState<'stored' | 'live'>('live');
  const [pollsLoading, setPollsLoading] = useState(true);
  const [pollsError, setPollsError] = useState(false);
  const [bet, setBet] = useState<Record<string, number>>(DEFAULT_BET);
  const [activeLeague, setActiveLeague] = useState<ActiveLeague | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [betSource, setBetSource] = useState<'suggested' | 'saved' | 'editing'>('suggested');

  const remaining = useMemo(
    () => TOTAL_SEATS - Object.values(bet).reduce((sum, value) => sum + value, 0),
    [bet],
  );

  const suggestedBet = useMemo(() => buildSuggestedBet(pollAggregate), [pollAggregate]);

  // While the user hasn't loaded a saved bet or edited the form, keep the bet in
  // sync with the poll-average suggestion (updates as live averages come in).
  useEffect(() => {
    if (betSource === 'suggested') setBet(suggestedBet);
  }, [suggestedBet, betSource]);

  // Local election-day preview (?preview=1): jump straight to the results tab.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const on = params.get('preview') === '1' || process.env.NEXT_PUBLIC_PREVIEW_ELECTION === 'true';
      if (on) {
        setPreviewMode(true);
        setActiveTab('results');
      }
    } catch {
      /* window unavailable (SSR) — ignore */
    }
  }, []);

  const belowThreshold = mockParties.filter((party) => party.thresholdRisk);
  const thresholdParties = mockParties.filter((party) => !party.thresholdRisk);
  const groupRevealDate = new Date('2026-10-27T08:00:00+03:00');
  const revealGroupBets = new Date() >= groupRevealDate;

  const countdown = useCountdown(LOCK_DATE);

  useEffect(() => {
    let isCurrent = true;

    fetch('/api/polls')
      .then(async (response) => {
        if (!response.ok) throw new Error('Poll request failed');
        return response.json();
      })
      .then((data: { polls: Poll[]; aggregate: Record<string, number>; sourceMode: 'stored' | 'live' }) => {
        if (!isCurrent) return;
        setPolls(data.polls);
        setPollAggregate(data.aggregate);
        setPollSourceMode(data.sourceMode);
      })
      .catch(() => {
        if (isCurrent) setPollsError(true);
      })
      .finally(() => {
        if (isCurrent) setPollsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const allSources = Array.from(new Set(polls.map((poll) => poll.source)));
  const partyNames = Array.from(new Set(polls.flatMap((poll) => poll.parties.map((party) => party.name))));

  const filteredPolls = polls.filter((poll) => {
    if (filterMode === 'source') {
      return selectedSource === 'all' || poll.source === selectedSource;
    }

    if (filterMode === 'party') {
      return selectedParty === 'all' || poll.parties.some((party) => party.name === selectedParty);
    }

    return selectedPollId === 'all' || poll.id === selectedPollId;
  });

  const selectedPollDetails =
    selectedPollId !== 'all' ? polls.find((poll) => poll.id === selectedPollId) ?? null : filteredPolls[0] ?? null;

  const selectedPartyResults =
    selectedParty !== 'all'
      ? polls.map((poll) => {
          const match = poll.parties.find((party) => party.name === selectedParty);
          return { id: poll.id, poll: poll.source, seats: match?.seats ?? null, date: poll.date };
        })
      : [];

  const updateSeatValue = (partyName: string, value: number) => {
    const numericValue = Number.isFinite(value) ? value : 0;
    const next = Math.max(0, Math.min(TOTAL_SEATS, Math.round(numericValue)));
    setBetSource('editing');
    setBet((current) => ({ ...current, [partyName]: next }));
  };

  const loadParticipants = useCallback(async (leagueId: string) => {
    if (!supabase) return;
    setParticipantsLoading(true);
    const { data, error } = await supabase.rpc('league_participants', { target_league: leagueId });
    setParticipantsLoading(false);
    if (!error) setParticipants((data ?? []) as Participant[]);
  }, []);

  const loadMyBet = useCallback(async (leagueId: string) => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from('user_bets')
      .select('bet_json, submitted_at')
      .eq('user_id', userId)
      .eq('league_id', leagueId)
      .maybeSingle();

    if (error) return;

    if (data?.bet_json && typeof data.bet_json === 'object') {
      setBetSource('saved');
      setBet({ ...DEFAULT_BET, ...(data.bet_json as Record<string, number>) });
      setSaveState('saved');
      setSaveMessage(
        data.submitted_at
          ? `ההימור השמור שלך נטען (נשלח ${new Date(data.submitted_at).toLocaleString('he-IL')}).`
          : 'ההימור השמור שלך נטען.',
      );
    } else {
      // No saved bet for this league yet — fall back to the poll-average
      // suggestion (the sync effect fills the form from suggestedBet).
      setBetSource('suggested');
      setSaveState('idle');
      setSaveMessage('');
    }
  }, []);

  useEffect(() => {
    if (!activeLeague) {
      setParticipants([]);
      setBetSource('suggested');
      return;
    }
    void loadParticipants(activeLeague.id);
    void loadMyBet(activeLeague.id);
  }, [activeLeague, loadParticipants, loadMyBet]);

  async function handleSaveBet() {
    if (!supabase) {
      setSaveState('error');
      setSaveMessage('יש להגדיר את Supabase כדי לשמור הימור.');
      return;
    }
    if (!activeLeague) {
      setSaveState('error');
      setSaveMessage('בחרי או צרי קבוצה בפאנל למעלה כדי לשמור את ההימור.');
      return;
    }

    setSaveState('saving');
    setSaveMessage('');

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setSaveState('error');
      setSaveMessage('צריך להתחבר לחשבון כדי לשמור הימור.');
      return;
    }

    const submittedAt = new Date().toISOString();
    // Update first (grants only allow updating bet_json/submitted_at), then
    // insert when no row exists yet. Avoids an upsert touching protected columns.
    const { data: updated, error: updateError } = await supabase
      .from('user_bets')
      .update({ bet_json: bet, submitted_at: submittedAt })
      .eq('user_id', userId)
      .eq('league_id', activeLeague.id)
      .select('id');

    if (updateError) {
      setSaveState('error');
      setSaveMessage(updateError.message);
      return;
    }

    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase
        .from('user_bets')
        .insert({ user_id: userId, league_id: activeLeague.id, bet_json: bet, submitted_at: submittedAt });
      if (insertError) {
        setSaveState('error');
        setSaveMessage(insertError.message);
        return;
      }
    }

    setSaveState('saved');
    setSaveMessage('ההימור נשמר ונשלח לקבוצה.');
    void loadParticipants(activeLeague.id);
  }

  const submittedCount = participants.filter((participant) => participant.has_submitted).length;
  const saveDisabled = remaining !== 0 || countdown.locked || saveState === 'saving';
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

        <AccountLeaguePanel onActiveLeagueChange={setActiveLeague} />

        <div className="border-b border-blue-100 bg-white px-4 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { key: 'bet', label: 'ההימור שלי', icon: Wallet },
              { key: 'polls', label: 'סקרים', icon: BarChart3 },
              { key: 'group', label: 'הקבוצה', icon: Users },
              { key: 'results', label: 'תוצאות', icon: Trophy },
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
              {polls[0]?.lastChecked && (
                <p className="mt-2 text-center text-[11px] text-cyan-800">
                  {pollSourceMode === 'live' ? 'נתונים חיים שנשלפו ' : 'נבדק לאחרונה '}
                  {new Date(polls[0].lastChecked).toLocaleString('he-IL')}
                </p>
              )}
            </div>

            {betSource !== 'saved' && (
              <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
                ההימור המוצע מבוסס על ממוצע הסקרים העדכני (מנורמל ל-120 מנדטים). אפשר לערוך לפני שמירה.
              </p>
            )}

            <div className="space-y-3">
              {thresholdParties.map((party) => (
                <PartyCard
                  key={party.name}
                  party={party}
                  average={pollAggregate[party.name]}
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
                      average={pollAggregate[party.name]}
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
              onClick={handleSaveBet}
              className={`w-full rounded-2xl px-4 py-3 text-base font-bold text-white transition ${
                saveDisabled ? 'cursor-not-allowed bg-slate-300' : 'bg-gradient-to-r from-blue-900 to-cyan-700 hover:from-blue-800 hover:to-cyan-600'
              }`}
            >
              {countdown.locked
                ? 'ההימור נעול - לא ניתן לעריכה'
                : saveState === 'saving'
                  ? 'שומר...'
                  : 'שמור / שלח הימור'}
            </button>

            {!activeLeague && !countdown.locked && (
              <p className="text-center text-xs text-slate-500">כדי לשמור הימור, בחרי או צרי קבוצה בפאנל שלמעלה.</p>
            )}
            {saveMessage && (
              <p role="status" className={`text-center text-xs ${saveState === 'error' ? 'text-red-700' : 'text-cyan-800'}`}>
                {saveMessage}
              </p>
            )}
            {remaining !== 0 && !countdown.locked && (
              <p className="text-center text-xs text-amber-700">יש לחלק בדיוק 120 מנדטים לפני שמירה (נותרו {remaining}).</p>
            )}
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
                <MiniStat label="ישר!" value={pollAggregate['ישר!']?.toFixed(1) ?? '—'} />
                <MiniStat label="הליכוד" value={pollAggregate['הליכוד']?.toFixed(1) ?? '—'} />
                <MiniStat label="ביחד" value={pollAggregate['ביחד']?.toFixed(1) ?? '—'} />
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
                    {polls.map((poll) => (
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
                {pollsLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">טוען סקרים...</div>
                ) : pollsError ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">לא ניתן לטעון סקרים כרגע.</div>
                ) : filteredPolls.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">אין סקרים זמינים להצגה.</div>
                ) : filteredPolls.map((poll) => {
                    const pollParties = poll.parties;
                  const maxValue = Math.max(...pollParties.map((party) => party.seats ?? 0), 1);
                  return (
                    <article key={poll.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <span className="text-sm font-bold text-slate-800">{poll.source}</span>
                            {(poll.pollingFirm || poll.sampleSize) && (
                              <p className="mt-1 text-xs text-slate-500">
                                {[poll.pollingFirm, poll.sampleSize ? `מדגם ${poll.sampleSize}` : null].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                          <div className="text-left">
                            <span className="text-xs text-slate-500">{poll.date}</span>
                            {poll.sourceUrl && (
                              <a className="mt-1 block text-xs font-medium text-blue-700 underline" href={poll.sourceUrl} target="_blank" rel="noreferrer">
                                לכתבה המקורית
                              </a>
                            )}
                          </div>
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

            <p className="text-center text-xs text-slate-500">
              מאגר הנתונים: <a className="text-blue-700 underline" href="https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Israeli_legislative_election" target="_blank" rel="noreferrer">Wikipedia</a>. בכל סקר מופיע קישור לפרסום המקורי.
            </p>

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
                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3">
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
            {!activeLeague ? (
              <div className="rounded-2xl border border-blue-200 bg-white p-4 text-sm text-slate-600">
                בחרי או צרי קבוצה בפאנל שלמעלה כדי לראות את המשתתפים.
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-blue-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800">{activeLeague.name}</span>
                    <Users className="h-4 w-4 text-blue-700" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl bg-sky-50 p-2">
                      <div className="text-xl font-black text-blue-950">{participants.length}</div>
                      <div className="text-[10px] text-slate-500">משתתפים בקבוצה</div>
                    </div>
                    <div className="rounded-xl bg-cyan-50 p-2">
                      <div className="text-xl font-black text-cyan-900">{submittedCount}</div>
                      <div className="text-[10px] text-slate-500">כבר מילאו הצבעה</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800">מי בקבוצה</span>
                    <span className="text-[11px] text-slate-500">מוצג מי מילא הצבעה — לא מה הצביע</span>
                  </div>
                  {participantsLoading ? (
                    <p className="py-2 text-sm text-slate-500">טוען משתתפים...</p>
                  ) : participants.length === 0 ? (
                    <p className="py-2 text-sm text-slate-500">עדיין אין משתתפים בקבוצה.</p>
                  ) : (
                    <ul className="space-y-2">
                      {participants.map((participant, index) => (
                        <li
                          key={`${participant.nickname}-${index}`}
                          className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                            participant.is_me ? 'bg-blue-50 ring-1 ring-blue-100' : 'bg-slate-50'
                          }`}
                        >
                          <span className="font-medium text-slate-800">
                            {participant.nickname}
                            {participant.is_me && <span className="mr-1 text-[11px] text-blue-700"> (את/ה)</span>}
                          </span>
                          {participant.has_submitted ? (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <Check className="h-3.5 w-3.5" /> מילא/ה הצבעה
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] text-slate-400">
                              <Clock3 className="h-3.5 w-3.5" /> טרם מילא/ה
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                  {revealGroupBets ? (
                    <span className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-blue-700" />
                      ההצבעות נחשפו — תצוגת ההימורים המלאה של הקבוצה תתווסף כאן בשלב הבא.
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-slate-400" />
                      ההצבעות של כולם ייחשפו ב-27.10. עד אז רואים רק מי כבר מילא.
                    </span>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {activeTab === 'results' && (
          previewMode ? (
            <ResultsView result={mockFinalResult} entries={mockGroupBets} updatedAt={new Date()} isPreview />
          ) : (
            <section className="space-y-4 bg-sky-50 p-4">
              <div className="rounded-2xl border border-blue-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">תוצאות</span>
                  <Trophy className="h-4 w-4 text-blue-700" />
                </div>
                <p className="text-sm text-slate-600">
                  עם סיום ספירת הקולות יוצגו כאן התוצאות הסופיות, טבלת המובילים, חלוקת הגושים
                  והשוואת התחזיות של הקבוצה מול התוצאה האמיתית.
                </p>
              </div>
            </section>
          )
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

function PartyCard({ party, average, value, onChange }: { party: Party; average?: number; value: number; onChange: (name: string, nextValue: number) => void }) {
  const inputValue = Number.isFinite(value) ? value : 0;
  const displayAverage = typeof average === 'number' ? average.toFixed(1) : party.pollAverage.toFixed(1);

  return (
    <div className="rounded-2xl border border-blue-200 bg-white p-3 shadow-sm ring-1 ring-blue-50">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{party.name}</h3>
          <p className="text-[11px] text-slate-500">{party.leader}</p>
        </div>
        <div className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-800 ring-1 ring-blue-100">
          {displayAverage} מנדטים
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
          <p className="text-sm font-bold text-slate-800">{displayAverage}</p>
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
