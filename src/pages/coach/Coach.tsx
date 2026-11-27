import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Copy, KeyRound, Link2, RefreshCw, Users, UserPlus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, cx, EmptyState, fmt, PageHeader, ProgressBar, Spinner } from '@/components/ui';
import { FlagList, useCoachError } from '@/components/CoachWidgets';
import type { ClientBundle, CoachClientLink } from '@/types';
import { COACH_LOOKBACK_DAYS, sortClients, summarizeClient, type ClientSummary } from '@/lib/calc/coach';
import { minutesInTz } from '@/lib/calc/alerts';
import { addDays, dateInTz, DEFAULT_TZ, formatDate } from '@/lib/calc/dates';
import { bmiCategory } from '@/lib/calc/body';
import { useNow } from '@/lib/useNow';

export const inviteLink = (code: string) => `${window.location.origin}/join?code=${code}`;

export function clientToday(b: ClientBundle, now: Date) {
  const tz = b.settings?.timezone || DEFAULT_TZ;
  return { today: dateInTz(now, tz), nowMinutes: minutesInTz(now, tz) };
}

export default function Coach() {
  const { t, coach } = useApp();
  return (
    <div>
      <PageHeader title={t('coach_title')} />
      {coach ? <CoachHome /> : <EnableCoach />}
    </div>
  );
}

function EnableCoach() {
  const { t, backend, profile, setCoach, toast } = useApp();
  const errText = useCoachError();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [busy, setBusy] = useState(false);
  const enable = async () => {
    setBusy(true);
    try { setCoach(await backend.becomeCoach(name.trim())); toast(t('saved')); } catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Card className="max-w-xl">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><Users size={20} /></span>
        <p className="text-sm leading-relaxed text-ink-600">{t('coach_intro')}</p>
      </div>
      <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) enable(); }}>
        <label className="block min-w-0 flex-1 text-xs font-medium text-ink-600">{t('coach_display_name')}
          <input className="input mt-1" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-testid="coach-name" />
        </label>
        <button className="btn-primary" disabled={busy || !name.trim()}>{t('coach_enable')}</button>
      </form>
    </Card>
  );
}

function InviteCard() {
  const { t, backend, coach, setCoach, toast } = useApp();
  const errText = useCoachError();
  if (!coach) return null;
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast(t('coach_copied')); } catch { window.prompt(t('coach_copy_link'), text); }
  };
  const regenerate = async () => {
    if (!window.confirm(t('coach_regenerate_confirm'))) return;
    try { setCoach(await backend.regenerateInviteCode()); } catch (e) { toast(errText(e), 'error'); }
  };
  const stop = async () => {
    if (!window.confirm(t('coach_stop_confirm'))) return;
    try { await backend.stopCoaching(); setCoach(null); } catch (e) { toast(errText(e), 'error'); }
  };
  return (
    <Card title={<span className="flex items-center gap-2"><KeyRound size={16} />{t('coach_invite_title')}</span>}
      action={<button className="text-xs font-medium text-ink-400 hover:text-red-600" onClick={stop}>{t('coach_stop')}</button>}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-xl bg-ink-900 px-4 py-2 font-mono text-2xl font-semibold tracking-[0.35em] text-white" data-testid="invite-code">{coach.invite_code}</span>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={() => copy(coach.invite_code)}><Copy size={14} />{t('coach_copy_code')}</button>
          <button className="btn-secondary btn-sm" onClick={() => copy(inviteLink(coach.invite_code))}><Link2 size={14} />{t('coach_copy_link')}</button>
          <button className="btn-ghost btn-sm" onClick={regenerate}><RefreshCw size={14} />{t('coach_regenerate')}</button>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-500">{t('coach_invite_help')}</p>
      <p className="mt-1 break-all font-mono text-[11px] text-ink-400">{inviteLink(coach.invite_code)}</p>
    </Card>
  );
}

interface Row { link: CoachClientLink; bundle: ClientBundle | null; summary: ClientSummary | null; name: string }

function CoachHome() {
  const { t, backend } = useApp();
  const errText = useCoachError();
  const now = useNow(60_000);
  const [links, setLinks] = useState<CoachClientLink[] | null>(null);
  const [bundles, setBundles] = useState<ClientBundle[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const l = await backend.coachListClients();
      // Window wide enough for every timezone's "today" plus the inactivity lookback.
      const end = addDays(dateInTz(new Date(), 'UTC'), 1);
      const b = l.length ? await backend.coachGetClients(l.map((x) => x.client_id), addDays(end, -(COACH_LOOKBACK_DAYS + 2)), end) : [];
      setLinks(l); setBundles(b);
    } catch (e) { setErr(errText(e)); setLinks([]); } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);
  useEffect(() => { load(); }, [load]);

  const rows: Row[] = useMemo(() => {
    const out = (links ?? []).map((link) => {
      const bundle = bundles.find((b) => b.profile.id === link.client_id) ?? null;
      let summary: ClientSummary | null = null;
      if (bundle) { const c = clientToday(bundle, now); summary = summarizeClient(bundle, c.today, c.nowMinutes); }
      return { link, bundle, summary, name: bundle?.profile.full_name || link.full_name || link.email };
    });
    const withS = sortClients(out.filter((r): r is Row & { summary: ClientSummary } => r.summary != null));
    return [...withS, ...out.filter((r) => r.summary == null)];
  }, [links, bundles, now]);
  const attention = rows.filter((r) => r.summary && (r.summary.level === 'danger' || r.summary.level === 'warning')).length;

  return (
    <div className="space-y-5">
      <InviteCard />
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t('coach_clients', { n: links?.length ?? 0 })}
          {attention > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{t('coach_need_attention', { n: attention })}</span>}
        </h2>
        <button className="btn-ghost btn-sm" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{t('coach_refresh')}</button>
      </div>
      {err && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</p>}
      {links == null ? <Spinner /> : rows.length === 0 ? (
        <Card><EmptyState icon={<UserPlus />} title={t('coach_no_clients')} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="client-list">
          {rows.map((r) => <ClientCard key={r.link.client_id} row={r} />)}
        </div>
      )}
    </div>
  );
}

const STRIPE = { danger: 'border-l-red-500', warning: 'border-l-amber-400', info: 'border-l-sky-400', ok: 'border-l-brand-500' } as const;

function ClientCard({ row }: { row: Row }) {
  const { t, lang } = useApp();
  const s = row.summary;
  const b = row.bundle;
  const std = b?.settings?.bmi_standard ?? 'who';
  const cat = s?.latest ? bmiCategory(s.latest.bmi, std) : null;
  return (
    <Link to={`/coach/clients/${row.link.client_id}`} className={cx('card block border-l-4 p-4 transition hover:shadow-md', STRIPE[s?.level ?? 'ok'])} data-testid="client-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink-900">{row.name}</div>
          <div className="truncate text-[11px] text-ink-400">{row.link.email}</div>
        </div>
        <ChevronRight size={16} className="mt-1 shrink-0 text-ink-300" />
      </div>
      {s && (
        <>
          <div className="mt-3 space-y-2">
            <ProgressBar compact label={t('calories')} value={s.totals.calories} max={s.goals?.calories ?? 0} unit="kcal" />
            <ProgressBar compact label={t('protein')} value={s.totals.protein} max={s.goals?.protein ?? 0} unit="g" />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-500">
            <span className={s.entriesToday ? 'text-brand-700' : 'text-amber-700'}>{s.entriesToday ? t('coach_meals_today', { n: s.mealsToday }) : t('coach_not_logged_today')}</span>
            {!s.entriesToday && s.lastLogDate && <span>{t('coach_last_log', { date: formatDate(s.lastLogDate, lang) })}</span>}
            {s.latest && <span>{fmt(s.latest.weight_kg, 1)} kg · BMI {fmt(s.latest.bmi, 1)}{cat ? ` (${std === 'asian' && cat.category === 'overweight' ? t('bmi_asian_overweight') : t(`bmi_${cat.category}` as 'bmi_normal')})` : ''}</span>}
          </div>
          <div className="mt-3"><FlagList flags={s.flags} compact max={3} /></div>
        </>
      )}
    </Link>
  );
}
