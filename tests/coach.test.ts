import { describe, it, expect } from 'vitest';
import { summarizeClient, sortClients, isValidInviteCode, normalizeInviteCode, INACTIVE_WARN_DAYS, type ClientSummary } from '@/lib/calc/coach';
import { calcBmi } from '@/lib/calc/body';
import type { BodyMeasurement, ClientBundle, DiaryEntry, FitnessGoals, Macros, UserProfile } from '@/types';

const TODAY = '2026-11-27';
const entry = (date: string, meal: DiaryEntry['meal_type'], grams: number, per100: Partial<Macros>): DiaryEntry => ({
  id: Math.random().toString(), user_id: 'c', entry_date: date, meal_type: meal, food_id: null, recipe_id: null, name_snapshot: 'x', grams,
  serving_label: null, serving_qty: null, per100: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, ...per100 }, created_at: '', updated_at: '',
});
const meas = (measured_on: string, weight_kg: number, extra: Partial<BodyMeasurement> = {}): BodyMeasurement => ({
  id: measured_on, user_id: 'c', measured_on, weight_kg, height_cm: 165, bmi: calcBmi(weight_kg, 165), smm_kg: null, body_fat_mass_kg: null,
  body_fat_pct: null, waist_cm: null, hip_cm: null, visceral_fat_level: null, total_body_water_l: null, device_bmr_kcal: null,
  segmental_lean: null, segmental_fat: null, device: null, notes: null, created_at: '', updated_at: '', ...extra,
});
const goals: FitnessGoals = { user_id: 'c', calories_kcal: 2000, protein_g: 120, carbs_g: 220, fat_g: 60, fiber_g: 25, target_weight_kg: null, target_body_fat_pct: null, target_smm_kg: null, step_goal: null, is_custom: false };
const profile = { id: 'c', email: 'c@x', full_name: 'C', fitness_goal: 'fat_loss' } as UserProfile;
const bundle = (over: Partial<ClientBundle> = {}): ClientBundle => ({ profile, settings: null, goals, diary: [], measurements: [meas('2026-11-20', 60)], water: null, ...over });
const codes = (s: ClientSummary) => s.flags.map((f) => (f.when ? `y:` : '') + (f.alert?.code ?? f.code));

describe('summarizeClient', () => {
  it('today totals, meals and latest measurement', () => {
    const s = summarizeClient(bundle({ diary: [entry(TODAY, 'breakfast', 200, { calories: 150, protein: 10 }), entry(TODAY, 'lunch', 100, { calories: 500, protein: 30 }), entry('2026-11-26', 'lunch', 100, { calories: 2000 })] }), TODAY, 12 * 60);
    expect(s.totals.calories).toBe(800);
    expect(s.totals.protein).toBe(50);
    expect(s.entriesToday).toBe(2);
    expect(s.mealsToday).toBe(2);
    expect(s.daysSinceLog).toBe(0);
    expect(s.latest?.weight_kg).toBe(60);
    expect(s.goals?.calories).toBe(2000);
  });
  it('flags over-eating today and under-eating yesterday', () => {
    const s = summarizeClient(bundle({ diary: [entry(TODAY, 'lunch', 1000, { calories: 250 }), entry('2026-11-26', 'lunch', 100, { calories: 1000, protein: 20 })] }), TODAY, 12 * 60);
    expect(codes(s)).toContain('kcal_over');
    expect(codes(s)).toContain('y:kcal_under');
    expect(codes(s)).toContain('y:protein_low');
    expect(s.level).toBe('warning');
  });
  it('does not repeat yesterday an alert already shown for today', () => {
    const s = summarizeClient(bundle({ diary: [entry(TODAY, 'lunch', 1000, { calories: 250 }), entry('2026-11-26', 'lunch', 1000, { calories: 250 })] }), TODAY, 12 * 60);
    expect(codes(s).filter((c) => c.endsWith('kcal_over'))).toEqual(['kcal_over']);
  });
  it('inactivity flags', () => {
    const recent = summarizeClient(bundle({ diary: [entry('2026-11-26', 'lunch', 100, { calories: 1800 })] }), TODAY, 12 * 60);
    expect(codes(recent)).not.toContain('no_log');
    const old = summarizeClient(bundle({ diary: [entry('2026-11-20', 'lunch', 100, { calories: 1800 })] }), TODAY, 12 * 60);
    expect(old.daysSinceLog).toBe(7);
    expect(old.flags.find((f) => f.code === 'no_log')?.vars).toEqual({ days: 7 });
    expect(INACTIVE_WARN_DAYS).toBe(2);
    const never = summarizeClient(bundle(), TODAY, 12 * 60);
    expect(codes(never)).toContain('no_log_long');
    expect(never.lastLogDate).toBeNull();
  });
  it('body alerts are reused, reminders are not', () => {
    const s = summarizeClient(bundle({ diary: [entry(TODAY, 'lunch', 100, { calories: 600 })], measurements: [meas('2026-11-20', 60, { visceral_fat_level: 12 })] }), TODAY, 8 * 60);
    expect(codes(s)).toContain('visceral_high');
    expect(s.level).toBe('danger');
    expect(codes(s).some((c) => c === 'meal_missing' || c === 'inbody_due' || c === 'water_behind')).toBe(false);
  });
  it('no goals is an info flag', () => {
    const s = summarizeClient(bundle({ goals: null, diary: [entry(TODAY, 'lunch', 100, { calories: 600 })] }), TODAY, 12 * 60);
    expect(codes(s)).toEqual(['no_goals']);
    expect(s.level).toBe('info');
  });
  it('ignores measurements after today', () => {
    const s = summarizeClient(bundle({ measurements: [meas('2026-11-20', 60), meas('2026-12-01', 59)] }), TODAY, 12 * 60);
    expect(s.latest?.weight_kg).toBe(60);
  });
});

describe('sortClients', () => {
  it('danger first, then warning, then by name', () => {
    const mk = (name: string, level: ClientSummary['level']) => ({ name, summary: { level } as ClientSummary });
    expect(sortClients([mk('An', 'ok'), mk('Bình', 'warning'), mk('Chi', 'danger'), mk('Ánh', 'warning')]).map((r) => r.name)).toEqual(['Chi', 'Ánh', 'Bình', 'An']);
  });
});

describe('invite codes', () => {
  it('normalizes and validates', () => {
    expect(normalizeInviteCode(' ab-c2 34x ')).toBe('ABC234');
    expect(isValidInviteCode('ABC234')).toBe(true);
    expect(isValidInviteCode('ABC1O4')).toBe(false); // 1 and O are never used
    expect(isValidInviteCode('ABC23')).toBe(false);
  });
});
