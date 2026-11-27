import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, cx } from './ui';
import { useAlertText } from './HealthAlerts';
import { BackendError } from '@/lib/data/backend';
import type { DictKey } from '@/i18n/dict';
import type { MyCoach } from '@/types';
import type { CoachFlag } from '@/lib/calc/coach';
import { isValidInviteCode, normalizeInviteCode } from '@/lib/calc/coach';
import { formatDate } from '@/lib/calc/dates';

const PENDING_KEY = 'ntvn_pending_invite';
export function savePendingInvite(code: string | null) {
  const c = normalizeInviteCode(code ?? '');
  if (!isValidInviteCode(c)) return;
  try { localStorage.setItem(PENDING_KEY, c); } catch { /* ignore */ }
}
export function takePendingInvite(): string | null {
  try { const c = localStorage.getItem(PENDING_KEY); localStorage.removeItem(PENDING_KEY); return c; } catch { return null; }
}

/** Translate backend errors from PT-mode calls. */
export function useCoachError() {
  const { t } = useApp();
  return (e: unknown) => {
    if (e instanceof BackendError) {
      if (e.code === 'migration_needed') return t('coach_migration');
      if (e.code === 'invalid_code' || e.code === 'own_code' || e.code === 'already_linked') return t(`coach_err_${e.code}` as DictKey);
    }
    return (e as Error).message || t('error_generic');
  };
}

const LEVEL = {
  danger: { box: 'border-red-200 bg-red-50 text-red-800', icon: AlertOctagon },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle },
  info: { box: 'border-sky-200 bg-sky-50 text-sky-900', icon: Info },
} as const;

export function FlagList({ flags, compact, max }: { flags: CoachFlag[]; compact?: boolean; max?: number }) {
  const { t } = useApp();
  const alertText = useAlertText();
  if (!flags.length) return <p className="flex items-center gap-1.5 text-xs text-brand-700"><CheckCircle2 size={14} />{t('coach_all_good')}</p>;
  const shown = max ? flags.slice(0, max) : flags;
  return (
    <ul className={cx(compact ? 'space-y-1' : 'space-y-2')} data-testid="coach-flags">
      {shown.map((f) => {
        const st = LEVEL[f.level];
        const text = f.alert ? alertText(f.alert) : t(`coach_flag_${f.code}` as DictKey, f.vars);
        return (
          <li key={f.id} className={cx('flex items-start gap-2 rounded-lg border', compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm', st.box)} data-code={f.alert?.code ?? f.code}>
            <st.icon size={compact ? 13 : 16} className="mt-0.5 shrink-0" />
            <span className="min-w-0">{f.when === 'yesterday' && <b className="mr-1">{t('coach_yesterday')}:</b>}{text}</span>
          </li>
        );
      })}
      {max && flags.length > max && <li className="text-[11px] text-ink-400">+{flags.length - max}</li>}
    </ul>
  );
}

/** Client side: enter a PT's invite code, see who it belongs to and what is shared, then accept. */
export function JoinCoachForm({ initialCode, onJoined }: { initialCode?: string; onJoined: () => void }) {
  const { t, backend, toast } = useApp();
  const errText = useCoachError();
  const [code, setCode] = useState(normalizeInviteCode(initialCode ?? ''));
  const [coachName, setCoachName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (c: string) => {
    setErr(null); setCoachName(null);
    if (!isValidInviteCode(c)) { setErr(t('coach_err_invalid_code')); return; }
    setBusy(true);
    try {
      const name = await backend.lookupCoach(c);
      if (name) setCoachName(name); else setErr(t('coach_err_invalid_code'));
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  useEffect(() => { if (initialCode && isValidInviteCode(normalizeInviteCode(initialCode))) check(normalizeInviteCode(initialCode)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const join = async () => {
    setBusy(true); setErr(null);
    try { await backend.joinCoach(code); toast(t('my_coach_joined')); onJoined(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {!coachName && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); check(code); }}>
          <label className="block text-xs font-medium text-ink-600">{t('my_coach_code')}
            <input className="input mt-1 w-40 font-mono text-base uppercase tracking-[0.3em]" value={code} maxLength={6} autoComplete="off" autoCapitalize="characters"
              onChange={(e) => { setCode(normalizeInviteCode(e.target.value)); setErr(null); }} data-testid="invite-code-input" />
          </label>
          <button className="btn-primary" disabled={busy || code.length !== 6}>{t('my_coach_check')}</button>
        </form>
      )}
      {coachName && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4" data-testid="join-confirm">
          <p className="font-semibold text-brand-900">{t('my_coach_join_with', { name: coachName })}</p>
          <p className="mt-2 flex gap-2 text-xs leading-relaxed text-brand-900/80"><ShieldCheck size={16} className="mt-0.5 shrink-0" />{t('my_coach_shares')}</p>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={join}><UserCheck size={16} />{t('my_coach_join')}</button>
            <button className="btn-ghost" disabled={busy} onClick={() => { setCoachName(null); setCode(''); }}>{t('cancel')}</button>
          </div>
        </div>
      )}
      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</p>}
    </div>
  );
}

/** Settings card: the client's current PT, or a form to connect to one. Also links PTs to PT mode. */
export function MyCoachCard() {
  const { t, backend, lang, toast, coach } = useApp();
  const errText = useCoachError();
  const [mine, setMine] = useState<MyCoach | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const load = () => backend.getMyCoach().then((c) => { setMine(c); setErr(null); }).catch((e) => { setMine(null); setErr(errText(e)); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [backend]);

  const leave = async () => {
    if (!window.confirm(t('my_coach_leave_confirm'))) return;
    try { await backend.leaveCoach(); toast(t('my_coach_left')); load(); } catch (e) { toast(errText(e), 'error'); }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><UserCheck size={16} />{t('my_coach_title')}</span>}>
      <div data-testid="my-coach-card">
        {err ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{err}</p>
          : mine === undefined ? null
          : mine ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-700" data-testid="my-coach-linked">{t('my_coach_linked', { name: mine.display_name, date: formatDate(mine.linked_at.slice(0, 10), lang) })}</p>
              <button className="btn-secondary btn-sm text-red-600" onClick={leave}>{t('my_coach_leave')}</button>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-500">{t('my_coach_none')}</p>
              <JoinCoachForm onJoined={load} />
            </>
          )}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
          <div className="text-xs text-ink-500"><b className="block text-ink-700">{t('coach_are_you_pt')}</b>{t('coach_are_you_pt_desc')}</div>
          <Link to="/coach" className="btn-secondary btn-sm shrink-0"><Users size={14} />{coach ? t('nav_coach') : t('coach_open')}</Link>
        </div>
      </div>
    </Card>
  );
}
