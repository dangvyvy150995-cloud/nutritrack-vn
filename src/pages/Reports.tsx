import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, Delta, fmt, PageHeader, ProgressBar, Segmented, Spinner } from '@/components/ui';
import type { BodyMeasurement, DiaryEntry } from '@/types';
import { addDays, eachDay, formatDate, inRange } from '@/lib/calc/dates';
import { bodyChange, nutritionReport, targetProgressPct, totalsPerDay } from '@/lib/calc/reports';
import { entryMacros, round } from '@/lib/calc/nutrition';
import { trendOf } from '@/lib/calc/body';
import { downloadText, toCsv } from '@/lib/calc/csv';

type Preset = 'week' | 'month' | 'custom';

function weekStart(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sunday
  return addDays(iso, -((dow + 6) % 7)); // Monday
}

export default function Reports() {
  const { t, backend, today, lang, goalMacros, goals, profile, toast } = useApp();
  const [preset, setPreset] = useState<Preset>('week');
  const [custom, setCustom] = useState({ start: addDays(today, -29), end: today });
  const [diary, setDiary] = useState<DiaryEntry[] | null>(null);
  const [body, setBody] = useState<BodyMeasurement[]>([]);

  const { start, end } = preset === 'week' ? { start: weekStart(today), end: today } : preset === 'month' ? { start: today.slice(0, 8) + '01', end: today } : custom;

  useEffect(() => {
    setDiary(null);
    Promise.all([backend.listDiary(start, end), backend.listMeasurements()]).then(([d, b]) => { setDiary(d); setBody(b); }).catch((e) => toast(e.message, 'error'));
  }, [backend, start, end, toast]);

  const days = useMemo(() => totalsPerDay(diary ?? []), [diary]);
  const target = goalMacros ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const rep = nutritionReport(days, target);
  const inR = body.filter((b) => inRange(b.measured_on, start, end));
  const bc = bodyChange(inR);
  const wantsLoss = profile ? ['weight_loss', 'fat_loss'].includes(profile.fitness_goal) : undefined;
  const allDays = eachDay(start, end).length;
  const firstAll = body[0];
  const lastAll = body[body.length - 1];
  const wProg = firstAll && lastAll ? targetProgressPct(firstAll.weight_kg, lastAll.weight_kg, goals?.target_weight_kg ?? null) : null;

  const exportDiary = () => downloadText(`nutritrack-diary_${start}_${end}.csv`, toCsv((diary ?? []).map((e) => {
    const m = entryMacros(e);
    return { date: e.entry_date, meal: e.meal_type, food: e.name_snapshot, grams: e.grams, serving: e.serving_label ?? '', serving_qty: e.serving_qty ?? '',
      kcal: round(m.calories, 0), protein_g: round(m.protein), carbs_g: round(m.carbs), fat_g: round(m.fat), fiber_g: round(m.fiber) };
  }).sort((a, b) => a.date.localeCompare(b.date))));
  const exportBody = () => downloadText(`nutritrack-body_${start}_${end}.csv`, toCsv(inR.map((b) => ({ date: b.measured_on, weight_kg: b.weight_kg, height_cm: b.height_cm, bmi: b.bmi,
    smm_kg: b.smm_kg, body_fat_mass_kg: b.body_fat_mass_kg, body_fat_pct: b.body_fat_pct, waist_cm: b.waist_cm, hip_cm: b.hip_cm, visceral_fat_level: b.visceral_fat_level,
    total_body_water_l: b.total_body_water_l, device_bmr_kcal: b.device_bmr_kcal, device: b.device, notes: b.notes }))));
  const exportSummary = () => downloadText(`nutritrack-summary_${start}_${end}.csv`, toCsv(days.map((d) => ({ date: d.date, kcal: round(d.calories, 0), protein_g: round(d.protein), carbs_g: round(d.carbs), fat_g: round(d.fat), fiber_g: round(d.fiber),
    kcal_target: target.calories || '', protein_target: target.protein || '' }))));

  return (
    <div>
      <PageHeader title={t('reports_title')} subtitle={`${formatDate(start, lang)} – ${formatDate(end, lang)}`}
        actions={<Segmented value={preset} onChange={setPreset} options={[{ value: 'week', label: t('this_week') }, { value: 'month', label: t('this_month') }, { value: 'custom', label: t('custom_range') }]} />} />
      {preset === 'custom' && (
        <div className="card mb-4 flex flex-wrap gap-3 p-4">
          <div><label className="label" htmlFor="rs">{t('from')}</label><input id="rs" type="date" className="input" value={custom.start} max={custom.end} onChange={(e) => setCustom({ ...custom, start: e.target.value })} /></div>
          <div><label className="label" htmlFor="re">{t('to')}</label><input id="re" type="date" className="input" value={custom.end} min={custom.start} onChange={(e) => setCustom({ ...custom, end: e.target.value })} /></div>
        </div>
      )}
      {diary == null ? <Spinner /> : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title={t('avg_daily')}>
            <p className="mb-3 text-xs text-ink-500">{t('logged_days')}: <b className="tabular text-ink-800">{rep.loggedDays}</b> / {allDays}</p>
            <div className="space-y-3">
              {([['calories', 'kcal', 0], ['protein', 'g', 1], ['carbs', 'g', 1], ['fat', 'g', 1], ['fiber', 'g', 1]] as const).map(([k, u]) => (
                <ProgressBar key={k} label={t(k)} value={rep.average[k]} max={target[k]} unit={u} />
              ))}
            </div>
          </Card>
          <Card title={t('goal_completion')}>
            <div className="flex items-baseline gap-2"><span className="tabular text-4xl font-semibold text-brand-600">{goalMacros ? `${rep.goalCompletionPct}%` : '—'}</span>
              <span className="text-xs text-ink-500">{rep.goalDaysMet}/{rep.loggedDays} {t('days')}</span></div>
            <p className="mt-2 text-[11px] text-ink-400">{t('goal_completion_hint')}</p>
            {wProg != null && <div className="mt-4"><ProgressBar label={`${t('target_weight')}: ${goals?.target_weight_kg}`} value={wProg} max={100} unit="%" /></div>}
          </Card>
          <Card title={t('body_changes')} className="lg:col-span-2">
            {!bc ? <p className="text-sm text-ink-400">{t('not_enough_points')}</p> : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {([['weight', t('weight_kg'), bc.diff.weight, 'kg'], ['bmi', 'BMI', bc.diff.bmi, ''], ['smm', 'SMM', bc.diff.smm, 'kg'], ['bodyFatMass', t('bfm_kg'), bc.diff.bodyFatMass, 'kg'],
                  ['bodyFatPct', t('bf_pct'), bc.diff.bodyFatPct, '%'], ['waist', t('waist_cm'), bc.diff.waist, 'cm']] as const).map(([k, l, v, u]) => (
                  <div key={k} className="rounded-xl bg-ink-50 p-3"><div className="text-[11px] text-ink-500">{l}</div><div className="mt-1"><Delta value={v} unit={u} good={trendOf(k, v, wantsLoss)} /></div></div>
                ))}
                <p className="col-span-full text-[11px] text-ink-400">{formatDate(bc.first.measured_on, lang)} → {formatDate(bc.last.measured_on, lang)}</p>
              </div>
            )}
          </Card>
          <Card title={t('export_csv')} className="lg:col-span-2">
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={exportDiary} disabled={!diary.length}><Download size={16} />{t('export_diary')}</button>
              <button className="btn-secondary" onClick={exportSummary} disabled={!days.length}><Download size={16} />{t('export_summary')}</button>
              <button className="btn-secondary" onClick={exportBody} disabled={!inR.length}><Download size={16} />{t('export_body')}</button>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">{fmt(diary.length)} entries · {fmt(inR.length)} measurements</p>
          </Card>
        </div>
      )}
    </div>
  );
}
