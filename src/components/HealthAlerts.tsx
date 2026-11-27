import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, BellRing, CheckCircle2, ChevronRight, Droplets, Info, Undo2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, cx, fmt } from './ui';
import type { DictKey } from '@/i18n/dict';
import type { WaterLog } from '@/types';
import { normalizeAlertPrefs, type AlertPrefs, type HealthAlert } from '@/lib/calc/alerts';

export function useAlertPrefs(): AlertPrefs {
  const { settings } = useApp();
  return normalizeAlertPrefs(settings?.alert_prefs);
}

/** Localised text for an alert. Meal names in vars are translated too. */
export function useAlertText() {
  const { t, lang } = useApp();
  return (a: HealthAlert) => {
    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(a.vars)) {
      if (k === 'meal') vars[k] = lang === 'vi' ? t(v as DictKey).toLowerCase() : t(v as DictKey);
      else vars[k] = typeof v === 'number' ? fmt(v, Number.isInteger(v) ? 0 : 1) : v;
    }
    let s = t(`alert_${a.code}` as DictKey, vars);
    if (a.code === 'meal_missing' && lang === 'en') s = s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  };
}

const LEVEL_STYLE = {
  danger: { box: 'border-red-200 bg-red-50 text-red-800', icon: AlertOctagon },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle },
  info: { box: 'border-sky-200 bg-sky-50 text-sky-900', icon: Info },
} as const;

export function AlertsCard({ alerts, className }: { alerts: HealthAlert[] | null; className?: string }) {
  const { t } = useApp();
  const prefs = useAlertPrefs();
  const text = useAlertText();
  const allOff = !prefs.nutrition && !prefs.body && !prefs.reminders;
  return (
    <Card className={className}
      title={<span className="flex items-center gap-2"><BellRing size={16} className="text-accent-500" />{t('alerts_title')}{alerts && alerts.length > 0 && <span className="rounded-full bg-accent-500 px-1.5 text-[10px] font-semibold text-white">{alerts.length}</span>}</span>}
      action={<Link to="/settings" className="text-xs font-medium text-brand-600">{t('nav_settings')} →</Link>}>
      {allOff ? <p className="text-sm text-ink-500">{t('alerts_off')}</p>
        : alerts == null ? null
        : alerts.length === 0 ? <p className="flex items-center gap-2 text-sm text-brand-700"><CheckCircle2 size={16} />{t('alerts_none')}</p>
        : (
          <ul className="space-y-2" data-testid="alerts-list">
            {alerts.map((a) => {
              const st = LEVEL_STYLE[a.level];
              return (
                <li key={a.id}>
                  <Link to={a.link} className={cx('flex items-start gap-2.5 rounded-xl border px-3 py-2 text-sm transition hover:brightness-95', st.box)} data-code={a.code}>
                    <st.icon size={16} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">{t(`alert_group_${a.group}` as DictKey)}</span>
                      {text(a)}
                    </span>
                    <ChevronRight size={14} className="mt-1 shrink-0 opacity-50" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      <p className="mt-3 text-[11px] leading-snug text-ink-400">{t('alerts_disclaimer')}</p>
    </Card>
  );
}

export function WaterCard({ date, logs, unavailable, onChanged, className }: {
  date: string; logs: WaterLog[] | null; unavailable: boolean; onChanged: () => void; className?: string;
}) {
  const { t, backend, toast } = useApp();
  const prefs = useAlertPrefs();
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const total = (logs ?? []).reduce((s, w) => s + w.amount_ml, 0);
  const goal = prefs.water_goal_ml;
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); onChanged(); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const add = (ml: number) => run(() => backend.addWater(date, ml));
  const last = logs && logs.length ? logs[logs.length - 1] : null;

  return (
    <Card className={className} title={<span className="flex items-center gap-2"><Droplets size={16} className="text-sky-500" />{t('water_title')}</span>}>
      {unavailable ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('alerts_migration')}</p> : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="tabular text-2xl font-semibold" data-testid="water-total">{fmt(total)}</span>
            <span className="text-xs text-ink-500">ml {goal > 0 && t('water_of_goal', { goal: fmt(goal) })}</span>
          </div>
          {goal > 0 && <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} /></div>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {[150, 250, 500].map((ml) => (
              <button key={ml} className="btn-secondary btn-sm" disabled={busy || logs == null} onClick={() => add(ml)}>+{ml} ml</button>
            ))}
            <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const v = Number(custom); if (v > 0 && v <= 5000) { add(v); setCustom(''); } }}>
              <input className="input w-20 py-1 text-xs" type="number" inputMode="numeric" min={1} max={5000} placeholder="ml" aria-label={t('water_custom')} value={custom} onChange={(e) => setCustom(e.target.value)} />
              <button className="btn-secondary btn-sm" disabled={busy || !custom}>+</button>
            </form>
            {last && <button className="btn-ghost btn-sm ml-auto" disabled={busy} onClick={() => run(() => backend.deleteWater(last.id))} title={t('water_undo')} aria-label={t('water_undo')}><Undo2 size={14} /></button>}
          </div>
        </>
      )}
    </Card>
  );
}
