import { useEffect, useState } from 'react';
import { Database, Globe, Activity, Clock, BellRing, Bell, Smartphone, Download, CheckCircle2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, PageHeader, SelectInput } from '@/components/ui';
import type { BmiStandard } from '@/types';
import type { DictKey } from '@/i18n/dict';
import { normalizeAlertPrefs, type AlertPrefs, type ReminderMeal } from '@/lib/calc/alerts';
import { BackendError } from '@/lib/data/backend';
import { useInstallState } from '@/components/PwaWidgets';
import { notificationSupport, promptInstall, requestNotificationPermission, showDeviceNotification, type NotifSupport } from '@/lib/pwa';

const TZS = ['Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'UTC'];

export default function Settings() {
  const { t, lang, setLang, settings, backend, setSettings, toast } = useApp();
  const save = async (patch: Parameters<typeof backend.saveSettings>[0]) => {
    try { setSettings(await backend.saveSettings(patch)); toast(t('saved')); return true; } catch (e) {
      toast(e instanceof BackendError && e.code === 'migration_needed' ? t('alerts_migration') : (e as Error).message, 'error');
      return false;
    }
  };
  return (
    <div>
      <PageHeader title={t('nav_settings')} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><Globe size={16} />{t('language')}</span>}>
          <SelectInput label={t('language')} value={lang} onChange={(e) => setLang(e.target.value as 'vi' | 'en')} options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]} />
        </Card>
        <Card title={<span className="flex items-center gap-2"><Activity size={16} />{t('bmi_standard')}</span>}>
          <SelectInput label={t('bmi_standard')} value={settings?.bmi_standard ?? 'who'} onChange={(e) => save({ bmi_standard: e.target.value as BmiStandard })}
            options={[{ value: 'who', label: t('bmi_std_who') }, { value: 'asian', label: t('bmi_std_asian') }]}
            hint="WHO: 18.5 / 25 / 30 · Asian: 18.5 / 23 / 25 / 30" />
        </Card>
        <Card title={<span className="flex items-center gap-2"><Clock size={16} />{t('timezone')}</span>}>
          <SelectInput label={t('timezone')} value={settings?.timezone ?? 'Asia/Ho_Chi_Minh'} onChange={(e) => save({ timezone: e.target.value })} options={TZS.map((z) => ({ value: z, label: z }))} />
        </Card>
        <Card title={<span className="flex items-center gap-2"><Database size={16} />{t('data_storage')}</span>}>
          <p className={`rounded-xl px-3 py-2 text-sm ${backend.mode === 'supabase' ? 'bg-brand-50 text-brand-800' : 'bg-amber-50 text-amber-800'}`}>
            {backend.mode === 'supabase' ? t('storage_supabase') : t('storage_demo')}
          </p>
        </Card>
        <AlertSettings save={save} />
        <div className="space-y-5">
          <NotificationSettings save={save} />
          <InstallCard />
        </div>
      </div>
    </div>
  );
}

type SaveFn = (patch: { alert_prefs: AlertPrefs }) => Promise<boolean>;

function Toggle({ checked, onChange, label, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span>{label}</span>
    </label>
  );
}

function AlertSettings({ save }: { save: SaveFn }) {
  const { t, settings } = useApp();
  const prefs = normalizeAlertPrefs(settings?.alert_prefs);
  const [draft, setDraft] = useState(prefs);
  const prefsKey = JSON.stringify(prefs);
  useEffect(() => { setDraft(normalizeAlertPrefs(settings?.alert_prefs)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsKey]);
  const dirty = JSON.stringify(normalizeAlertPrefs(draft)) !== prefsKey;
  const toggle = (k: 'nutrition' | 'body' | 'reminders') => (v: boolean) => save({ alert_prefs: { ...prefs, [k]: v } });
  const numField = (k: 'water_goal_ml' | 'water_interval_min' | 'inbody_interval_days', label: string, min: number, max: number, step = 1) => (
    <label className="block text-xs font-medium text-ink-600">{label}
      <input className="input mt-1 tabular" type="number" inputMode="numeric" min={min} max={max} step={step} value={draft[k]}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value === '' ? 0 : Number(e.target.value) })} />
    </label>
  );
  const timeField = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="block text-xs font-medium text-ink-600">{label}
      <input className="input mt-1 tabular" type="time" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
  return (
    <Card title={<span className="flex items-center gap-2"><BellRing size={16} />{t('alerts_settings')}</span>}>
      <Toggle checked={prefs.nutrition} onChange={toggle('nutrition')} label={t('alerts_nutrition_toggle')} testId="toggle-nutrition" />
      <Toggle checked={prefs.body} onChange={toggle('body')} label={t('alerts_body_toggle')} testId="toggle-body" />
      <Toggle checked={prefs.reminders} onChange={toggle('reminders')} label={t('alerts_reminders_toggle')} testId="toggle-reminders" />
      <form className="mt-3 space-y-3 border-t border-ink-100 pt-3" onSubmit={(e) => { e.preventDefault(); save({ alert_prefs: normalizeAlertPrefs(draft) }); }}>
        <div className="grid grid-cols-2 gap-3">
          {numField('water_goal_ml', t('water_goal'), 0, 6000, 50)}
          {numField('water_interval_min', t('water_interval'), 30, 360, 15)}
          {timeField(draft.water_start, (v) => setDraft({ ...draft, water_start: v }), t('water_from'))}
          {timeField(draft.water_end, (v) => setDraft({ ...draft, water_end: v }), t('water_to'))}
          {(['breakfast', 'lunch', 'dinner'] as ReminderMeal[]).map((m) => (
            <div key={m}>{timeField(draft.meal_times[m], (v) => setDraft({ ...draft, meal_times: { ...draft.meal_times, [m]: v } }), t('meal_remind_by', { meal: t(m as DictKey).toLowerCase() }))}</div>
          ))}
          {numField('inbody_interval_days', t('inbody_interval'), 7, 180)}
        </div>
        <button className="btn-primary btn-sm" disabled={!dirty}>{t('save')}</button>
      </form>
      <p className="mt-3 text-[11px] leading-snug text-ink-400">{t('alerts_disclaimer')}</p>
    </Card>
  );
}

function NotificationSettings({ save }: { save: SaveFn }) {
  const { t, settings, toast } = useApp();
  const prefs = normalizeAlertPrefs(settings?.alert_prefs);
  const [perm, setPerm] = useState<NotifSupport>(notificationSupport);
  const turn = async (on: boolean) => {
    if (on) {
      const p = perm === 'granted' ? perm : await requestNotificationPermission();
      setPerm(p);
      if (p !== 'granted') { toast(p === 'unsupported' ? t('notif_unsupported') : t('notif_denied'), 'error'); return; }
    }
    await save({ alert_prefs: { ...prefs, notifications: on } });
  };
  return (
    <Card title={<span className="flex items-center gap-2"><Bell size={16} />{t('notif_title')}</span>}>
      <Toggle checked={prefs.notifications && perm === 'granted'} onChange={turn} label={t('notif_toggle')} testId="toggle-notifications" />
      {perm === 'denied' && <p className="mt-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('notif_denied')}</p>}
      {perm === 'unsupported' && <p className="mt-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('notif_unsupported')}</p>}
      {perm === 'granted' && (
        <button className="btn-secondary btn-sm mt-2" onClick={async () => { if (!(await showDeviceNotification('NutriTrack VN', t('notif_test_body'), { tag: 'ntvn-test' }))) toast(t('error_generic'), 'error'); }}>
          {t('notif_test')}
        </button>
      )}
      <p className="mt-3 text-[11px] leading-snug text-ink-400">{t('notif_limits')}</p>
    </Card>
  );
}

function InstallCard() {
  const { t } = useApp();
  const { canPrompt, standalone, ios } = useInstallState();
  return (
    <Card title={<span className="flex items-center gap-2"><Smartphone size={16} />{t('install_title')}</span>}>
      {standalone ? <p className="flex items-center gap-2 text-sm text-brand-700"><CheckCircle2 size={16} />{t('install_done')}</p> : (
        <div className="space-y-2 text-sm text-ink-600">
          <p>{t('install_desc')}</p>
          {canPrompt && <button className="btn-primary" onClick={() => promptInstall()}><Download size={16} />{t('install_btn')}</button>}
          <p className="text-xs text-ink-500">{ios ? t('install_ios') : t('install_other')}</p>
        </div>
      )}
    </Card>
  );
}
