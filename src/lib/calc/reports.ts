import type { BodyMeasurement, DiaryEntry, Macros } from '@/types';
import { dailyTotals, ZERO, round } from './nutrition';
import { compareMeasurements, type MeasurementDiff } from './body';

export interface DayTotal extends Macros { date: string }

export function totalsPerDay(entries: DiaryEntry[]): DayTotal[] {
  const by = new Map<string, DiaryEntry[]>();
  for (const e of entries) {
    const l = by.get(e.entry_date) ?? [];
    l.push(e); by.set(e.entry_date, l);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, ...dailyTotals(list) }));
}

export interface NutritionReport {
  loggedDays: number;
  average: Macros; // averaged over days with at least one entry
  goalDaysMet: number;
  goalCompletionPct: number;
}

/**
 * A logged day "meets goal" when calories are within ±10 % of target and
 * protein reaches ≥ 90 % of target. Days without entries are excluded.
 */
export function nutritionReport(days: DayTotal[], target: Macros): NutritionReport {
  const n = days.length;
  if (!n) return { loggedDays: 0, average: { ...ZERO }, goalDaysMet: 0, goalCompletionPct: 0 };
  const sum = days.reduce((a, d) => ({ calories: a.calories + d.calories, protein: a.protein + d.protein, carbs: a.carbs + d.carbs, fat: a.fat + d.fat, fiber: a.fiber + d.fiber }), { ...ZERO });
  const met = days.filter((d) => meetsGoal(d, target)).length;
  return {
    loggedDays: n,
    average: { calories: sum.calories / n, protein: sum.protein / n, carbs: sum.carbs / n, fat: sum.fat / n, fiber: sum.fiber / n },
    goalDaysMet: met,
    goalCompletionPct: round((met / n) * 100, 0),
  };
}

export function meetsGoal(d: Macros, t: Macros): boolean {
  if (!(t.calories > 0)) return false;
  const calOk = Math.abs(d.calories - t.calories) <= t.calories * 0.1;
  const proOk = !(t.protein > 0) || d.protein >= t.protein * 0.9;
  return calOk && proOk;
}

export function bodyChange(measurements: BodyMeasurement[]): { first: BodyMeasurement; last: BodyMeasurement; diff: MeasurementDiff } | null {
  if (measurements.length < 2) return null;
  const sorted = [...measurements].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const first = sorted[0], last = sorted[sorted.length - 1];
  return { first, last, diff: compareMeasurements(first, last) };
}

/** Progress toward target weight from the first measurement in range (0..100). */
export function targetProgressPct(start: number, current: number, target: number | null): number | null {
  if (target == null || start === target) return null;
  const p = ((start - current) / (start - target)) * 100;
  return Math.max(0, Math.min(100, round(p, 0)));
}
