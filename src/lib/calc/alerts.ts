import type { BmiStandard, BodyMeasurement, DiaryEntry, FitnessGoal, Macros, MealType } from '@/types';
import { dailyTotals, round } from './nutrition';
import { bmiCategory } from './body';
import { daysBetween } from './dates';

/**
 * Health alerts & reminders. Pure functions only: the UI decides how to show
 * them (dashboard card, device notification). Thresholds are general
 * guidance, not a medical diagnosis – the UI says so next to every list.
 */

export type ReminderMeal = Exclude<MealType, 'snack'>;

export interface AlertPrefs {
  nutrition: boolean; // daily intake vs goals
  body: boolean; // BMI, rapid weight change, InBody changes
  reminders: boolean; // meals, water, InBody check-in
  notifications: boolean; // also show reminders as device notifications
  water_goal_ml: number;
  water_start: string; // HH:MM – water reminders only between start and end
  water_end: string;
  water_interval_min: number;
  meal_times: Record<ReminderMeal, string>; // remind if the meal isn't logged by this time
  inbody_interval_days: number;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  nutrition: true,
  body: true,
  reminders: true,
  notifications: false,
  water_goal_ml: 2000,
  water_start: '08:00',
  water_end: '21:00',
  water_interval_min: 120,
  meal_times: { breakfast: '09:30', lunch: '13:30', dinner: '20:00' },
  inbody_interval_days: 30,
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const num = (v: unknown, min: number, max: number, dflt: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : dflt);
const time = (v: unknown, dflt: string) => (typeof v === 'string' && TIME_RE.test(v) ? v : dflt);
const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt);

/** Merge stored (possibly partial or old) preferences with defaults, dropping invalid values. */
export function normalizeAlertPrefs(raw: unknown): AlertPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_ALERT_PREFS;
  const mt = (r.meal_times && typeof r.meal_times === 'object' ? r.meal_times : {}) as Record<string, unknown>;
  return {
    nutrition: bool(r.nutrition, d.nutrition),
    body: bool(r.body, d.body),
    reminders: bool(r.reminders, d.reminders),
    notifications: bool(r.notifications, d.notifications),
    water_goal_ml: num(r.water_goal_ml, 0, 6000, d.water_goal_ml),
    water_start: time(r.water_start, d.water_start),
    water_end: time(r.water_end, d.water_end),
    water_interval_min: num(r.water_interval_min, 30, 360, d.water_interval_min),
    meal_times: {
      breakfast: time(mt.breakfast, d.meal_times.breakfast),
      lunch: time(mt.lunch, d.meal_times.lunch),
      dinner: time(mt.dinner, d.meal_times.dinner),
    },
    inbody_interval_days: num(r.inbody_interval_days, 7, 180, d.inbody_interval_days),
  };
}

export const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Minutes since midnight for `now` in an IANA timezone. */
export function minutesInTz(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export type AlertGroup = 'nutrition' | 'body' | 'reminder';
export type AlertLevel = 'danger' | 'warning' | 'info';

export type AlertCode =
  | 'kcal_over' | 'kcal_under' | 'fat_over' | 'carbs_over' | 'protein_low' | 'fiber_low'
  | 'bmi_under' | 'bmi_over' | 'bmi_obese' | 'weight_fast_loss' | 'weight_fast_gain'
  | 'visceral_high' | 'visceral_up' | 'bf_up' | 'smm_down'
  | 'meal_missing' | 'water_behind' | 'inbody_due' | 'inbody_none';

export interface HealthAlert {
  /** Stable within a day; used to avoid notifying twice. */
  id: string;
  group: AlertGroup;
  level: AlertLevel;
  code: AlertCode;
  vars: Record<string, string | number>;
  link: string;
}

export interface AlertInput {
  date: string; // the day being looked at (YYYY-MM-DD)
  today: string; // today in the user's timezone
  nowMinutes: number; // minutes since local midnight
  entries: DiaryEntry[]; // diary entries for `date`
  goals: Macros | null;
  measurements: BodyMeasurement[];
  bmiStandard: BmiStandard;
  fitnessGoal: FitnessGoal | null;
  waterMl: number | null; // null = water tracking unavailable
  prefs: AlertPrefs;
}

// Thresholds (exported so the tests and the settings page can show them).
export const T = {
  kcalOver: 1.1, // >110 % of target
  kcalUnder: 0.7, // <70 % of target once the day is over
  fatOver: 1.15,
  carbsOver: 1.2,
  proteinLow: 0.8,
  fiberLow: 0.7,
  dayOverAt: 21 * 60, // after 21:00 "today" counts as finished for under-eating checks
  weeklyChangePct: 1, // >1 % of body weight per week
  minDaysForRate: 7,
  maxDaysForRate: 35,
  visceralHigh: 10, // InBody: level 10+ is above the healthy range
  visceralUp: 1,
  bfUp: 1, // percentage points between two measurements
  smmDown: 0.5, // kg
  waterSlack: 250, // ml behind schedule before reminding
};

const LEVEL_ORDER: Record<AlertLevel, number> = { danger: 0, warning: 1, info: 2 };

export function computeAlerts(i: AlertInput): HealthAlert[] {
  const out: HealthAlert[] = [];
  const { prefs } = i;
  if (prefs.nutrition) out.push(...nutritionAlerts(i));
  if (prefs.body) out.push(...bodyAlerts(i));
  if (prefs.reminders) out.push(...reminderAlerts(i));
  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

function nutritionAlerts(i: AlertInput): HealthAlert[] {
  const g = i.goals;
  if (!g || i.entries.length === 0 || i.date > i.today) return [];
  const tot = dailyTotals(i.entries);
  const dayOver = i.date < i.today || i.nowMinutes >= T.dayOverAt;
  const out: HealthAlert[] = [];
  const add = (code: AlertCode, level: AlertLevel, vars: HealthAlert['vars']) =>
    out.push({ id: `${code}`, group: 'nutrition', level, code, vars, link: '/diary' });
  const pct = (v: number, goal: number) => Math.round((v / goal) * 100);

  if (g.calories > 0 && tot.calories > g.calories * T.kcalOver)
    add('kcal_over', 'warning', { amount: Math.round(tot.calories - g.calories), pct: pct(tot.calories, g.calories) });
  if (dayOver && g.calories > 0 && tot.calories < g.calories * T.kcalUnder)
    add('kcal_under', 'info', { amount: Math.round(tot.calories), pct: pct(tot.calories, g.calories) });
  if (g.fat > 0 && tot.fat > g.fat * T.fatOver)
    add('fat_over', 'warning', { amount: round(tot.fat, 0), goal: g.fat });
  if (g.carbs > 0 && tot.carbs > g.carbs * T.carbsOver)
    add('carbs_over', 'info', { amount: round(tot.carbs, 0), goal: g.carbs });
  if (dayOver && g.protein > 0 && tot.protein < g.protein * T.proteinLow)
    add('protein_low', 'info', { amount: round(tot.protein, 0), goal: g.protein });
  if (dayOver && g.fiber > 0 && tot.fiber < g.fiber * T.fiberLow)
    add('fiber_low', 'info', { amount: round(tot.fiber, 0), goal: g.fiber });
  return out;
}

const byDate = (a: BodyMeasurement, b: BodyMeasurement) => a.measured_on.localeCompare(b.measured_on) || (a.created_at ?? '').localeCompare(b.created_at ?? '');

function bodyAlerts(i: AlertInput): HealthAlert[] {
  const ms = i.measurements.filter((m) => m.measured_on <= i.date).sort(byDate);
  const latest = ms[ms.length - 1];
  if (!latest) return [];
  const out: HealthAlert[] = [];
  const add = (code: AlertCode, level: AlertLevel, vars: HealthAlert['vars'], link = '/body') =>
    out.push({ id: code, group: 'body', level, code, vars, link });

  // BMI outside the healthy band of the chosen standard.
  const band = bmiCategory(latest.bmi, i.bmiStandard);
  if (band) {
    if (band.category === 'underweight') add('bmi_under', 'warning', { bmi: latest.bmi });
    else if (band.category === 'overweight') add('bmi_over', 'info', { bmi: latest.bmi });
    else if (band.category !== 'normal') add('bmi_obese', 'warning', { bmi: latest.bmi });
  }

  // Rapid weight change: compare with the latest measurement 7–35 days earlier.
  const ref = [...ms].reverse().find((m) => {
    const d = daysBetween(m.measured_on, latest.measured_on);
    return d >= T.minDaysForRate && d <= T.maxDaysForRate;
  });
  if (ref && ref.weight_kg > 0) {
    const days = daysBetween(ref.measured_on, latest.measured_on);
    const perWeek = ((latest.weight_kg - ref.weight_kg) / days) * 7;
    const pctWeek = (perWeek / ref.weight_kg) * 100;
    if (Math.abs(pctWeek) > T.weeklyChangePct) {
      const vars = { kg: round(Math.abs(latest.weight_kg - ref.weight_kg), 1), days, perWeek: round(Math.abs(perWeek), 2) };
      if (pctWeek < 0) add('weight_fast_loss', 'warning', vars, '/progress');
      else add('weight_fast_gain', 'warning', vars, '/progress');
    }
  }

  // InBody: compare each metric with the previous measurement that has it.
  const prevWith = (k: keyof BodyMeasurement, before: BodyMeasurement) =>
    [...ms].reverse().find((m) => m !== before && byDate(m, before) <= 0 && m[k] != null) ?? null;
  const lastWith = (k: keyof BodyMeasurement) => [...ms].reverse().find((m) => m[k] != null) ?? null;

  const vis = lastWith('visceral_fat_level');
  if (vis && vis.visceral_fat_level != null) {
    const prev = prevWith('visceral_fat_level', vis);
    if (vis.visceral_fat_level >= T.visceralHigh) add('visceral_high', 'danger', { level: vis.visceral_fat_level });
    else if (prev && prev.visceral_fat_level != null && vis.visceral_fat_level - prev.visceral_fat_level >= T.visceralUp)
      add('visceral_up', 'warning', { from: prev.visceral_fat_level, to: vis.visceral_fat_level });
  }
  const bf = lastWith('body_fat_pct');
  if (bf && bf.body_fat_pct != null) {
    const prev = prevWith('body_fat_pct', bf);
    if (prev && prev.body_fat_pct != null && bf.body_fat_pct - prev.body_fat_pct >= T.bfUp)
      add('bf_up', 'warning', { from: prev.body_fat_pct, to: bf.body_fat_pct });
  }
  const smm = lastWith('smm_kg');
  if (smm && smm.smm_kg != null) {
    const prev = prevWith('smm_kg', smm);
    if (prev && prev.smm_kg != null && prev.smm_kg - smm.smm_kg >= T.smmDown)
      add('smm_down', 'warning', { from: prev.smm_kg, to: smm.smm_kg, kg: round(prev.smm_kg - smm.smm_kg, 1) });
  }
  return out;
}

function reminderAlerts(i: AlertInput): HealthAlert[] {
  if (i.date !== i.today) return []; // reminders only make sense for today
  const p = i.prefs;
  const out: HealthAlert[] = [];
  const now = i.nowMinutes;

  for (const meal of ['breakfast', 'lunch', 'dinner'] as ReminderMeal[]) {
    if (now >= toMinutes(p.meal_times[meal]) && !i.entries.some((e) => e.meal_type === meal))
      out.push({ id: `meal_${meal}`, group: 'reminder', level: 'info', code: 'meal_missing', vars: { meal }, link: '/diary' });
  }

  if (i.waterMl != null && p.water_goal_ml > 0) {
    const start = toMinutes(p.water_start);
    const end = toMinutes(p.water_end);
    if (end > start && now >= start + p.water_interval_min && now <= end) {
      const expected = (p.water_goal_ml * (now - start)) / (end - start);
      if (i.waterMl < expected - T.waterSlack) {
        // One id per reminder interval, so a device notification repeats every interval at most.
        const slot = Math.floor((now - start) / p.water_interval_min);
        out.push({ id: `water_${slot}`, group: 'reminder', level: 'info', code: 'water_behind',
          vars: { drunk: i.waterMl, goal: p.water_goal_ml, expected: Math.round(expected / 50) * 50 }, link: '/' });
      }
    }
  }

  const ms = i.measurements.filter((m) => m.measured_on <= i.today).sort(byDate);
  const last = ms[ms.length - 1];
  if (!last) out.push({ id: 'inbody_none', group: 'reminder', level: 'info', code: 'inbody_none', vars: {}, link: '/body' });
  else {
    const days = daysBetween(last.measured_on, i.today);
    if (days >= p.inbody_interval_days)
      out.push({ id: 'inbody_due', group: 'reminder', level: 'info', code: 'inbody_due', vars: { days }, link: '/body' });
  }
  return out;
}
