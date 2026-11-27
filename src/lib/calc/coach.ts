import type { BodyMeasurement, ClientBundle, Macros } from '@/types';
import { computeAlerts, DEFAULT_ALERT_PREFS, type AlertLevel, type HealthAlert } from './alerts';
import { dailyTotals } from './nutrition';
import { addDays, daysBetween } from './dates';

/**
 * PT dashboard: a per-client summary for "today" plus warning flags. The flags
 * reuse the client-side health alert rules (nutrition + body). Reminders are
 * left out because they are meant for the client, not the PT; instead the PT
 * gets an inactivity flag when the client stops logging meals.
 */

export const COACH_LOOKBACK_DAYS = 30; // diary window loaded for the overview
export const INACTIVE_WARN_DAYS = 2; // no meal logged for this many days -> warning

export type CoachFlagCode = 'no_log' | 'no_log_long' | 'no_goals';

export interface CoachFlag {
  id: string;
  level: AlertLevel;
  /** A reused health alert, or a PT-only flag. */
  alert?: HealthAlert;
  code?: CoachFlagCode;
  vars?: Record<string, string | number>;
  /** Set when the alert is about yesterday's (complete) day. */
  when?: 'yesterday';
}

export interface ClientSummary {
  today: string;
  goals: Macros | null;
  totals: Macros; // today
  entriesToday: number;
  mealsToday: number; // distinct meal types logged today
  lastLogDate: string | null; // within the lookback window
  daysSinceLog: number | null; // null = nothing in the lookback window
  latest: BodyMeasurement | null;
  flags: CoachFlag[];
  level: AlertLevel | 'ok'; // worst flag
}

const ORDER: Record<AlertLevel, number> = { danger: 0, warning: 1, info: 2 };

export const goalsToMacros = (g: ClientBundle['goals']): Macros | null =>
  g ? { calories: g.calories_kcal, protein: g.protein_g, carbs: g.carbs_g, fat: g.fat_g, fiber: g.fiber_g } : null;

/**
 * @param today the client's "today" (YYYY-MM-DD in the client's timezone)
 * @param nowMinutes minutes since midnight in the client's timezone
 */
export function summarizeClient(b: ClientBundle, today: string, nowMinutes: number): ClientSummary {
  const goals = goalsToMacros(b.goals);
  const todays = b.diary.filter((e) => e.entry_date === today);
  const yesterday = addDays(today, -1);
  const yEntries = b.diary.filter((e) => e.entry_date === yesterday);
  const lastLogDate = b.diary.reduce<string | null>((m, e) => (e.entry_date <= today && (m == null || e.entry_date > m) ? e.entry_date : m), null);
  const daysSinceLog = lastLogDate ? daysBetween(lastLogDate, today) : null;
  const measurements = [...b.measurements].sort((x, y) => x.measured_on.localeCompare(y.measured_on));
  const latest = measurements.filter((m) => m.measured_on <= today).pop() ?? null;

  const prefs = { ...DEFAULT_ALERT_PREFS, nutrition: true, body: true, reminders: false };
  const base = { today, nowMinutes, goals, measurements, bmiStandard: b.settings?.bmi_standard ?? 'who', fitnessGoal: b.profile.fitness_goal, waterMl: null, prefs } as const;

  const flags: CoachFlag[] = [];
  for (const a of computeAlerts({ ...base, date: today, entries: todays })) flags.push({ id: a.id, level: a.level, alert: a });
  // Yesterday is a finished day, so under-eating (calories/protein/fiber) shows up there.
  if (yEntries.length) {
    for (const a of computeAlerts({ ...base, date: yesterday, entries: yEntries, prefs: { ...prefs, body: false } }))
      if (!flags.some((f) => f.alert?.code === a.code)) flags.push({ id: `y_${a.id}`, level: a.level, alert: a, when: 'yesterday' });
  }
  if (daysSinceLog == null) flags.push({ id: 'no_log_long', level: 'warning', code: 'no_log_long', vars: { days: COACH_LOOKBACK_DAYS } });
  else if (daysSinceLog >= INACTIVE_WARN_DAYS) flags.push({ id: 'no_log', level: 'warning', code: 'no_log', vars: { days: daysSinceLog } });
  if (!goals) flags.push({ id: 'no_goals', level: 'info', code: 'no_goals' });
  flags.sort((x, y) => ORDER[x.level] - ORDER[y.level]);

  const worst = flags[0]?.level ?? 'ok';
  return {
    today, goals, totals: dailyTotals(todays), entriesToday: todays.length, mealsToday: new Set(todays.map((e) => e.meal_type)).size,
    lastLogDate, daysSinceLog, latest, flags, level: worst,
  };
}

/** Clients needing attention first, then by name. */
export function sortClients<T extends { summary: ClientSummary; name: string }>(rows: T[]): T[] {
  const rank = (s: ClientSummary) => (s.level === 'ok' ? 3 : ORDER[s.level]);
  return [...rows].sort((a, b) => rank(a.summary) - rank(b.summary) || a.name.localeCompare(b.name, 'vi'));
}

/** Invite codes are 6 characters without look-alikes (0/O, 1/I). */
export const normalizeInviteCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export const isValidInviteCode = (s: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(s);
