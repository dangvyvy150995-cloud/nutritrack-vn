import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Scale, Activity, Dumbbell, Droplet, Flame, Beef, Wheat, Leaf, Plus, Ruler } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, DateNav, fmt, PageHeader, ProgressBar, StatCard, Spinner } from '@/components/ui';
import { FoodPicker, type PickedItem } from '@/components/FoodPicker';
import { MeasurementModal } from './Body';
import type { BodyMeasurement, DiaryEntry, MealType } from '@/types';
import { dailyTotals, remaining, totalsByMeal } from '@/lib/calc/nutrition';
import { bmiCategory } from '@/lib/calc/body';
import { formatDate } from '@/lib/calc/dates';

export default function Dashboard() {
  const { t, backend, today, goalMacros, profile, settings, lang, toast, dataVersion, bump } = useApp();
  const [date, setDate] = useState(today);
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [body, setBody] = useState<BodyMeasurement[]>([]);
  const [pick, setPick] = useState(false);
  const [measure, setMeasure] = useState(false);

  useEffect(() => {
    let alive = true;
    setEntries(null);
    Promise.all([backend.listDiary(date, date), backend.listMeasurements()])
      .then(([e, b]) => { if (alive) { setEntries(e); setBody(b); } })
      .catch((e) => toast(e.message, 'error'));
    return () => { alive = false; };
  }, [backend, date, dataVersion, toast]);

  const totals = useMemo(() => dailyTotals(entries ?? []), [entries]);
  const byMeal = useMemo(() => totalsByMeal(entries ?? []), [entries]);
  // latest measurement on or before the selected date
  const latest = useMemo(() => [...body].filter((b) => b.measured_on <= date).sort((a, b) => a.measured_on.localeCompare(b.measured_on)).pop() ?? null, [body, date]);
  const latestWith = (k: keyof BodyMeasurement) => [...body].filter((b) => b.measured_on <= date && b[k] != null).pop() ?? null;
  const smmRec = latestWith('smm_kg');
  const bfRec = latestWith('body_fat_pct');
  const std = settings?.bmi_standard ?? 'who';
  const cat = latest ? bmiCategory(latest.bmi, std) : null;
  const rem = goalMacros ? remaining(goalMacros, totals) : null;
  const profileIncomplete = !profile?.gender || !profile?.date_of_birth || !profile?.height_cm;

  const add = async (it: PickedItem) => {
    await backend.addDiaryEntries([{ entry_date: date, meal_type: it.meal, food_id: it.food_id, recipe_id: it.recipe_id, name_snapshot: it.name, grams: it.grams, serving_label: it.serving_label, serving_qty: it.serving_qty, per100: it.per100 }]);
    toast(t('saved')); setPick(false); bump();
  };

  const bmiLabel = cat ? (std === 'asian' && cat.category === 'overweight' ? t('bmi_asian_overweight') : t(`bmi_${cat.category}` as 'bmi_normal')) : null;
  const measuredSub = (rec: BodyMeasurement | null) => rec ? `${t('last_measured')} ${formatDate(rec.measured_on, lang)}` : t('no_measure_yet');

  return (
    <div>
      <PageHeader title={`${t('nav_dashboard')}${profile?.full_name ? ` · ${profile.full_name}` : ''}`} subtitle={formatDate(date, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={<>
          <DateNav value={date} onChange={setDate} />
          <button className="btn-primary" onClick={() => setPick(true)}><Plus size={16} />{t('quick_add_food')}</button>
          <button className="btn-secondary" onClick={() => setMeasure(true)}><Ruler size={16} />{t('quick_add_measure')}</button>
        </>} />

      {(profileIncomplete || !goalMacros) && (
        <div className="mb-5 flex flex-col gap-2 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{profileIncomplete ? t('setup_profile') : t('no_goals')}</span>
          <Link className="btn-primary btn-sm" to={profileIncomplete ? '/profile' : '/goals'}>{profileIncomplete ? t('setup_profile_cta') : t('set_goals')}</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<Scale size={16} />} label={t('current_weight')} value={latest ? fmt(latest.weight_kg, 1) : '—'} unit="kg" sub={measuredSub(latest)} />
        <StatCard icon={<Activity size={16} />} label={t('current_bmi')} value={latest ? fmt(latest.bmi, 1) : '—'} sub={latest ? `${bmiLabel} · ${t(std === 'asian' ? 'bmi_std_asian' : 'bmi_std_who')}` : t('no_measure_yet')} tone="ink" />
        <StatCard icon={<Dumbbell size={16} />} label={t('current_smm')} value={smmRec ? fmt(smmRec.smm_kg, 1) : '—'} unit="kg" sub={measuredSub(smmRec)} />
        <StatCard icon={<Droplet size={16} />} label={t('current_bf')} value={bfRec ? fmt(bfRec.body_fat_pct, 1) : '—'} unit="%" sub={measuredSub(bfRec)} tone="accent" />
        <StatCard icon={<Flame size={16} />} label={t('daily_intake')} value={fmt(totals.calories)} unit="kcal" sub={goalMacros ? `${t('target')} ${fmt(goalMacros.calories)} kcal` : t('no_goals')} tone="accent" />
        <StatCard icon={<Beef size={16} />} label={t('protein_intake')} value={fmt(totals.protein, 1)} unit="g" sub={goalMacros ? `${t('target')} ${fmt(goalMacros.protein)} g` : undefined} />
        <StatCard icon={<Flame size={16} />} label={t('remaining_kcal')} value={rem ? fmt(Math.abs(rem.calories)) : '—'} unit="kcal" sub={rem && rem.calories < 0 ? t('over') : rem ? t('remaining') : t('no_goals')} tone={rem && rem.calories < 0 ? 'accent' : 'brand'} />
        <StatCard icon={<Leaf size={16} />} label={t('fiber_intake')} value={fmt(totals.fiber, 1)} unit="g" sub={goalMacros ? `${t('target')} ${fmt(goalMacros.fiber)} g` : undefined} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card title={t('daily_progress')} className="lg:col-span-3">
          {entries == null ? <Spinner /> : (
            <div className="space-y-4">
              <ProgressBar label={<span className="flex items-center gap-1.5"><Flame size={14} className="text-accent-500" />{t('calories')}</span>} value={totals.calories} max={goalMacros?.calories ?? 0} unit="kcal" />
              <ProgressBar label={<span className="flex items-center gap-1.5"><Beef size={14} className="text-brand-500" />{t('protein')}</span>} value={totals.protein} max={goalMacros?.protein ?? 0} unit="g" />
              <ProgressBar label={<span className="flex items-center gap-1.5"><Wheat size={14} className="text-amber-500" />{t('carbs')}</span>} value={totals.carbs} max={goalMacros?.carbs ?? 0} unit="g" color="bg-amber-400" />
              <ProgressBar label={<span className="flex items-center gap-1.5"><Droplet size={14} className="text-ink-500" />{t('fat')}</span>} value={totals.fat} max={goalMacros?.fat ?? 0} unit="g" color="bg-ink-500" />
              <ProgressBar label={<span className="flex items-center gap-1.5"><Leaf size={14} className="text-emerald-500" />{t('fiber')}</span>} value={totals.fiber} max={goalMacros?.fiber ?? 0} unit="g" color="bg-emerald-500" overColor="bg-emerald-600" />
            </div>
          )}
        </Card>
        <Card title={t('meals_today')} className="lg:col-span-2" action={<Link to="/diary" className="text-xs font-medium text-brand-600">{t('nav_diary')} →</Link>}>
          <ul className="divide-y divide-ink-100">
            {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((m) => {
              const n = (entries ?? []).filter((e) => e.meal_type === m).length;
              return (
                <li key={m} className="flex items-center justify-between py-2.5">
                  <div><div className="text-sm font-medium">{t(m)}</div><div className="text-[11px] text-ink-400">{n ? `${n} món` : t('empty_meal')}</div></div>
                  <div className="text-right"><div className="tabular text-sm font-semibold">{fmt(byMeal[m].calories)} <span className="text-[11px] font-normal text-ink-400">kcal</span></div>
                    <div className="tabular text-[11px] text-ink-400">P {fmt(byMeal[m].protein, 1)} · C {fmt(byMeal[m].carbs, 1)} · F {fmt(byMeal[m].fat, 1)}</div></div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <FoodPicker open={pick} onClose={() => setPick(false)} onPick={add} defaultMeal={defaultMealNow()} />
      <MeasurementModal open={measure} onClose={() => setMeasure(false)} onSaved={() => { setMeasure(false); bump(); }} />
    </div>
  );
}

function defaultMealNow(): MealType {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()));
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}
