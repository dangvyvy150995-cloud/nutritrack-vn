import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, Beef, Droplet, Dumbbell, Eye, Flame, Leaf, LineChart as LineIcon, Scale, UserMinus, Wheat } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, DateNav, EmptyState, fmt, PageHeader, ProgressBar, RangeTabs, Spinner, StatCard } from '@/components/ui';
import { FlagList, useCoachError } from '@/components/CoachWidgets';
import { CalorieBars, PRIMARY, SERIES, TrendLine, type Pt } from '@/components/charts/Charts';
import type { BodyMeasurement, ClientBundle, CoachClientLink, MealType } from '@/types';
import type { DictKey } from '@/i18n/dict';
import { goalsToMacros, summarizeClient } from '@/lib/calc/coach';
import { dailyTotals, entryMacros, totalsByMeal } from '@/lib/calc/nutrition';
import { totalsPerDay } from '@/lib/calc/reports';
import { bmiBands, bmiCategory } from '@/lib/calc/body';
import { ageOn, formatDate, inRange, rangeStart, type RangeKey } from '@/lib/calc/dates';
import { useNow } from '@/lib/useNow';
import { clientToday } from './Coach';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function ClientDetail() {
  const { id = '' } = useParams();
  const { t, backend, lang, toast } = useApp();
  const errText = useCoachError();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const [link, setLink] = useState<CoachClientLink | null | undefined>(undefined);
  const [bundle, setBundle] = useState<ClientBundle | null>(null);
  const [range, setRange] = useState<RangeKey>('30d');
  const [date, setDate] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // The client's "today" depends on the client's timezone, known after the first load.
  const today = bundle ? clientToday(bundle, now).today : null;
  const day = date ?? today;

  const load = useCallback(async (start: string, end: string) => {
    try {
      const links = await backend.coachListClients();
      const l = links.find((x) => x.client_id === id) ?? null;
      setLink(l);
      if (!l) return;
      const [b] = await backend.coachGetClients([id], start, end);
      setBundle(b ?? null);
      if (!b) setLink(null);
    } catch (e) { setErr(errText(e)); setLink(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, id]);

  // Load a window that covers the chart range and the selected day.
  const anchor = today ?? new Date().toISOString().slice(0, 10);
  const rs = rangeStart(range, anchor) ?? '2000-01-01';
  const start = day && day < rs ? day : rs;
  const end = day && day > anchor ? day : anchor;
  useEffect(() => { load(start, end); }, [load, start, end]);

  const remove = async () => {
    const name = bundle?.profile.full_name || link?.email || '';
    if (!window.confirm(t('coach_remove_confirm', { name }))) return;
    try { await backend.coachRemoveClient(id); toast(t('coach_removed')); navigate('/coach'); } catch (e) { toast(errText(e), 'error'); }
  };

  if (err) return <Card><p className="text-sm text-amber-800">{err}</p></Card>;
  if (link === undefined || (link && !bundle)) return <Spinner />;
  if (!link || !bundle || !today || !day) {
    return <Card><EmptyState icon={<UserMinus />} title={t('coach_client_not_found')} action={<Link to="/coach" className="btn-primary btn-sm">{t('coach_back')}</Link>} /></Card>;
  }
  return <Detail bundle={bundle} link={link} today={today} day={day} setDate={setDate} range={range} setRange={setRange} onRemove={remove} lang={lang} />;
}

function Detail({ bundle, link, today, day, setDate, range, setRange, onRemove, lang }: {
  bundle: ClientBundle; link: CoachClientLink; today: string; day: string; setDate: (d: string) => void;
  range: RangeKey; setRange: (r: RangeKey) => void; onRemove: () => void; lang: 'vi' | 'en';
}) {
  const { t } = useApp();
  const now = useNow(60_000);
  const p = bundle.profile;
  const std = bundle.settings?.bmi_standard ?? 'who';
  const goals = goalsToMacros(bundle.goals);
  const summary = useMemo(() => summarizeClient(bundle, today, clientToday(bundle, now).nowMinutes), [bundle, today, now]);
  const dayEntries = useMemo(() => bundle.diary.filter((e) => e.entry_date === day), [bundle, day]);
  const totals = useMemo(() => dailyTotals(dayEntries), [dayEntries]);
  const byMeal = useMemo(() => totalsByMeal(dayEntries), [dayEntries]);
  const rs = rangeStart(range, today);
  const ms = useMemo(() => bundle.measurements.filter((m) => inRange(m.measured_on, rs, today)), [bundle, rs, today]);
  const days = useMemo(() => totalsPerDay(bundle.diary.filter((e) => inRange(e.entry_date, rs, today))).map((d) => ({ ...d, calories: Math.round(d.calories) })), [bundle, rs, today]);
  const latestWith = (k: keyof BodyMeasurement) => [...bundle.measurements].filter((m) => m.measured_on <= today && m[k] != null).pop() ?? null;
  const latest = latestWith('weight_kg');
  const smm = latestWith('smm_kg');
  const bf = latestWith('body_fat_pct');
  const cat = latest ? bmiCategory(latest.bmi, std) : null;
  const bmiLabel = (c: typeof cat) => c ? (std === 'asian' && c.category === 'overweight' ? t('bmi_asian_overweight') : t(`bmi_${c.category}` as 'bmi_normal')) : '';
  const pts = (k: keyof BodyMeasurement): Pt[] => ms.filter((x) => x[k] != null).map((x) => ({ date: x.measured_on, [k]: x[k] as number }));
  const noData = <EmptyState icon={<LineIcon />} title={t('empty_chart')} />;
  const measuredSub = (m: BodyMeasurement | null) => (m ? `${t('last_measured')} ${formatDate(m.measured_on, lang)}` : t('no_measure_yet'));

  const chips: string[] = [];
  if (p.gender) chips.push(t(p.gender));
  if (p.date_of_birth) chips.push(t('coach_age', { n: ageOn(p.date_of_birth, today) }));
  if (p.height_cm) chips.push(`${fmt(p.height_cm, 1)} cm`);
  chips.push(`${t('coach_profile_goal')}: ${t(`goal_${p.fitness_goal}` as DictKey)}`);
  chips.push(`${t('bmi_standard')}: ${t(std === 'asian' ? 'bmi_std_asian' : 'bmi_std_who')}`);

  return (
    <div data-testid="client-detail">
      <Link to="/coach" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600"><ArrowLeft size={14} />{t('coach_back')}</Link>
      <PageHeader title={p.full_name || p.email} subtitle={<span>{p.email} · {t('coach_linked_since', { date: formatDate(link.linked_at.slice(0, 10), lang) })}</span>}
        actions={<button className="btn-ghost btn-sm text-red-600" onClick={onRemove}><UserMinus size={14} />{t('coach_remove')}</button>} />
      <p className="mb-4 flex items-center gap-2 rounded-xl bg-ink-100 px-3 py-2 text-xs text-ink-600"><Eye size={14} />{t('coach_readonly')}</p>
      <div className="mb-5 flex flex-wrap gap-1.5">{chips.map((c) => <span key={c} className="chip bg-white text-ink-600 ring-1 ring-ink-100">{c}</span>)}</div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<Scale size={16} />} label={t('current_weight')} value={latest ? fmt(latest.weight_kg, 1) : '—'} unit="kg" sub={measuredSub(latest)} />
        <StatCard icon={<Activity size={16} />} label={t('current_bmi')} value={latest ? fmt(latest.bmi, 1) : '—'} sub={latest ? bmiLabel(cat) : t('no_measure_yet')} tone="ink" />
        <StatCard icon={<Dumbbell size={16} />} label={t('current_smm')} value={smm ? fmt(smm.smm_kg, 1) : '—'} unit="kg" sub={measuredSub(smm)} />
        <StatCard icon={<Droplet size={16} />} label={t('current_bf')} value={bf ? fmt(bf.body_fat_pct, 1) : '—'} unit="%" sub={measuredSub(bf)} tone="accent" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card title={t('coach_flags_title')} className="lg:col-span-3"><FlagList flags={summary.flags} /><p className="mt-3 text-[11px] text-ink-400">{t('alerts_disclaimer')}</p></Card>
        <Card title={t('coach_goals_title')} className="lg:col-span-2">
          {goals ? (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {([['calories', 'kcal'], ['protein', 'g'], ['carbs', 'g'], ['fat', 'g'], ['fiber', 'g']] as const).map(([k, u]) => (
                <div key={k} className="rounded-lg bg-ink-50 px-3 py-2"><dt className="text-[11px] text-ink-500">{t(k)}</dt><dd className="tabular font-semibold">{fmt(goals[k])} <span className="text-[11px] font-normal text-ink-400">{u}</span></dd></div>
              ))}
              {bundle.goals?.target_weight_kg != null && <div className="rounded-lg bg-ink-50 px-3 py-2"><dt className="text-[11px] text-ink-500">{t('target_weight')}</dt><dd className="tabular font-semibold">{fmt(bundle.goals.target_weight_kg, 1)} <span className="text-[11px] font-normal text-ink-400">kg</span></dd></div>}
            </dl>
          ) : <p className="text-sm text-ink-500">{t('coach_flag_no_goals')}</p>}
        </Card>
      </div>

      <Card className="mt-5" title={t('coach_diary_day')} action={<DateNav value={day} onChange={setDate} />}>
        <p className="-mt-1 mb-3 text-xs text-ink-500">{formatDate(day, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            <ProgressBar label={<span className="flex items-center gap-1.5"><Flame size={14} className="text-accent-500" />{t('calories')}</span>} value={totals.calories} max={goals?.calories ?? 0} unit="kcal" />
            <ProgressBar label={<span className="flex items-center gap-1.5"><Beef size={14} className="text-brand-500" />{t('protein')}</span>} value={totals.protein} max={goals?.protein ?? 0} unit="g" />
            <ProgressBar label={<span className="flex items-center gap-1.5"><Wheat size={14} className="text-amber-500" />{t('carbs')}</span>} value={totals.carbs} max={goals?.carbs ?? 0} unit="g" color="bg-amber-400" />
            <ProgressBar label={<span className="flex items-center gap-1.5"><Droplet size={14} className="text-ink-500" />{t('fat')}</span>} value={totals.fat} max={goals?.fat ?? 0} unit="g" color="bg-ink-500" />
            <ProgressBar label={<span className="flex items-center gap-1.5"><Leaf size={14} className="text-emerald-500" />{t('fiber')}</span>} value={totals.fiber} max={goals?.fiber ?? 0} unit="g" color="bg-emerald-500" overColor="bg-emerald-600" />
          </div>
          <div className="lg:col-span-3" data-testid="client-diary">
            {dayEntries.length === 0 ? <p className="py-6 text-center text-sm text-ink-400">{t('coach_no_entries')}</p> : MEALS.map((m) => {
              const list = dayEntries.filter((e) => e.meal_type === m);
              if (!list.length) return null;
              return (
                <div key={m} className="mb-3">
                  <div className="mb-1 flex items-baseline justify-between text-sm"><b>{t(m)}</b><span className="tabular text-xs text-ink-500">{fmt(byMeal[m].calories)} kcal · P {fmt(byMeal[m].protein, 1)} g</span></div>
                  <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                    {list.map((e) => { const mm = entryMacros(e); return (
                      <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0"><span className="block truncate">{e.name_snapshot}</span><span className="text-[11px] text-ink-400">{e.serving_label && e.serving_qty ? `${fmt(e.serving_qty, 2)} × ${e.serving_label} · ` : ''}{fmt(e.grams)} g</span></span>
                        <span className="shrink-0 text-right tabular text-xs"><b>{fmt(mm.calories)}</b> kcal<span className="block text-[11px] text-ink-400">P {fmt(mm.protein, 1)} · C {fmt(mm.carbs, 1)} · F {fmt(mm.fat, 1)}</span></span>
                      </li>
                    ); })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="mb-3 mt-6 flex justify-end"><RangeTabs value={range} onChange={setRange} /></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title={t('chart_weight')}>
          {pts('weight_kg').length ? <TrendLine data={pts('weight_kg')} series={[{ key: 'weight_kg', name: t('weight_kg'), color: PRIMARY }]} lang={lang} unit="kg"
            target={bundle.goals?.target_weight_kg ? { value: bundle.goals.target_weight_kg, label: `${t('target')} ${bundle.goals.target_weight_kg}` } : null} /> : noData}
        </ChartCard>
        <ChartCard title={t('chart_bmi')}>
          {pts('bmi').length ? <TrendLine data={pts('bmi')} series={[{ key: 'bmi', name: 'BMI', color: PRIMARY }]} lang={lang} bands={bmiBands(std)}
            domain={[(min: number) => Math.floor(Math.min(min, 18) - 1), (max: number) => Math.ceil(Math.max(max, 26) + 1)] as unknown as [number, number]} /> : noData}
        </ChartCard>
        <ChartCard title={t('chart_bf')}>
          {pts('body_fat_pct').length ? <TrendLine data={pts('body_fat_pct')} series={[{ key: 'body_fat_pct', name: t('bf_pct'), color: SERIES.fat }]} lang={lang} unit="%" /> : noData}
        </ChartCard>
        <ChartCard title={t('chart_smm')}>
          {pts('smm_kg').length ? <TrendLine data={pts('smm_kg')} series={[{ key: 'smm_kg', name: 'SMM', color: PRIMARY }]} lang={lang} unit="kg" /> : noData}
        </ChartCard>
        <ChartCard title={t('coach_kcal_range')} wide>
          {days.length ? <CalorieBars data={days} lang={lang} target={goals?.calories ?? null}
            names={{ consumed: t('consumed'), target: t('target'), surplus: t('surplus'), deficit: t('deficit') }} /> : noData}
        </ChartCard>
      </div>

      <Card className="mt-5" title={t('coach_measurements')} padded={false}>
        {bundle.measurements.length === 0 ? <p className="p-5 text-sm text-ink-400">{t('no_measurements')}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="client-measurements">
              <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                <tr>{[t('measured_on'), t('weight_kg'), 'BMI', t('smm_kg'), t('bf_pct'), t('bfm_kg'), t('visceral'), t('waist_cm'), t('device')].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink-100 tabular">
                {[...bundle.measurements].reverse().map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(m.measured_on, lang)}</td>
                    <td className="px-3 py-2">{fmt(m.weight_kg, 1)}</td>
                    <td className="px-3 py-2">{fmt(m.bmi, 1)} <span className="text-[11px] text-ink-400">{bmiLabel(bmiCategory(m.bmi, std))}</span></td>
                    <td className="px-3 py-2">{fmt(m.smm_kg, 1)}</td>
                    <td className="px-3 py-2">{fmt(m.body_fat_pct, 1)}</td>
                    <td className="px-3 py-2">{fmt(m.body_fat_mass_kg, 1)}</td>
                    <td className="px-3 py-2">{fmt(m.visceral_fat_level, 0)}</td>
                    <td className="px-3 py-2">{fmt(m.waist_cm, 1)}</td>
                    <td className="px-3 py-2 text-xs text-ink-500">{m.device ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ChartCard({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return <Card title={title} className={wide ? 'lg:col-span-2' : ''}>{children}</Card>;
}
