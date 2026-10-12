'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { LogIn, LogOut, Plus, UserPlus, Users } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type League = {
  id: string;
  name: string;
  invite_code: string;
};

type AuthMode = 'sign-in' | 'sign-up';

export default function AccountLeaguePanel() {
  const [user, setUser] = useState<User | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [leagueName, setLeagueName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [notice, setNotice] = useState('');
  const [isError, setIsError] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [leagueRefresh, setLeagueRefresh] = useState(0);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let isActive = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!isActive) return;
      if (error) {
        setNotice(error.message);
        setIsError(true);
      }
      setUser(data.session?.user ?? null);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || !user) {
      setLeagues([]);
      setSelectedLeagueId('');
      return;
    }

    let isActive = true;
    void client
      .from('leagues')
      .select('id, name, invite_code')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!isActive) return;
        if (error) {
          setNotice(error.message);
          setIsError(true);
          return;
        }

        const rows = (data ?? []) as League[];
        setLeagues(rows);
        setSelectedLeagueId((currentId) =>
          rows.some((league) => league.id === currentId) ? currentId : rows[0]?.id ?? '',
        );
      });

    return () => {
      isActive = false;
    };
  }, [user, leagueRefresh]);

  const selectedLeague = leagues.find((league) => league.id === selectedLeagueId) ?? null;

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    if (!client) return;

    setIsBusy(true);
    setNotice('');
    setIsError(false);

    const result = authMode === 'sign-up'
      ? await client.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { nickname: nickname.trim() } },
        })
      : await client.auth.signInWithPassword({ email: email.trim(), password });

    setIsBusy(false);
    if (result.error) {
      showMessage(result.error.message, true);
      return;
    }

    if (authMode === 'sign-up' && !result.data.session) {
      showMessage('נשלח אליך קישור לאישור כתובת הדוא״ל. לאחר האישור אפשר להתחבר.');
    } else {
      showMessage(authMode === 'sign-up' ? 'נרשמת בהצלחה.' : 'התחברת בהצלחה.');
    }
  }

  async function handleSignOut() {
    const client = supabase;
    if (!client) return;

    setIsBusy(true);
    const { error } = await client.auth.signOut();
    setIsBusy(false);
    if (error) showMessage(error.message, true);
    else showMessage('התנתקת מהחשבון.');
  }

  async function handleCreateLeague(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    if (!client) return;

    setIsBusy(true);
    const { error } = await client.rpc('create_league', { p_name: leagueName.trim() });
    setIsBusy(false);
    if (error) {
      showMessage(error.message, true);
      return;
    }

    setLeagueName('');
    setLeagueRefresh((value) => value + 1);
    showMessage('הקבוצה נוצרה. אפשר לשתף את קוד ההזמנה עם חברים.');
  }

  async function handleJoinLeague(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    if (!client) return;

    setIsBusy(true);
    const { error } = await client.rpc('join_league_by_code', { p_invite_code: inviteCode.trim() });
    setIsBusy(false);
    if (error) {
      showMessage(error.message, true);
      return;
    }

    setInviteCode('');
    setLeagueRefresh((value) => value + 1);
    showMessage('הצטרפת לקבוצה.');
  }

  function showMessage(message: string, error = false) {
    setNotice(message);
    setIsError(error);
  }

  return (
    <section className="border-b border-blue-100 bg-sky-50 px-4 py-3" aria-label="חשבון וקבוצות">
      {!supabase ? (
        <p className="rounded-xl border border-blue-200 bg-white p-3 text-sm text-slate-600">
          יש להגדיר את פרטי Supabase בקובץ .env.local ולהפעיל מחדש את האפליקציה.
        </p>
      ) : !user ? (
        <div className="rounded-xl border border-blue-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              {authMode === 'sign-up' ? <UserPlus className="h-4 w-4 text-blue-700" /> : <LogIn className="h-4 w-4 text-blue-700" />}
              {authMode === 'sign-up' ? 'פתיחת חשבון' : 'כניסה לחשבון'}
            </div>
            <div className="flex rounded-lg bg-sky-50 p-1 text-xs" role="group" aria-label="מצב חשבון">
              <button
                type="button"
                onClick={() => { setAuthMode('sign-in'); setNotice(''); }}
                aria-pressed={authMode === 'sign-in'}
                className={`rounded-md px-2 py-1 ${authMode === 'sign-in' ? 'bg-blue-900 text-white' : 'text-blue-800'}`}
              >
                כניסה
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('sign-up'); setNotice(''); }}
                aria-pressed={authMode === 'sign-up'}
                className={`rounded-md px-2 py-1 ${authMode === 'sign-up' ? 'bg-blue-900 text-white' : 'text-blue-800'}`}
              >
                הרשמה
              </button>
            </div>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-2">
            {authMode === 'sign-up' && (
              <input
                required
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="שם שיוצג בקבוצה"
                aria-label="שם שיוצג בקבוצה"
                className="w-full rounded-lg border border-blue-200 px-3 py-2 text-right text-sm outline-none focus:border-blue-500"
              />
            )}
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="כתובת דוא״ל"
              aria-label="כתובת דוא״ל"
              dir="ltr"
              className="w-full rounded-lg border border-blue-200 px-3 py-2 text-left text-sm outline-none focus:border-blue-500"
            />
            <input
              required
              type="password"
              autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'}
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="סיסמה, לפחות 6 תווים"
              aria-label="סיסמה"
              dir="ltr"
              className="w-full rounded-lg border border-blue-200 px-3 py-2 text-left text-sm outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={isBusy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {authMode === 'sign-up' ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {isBusy ? 'רגע...' : authMode === 'sign-up' ? 'הרשמה' : 'כניסה'}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-blue-200 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">מחובר בתור</p>
              <p className="truncate text-sm font-semibold text-slate-800">
                {user.user_metadata.nickname || user.email}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isBusy}
              aria-label="התנתקות"
              title="התנתקות"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-blue-800 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          {leagues.length > 0 ? (
            <>
              <label className="block text-xs font-medium text-slate-600" htmlFor="active-league">הקבוצה שלי</label>
              <select
                id="active-league"
                value={selectedLeagueId}
                onChange={(event) => setSelectedLeagueId(event.target.value)}
                className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800"
              >
                {leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
              </select>
              {selectedLeague && (
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5 text-blue-700" />
                  קוד הזמנה: <strong dir="ltr" className="font-semibold text-blue-900">{selectedLeague.invite_code}</strong>
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-600">עדיין אין לך קבוצה. אפשר ליצור קבוצה או להצטרף עם קוד.</p>
          )}

          <details className="border-t border-slate-100 pt-2">
            <summary className="cursor-pointer text-sm font-semibold text-blue-900">יצירת קבוצה או הצטרפות</summary>
            <div className="mt-3 space-y-3">
              <form onSubmit={handleCreateLeague} className="flex gap-2">
                <input
                  required
                  minLength={2}
                  maxLength={50}
                  value={leagueName}
                  onChange={(event) => setLeagueName(event.target.value)}
                  placeholder="שם קבוצה חדשה"
                  aria-label="שם קבוצה חדשה"
                  className="min-w-0 flex-1 rounded-lg border border-blue-200 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={isBusy}
                  aria-label="יצירת קבוצה"
                  title="יצירת קבוצה"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-900 text-white disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </form>
              <form onSubmit={handleJoinLeague} className="flex gap-2">
                <input
                  required
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                  placeholder="קוד הזמנה"
                  aria-label="קוד הזמנה"
                  dir="ltr"
                  className="min-w-0 flex-1 rounded-lg border border-blue-200 px-3 py-2 text-left text-sm"
                />
                <button
                  type="submit"
                  disabled={isBusy}
                  className="flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Users className="h-4 w-4" />
                  הצטרפות
                </button>
              </form>
            </div>
          </details>
        </div>
      )}

      {notice && (
        <p role="status" className={`mt-2 text-xs ${isError ? 'text-red-700' : 'text-cyan-900'}`}>
          {notice}
        </p>
      )}
    </section>
  );
}
