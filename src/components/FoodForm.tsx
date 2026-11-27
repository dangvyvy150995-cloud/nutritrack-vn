import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { NumberInput, Segmented, SelectInput, TextInput } from './ui';
import type { DictKey } from '@/i18n/dict';
import type { FoodItem, PreparationMethod, RawOrCooked, VerificationStatus } from '@/types';
import { atwaterCalories } from '@/lib/calc/nutrition';

const PREPS: PreparationMethod[] = ['raw', 'cooked', 'boiled', 'steamed', 'grilled', 'fried', 'roasted', 'stir_fried', 'braised', 'pan_seared', 'dried', 'processed', 'prepared', 'beverage', 'none'];
const ROCS: RawOrCooked[] = ['raw', 'cooked', 'dry', 'prepared', 'n/a'];

export type FoodDraft = Omit<FoodItem, 'created_at' | 'updated_at' | 'owner_id'>;

export function emptyFood(category: string): FoodDraft {
  return {
    food_id: '', food_name_vi: '', food_name_en: '', alternative_names: [], search_keywords: [], category, subcategory: null,
    calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, serving_size: 100, serving_unit: 'g',
    preparation_method: 'cooked', raw_or_cooked: 'cooked', edible_portion: 1, data_source: '', verification_status: 'USER-ENTERED', servings: [],
  };
}

export function servingsToText(f: Pick<FoodItem, 'servings'>) {
  return (f.servings ?? []).map((s) => `${s.label_vi}=${s.grams}`).join(' | ');
}

export function parseServings(text: string, foodId: string): FoodItem['servings'] {
  return text.split('|').map((p) => p.trim()).filter(Boolean).map((p, i) => {
    const [label, g] = p.split('=');
    return { id: `${foodId}--${i}`, food_id: foodId, label_vi: label.trim(), label_en: label.trim(), grams: Number(g), is_default: i === 0 };
  }).filter((s) => s.label_vi && s.grams > 0);
}

/** Returns a dictionary key describing the first problem, or null when the draft can be saved. */
export function validateFoodDraft(f: FoodDraft, admin: boolean): DictKey | null {
  if (!f.food_name_vi.trim()) return 'food_err_name';
  for (const v of [f.calories_kcal, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g]) if (!(v >= 0)) return 'food_err_nutrients';
  if (!(f.serving_size > 0)) return 'food_err_portion';
  if (f.calories_kcal > 950) return 'food_err_kcal';
  if (f.protein_g + f.carbs_g + f.fat_g > 100.5) return 'food_err_macros';
  if (admin && f.verification_status === 'VERIFIED' && !f.data_source.trim()) return 'need_source';
  return null;
}

/** Turns a database/network error into a message a user can act on. */
export function foodSaveErrorKey(message: string): DictKey | null {
  if (/macro_mass|protein_g|carbs_g|fat_g/.test(message)) return 'food_err_macros';
  if (/calories_kcal/.test(message)) return 'food_err_kcal';
  if (/food_name_vi/.test(message)) return 'food_err_name';
  if (/serving_size/.test(message)) return 'food_err_portion';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(message)) return 'food_err_network';
  return null;
}

type Basis = 'per100' | 'serving';
type Nutr = 'calories_kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g';
const NUTRS: Nutr[] = ['calories_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'];
const r2 = (v: number) => Math.round(v * 100) / 100;

export function FoodForm({ value, onChange, admin }: { value: FoodDraft; onChange: (f: FoodDraft) => void; admin?: boolean }) {
  const { t, categories, lang } = useApp();
  const [servingText, setServingText] = useState(servingsToText(value));
  // Nutrition is stored per 100 g/ml, but people often only know the numbers for a whole plate or a label serving.
  // In "serving" mode the inputs hold the per-serving numbers and the draft gets the per-100 equivalent.
  const [basis, setBasis] = useState<Basis>('per100');
  const [portion, setPortion] = useState<number | null>(value.serving_size);
  const [perServing, setPerServing] = useState<Record<Nutr, number>>(() => Object.fromEntries(NUTRS.map((k) => [k, r2((value[k] * value.serving_size) / 100)])) as Record<Nutr, number>);
  const set = <K extends keyof FoodDraft>(k: K, v: FoodDraft[K]) => onChange({ ...value, [k]: v });
  const fromServing = (vals: Record<Nutr, number>, g: number | null) => {
    const ok = g != null && g > 0;
    const per100 = ok ? Object.fromEntries(NUTRS.map((k) => [k, r2((vals[k] * 100) / g)])) : {};
    onChange({ ...value, ...per100, serving_size: ok ? g : 0 });
  };
  const setNutr = (k: Nutr, v: number) => {
    if (basis === 'per100') { set(k, v); return; }
    const next = { ...perServing, [k]: v };
    setPerServing(next); fromServing(next, portion);
  };
  const switchBasis = (b: Basis) => {
    if (b === basis) return;
    if (b === 'serving') {
      const g = value.serving_size > 0 ? value.serving_size : 100;
      const vals = Object.fromEntries(NUTRS.map((k) => [k, r2((value[k] * g) / 100)])) as Record<Nutr, number>;
      setPortion(g); setPerServing(vals); onChange({ ...value, serving_size: g });
    } else if (!(value.serving_size > 0)) {
      onChange({ ...value, serving_size: 100 });
    }
    setBasis(b);
  };
  const shown = (k: Nutr) => (basis === 'per100' ? value[k] : perServing[k]);
  const perLabel = basis === 'per100' ? `100${value.serving_unit}` : t('per_portion');
  const atw = atwaterCalories({ protein: value.protein_g, carbs: value.carbs_g, fat: value.fat_g });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextInput label={`${t('name_vi')} *`} value={value.food_name_vi} onChange={(e) => set('food_name_vi', e.target.value)} required maxLength={200} />
      <TextInput label={t('name_en')} value={value.food_name_en} onChange={(e) => set('food_name_en', e.target.value)} maxLength={200} />
      <div className="sm:col-span-2"><TextInput label={t('alt_names')} value={value.alternative_names.join(' | ')} onChange={(e) => set('alternative_names', e.target.value.split('|').map((s) => s.trim()).filter(Boolean))} /></div>
      <SelectInput label={t('category')} value={value.category} onChange={(e) => set('category', e.target.value)} options={categories.map((c) => ({ value: c.id, label: `${c.code}. ${lang === 'en' ? c.name_en : c.name_vi}` }))} />
      <TextInput label={t('subcategory')} value={value.subcategory ?? ''} onChange={(e) => set('subcategory', e.target.value || null)} />
      <SelectInput label={t('preparation')} value={value.preparation_method} onChange={(e) => set('preparation_method', e.target.value as PreparationMethod)} options={PREPS.map((p) => ({ value: p, label: t(`prep_${p}` as 'prep_raw') }))} />
      <SelectInput label={t('raw_or_cooked')} value={value.raw_or_cooked} onChange={(e) => set('raw_or_cooked', e.target.value as RawOrCooked)} options={ROCS.map((r) => ({ value: r, label: t(`roc_${r}` as 'roc_raw') }))} />
      <div className="sm:col-span-2">
        <div className="mb-1 text-sm font-medium text-ink-700">{t('nutrition_basis')}</div>
        <Segmented value={basis} onChange={switchBasis} options={[{ value: 'per100', label: t('basis_100') }, { value: 'serving', label: t('basis_serving') }]} />
        {basis === 'serving' && <p className="mt-1 text-[11px] text-ink-500">{t('basis_serving_hint')}</p>}
      </div>
      {basis === 'serving' && (
        <NumberInput label={`${t('portion_weight')} (${value.serving_unit}) *`} value={portion} min={1}
          onChange={(v) => { setPortion(v); fromServing(perServing, v); }} />
      )}
      <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-5">
        <NumberInput label={`kcal / ${perLabel}`} value={shown('calories_kcal')} onChange={(v) => setNutr('calories_kcal', v ?? 0)} min={0} max={basis === 'per100' ? 950 : undefined} />
        <NumberInput label={`${t('protein')} (g)`} value={shown('protein_g')} onChange={(v) => setNutr('protein_g', v ?? 0)} min={0} max={basis === 'per100' ? 100 : undefined} />
        <NumberInput label={`${t('carbs')} (g)`} value={shown('carbs_g')} onChange={(v) => setNutr('carbs_g', v ?? 0)} min={0} max={basis === 'per100' ? 100 : undefined} />
        <NumberInput label={`${t('fat')} (g)`} value={shown('fat_g')} onChange={(v) => setNutr('fat_g', v ?? 0)} min={0} max={basis === 'per100' ? 100 : undefined} />
        <NumberInput label={`${t('fiber')} (g)`} value={shown('fiber_g')} onChange={(v) => setNutr('fiber_g', v ?? 0)} min={0} max={basis === 'per100' ? 100 : undefined} />
      </div>
      {basis === 'serving' && portion != null && portion > 0 && (
        <p className="text-[11px] text-ink-500 sm:col-span-2" data-testid="per100-preview">
          {t('saved_as_per100', { unit: value.serving_unit, kcal: r2(value.calories_kcal), p: r2(value.protein_g), c: r2(value.carbs_g), f: r2(value.fat_g) })}
        </p>
      )}
      <p className="text-[11px] text-ink-400 sm:col-span-2">P×4 + C×4 + F×9 ≈ {Math.round(atw)} kcal {Math.abs(atw - value.calories_kcal) > Math.max(25, value.calories_kcal * 0.15) + value.fiber_g * 2 ? '⚠︎' : '✓'}</p>
      <SelectInput label={t('unit')} value={value.serving_unit} onChange={(e) => set('serving_unit', e.target.value as 'g' | 'ml')} options={[{ value: 'g', label: 'g (100 g)' }, { value: 'ml', label: 'ml (100 ml)' }]} />
      {basis === 'per100' && <NumberInput label={`${t('serving')} (${value.serving_unit})`} value={value.serving_size} onChange={(v) => set('serving_size', v ?? 100)} min={0.1} />}
      <NumberInput label={`${t('edible_portion')} (0–1)`} value={value.edible_portion} onChange={(v) => set('edible_portion', v ?? 1)} min={0.01} max={1} step="0.01" />
      <TextInput label={t('servings_edit')} value={servingText} placeholder="1 bát=150 | 1 đĩa=250"
        onChange={(e) => { setServingText(e.target.value); set('servings', parseServings(e.target.value, value.food_id || 'new')); }} />
      {admin && (
        <>
          <SelectInput label={t('verification')} value={value.verification_status} onChange={(e) => set('verification_status', e.target.value as VerificationStatus)}
            options={(['VERIFIED', 'ESTIMATED', 'USER-ENTERED'] as const).map((s) => ({ value: s, label: t(`status_${s}` as 'status_VERIFIED') }))}
            hint={value.verification_status === 'VERIFIED' ? t('need_source') : undefined} />
          <TextInput label={t('data_source')} value={value.data_source} onChange={(e) => set('data_source', e.target.value)} />
        </>
      )}
      {!admin && <div className="sm:col-span-2"><TextInput label={`${t('data_source')} (${t('optional')})`} value={value.data_source} onChange={(e) => set('data_source', e.target.value)} placeholder="Nhãn sản phẩm, tự cân đo…" /></div>}
    </div>
  );
}
