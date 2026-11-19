import { describe, it, expect } from 'vitest';
import { SEED_FOODS, CATEGORIES } from '@/data/foods.seed';
import { atwaterCalories } from '@/lib/calc/nutrition';

describe('seed dataset integrity', () => {
  it('has unique ids and valid categories', () => {
    const ids = new Set(SEED_FOODS.map((f) => f.food_id));
    expect(ids.size).toBe(SEED_FOODS.length);
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const f of SEED_FOODS) expect(cats.has(f.category)).toBe(true);
  });
  it('never claims VERIFIED without a source and always states a basis', () => {
    for (const f of SEED_FOODS) {
      expect(f.verification_status).toBe('ESTIMATED');
      expect(f.data_source.length).toBeGreaterThan(20);
    }
  });
  it('has plausible values (non-negative, macros within 100 g, energy roughly consistent)', () => {
    const outliers: string[] = [];
    for (const f of SEED_FOODS) {
      for (const v of [f.calories_kcal, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g]) expect(v).toBeGreaterThanOrEqual(0);
      expect(f.protein_g + f.carbs_g + f.fat_g).toBeLessThanOrEqual(100.5);
      expect(f.fiber_g).toBeLessThanOrEqual(f.carbs_g + 0.01);
      const atw = atwaterCalories({ protein: f.protein_g, carbs: f.carbs_g, fat: f.fat_g });
      // fiber yields ~2 kcal/g not 4; alcohol is not in macros -> allow margin
      const tol = Math.max(25, f.calories_kcal * 0.15) + f.fiber_g * 2;
      if (Math.abs(atw - f.calories_kcal) > tol && !/alcohol/i.test(f.food_name_en)) outliers.push(`${f.food_id}: ${f.calories_kcal} vs ${atw.toFixed(0)}`);
      expect(f.edible_portion).toBeGreaterThan(0);
      expect(f.edible_portion).toBeLessThanOrEqual(1);
    }
    expect(outliers).toEqual([]);
  });
  it('distinguishes raw and cooked records', () => {
    expect(SEED_FOODS.find((f) => f.food_id === 'uc-ga-song')!.calories_kcal).not.toBe(SEED_FOODS.find((f) => f.food_id === 'uc-ga-chin')!.calories_kcal);
  });
});
