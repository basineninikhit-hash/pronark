/*
 * Apple Health suggested check-ins. The iPhone companion uploads daily totals; the database turns
 * a total that meets a linked activity's target into a suggestion. Only an explicit confirmation
 * checks the activity off. All of these rows are owner-only.
 */

export type HealthKind = 'steps' | 'workouts';
export type HealthConnection = { owner_id: string; steps_enabled: boolean; workouts_enabled: boolean; device_label: string; connected_at: string; last_sync_at: string | null; revision: number };
export type HealthLink = { task_id: string; owner_id: string; kind: HealthKind; target: number; workout_types: WorkoutType[]; revision: number };
export type HealthSuggestionStatus = 'pending' | 'confirmed' | 'dismissed' | 'withdrawn' | 'already_done' | 'undone';
export type HealthSuggestion = {
  id: string; owner_id: string; task_id: string; local_date: string; kind: HealthKind;
  measured_value: number; target: number; unit: string; source: string;
  status: HealthSuggestionStatus; data_changed: boolean; updated_at: string;
};
export type ConfirmResult = { status: HealthSuggestionStatus; rewarded: boolean };

export const workoutTypes = [
  ['running', 'Running'], ['walking', 'Walking'], ['cycling', 'Cycling'], ['strength', 'Strength'], ['hiit', 'HIIT'],
  ['yoga', 'Yoga'], ['swimming', 'Swimming'], ['dance', 'Dance'], ['other', 'Other'],
] as const;
export type WorkoutType = (typeof workoutTypes)[number][0];

/** "12,481 steps" or "35 workout minutes". */
export function amountText(kind: HealthKind, value: number) {
  const n = Math.round(Number(value)).toLocaleString('en-US');
  return kind === 'steps' ? `${n} steps` : `${n} workout minute${Number(value) === 1 ? '' : 's'}`;
}

/** Suggestions still waiting for a decision, for days the member can still change (this month). */
export function pendingSuggestions(rows: HealthSuggestion[], owner: string, today: string) {
  return rows
    .filter((s) => s.owner_id === owner && s.status === 'pending' && s.local_date <= today && s.local_date.slice(0, 7) === today.slice(0, 7))
    .sort((a, b) => b.local_date.localeCompare(a.local_date));
}

/** The suggestion behind a check-in, when the member confirmed it from Health and it's still checked. */
export function confirmedFrom(rows: HealthSuggestion[], taskId: string, date: string) {
  return rows.find((s) => s.task_id === taskId && s.local_date === date && s.status === 'confirmed');
}

/** What to tell the member after they tap Confirm. */
export function confirmMessage(result: ConfirmResult) {
  if (result.status === 'confirmed') return result.rewarded ? 'Checked off from Apple Health. Nice work!' : 'Already checked off from Apple Health.';
  if (result.status === 'already_done') return 'That day was already checked off, so nothing changed.';
  return 'Apple Health no longer shows that goal as met, so nothing was checked off.';
}

/** Default target when linking: the profile's monthly step goal, or 30 workout minutes. */
export function defaultTarget(kind: HealthKind, stepGoal: number | null | undefined) {
  return kind === 'steps' ? stepGoal ?? 10000 : 30;
}

export function targetError(kind: HealthKind, value: number) {
  if (!Number.isFinite(value)) return 'Enter a number.';
  if (kind === 'steps' && (value < 100 || value > 200000)) return 'Use 100 to 200,000 steps.';
  if (kind === 'workouts' && (value < 1 || value > 1440)) return 'Use 1 to 1,440 minutes.';
  return null;
}
