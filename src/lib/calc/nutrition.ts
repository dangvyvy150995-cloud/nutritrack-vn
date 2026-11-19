import type { Macros, Recipe, RecipeIngredient, DiaryEntry, FoodItem, MealType } from '@/types';

/** All nutrient values are stored per 100 g (or 100 ml) of EDIBLE food. */
export const ZERO: Macros = Object.freeze({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

export const round = (n: number, d = 1) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

export function foodPer100(f: Pick<FoodItem, 'calories_kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g'>): Macros {
  return { calories: f.calories_kcal, protein: f.protein_g, carbs: f.carbs_g, fat: f.fat_g, fiber: f.fiber_g };
}

/** Nutrient consumed = Nutrient per 100 g × consumed weight / 100. */
export function scaleMacros(per100: Macros, grams: number): Macros {
  if (!Number.isFinite(grams) || grams <= 0) return { ...ZERO };
  const k = grams / 100;
  return {
    calories: per100.calories * k,
    protein: per100.protein * k,
    carbs: per100.carbs * k,
    fat: per100.fat * k,
    fiber: per100.fiber * k,
  };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fiber: a.fiber + b.fiber,
  };
}

export const sumMacros = (list: Macros[]): Macros => list.reduce(addMacros, { ...ZERO });

export function roundMacros(m: Macros, d = 1): Macros {
  return { calories: round(m.calories, 0), protein: round(m.protein, d), carbs: round(m.carbs, d), fat: round(m.fat, d), fiber: round(m.fiber, d) };
}

/** grams = serving unit weight × quantity */
export function servingToGrams(unitGrams: number, qty: number): number {
  if (!(unitGrams > 0) || !(qty > 0)) return 0;
  return unitGrams * qty;
}

/**
 * Convert an as-purchased weight (with bones, peel, shell) to edible weight.
 * edible_portion is a 0..1 fraction.
 */
export function edibleWeight(purchasedGrams: number, ediblePortion: number): number {
  const ep = ediblePortion > 0 && ediblePortion <= 1 ? ediblePortion : 1;
  return purchasedGrams * ep;
}

export const entryMacros = (e: Pick<DiaryEntry, 'per100' | 'grams'>): Macros => scaleMacros(e.per100, e.grams);

export function dailyTotals(entries: DiaryEntry[]): Macros {
  return sumMacros(entries.map(entryMacros));
}

export function totalsByMeal(entries: DiaryEntry[]): Record<MealType, Macros> {
  const out: Record<MealType, Macros> = { breakfast: { ...ZERO }, lunch: { ...ZERO }, dinner: { ...ZERO }, snack: { ...ZERO } };
  for (const e of entries) out[e.meal_type] = addMacros(out[e.meal_type], entryMacros(e));
  return out;
}

export function remaining(target: Macros, consumed: Macros): Macros {
  return {
    calories: target.calories - consumed.calories,
    protein: target.protein - consumed.protein,
    carbs: target.carbs - consumed.carbs,
    fat: target.fat - consumed.fat,
    fiber: target.fiber - consumed.fiber,
  };
}

// ---------- Recipes ----------
export interface RecipeNutrition {
  total: Macros;
  ingredientWeight: number; // sum of raw ingredient weights
  finalWeight: number; // cooked yield used for per-100 g values
  yieldFactor: number; // finalWeight / ingredientWeight
  per100: Macros;
  perServing: Macros;
  servingWeight: number;
}

/**
 * Recipe totals are the sum of each ingredient counted ONCE. Cooking changes
 * weight (water loss/gain) but not the nutrient totals, so per-100 g values are
 * computed against the final cooked weight.
 */
export function recipeNutrition(r: Pick<Recipe, 'servings' | 'final_weight_g'> & { ingredients: Pick<RecipeIngredient, 'grams' | 'per100'>[] }): RecipeNutrition {
  const total = sumMacros(r.ingredients.map((i) => scaleMacros(i.per100, i.grams)));
  const ingredientWeight = r.ingredients.reduce((s, i) => s + (i.grams > 0 ? i.grams : 0), 0);
  const finalWeight = r.final_weight_g && r.final_weight_g > 0 ? r.final_weight_g : ingredientWeight;
  const servings = r.servings > 0 ? r.servings : 1;
  const per100 = finalWeight > 0 ? scaleTo(total, 100 / finalWeight) : { ...ZERO };
  return {
    total,
    ingredientWeight,
    finalWeight,
    yieldFactor: ingredientWeight > 0 ? finalWeight / ingredientWeight : 1,
    per100,
    perServing: scaleTo(total, 1 / servings),
    servingWeight: finalWeight / servings,
  };
}

function scaleTo(m: Macros, k: number): Macros {
  return { calories: m.calories * k, protein: m.protein * k, carbs: m.carbs * k, fat: m.fat * k, fiber: m.fiber * k };
}

/** Energy implied by macronutrients using Atwater factors (fiber counted inside carbs). */
export function atwaterCalories(m: Pick<Macros, 'protein' | 'carbs' | 'fat'>): number {
  return m.protein * 4 + m.carbs * 4 + m.fat * 9;
}

/** Percent of energy from each macro (based on Atwater energy). */
export function macroSplit(m: Macros): { protein: number; carbs: number; fat: number } {
  const p = m.protein * 4, c = m.carbs * 4, f = m.fat * 9;
  const t = p + c + f;
  if (t <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return { protein: (p / t) * 100, carbs: (c / t) * 100, fat: (f / t) * 100 };
}
