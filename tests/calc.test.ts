import { describe, it, expect } from 'vitest';
import { scaleMacros, dailyTotals, recipeNutrition, servingToGrams, edibleWeight, totalsByMeal, remaining, atwaterCalories } from '@/lib/calc/nutrition';
import { calcBmi, bmiCategory, compareMeasurements, validateMeasurement, waistHipRatio, trendOf } from '@/lib/calc/body';
import { bmrMifflin, tdee, recommendTargets, macrosForCalories, macroCalorieGap } from '@/lib/calc/energy';
import { normalizeVi, FoodSearchIndex } from '@/lib/calc/search';
import { addDays, ageOn, rangeStart, dateInTz, eachDay } from '@/lib/calc/dates';
import { nutritionReport, totalsPerDay } from '@/lib/calc/reports';
import { parseCsv, toCsv } from '@/lib/calc/csv';
import { validateFoodRows } from '@/lib/data/foodIO';
import { SEED_FOODS } from '@/data/foods.seed';
import type { BodyMeasurement, DiaryEntry, Macros } from '@/types';

const RICE: Macros = { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3, fiber: 0.4 };
const entry = (meal: DiaryEntry['meal_type'], grams: number, per100: Macros, date = '2026-11-19'): DiaryEntry => ({
  id: Math.random().toString(), user_id: 'u', entry_date: date, meal_type: meal, food_id: null, recipe_id: null, name_snapshot: 'x', grams,
  serving_label: null, serving_qty: null, per100, created_at: '', updated_at: '',
});

describe('nutrient scaling: per100 × grams / 100', () => {
  it('150 g cooked rice', () => {
    const m = scaleMacros(RICE, 150);
    expect(m.calories).toBeCloseTo(195, 6);
    expect(m.protein).toBeCloseTo(4.05, 6);
    expect(m.carbs).toBeCloseTo(42.3, 6);
    expect(m.fat).toBeCloseTo(0.45, 6);
    expect(m.fiber).toBeCloseTo(0.6, 6);
  });
  it('zero / negative / NaN grams yield zero', () => {
    expect(scaleMacros(RICE, 0).calories).toBe(0);
    expect(scaleMacros(RICE, -50).calories).toBe(0);
    expect(scaleMacros(RICE, NaN).calories).toBe(0);
  });
});

describe('daily totals across four meals, no double counting', () => {
  const egg: Macros = { calories: 155, protein: 12.6, carbs: 1.1, fat: 10.6, fiber: 0 };
  const oil: Macros = { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 };
  const entries = [entry('breakfast', 100, egg), entry('lunch', 150, RICE), entry('dinner', 13.6, oil), entry('snack', 50, egg)];
  it('sums each entry exactly once', () => {
    const t = dailyTotals(entries);
    expect(t.calories).toBeCloseTo(155 + 195 + 120.224 + 77.5, 6);
    expect(t.fat).toBeCloseTo(10.6 + 0.45 + 13.6 + 5.3, 6);
  });
  it('meal totals add up to the day total', () => {
    const by = totalsByMeal(entries);
    const sum = by.breakfast.calories + by.lunch.calories + by.dinner.calories + by.snack.calories;
    expect(sum).toBeCloseTo(dailyTotals(entries).calories, 9);
  });
  it('remaining = target − consumed (negative when over)', () => {
    const r = remaining({ calories: 500, protein: 50, carbs: 50, fat: 10, fiber: 20 }, dailyTotals(entries));
    expect(r.calories).toBeCloseTo(500 - 547.724, 6);
    expect(r.fat).toBeLessThan(0);
  });
});

describe('serving conversions', () => {
  it('2 × 1 egg (50 g) = 100 g', () => expect(servingToGrams(50, 2)).toBe(100));
  it('1.5 bowls of 150 g = 225 g', () => expect(servingToGrams(150, 1.5)).toBe(225));
  it('1 tbsp oil 13.6 g → 120 kcal', () => expect(scaleMacros({ calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 }, servingToGrams(13.6, 1)).calories).toBeCloseTo(120.2, 1));
  it('invalid inputs give 0', () => { expect(servingToGrams(0, 2)).toBe(0); expect(servingToGrams(50, 0)).toBe(0); });
  it('edible portion: 200 g whole shrimp at 55 % edible = 110 g', () => expect(edibleWeight(200, 0.55)).toBeCloseTo(110));
  it('seed servings point at grams for the right food', () => {
    const egg = SEED_FOODS.find((f) => f.food_id === 'trung-ga')!;
    expect(egg.servings![0].grams).toBe(50);
    const rice = SEED_FOODS.find((f) => f.food_id === 'com-trang')!;
    expect(rice.servings!.map((s) => s.grams)).toEqual([150, 120, 250]);
  });
});

describe('recipe: seafood noodle soup example', () => {
  const ing = (fid: string, grams: number) => { const f = SEED_FOODS.find((x) => x.food_id === fid)!; return { grams, per100: { calories: f.calories_kcal, protein: f.protein_g, carbs: f.carbs_g, fat: f.fat_g, fiber: f.fiber_g } }; };
  const ingredients = [ing('bun-tuoi', 200), ing('muc-ong-song', 150), ing('tom-the-song', 100), ing('cai-ngot', 100), ing('dau-an', 5)];
  const expectedKcal = 220 + 138 + 82 + 15 + 44.2;
  it('totals = sum of ingredients counted once', () => {
    const r = recipeNutrition({ servings: 2, final_weight_g: null, ingredients });
    expect(r.total.calories).toBeCloseTo(expectedKcal, 6);
    expect(r.ingredientWeight).toBe(555);
    expect(r.perServing.calories).toBeCloseTo(expectedKcal / 2, 6);
    expect(r.per100.calories).toBeCloseTo((expectedKcal / 555) * 100, 6);
  });
  it('cooking yield changes per-100 g but not totals or per-serving', () => {
    const r = recipeNutrition({ servings: 2, final_weight_g: 900, ingredients });
    expect(r.total.calories).toBeCloseTo(expectedKcal, 6);
    expect(r.per100.calories).toBeCloseTo((expectedKcal / 900) * 100, 6);
    expect(r.perServing.calories).toBeCloseTo(expectedKcal / 2, 6);
    expect(r.servingWeight).toBe(450);
    // logging one serving by weight gives back exactly one serving of energy
    expect(scaleMacros(r.per100, r.servingWeight).calories).toBeCloseTo(r.perServing.calories, 6);
  });
});

describe('BMI', () => {
  it('60 kg / 165 cm = 22.0', () => expect(calcBmi(60, 165)).toBe(22));
  it('80 kg / 175 cm = 26.1', () => expect(calcBmi(80, 175)).toBe(26.1));
  it('invalid → 0', () => expect(calcBmi(0, 170)).toBe(0));
  it('WHO vs Asian classification', () => {
    expect(bmiCategory(24, 'who')!.category).toBe('normal');
    expect(bmiCategory(24, 'asian')!.category).toBe('overweight');
    expect(bmiCategory(26, 'asian')!.category).toBe('obese1');
    expect(bmiCategory(18.4, 'who')!.category).toBe('underweight');
    expect(bmiCategory(30, 'who')!.category).toBe('obese1');
  });
});

describe('body comparison & validation', () => {
  const mk = (d: string, w: number, smm: number, bf: number): BodyMeasurement => ({ id: d, user_id: 'u', measured_on: d, weight_kg: w, height_cm: 160, bmi: calcBmi(w, 160),
    smm_kg: smm, body_fat_mass_kg: (w * bf) / 100, body_fat_pct: bf, waist_cm: 80, hip_cm: 98, visceral_fat_level: null, total_body_water_l: null, device_bmr_kcal: null,
    segmental_lean: null, segmental_fat: null, device: null, notes: null, created_at: '', updated_at: '' });
  it('differences are newer − older', () => {
    const d = compareMeasurements(mk('2026-10-01', 61, 22.1, 32), mk('2026-11-01', 59, 22.6, 29));
    expect(d.weight).toBe(-2); expect(d.smm).toBe(0.5); expect(d.bodyFatPct).toBe(-3); expect(d.days).toBe(31);
    expect(trendOf('smm', d.smm)).toBe('good'); expect(trendOf('bodyFatPct', d.bodyFatPct)).toBe('good'); expect(trendOf('weight', d.weight, true)).toBe('good');
  });
  it('WHR', () => expect(waistHipRatio(80, 100)).toBe(0.8));
  it('flags inconsistent fat mass vs %', () => {
    const issues = validateMeasurement({ measured_on: '2026-11-19', weight_kg: 60, height_cm: 165, smm_kg: 24, body_fat_mass_kg: 10, body_fat_pct: 30, waist_cm: null, hip_cm: null });
    expect(issues.some((i) => i.code === 'inconsistent')).toBe(true);
  });
  it('SMM cannot exceed weight', () => {
    expect(validateMeasurement({ measured_on: '2026-11-19', weight_kg: 60, height_cm: 165, smm_kg: 70, body_fat_mass_kg: null, body_fat_pct: null, waist_cm: null, hip_cm: null }).length).toBe(1);
  });
});

describe('energy (Mifflin-St Jeor)', () => {
  it('male 80 kg 180 cm 30 y = 1780', () => expect(bmrMifflin('male', 80, 180, 30)).toBe(1780));
  it('female 60 kg 165 cm 30 y = 1320.25', () => expect(bmrMifflin('female', 60, 165, 30)).toBeCloseTo(1320.25));
  it('TDEE moderate = BMR × 1.55', () => expect(tdee(1780, 'moderate')).toBeCloseTo(2759));
  it('macros are internally consistent with calories', () => {
    for (const kcal of [1200, 1500, 1800, 2200, 3000]) {
      const m = macrosForCalories(kcal, 70, 2.0);
      expect(Math.abs(atwaterCalories(m) - kcal)).toBeLessThanOrEqual(6);
      expect(Math.abs(macroCalorieGap(m))).toBeLessThanOrEqual(6);
    }
  });
  it('never recommends below a safe floor or an extreme deficit', () => {
    const r = recommendTargets({ gender: 'female', weightKg: 48, heightCm: 150, ageYears: 45, activity: 'sedentary', goal: 'weight_loss' });
    expect(r.targets.calories).toBeGreaterThanOrEqual(1200);
    const big = recommendTargets({ gender: 'male', weightKg: 130, heightCm: 185, ageYears: 30, activity: 'very', goal: 'weight_loss' });
    expect(big.deficitKcal).toBeGreaterThanOrEqual(-760);
  });
});

describe('search without diacritics', () => {
  const idx = new FoodSearchIndex(SEED_FOODS);
  it('normalizes Vietnamese', () => { expect(normalizeVi('Tôm hấp')).toBe('tom hap'); expect(normalizeVi('Đậu phụ')).toBe('dau phu'); });
  it('"tom hap" returns "Tôm hấp" first', () => expect(idx.search('tom hap')[0].food_name_vi).toBe('Tôm hấp'));
  it('"pho bo" → Phở bò', () => expect(idx.search('pho bo')[0].food_name_vi).toBe('Phở bò'));
  it('English: "chicken breast"', () => expect(idx.search('chicken breast')[0].food_id).toMatch(/uc-ga/));
  it('alternative name: "dua" (dứa) finds pineapple; "ngo luoc" finds boiled corn', () => {
    expect(idx.search('dứa').some((f) => f.food_id === 'thom')).toBe(true);
    expect(idx.search('ngo luoc')[0].food_id).toBe('bap-luoc');
  });
  it('category + preparation filters', () => {
    const r = idx.search('', { category: 'seafood', prep: 'raw', limit: 999 });
    expect(r.length).toBeGreaterThan(10);
    expect(r.every((f) => f.category === 'seafood' && f.preparation_method === 'raw')).toBe(true);
  });
});

describe('dates & ranges (Asia/Ho_Chi_Minh)', () => {
  it('UTC 20:00 is the next day in Vietnam', () => expect(dateInTz(new Date('2026-11-19T20:00:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-11-20'));
  it('addDays crosses months/years', () => { expect(addDays('2026-12-31', 1)).toBe('2027-01-01'); expect(addDays('2026-03-01', -1)).toBe('2026-02-28'); });
  it('7-day range is inclusive of 7 days', () => expect(eachDay(rangeStart('7d', '2026-11-19')!, '2026-11-19').length).toBe(7));
  it('all time → null start', () => expect(rangeStart('all', '2026-11-19')).toBeNull());
  it('age', () => { expect(ageOn('1994-11-20', '2026-11-19')).toBe(31); expect(ageOn('1994-11-19', '2026-11-19')).toBe(32); });
});

describe('reports', () => {
  it('averages only logged days; goal completion', () => {
    const t = { calories: 2000, protein: 100, carbs: 250, fat: 60, fiber: 25 };
    const big: Macros = { calories: 1000, protein: 50, carbs: 100, fat: 30, fiber: 10 };
    const days = totalsPerDay([entry('lunch', 200, big, '2026-11-01'), entry('lunch', 100, big, '2026-11-02')]);
    const r = nutritionReport(days, t);
    expect(r.loggedDays).toBe(2);
    expect(r.average.calories).toBe(1500);
    expect(r.goalDaysMet).toBe(1);
    expect(r.goalCompletionPct).toBe(50);
  });
});

describe('CSV round-trip & import validation', () => {
  it('quotes commas, quotes, newlines and Vietnamese text', () => {
    const csv = toCsv([{ a: 'Cơm, "tấm"', b: 'line1\nline2', c: 3 }]);
    expect(parseCsv(csv)).toEqual([{ a: 'Cơm, "tấm"', b: 'line1\nline2', c: '3' }]);
  });
  it('rejects VERIFIED rows without a data_source and bad macros', () => {
    const r = validateFoodRows([
      { food_name_vi: 'A', category: 'meat', calories_kcal: 100, protein_g: 20, carbs_g: 0, fat_g: 2, verification_status: 'VERIFIED' },
      { food_name_vi: 'B', category: 'meat', calories_kcal: 100, protein_g: 80, carbs_g: 30, fat_g: 2 },
      { food_name_vi: 'C', category: 'meat', calories_kcal: 100, protein_g: 20, carbs_g: 0, fat_g: 2 },
    ], ['meat']);
    expect(r.errors.map((e) => e.row)).toEqual([1, 2]);
    expect(r.valid[0].verification_status).toBe('ESTIMATED');
  });
});
