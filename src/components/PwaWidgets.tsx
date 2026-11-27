import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { normalizeAlertPrefs, computeAlerts, minutesInTz } from '@/lib/calc/alerts';
import { useAlertText } from './HealthAlerts';
import { useNow } from '@/lib/useNow';
import {
  applyUpdate, canPromptInstall, isIos, isStandalone, notificationSupport, promptInstall, showDeviceNotification, subscribeInstall, updateAvailable,
} from '@/lib/pwa';

export function useInstallState() {
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const standalone = useSyncExternalStore(subscribeInstall, isStandalone, () => false);
  const update = useSyncExternalStore(subscribeInstall, updateAvailable, () => false);
  return { canPrompt, standalone, update, ios: isIos() };
}

const DISMISS_KEY = 'ntvn_install_dismissed';
const DISMISS_DAYS = 14;

/** Small banner: "install the app" (when possible) and "new version available". */
export function PwaBanner() {
  const { t } = useApp();
  const { canPrompt, standalone, update, ios } = useInstallState();
  const [dismissed, setDismissed] = useState(() => {
    try { const v = Number(localStorage.getItem(DISMISS_KEY) || 0); return Date.now() - v < DISMISS_DAYS * 86400000; } catch { return false; }
  });
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ } };

  if (update) {
    return (
      <div className="flex items-center gap-3 border-b border-brand-200 bg-brand-50 px-4 py-2 text-xs text-brand-800" role="status">
        <RefreshCw size={14} className="shrink-0" /><span className="flex-1">{t('update_ready')}</span>
        <button className="btn-primary btn-sm" onClick={() => applyUpdate()}>{t('reload')}</button>
      </div>
    );
  }
  if (standalone || dismissed || !(canPrompt || ios)) return null;
  return (
    <div className="flex items-center gap-3 border-b border-brand-200 bg-brand-50 px-4 py-2 text-xs text-brand-800" role="status" data-testid="install-banner">
      <Download size={14} className="shrink-0" />
      <span className="flex-1">{ios && !canPrompt ? t('install_ios') : t('install_banner')}</span>
      {canPrompt && <button className="btn-primary btn-sm" onClick={() => promptInstall()}>{t('install_btn')}</button>}
      <button className="btn-ghost btn-sm" onClick={dismiss} aria-label={t('dismiss')}><X size={14} /></button>
    </div>
  );
}

const NOTIFIED_KEY = 'ntvn_notified_v1';
function loadNotified(date: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || 'null');
    if (v && v.date === date && Array.isArray(v.ids)) return new Set(v.ids);
  } catch { /* ignore */ }
  return new Set();
}
function saveNotified(date: string, ids: Set<string>) {
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify({ date, ids: [...ids] })); } catch { /* ignore */ }
}

/**
 * Turns due reminders (unlogged meals, water, InBody check-in) into device
 * notifications. Runs while the app is open or in the background; each
 * reminder is notified at most once per day (water: once per interval).
 */
export function ReminderNotifier() {
  const { backend, user, settings, today, tz, goalMacros, profile, t, dataVersion } = useApp();
  const prefs = normalizeAlertPrefs(settings?.alert_prefs);
  const enabled = !!user && prefs.notifications && prefs.reminders;
  const now = useNow(5 * 60_000);
  const text = useAlertText();
  const prefsKey = JSON.stringify(prefs);

  useEffect(() => {
    if (!enabled || notificationSupport() !== 'granted') return;
    let alive = true;
    (async () => {
      const [entries, measurements, water] = await Promise.all([
        backend.listDiary(today, today),
        backend.listMeasurements(),
        backend.listWater(today, today).catch(() => null),
      ]);
      if (!alive) return;
      const due = computeAlerts({
        date: today, today, nowMinutes: minutesInTz(new Date(), tz), entries, goals: goalMacros, measurements,
        bmiStandard: settings?.bmi_standard ?? 'who', fitnessGoal: profile?.fitness_goal ?? null,
        waterMl: water ? water.reduce((s, w) => s + w.amount_ml, 0) : null,
        prefs: { ...prefs, nutrition: false, body: false },
      });
      const sent = loadNotified(today);
      const fresh = due.filter((a) => !sent.has(a.id));
      if (!fresh.length) return;
      const title = fresh.length === 1 ? `NutriTrack VN · ${t('alert_group_reminder')}` : `NutriTrack VN · ${fresh.length} ${t('alert_group_reminder').toLowerCase()}`;
      const ok = await showDeviceNotification(title, fresh.map(text).join('\n'), { tag: 'ntvn-reminder', url: fresh[0].link });
      if (ok) { fresh.forEach((a) => sent.add(a.id)); saveNotified(today, sent); }
    })().catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, now, today, dataVersion, prefsKey]);

  return null;
}
