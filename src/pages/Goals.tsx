import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, fmt, NumberInput, PageHeader } from '@/components/ui';
import type { FitnessGoals } from '@/types';
import { ageOn } from '@/lib/calc/dates';
import { calorieFloor, bmrMifflin, macroCalorieGap, recommendTargets, weeklyChangeKg } from '@/lib/calc/energy';
import { atwaterCalories } from '@/lib/calc/nutrition';

type Form = Omit<FitnessGoals, 'user_id' | 'updated_at'>;

export default function Goals() {
  const { t, profile, goals, backend, setGoals, toast, today } = useApp();
  const rec = useMemo(() => {
    if (!profile?.gender || !profile.date_of_birth || !profile.height_cm || !profile.current_weight_kg) return null;
    return recommendTargets({ gender: profile.gender, weightKg: profile.current_weight_kg, heightCm: profile.height_cm, ageYears: ageOn(profile.date_of_birth, today), activity: profile.activity_level, goal: profile.fitness_goal });
  }, [profile, today]);
  const initial = (): Form => goals ? { ...goals } : {
    calories_kcal: rec?.targets.calories ?? 2000, protein_g: rec?.targets.protein ?? 100, carbs_g: rec?.targets.carbs ?? 250, fat_g: rec?.targets.fat ?? 60, fiber_g: rec?.targets.fiber ?? 28,
    target_weight_kg: profile?.target_weight_kg ?? null, target_body_fat_pct: profile?.target_body_fat_pct ?? null, target_smm_kg: profile?.target_smm_kg ?? null, step_goal: 8000, is_custom: false,
  };
  const [f, setF] = useState<Form>(initial);
  useEffect(() => { setF(initial()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [goals, rec]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v, is_custom: ['calories_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'].includes(k as string) ? true : f.is_custom });

  const gap = macroCalorieGap({ calories: f.calories_kcal, protein: f.protein_g, carbs: f.carbs_g, fat: f.fat_g, fiber: f.fiber_g });
  const floor = profile?.gender && rec ? calorieFloor(profile.gender, bmrMifflin(profile.gender, profile.current_weight_kg!, profile.height_cm!, ageOn(profile.date_of_birth!, today))) : 1200;
  const tooLow = f.calories_kcal < floor;
  const diff = rec ? f.calories_kcal - rec.tdee : null;

  const applyRec = () => { if (rec) setF({ ...f, calories_kcal: rec.targets.calories, protein_g: rec.targets.protein, carbs_g: rec.targets.carbs, fat_g: rec.targets.fat, fiber_g: rec.targets.fiber, is_custom: false }); };
  const rebalance = () => setF({ ...f, carbs_g: Math.max(0, Math.round((f.calories_kcal - f.protein_g * 4 - f.fat_g * 9) / 4)) });
  const save = async () => {
    if (!(f.calories_kcal >= 800 && f.calories_kcal <= 6000)) { toast(`${t('calorie_target')}: 800–6000`, 'error'); return; }
    try {
      setGoals(await backend.saveGoals(f));
      toast(t('saved'));
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <div>
      <PageHeader title={t('goals_title')} actions={<button className="btn-primary" onClick={save}>{t('save')}</button>} />
      <div className="mb-5 rounded-2xl border border-ink-200 bg-white p-4 text-xs text-ink-600">{t('goals_disclaimer')}</div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title={<span className="flex items-center gap-2"><Sparkles size={16} className="text-brand-500" />{t('recommended')}</span>}>
          {!rec ? <div className="text-sm text-ink-500">{t('profile_needed')} <Link to="/profile" className="text-brand-600 underline">{t('setup_profile_cta')}</Link></div> : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-500">{t('bmr')}</span><b className="tabular">{fmt(rec.bmr)} kcal</b></div>
              <div className="flex justify-between"><span className="text-ink-500">{t('tdee')}</span><b className="tabular">{fmt(rec.tdee)} kcal</b></div>
              <hr className="border-ink-100" />
              <div className="flex justify-between"><span className="text-ink-500">{t('calories')}</span><b className="tabular">{fmt(rec.targets.calories)} kcal</b></div>
              <div className="flex justify-between"><span className="text-ink-500">{t('protein')}</span><b className="tabular">{rec.targets.protein} g</b></div>
              <div className="flex justify-between"><span className="text-ink-500">{t('carbs')}</span><b className="tabular">{rec.targets.carbs} g</b></div>
              <div className="flex justify-between"><span className="text-ink-500">{t('fat')}</span><b className="tabular">{rec.targets.fat} g</b></div>
              <div className="flex justify-between"><span className="text-ink-500">{t('fiber')}</span><b className="tabular">{rec.targets.fiber} g</b></div>
              {rec.flooredAtSafeMinimum && <p className="text-[11px] text-amber-700">{t('floored')}</p>}
              <button className="btn-secondary btn-sm mt-2 w-full" onClick={applyRec}>{t('apply_recommended')}</button>
            </div>
          )}
        </Card>
        <Card title={t('calories')} className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <NumberInput label={t('calorie_target')} value={f.calories_kcal} onChange={(v) => set('calories_kcal', v ?? 0)} min={800} max={6000} step="10" />
            <NumberInput label={t('protein_target')} value={f.protein_g} onChange={(v) => set('protein_g', v ?? 0)} min={0} step="1" />
            <NumberInput label={t('carbs_target')} value={f.carbs_g} onChange={(v) => set('carbs_g', v ?? 0)} min={0} step="1" />
            <NumberInput label={t('fat_target')} value={f.fat_g} onChange={(v) => set('fat_g', v ?? 0)} min={0} step="1" />
            <NumberInput label={t('fiber_target')} value={f.fiber_g} onChange={(v) => set('fiber_g', v ?? 0)} min={0} step="1" />
          </div>
          <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs ${Math.abs(gap) > 25 ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-800'}`}>
            {Math.abs(gap) > 25 ? <>{t('macro_gap', { kcal: Math.round(atwaterCalories({ protein: f.protein_g, carbs: f.carbs_g, fat: f.fat_g })), gap: gap > 0 ? `+${gap}` : gap })}
              <button className="btn-secondary btn-sm" onClick={rebalance}>{t('rebalance')}</button></> : t('macro_ok')}
          </div>
          {diff != null && <p className="mt-2 text-[11px] text-ink-500">{t('deficit_note', { d: diff > 0 ? `+${diff}` : diff, w: fmt(weeklyChangeKg(diff), 2) })}</p>}
          {tooLow && <p className="mt-2 flex items-center gap-1.5 text-xs text-accent-600"><AlertTriangle size={14} />{t('too_low_warning', { min: floor })}</p>}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumberInput label={t('target_weight')} value={f.target_weight_kg} onChange={(v) => set('target_weight_kg', v)} min={20} max={350} step="0.1" />
            <NumberInput label={t('target_bf')} value={f.target_body_fat_pct} onChange={(v) => set('target_body_fat_pct', v)} min={2} max={75} step="0.1" />
            <NumberInput label={t('target_smm')} value={f.target_smm_kg} onChange={(v) => set('target_smm_kg', v)} min={5} max={150} step="0.1" />
            <NumberInput label={t('step_goal')} value={f.step_goal} onChange={(v) => set('step_goal', v)} min={0} max={100000} step="500" />
          </div>
        </Card>
      </div>
    </div>
  );
}
