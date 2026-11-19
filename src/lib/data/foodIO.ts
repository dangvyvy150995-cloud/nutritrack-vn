import type { FoodItem, PreparationMethod, RawOrCooked, VerificationStatus } from '@/types';

/** Import/export schema for the food database (CSV and JSON share these fields). */
export const FOOD_CSV_COLUMNS = [
  'food_id', 'food_name_vi', 'food_name_en', 'alternative_names', 'search_keywords', 'category', 'subcategory',
  'calories_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'serving_size', 'serving_unit',
  'preparation_method', 'raw_or_cooked', 'edible_portion', 'data_source', 'verification_status', 'servings',
];

export function foodToCsvRow(f: FoodItem): Record<string, unknown> {
  return {
    ...f,
    alternative_names: f.alternative_names.join('|'),
    search_keywords: f.search_keywords.join('|'),
    servings: (f.servings ?? []).map((s) => `${s.label_vi}=${s.grams}`).join('|'),
  };
}

const PREPS: PreparationMethod[] = ['raw', 'cooked', 'boiled', 'steamed', 'grilled', 'fried', 'roasted', 'stir_fried', 'braised', 'pan_seared', 'dried', 'processed', 'prepared', 'beverage', 'none'];
const ROC: RawOrCooked[] = ['raw', 'cooked', 'dry', 'prepared', 'n/a'];
const STATUS: VerificationStatus[] = ['VERIFIED', 'ESTIMATED', 'USER-ENTERED'];

export interface ImportResult { valid: FoodItem[]; errors: { row: number; message: string }[] }

const num = (v: unknown) => (v === '' || v == null ? NaN : Number(v));
const list = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : String(v ?? '').split('|').map((s) => s.trim()).filter(Boolean);

/**
 * Validate raw rows from CSV or JSON. Rows marked VERIFIED without a data
 * source are rejected; rows without a status default to ESTIMATED.
 */
export function validateFoodRows(rows: Record<string, unknown>[], categories: string[]): ImportResult {
  const valid: FoodItem[] = [];
  const errors: { row: number; message: string }[] = [];
  const now = new Date().toISOString();
  rows.forEach((r, i) => {
    const row = i + 1;
    const err = (m: string) => errors.push({ row, message: m });
    const name = String(r.food_name_vi ?? '').trim();
    if (!name) return err('food_name_vi is required');
    const category = String(r.category ?? '').trim();
    if (!categories.includes(category)) return err(`unknown category "${category}"`);
    const n = { kcal: num(r.calories_kcal), p: num(r.protein_g), c: num(r.carbs_g), f: num(r.fat_g), fib: r.fiber_g === '' || r.fiber_g == null ? 0 : num(r.fiber_g) };
    if (Object.values(n).some((v) => !Number.isFinite(v) || v < 0)) return err('nutrient values must be non-negative numbers');
    if (n.kcal > 950) return err('calories_kcal per 100 g cannot exceed 950');
    if (n.p + n.c + n.f > 100.5) return err('protein + carbs + fat exceed 100 g per 100 g');
    const status = (String(r.verification_status ?? '').trim().toUpperCase() || 'ESTIMATED') as VerificationStatus;
    if (!STATUS.includes(status)) return err(`invalid verification_status "${status}"`);
    const source = String(r.data_source ?? '').trim();
    if (status === 'VERIFIED' && !source) return err('VERIFIED records must name an identifiable data_source');
    const prep = (String(r.preparation_method ?? 'none').trim() || 'none') as PreparationMethod;
    if (!PREPS.includes(prep)) return err(`invalid preparation_method "${prep}"`);
    const roc = (String(r.raw_or_cooked ?? 'n/a').trim() || 'n/a') as RawOrCooked;
    if (!ROC.includes(roc)) return err(`invalid raw_or_cooked "${roc}"`);
    const unit = String(r.serving_unit ?? 'g').trim() === 'ml' ? 'ml' : 'g';
    const servingSize = Number.isFinite(num(r.serving_size)) && num(r.serving_size) > 0 ? num(r.serving_size) : 100;
    const edible = Number.isFinite(num(r.edible_portion)) && num(r.edible_portion) > 0 && num(r.edible_portion) <= 1 ? num(r.edible_portion) : 1;
    const id = String(r.food_id ?? '').trim() || `imp-${Date.now().toString(36)}-${row}`;
    let servings: FoodItem['servings'];
    if (Array.isArray(r.servings)) {
      servings = (r.servings as { label_vi: string; label_en?: string; grams: number; is_default?: boolean }[])
        .filter((s) => s && s.label_vi && Number(s.grams) > 0)
        .map((s, k) => ({ id: `${id}--${k}`, food_id: id, label_vi: s.label_vi, label_en: s.label_en ?? s.label_vi, grams: Number(s.grams), is_default: !!s.is_default }));
    } else if (typeof r.servings === 'string' && r.servings.trim()) {
      servings = r.servings.split('|').map((part, k) => {
        const [label, g] = part.split('=');
        return { id: `${id}--${k}`, food_id: id, label_vi: label.trim(), label_en: label.trim(), grams: Number(g), is_default: k === 0 };
      }).filter((s) => s.label_vi && s.grams > 0);
    }
    valid.push({
      food_id: id, food_name_vi: name, food_name_en: String(r.food_name_en ?? '').trim(),
      alternative_names: list(r.alternative_names), search_keywords: list(r.search_keywords),
      category, subcategory: String(r.subcategory ?? '').trim() || null,
      calories_kcal: n.kcal, protein_g: n.p, carbs_g: n.c, fat_g: n.f, fiber_g: n.fib,
      serving_size: servingSize, serving_unit: unit, preparation_method: prep, raw_or_cooked: roc, edible_portion: edible,
      data_source: source, verification_status: status, owner_id: null, created_at: now, updated_at: now, servings,
    });
  });
  return { valid, errors };
}
