import type { BmiStandard, BodyMeasurement } from '@/types';
import { round } from './nutrition';

/** BMI = weight (kg) / height (m)^2, rounded to 1 decimal. */
export function calcBmi(weightKg: number, heightCm: number): number {
  if (!(weightKg > 0) || !(heightCm > 0)) return 0;
  const m = heightCm / 100;
  return round(weightKg / (m * m), 1);
}

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese1' | 'obese2' | 'obese3';

export interface BmiBand { category: BmiCategory; min: number; max: number; color: string }

/** WHO international adult classification. */
export const WHO_BANDS: BmiBand[] = [
  { category: 'underweight', min: 0, max: 18.5, color: '#93c5fd' },
  { category: 'normal', min: 18.5, max: 25, color: '#86efac' },
  { category: 'overweight', min: 25, max: 30, color: '#fcd34d' },
  { category: 'obese1', min: 30, max: 35, color: '#fdba74' },
  { category: 'obese2', min: 35, max: 40, color: '#fca5a5' },
  { category: 'obese3', min: 40, max: 100, color: '#f87171' },
];

/** WHO Western Pacific Region (2000) proposed cut-offs for Asian adults. */
export const ASIAN_BANDS: BmiBand[] = [
  { category: 'underweight', min: 0, max: 18.5, color: '#93c5fd' },
  { category: 'normal', min: 18.5, max: 23, color: '#86efac' },
  { category: 'overweight', min: 23, max: 25, color: '#fcd34d' },
  { category: 'obese1', min: 25, max: 30, color: '#fdba74' },
  { category: 'obese2', min: 30, max: 100, color: '#fca5a5' },
];

export const bmiBands = (s: BmiStandard) => (s === 'asian' ? ASIAN_BANDS : WHO_BANDS);

export function bmiCategory(bmi: number, standard: BmiStandard = 'who'): BmiBand | null {
  if (!(bmi > 0)) return null;
  return bmiBands(standard).find((b) => bmi >= b.min && bmi < b.max) ?? null;
}

export function waistHipRatio(waist: number | null, hip: number | null): number | null {
  if (!waist || !hip || waist <= 0 || hip <= 0) return null;
  return round(waist / hip, 2);
}

export interface MeasurementDiff {
  weight: number | null;
  bmi: number | null;
  smm: number | null;
  bodyFatMass: number | null;
  bodyFatPct: number | null;
  waist: number | null;
  hip: number | null;
  days: number;
}

const d = (a: number | null, b: number | null, dp = 1) => (a == null || b == null ? null : round(b - a, dp));

/** Difference from `from` (older) to `to` (newer): positive means increased. */
export function compareMeasurements(from: BodyMeasurement, to: BodyMeasurement): MeasurementDiff {
  return {
    weight: d(from.weight_kg, to.weight_kg),
    bmi: d(from.bmi, to.bmi),
    smm: d(from.smm_kg, to.smm_kg),
    bodyFatMass: d(from.body_fat_mass_kg, to.body_fat_mass_kg),
    bodyFatPct: d(from.body_fat_pct, to.body_fat_pct),
    waist: d(from.waist_cm, to.waist_cm),
    hip: d(from.hip_cm, to.hip_cm),
    days: Math.round((Date.parse(to.measured_on) - Date.parse(from.measured_on)) / 86400000),
  };
}

/** Whether an increase in this metric is generally favourable. */
export const HIGHER_IS_BETTER: Record<keyof Omit<MeasurementDiff, 'days'>, boolean | null> = {
  weight: null, // depends on the goal
  bmi: null,
  smm: true,
  bodyFatMass: false,
  bodyFatPct: false,
  waist: false,
  hip: null,
};

export type Trend = 'good' | 'bad' | 'neutral';
export function trendOf(metric: keyof typeof HIGHER_IS_BETTER, delta: number | null, wantsLoss?: boolean): Trend {
  if (delta == null || delta === 0) return 'neutral';
  let pref = HIGHER_IS_BETTER[metric];
  if (pref == null && (metric === 'weight' || metric === 'bmi') && wantsLoss !== undefined) pref = !wantsLoss;
  if (pref == null) return 'neutral';
  return (delta > 0) === pref ? 'good' : 'bad';
}

export interface ValidationIssue { field: string; code: string }

/** Validate a measurement entered from an InBody-type device. No values are estimated. */
export function validateMeasurement(m: {
  weight_kg: number; height_cm: number; smm_kg: number | null; body_fat_mass_kg: number | null; body_fat_pct: number | null;
  waist_cm: number | null; hip_cm: number | null; measured_on: string;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!m.measured_on || !/^\d{4}-\d{2}-\d{2}$/.test(m.measured_on)) issues.push({ field: 'measured_on', code: 'required' });
  if (!(m.weight_kg >= 20 && m.weight_kg <= 350)) issues.push({ field: 'weight_kg', code: 'range' });
  if (!(m.height_cm >= 100 && m.height_cm <= 250)) issues.push({ field: 'height_cm', code: 'range' });
  if (m.smm_kg != null && !(m.smm_kg > 0 && m.smm_kg < m.weight_kg)) issues.push({ field: 'smm_kg', code: 'range' });
  if (m.body_fat_mass_kg != null && !(m.body_fat_mass_kg >= 0 && m.body_fat_mass_kg < m.weight_kg)) issues.push({ field: 'body_fat_mass_kg', code: 'range' });
  if (m.body_fat_pct != null && !(m.body_fat_pct >= 2 && m.body_fat_pct <= 75)) issues.push({ field: 'body_fat_pct', code: 'range' });
  if (m.waist_cm != null && !(m.waist_cm >= 30 && m.waist_cm <= 250)) issues.push({ field: 'waist_cm', code: 'range' });
  if (m.hip_cm != null && !(m.hip_cm >= 40 && m.hip_cm <= 250)) issues.push({ field: 'hip_cm', code: 'range' });
  if (m.body_fat_mass_kg != null && m.body_fat_pct != null && m.weight_kg > 0) {
    const implied = (m.body_fat_mass_kg / m.weight_kg) * 100;
    if (Math.abs(implied - m.body_fat_pct) > 2) issues.push({ field: 'body_fat_pct', code: 'inconsistent' });
  }
  return issues;
}
