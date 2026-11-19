import type { ActivityLevel, FitnessGoal, Gender, Macros } from '@/types';
import { atwaterCalories } from './nutrition';

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extreme: 1.9,
};

/** Mifflin-St Jeor resting energy expenditure (kcal/day). */
export function bmrMifflin(gender: Gender, weightKg: number, heightCm: number, ageYears: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return gender === 'male' ? base + 5 : base - 161;
}

export const tdee = (bmr: number, activity: ActivityLevel) => bmr * ACTIVITY_FACTORS[activity];

/** Energy adjustment by goal, as a fraction of TDEE, with conservative caps. */
const GOAL_ADJ: Record<FitnessGoal, { pct: number; maxKcal: number }> = {
  weight_loss: { pct: -0.2, maxKcal: 750 },
  fat_loss: { pct: -0.15, maxKcal: 600 },
  recomp: { pct: -0.1, maxKcal: 400 },
  muscle_gain: { pct: 0.1, maxKcal: 350 },
  maintenance: { pct: 0, maxKcal: 0 },
};

/** Protein g per kg body weight by goal (sports-nutrition consensus ranges, conservative midpoints). */
const PROTEIN_G_PER_KG: Record<FitnessGoal, number> = {
  weight_loss: 1.6,
  fat_loss: 2.0,
  recomp: 2.0,
  muscle_gain: 1.8,
  maintenance: 1.4,
};

/** Absolute floor so recommendations never suggest an extreme deficit. */
export const calorieFloor = (gender: Gender, bmr: number) => Math.max(gender === 'male' ? 1500 : 1200, Math.round(bmr));

export interface Recommendation {
  bmr: number;
  tdee: number;
  targets: Macros;
  flooredAtSafeMinimum: boolean;
  deficitKcal: number; // negative = deficit
}

export function recommendTargets(input: {
  gender: Gender; weightKg: number; heightCm: number; ageYears: number; activity: ActivityLevel; goal: FitnessGoal;
}): Recommendation {
  const bmr = bmrMifflin(input.gender, input.weightKg, input.heightCm, input.ageYears);
  const t = tdee(bmr, input.activity);
  const adj = GOAL_ADJ[input.goal];
  let delta = t * adj.pct;
  if (Math.abs(delta) > adj.maxKcal) delta = Math.sign(delta) * adj.maxKcal;
  let calories = Math.round((t + delta) / 10) * 10;
  const floor = calorieFloor(input.gender, bmr);
  let floored = false;
  if (calories < floor) { calories = Math.round(floor / 10) * 10; floored = true; }
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(t),
    targets: macrosForCalories(calories, input.weightKg, PROTEIN_G_PER_KG[input.goal]),
    flooredAtSafeMinimum: floored,
    deficitKcal: Math.round(calories - t),
  };
}

/**
 * Split a calorie target into macros so that 4·P + 4·C + 9·F == calories.
 * Protein from g/kg (capped at 35% energy), fat 27% of energy (min 0.6 g/kg),
 * carbs fill the remainder. Fiber 14 g / 1000 kcal (IOM adequate intake basis).
 */
export function macrosForCalories(calories: number, weightKg: number, proteinPerKg: number): Macros {
  let protein = Math.round(weightKg * proteinPerKg);
  protein = Math.min(protein, Math.floor((calories * 0.35) / 4));
  let fat = Math.round((calories * 0.27) / 9);
  fat = Math.max(fat, Math.round(weightKg * 0.6));
  let carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
  if (carbs < 0) { carbs = 0; fat = Math.floor((calories - protein * 4) / 9); }
  const fiber = Math.round((calories / 1000) * 14);
  return { calories, protein, carbs, fat, fiber };
}

/** How far the macro grams are from the stated calorie target (kcal). */
export function macroCalorieGap(t: Macros): number {
  return Math.round(atwaterCalories(t) - t.calories);
}

/** Expected rate check: > 1% body weight per week is flagged as aggressive. */
export function weeklyChangeKg(deficitKcalPerDay: number): number {
  return (deficitKcalPerDay * 7) / 7700;
}
