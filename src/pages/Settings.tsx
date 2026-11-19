import { Database, Globe, Activity, Clock } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, PageHeader, SelectInput } from '@/components/ui';
import type { BmiStandard } from '@/types';

const TZS = ['Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'UTC'];

export default function Settings() {
  const { t, lang, setLang, settings, backend, setSettings, toast } = useApp();
  const save = async (patch: Parameters<typeof backend.saveSettings>[0]) => {
    try { setSettings(await backend.saveSettings(patch)); toast(t('saved')); } catch (e) { toast((e as Error).message, 'error'); }
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
      </div>
    </div>
  );
}
