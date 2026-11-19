import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LineChart as LineIcon } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, Delta, EmptyState, fmt, PageHeader, RangeTabs, Segmented, Spinner } from '@/components/ui';
import { CalorieBars, MacroBars, PRIMARY, SECONDARY, SERIES, TrendLine, type Pt } from '@/components/charts/Charts';
import type { BodyMeasurement, DiaryEntry } from '@/types';
import { inRange, rangeStart, type RangeKey } from '@/lib/calc/dates';
import { bmiBands, trendOf, waistHipRatio } from '@/lib/calc/body';
import { totalsPerDay } from '@/lib/calc/reports';
import { round } from '@/lib/calc/nutrition';

export default function Progress() {
  const { t, backend, today, lang, settings, goalMacros, goals, profile, toast } = useApp();
  const [range, setRange] = useState<RangeKey>('30d');
  const [body, setBody] = useState<BodyMeasurement[] | null>(null);
  const [diary, setDiary] = useState<DiaryEntry[] | null>(null);
  const [bfMetric, setBfMetric] = useState<'pct' | 'kg'>('pct');
  const start = rangeStart(range, today);

  useEffect(() => { backend.listMeasurements().then(setBody).catch((e) => toast(e.message, 'error')); }, [backend, toast]);
  useEffect(() => { setDiary(null); backend.listDiary(start, today).then(setDiary).catch((e) => toast(e.message, 'error')); }, [backend, start, today, toast]);

  const m = useMemo(() => (body ?? []).filter((b) => inRange(b.measured_on, start, today)), [body, start, today]);
  const days = useMemo(() => totalsPerDay(diary ?? []).map((d) => ({ ...d, calories: Math.round(d.calories), protein: round(d.protein), carbs: round(d.carbs), fat: round(d.fat), fiber: round(d.fiber) })), [diary]);
  const std = settings?.bmi_standard ?? 'who';
  const wantsLoss = profile ? ['weight_loss', 'fat_loss'].includes(profile.fitness_goal) : undefined;

  const pts = (k: keyof BodyMeasurement): Pt[] => m.filter((x) => x[k] != null).map((x) => ({ date: x.measured_on, [k]: x[k] as number }));
  const change = (k: keyof BodyMeasurement) => {
    const p = m.filter((x) => x[k] != null);
    if (p.length < 2) return { total: null, last: null };
    return { total: round((p[p.length - 1][k] as number) - (p[0][k] as number), 1), last: round((p[p.length - 1][k] as number) - (p[p.length - 2][k] as number), 1) };
  };

  if (!body) return <Spinner />;
  const noBody = <EmptyState icon={<LineIcon />} title={t('empty_chart')} action={<Link to="/body" className="btn-primary btn-sm">{t('empty_chart_cta')}</Link>} />;
  const noFood = <EmptyState icon={<LineIcon />} title={t('empty_chart')} action={<Link to="/diary" className="btn-primary btn-sm">{t('empty_chart_cta')}</Link>} />;

  const ChangeRow = ({ k, unit, metric }: { k: keyof BodyMeasurement; unit: string; metric: 'weight' | 'bmi' | 'smm' | 'bodyFatPct' | 'bodyFatMass' | 'waist' }) => {
    const c = change(k);
    if (c.total == null) return <p className="mb-2 text-[11px] text-ink-400">{t('not_enough_points')}</p>;
    return (
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
        <span>{t('change_period')}: <Delta value={c.total} unit={unit} good={trendOf(metric, c.total, wantsLoss)} /></span>
        <span>{t('vs_previous')}: <Delta value={c.last} unit={unit} good={trendOf(metric, c.last, wantsLoss)} /></span>
      </div>
    );
  };

  const whr: Pt[] = m.filter((x) => waistHipRatio(x.waist_cm, x.hip_cm) != null).map((x) => ({ date: x.measured_on, whr: waistHipRatio(x.waist_cm, x.hip_cm) }));

  return (
    <div>
      <PageHeader title={t('nav_progress')} actions={<RangeTabs value={range} onChange={setRange} />} />
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title={t('chart_weight')}>
          {pts('weight_kg').length ? <><ChangeRow k="weight_kg" unit="kg" metric="weight" />
            <TrendLine data={pts('weight_kg')} series={[{ key: 'weight_kg', name: t('weight_kg'), color: PRIMARY }]} lang={lang} unit="kg"
              target={goals?.target_weight_kg ? { value: goals.target_weight_kg, label: `${t('target')} ${goals.target_weight_kg}` } : null} /></> : noBody}
        </ChartCard>

        <ChartCard title={t('chart_bmi')} sub={`${t('bmi_standard')}: ${t(std === 'asian' ? 'bmi_std_asian' : 'bmi_std_who')}`}>
          {pts('bmi').length ? <><ChangeRow k="bmi" unit="" metric="bmi" />
            <TrendLine data={pts('bmi')} series={[{ key: 'bmi', name: 'BMI', color: PRIMARY }]} lang={lang} bands={bmiBands(std)}
              domain={[(min: number) => Math.floor(Math.min(min, 18) - 1), (max: number) => Math.ceil(Math.max(max, 26) + 1)] as unknown as [number, number]} />
            <BmiLegend /></> : noBody}
        </ChartCard>

        <ChartCard title={t('chart_smm')}>
          {pts('smm_kg').length ? <><ChangeRow k="smm_kg" unit="kg" metric="smm" />
            <TrendLine data={pts('smm_kg')} series={[{ key: 'smm_kg', name: 'SMM', color: PRIMARY }]} lang={lang} unit="kg"
              target={goals?.target_smm_kg ? { value: goals.target_smm_kg, label: `${t('target')} ${goals.target_smm_kg}` } : null} /></> : noBody}
        </ChartCard>

        <ChartCard title={t('chart_bf')} action={<Segmented value={bfMetric} onChange={setBfMetric} options={[{ value: 'pct', label: '%' }, { value: 'kg', label: 'kg' }]} />}>
          {bfMetric === 'pct' ? (pts('body_fat_pct').length ? <><ChangeRow k="body_fat_pct" unit="%" metric="bodyFatPct" />
            <TrendLine data={pts('body_fat_pct')} series={[{ key: 'body_fat_pct', name: t('bf_pct'), color: SERIES.fat }]} lang={lang} unit="%"
              target={goals?.target_body_fat_pct ? { value: goals.target_body_fat_pct, label: `${t('target')} ${goals.target_body_fat_pct}%` } : null} /></> : noBody)
            : (pts('body_fat_mass_kg').length ? <><ChangeRow k="body_fat_mass_kg" unit="kg" metric="bodyFatMass" />
              <TrendLine data={pts('body_fat_mass_kg')} series={[{ key: 'body_fat_mass_kg', name: t('bfm_kg'), color: SERIES.fat }]} lang={lang} unit="kg" /></> : noBody)}
        </ChartCard>

        <ChartCard title={t('chart_kcal')} wide>
          {diary == null ? <Spinner /> : days.length ? <CalorieBars data={days} lang={lang} target={goalMacros?.calories ?? null}
            names={{ consumed: t('consumed'), target: t('target'), surplus: t('surplus'), deficit: t('deficit') }} /> : noFood}
        </ChartCard>

        <ChartCard title={t('chart_macros')} wide>
          {diary == null ? <Spinner /> : days.length ? <MacroBars data={days} lang={lang} names={{ protein: t('protein'), carbs: t('carbs'), fat: t('fat'), fiber: t('fiber') }} /> : noFood}
        </ChartCard>

        <ChartCard title={t('chart_circ')}>
          {m.some((x) => x.waist_cm != null || x.hip_cm != null) ? <><ChangeRow k="waist_cm" unit="cm" metric="waist" />
            <TrendLine data={m.filter((x) => x.waist_cm != null || x.hip_cm != null).map((x) => ({ date: x.measured_on, waist: x.waist_cm, hip: x.hip_cm }))}
              series={[{ key: 'waist', name: t('waist_cm'), color: PRIMARY }, { key: 'hip', name: t('hip_cm'), color: SECONDARY }]} lang={lang} unit="cm" /></> : noBody}
        </ChartCard>

        <ChartCard title={t('whr')}>
          {whr.length ? <TrendLine data={whr} series={[{ key: 'whr', name: t('whr'), color: SERIES.fiber }]} lang={lang} height={200} /> : noBody}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, sub, action, children, wide }: { title: string; sub?: string; action?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <Card title={<span>{title}{sub && <span className="block text-[11px] font-normal text-ink-400">{sub}</span>}</span>} action={action} className={wide ? 'lg:col-span-2' : ''}>
      {children}
    </Card>
  );
}

function BmiLegend() {
  const { t, settings } = useApp();
  const std = settings?.bmi_standard ?? 'who';
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-500">
      {bmiBands(std).map((b) => (
        <span key={b.category} className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: b.color }} />
          {std === 'asian' && b.category === 'overweight' ? t('bmi_asian_overweight') : t(`bmi_${b.category}` as 'bmi_normal')} ({b.min === 0 ? '<' + b.max : b.max >= 100 ? '≥' + b.min : `${b.min}–${fmt(b.max - 0.1, 1)}`})</span>
      ))}
    </div>
  );
}
