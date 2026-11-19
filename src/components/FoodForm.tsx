import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { NumberInput, SelectInput, TextInput } from './ui';
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

export function validateFoodDraft(f: FoodDraft, admin: boolean): string | null {
  if (!f.food_name_vi.trim()) return 'food_name_vi';
  for (const v of [f.calories_kcal, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g]) if (!(v >= 0)) return 'nutrients';
  if (f.calories_kcal > 950) return 'calories_kcal > 950';
  if (f.protein_g + f.carbs_g + f.fat_g > 100.5) return 'protein + carbs + fat > 100 g';
  if (admin && f.verification_status === 'VERIFIED' && !f.data_source.trim()) return 'data_source';
  return null;
}

export function FoodForm({ value, onChange, admin }: { value: FoodDraft; onChange: (f: FoodDraft) => void; admin?: boolean }) {
  const { t, categories, lang } = useApp();
  const [servingText, setServingText] = useState(servingsToText(value));
  const set = <K extends keyof FoodDraft>(k: K, v: FoodDraft[K]) => onChange({ ...value, [k]: v });
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
      <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-5">
        <NumberInput label={`kcal / 100${value.serving_unit}`} value={value.calories_kcal} onChange={(v) => set('calories_kcal', v ?? 0)} min={0} max={950} />
        <NumberInput label={`${t('protein')} (g)`} value={value.protein_g} onChange={(v) => set('protein_g', v ?? 0)} min={0} max={100} />
        <NumberInput label={`${t('carbs')} (g)`} value={value.carbs_g} onChange={(v) => set('carbs_g', v ?? 0)} min={0} max={100} />
        <NumberInput label={`${t('fat')} (g)`} value={value.fat_g} onChange={(v) => set('fat_g', v ?? 0)} min={0} max={100} />
        <NumberInput label={`${t('fiber')} (g)`} value={value.fiber_g} onChange={(v) => set('fiber_g', v ?? 0)} min={0} max={100} />
      </div>
      <p className="text-[11px] text-ink-400 sm:col-span-2">P×4 + C×4 + F×9 ≈ {Math.round(atw)} kcal {Math.abs(atw - value.calories_kcal) > Math.max(25, value.calories_kcal * 0.15) + value.fiber_g * 2 ? '⚠︎' : '✓'}</p>
      <SelectInput label={t('unit')} value={value.serving_unit} onChange={(e) => set('serving_unit', e.target.value as 'g' | 'ml')} options={[{ value: 'g', label: 'g (100 g)' }, { value: 'ml', label: 'ml (100 ml)' }]} />
      <NumberInput label={`${t('serving')} (${value.serving_unit})`} value={value.serving_size} onChange={(v) => set('serving_size', v ?? 100)} min={0.1} />
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
