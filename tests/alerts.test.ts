import { describe, it, expect } from 'vitest';
import { computeAlerts, normalizeAlertPrefs, DEFAULT_ALERT_PREFS, minutesInTz, type AlertInput } from '@/lib/calc/alerts';
import { calcBmi } from '@/lib/calc/body';
import type { BodyMeasurement, DiaryEntry, Macros } from '@/types';

const GOALS: Macros = { calories: 2000, protein: 120, carbs: 220, fat: 60, fiber: 25 };
const entry = (meal: DiaryEntry['meal_type'], grams: number, per100: Partial<Macros>, date = '2026-11-27'): DiaryEntry => ({
  id: Math.random().toString(), user_id: 'u', entry_date: date, meal_type: meal, food_id: null, recipe_id: null, name_snapshot: 'x', grams,
  serving_label: null, serving_qty: null, per100: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, ...per100 }, created_at: '', updated_at: '',
});
const meas = (measured_on: string, weight_kg: number, extra: Partial<BodyMeasurement> = {}): BodyMeasurement => ({
  id: measured_on, user_id: 'u', measured_on, weight_kg, height_cm: 165, bmi: calcBmi(weight_kg, 165), smm_kg: null, body_fat_mass_kg: null,
  body_fat_pct: null, waist_cm: null, hip_cm: null, visceral_fat_level: null, total_body_water_l: null, device_bmr_kcal: null,
  segmental_lean: null, segmental_fat: null, device: null, notes: null, created_at: '', updated_at: '', ...extra,
});
const base = (over: Partial<AlertInput> = {}): AlertInput => ({
  date: '2026-11-27', today: '2026-11-27', nowMinutes: 12 * 60, entries: [], goals: GOALS, measurements: [meas('2026-11-20', 60)],
  bmiStandard: 'who', fitnessGoal: 'maintenance', waterMl: null, prefs: { ...DEFAULT_ALERT_PREFS, reminders: false }, ...over,
});
const codes = (i: AlertInput) => computeAlerts(i).map((a) => a.code).sort();

describe('nutrition alerts', () => {
  it('no alerts without entries or goals', () => {
    expect(codes(base())).toEqual([]);
    expect(codes(base({ goals: null, entries: [entry('lunch', 1000, { calories: 300 })] }))).toEqual([]);
  });
  it('calories over 110 % of target', () => {
    const a = computeAlerts(base({ entries: [entry('lunch', 1000, { calories: 230 })] })); // 2300 kcal
    expect(a.map((x) => x.code)).toContain('kcal_over');
    expect(a.find((x) => x.code === 'kcal_over')!.vars).toMatchObject({ amount: 300, pct: 115 });
  });
  it('exactly 110 % is not flagged', () => {
    expect(codes(base({ entries: [entry('lunch', 1000, { calories: 220 })] }))).not.toContain('kcal_over');
  });
  it('under-eating, low protein and low fiber only once the day is over', () => {
    const entries = [entry('lunch', 100, { calories: 500, protein: 20, fiber: 5 })];
    expect(codes(base({ entries }))).toEqual([]); // noon: day still in progress
    expect(codes(base({ entries, nowMinutes: 21 * 60 + 5 }))).toEqual(['fiber_low', 'kcal_under', 'protein_low']);
    expect(codes(base({ entries: entries.map((e) => ({ ...e, entry_date: '2026-11-26' })), date: '2026-11-26' }))).toEqual(['fiber_low', 'kcal_under', 'protein_low']);
  });
  it('fat and carbs over target', () => {
    expect(codes(base({ entries: [entry('dinner', 100, { calories: 1500, fat: 70, carbs: 270, protein: 120, fiber: 30 })] }))).toEqual(['carbs_over', 'fat_over']);
  });
  it('disabled group produces nothing', () => {
    expect(codes(base({ entries: [entry('lunch', 1000, { calories: 300 })], prefs: { ...DEFAULT_ALERT_PREFS, nutrition: false, reminders: false } }))).toEqual([]);
  });
});

describe('body alerts', () => {
  it('BMI bands follow the selected standard', () => {
    const m = [meas('2026-11-20', 65)]; // BMI 23.9: normal (WHO), overweight (Asian)
    expect(codes(base({ measurements: m }))).toEqual([]);
    expect(codes(base({ measurements: m, bmiStandard: 'asian' }))).toEqual(['bmi_over']);
    expect(codes(base({ measurements: [meas('2026-11-20', 48)] }))).toEqual(['bmi_under']);
    expect(codes(base({ measurements: [meas('2026-11-20', 90)] }))).toEqual(['bmi_obese']);
  });
  it('rapid weight loss: >1 % body weight per week', () => {
    const a = computeAlerts(base({ measurements: [meas('2026-11-06', 62), meas('2026-11-20', 60)] })); // -2 kg / 2 wk on 62 kg = 1.6 %/wk
    expect(a.map((x) => x.code)).toEqual(['weight_fast_loss']);
    expect(a[0].vars).toMatchObject({ kg: 2, days: 14, perWeek: 1 });
  });
  it('slow change is fine; gaps under 7 days are ignored', () => {
    expect(codes(base({ measurements: [meas('2026-11-06', 60.8), meas('2026-11-20', 60)] }))).toEqual([]); // 0.66 %/wk
    expect(codes(base({ measurements: [meas('2026-11-17', 63), meas('2026-11-20', 60)] }))).toEqual([]);
  });
  it('rapid weight gain', () => {
    expect(codes(base({ measurements: [meas('2026-11-13', 58), meas('2026-11-20', 60)] }))).toEqual(['weight_fast_gain']);
  });
  it('InBody: visceral fat, body fat % and SMM worsening vs previous measurement', () => {
    const ms = [
      meas('2026-10-20', 60, { visceral_fat_level: 7, body_fat_pct: 25, smm_kg: 24 }),
      meas('2026-11-20', 60, { visceral_fat_level: 8, body_fat_pct: 26.2, smm_kg: 23.3 }),
    ];
    expect(codes(base({ measurements: ms }))).toEqual(['bf_up', 'smm_down', 'visceral_up']);
  });
  it('InBody: high visceral fat is a danger alert and sorts first', () => {
    const a = computeAlerts(base({ measurements: [meas('2026-11-20', 60, { visceral_fat_level: 12 })], bmiStandard: 'asian' }));
    expect(a[0]).toMatchObject({ code: 'visceral_high', level: 'danger' });
  });
  it('improvements are not flagged', () => {
    const ms = [meas('2026-10-20', 60, { visceral_fat_level: 8, body_fat_pct: 27, smm_kg: 23 }), meas('2026-11-20', 60, { visceral_fat_level: 7, body_fat_pct: 25, smm_kg: 24 })];
    expect(codes(base({ measurements: ms }))).toEqual([]);
  });
  it('measurements after the viewed date are ignored', () => {
    expect(codes(base({ date: '2026-11-19', today: '2026-11-27', measurements: [meas('2026-11-20', 48)] }))).toEqual([]);
  });
});

describe('reminders', () => {
  const r = (over: Partial<AlertInput>) => base({ prefs: { ...DEFAULT_ALERT_PREFS, nutrition: false, body: false }, ...over });
  it('unlogged meals after their reminder time', () => {
    expect(codes(r({ nowMinutes: 9 * 60 }))).toEqual([]);
    expect(computeAlerts(r({ nowMinutes: 14 * 60 })).map((a) => a.id)).toEqual(['meal_breakfast', 'meal_lunch']);
    expect(computeAlerts(r({ nowMinutes: 14 * 60, entries: [entry('breakfast', 100, { calories: 100 })] })).map((a) => a.id)).toEqual(['meal_lunch']);
  });
  it('only for today', () => {
    expect(codes(r({ date: '2026-11-26', nowMinutes: 22 * 60 }))).toEqual([]);
  });
  it('water: behind schedule, one id per interval', () => {
    const at = (h: number, ml: number) => computeAlerts(r({ nowMinutes: h * 60, waterMl: ml, entries: [entry('breakfast', 1, {}), entry('lunch', 1, {}), entry('dinner', 1, {})] }));
    expect(at(9, 0)).toEqual([]); // first interval not over yet
    expect(at(12, 0).map((a) => a.id)).toEqual(['water_2']); // expected ~615 ml at 12:00
    expect(at(12, 500)).toEqual([]); // within 250 ml slack
    expect(at(16, 0).map((a) => a.id)).toEqual(['water_4']);
    expect(at(22, 0)).toEqual([]); // after window
  });
  it('water: skipped when tracking is unavailable', () => {
    expect(codes(r({ nowMinutes: 12 * 60, waterMl: null, entries: [entry('breakfast', 1, {})] }))).toEqual([]);
  });
  it('InBody check-in due after the interval, and when nothing was ever measured', () => {
    expect(codes(r({ nowMinutes: 8 * 60, measurements: [meas('2026-10-28', 60)] }))).toEqual(['inbody_due']);
    expect(codes(r({ nowMinutes: 8 * 60, measurements: [meas('2026-10-29', 60)] }))).toEqual([]);
    expect(codes(r({ nowMinutes: 8 * 60, measurements: [] }))).toEqual(['inbody_none']);
  });
});

describe('preferences', () => {
  it('fills defaults and drops invalid values', () => {
    expect(normalizeAlertPrefs(null)).toEqual(DEFAULT_ALERT_PREFS);
    const p = normalizeAlertPrefs({ nutrition: false, water_goal_ml: -5, water_start: '25:00', meal_times: { lunch: '12:15' }, inbody_interval_days: 14 });
    expect(p).toMatchObject({ nutrition: false, water_goal_ml: 2000, water_start: '08:00', inbody_interval_days: 14 });
    expect(p.meal_times).toEqual({ breakfast: '09:30', lunch: '12:15', dinner: '20:00' });
  });
  it('minutesInTz uses the user timezone', () => {
    expect(minutesInTz(new Date('2026-11-27T01:30:00Z'), 'Asia/Ho_Chi_Minh')).toBe(8 * 60 + 30);
    expect(minutesInTz(new Date('2026-11-27T17:05:00Z'), 'Asia/Ho_Chi_Minh')).toBe(5);
  });
});
