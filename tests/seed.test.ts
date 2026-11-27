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
  it('never claims VERIFIED without a cited USDA record and always states a basis', () => {
    for (const f of SEED_FOODS) {
      expect(['ESTIMATED', 'VERIFIED']).toContain(f.verification_status);
      expect(f.data_source.length).toBeGreaterThan(20);
      if (f.verification_status === 'VERIFIED') expect(f.data_source).toMatch(/^USDA FoodData Central – SR Legacy \(SR28\), NDB \d{5} /);
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

describe('vegetarian foods', () => {
  it('adds the "Món chay" category and tags plant-only records', async () => {
    const { isVegetarian } = await import('@/lib/calc/search');
    expect(CATEGORIES.find((c) => c.id === 'vegetarian')?.name_vi).toBe('Món chay');
    const veg = SEED_FOODS.filter(isVegetarian).map((f) => f.food_id);
    for (const id of ['com-tam-chay', 'pho-chay', 'tempeh', 'mi-can', 'dau-phu', 'sua-dau-nanh-khong-duong']) expect(veg).toContain(id);
    for (const id of ['pho-bo', 'uc-ga-chin', 'trung-ga']) expect(veg).not.toContain(id);
  });
  it('calculates composed dishes from their ingredient list', async () => {
    const { VEG_SUMMARY, sumItems } = await import('@/data/vegetarian');
    const tam = VEG_SUMMARY.find((d) => d.slug === 'com-tam-chay')!;
    // 200 g rice (USDA 20045) alone = 260 kcal, 5.4 g protein
    expect(tam.protein).toBeGreaterThan(10);
    expect(tam.protein).toBeLessThan(20);
    expect(sumItems([['rice', 200]]).kcal).toBeCloseTo(260, 5);
    const food = SEED_FOODS.find((f) => f.food_id === 'com-tam-chay')!;
    expect(food.calories_kcal * food.serving_size / 100).toBeCloseTo(tam.kcal, -1);
    expect(food.data_source).toContain('USDA 20045');
  });
  it('replaces the old "Đậu sốt cà chua" record in place instead of duplicating it', () => {
    expect(SEED_FOODS.filter((f) => f.food_id === 'dau-sot-ca')).toHaveLength(1);
    expect(SEED_FOODS.find((f) => f.food_id === 'dau-sot-ca')!.category).toBe('vegetarian');
  });
});
