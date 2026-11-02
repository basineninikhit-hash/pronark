import { weekdays } from '@/lib/domain';

export type Routine = { id: string; owner_id: string; name: string; active_days: number[]; start_time: string | null; reminder_enabled: boolean; archived_at: string | null; revision: number };
export type RoutineCategory = { id: string; routine_id: string; position: number; title: string };
export type RoutineStep = { id: string; category_id: string; routine_id: string; position: number; title: string; instruction: string; weekdays: number[] | null; timer_seconds: number | null; habit_task_id: string | null; record_time: boolean; enabled: boolean };
export type SnapStep = { id: string; title: string; instruction: string; timer_seconds: number | null; habit_task_id: string | null; record_time: boolean };
export type SnapCategory = { id: string; title: string; steps: SnapStep[]; later?: boolean };
export type RoutineRun = { id: string; owner_id: string; routine_id: string; start_date: string; snapshot: SnapCategory[]; state: 'active' | 'finished' | 'ended'; started_at: string; finished_at: string | null; step_started_at: string; paused_at: string | null; step_paused_ms: number };
export type StepResult = { run_id: string; step_id: string; status: 'done' | 'skipped'; started_at: string; resolved_at: string; local_date: string; active_ms: number; habit_task_id: string | null; habit_outcome: 'none' | 'checked' | 'already' | 'not_scheduled'; created_checkoff: boolean };

/** Everything the runner and summary show, derived from the run's snapshot and its saved results. */
export function runProgress(run: RoutineRun, results: StepResult[]) {
  const byStep = new Map(results.filter((r) => r.run_id === run.id).map((r) => [r.step_id, r]));
  const flat = run.snapshot.flatMap((cat, ci) => cat.steps.map((step, si) => ({ cat, ci, step, si, result: byStep.get(step.id) })));
  const current = flat.find((x) => !x.result) ?? null;
  const done = flat.filter((x) => x.result?.status === 'done').length, skipped = flat.filter((x) => x.result?.status === 'skipped').length;
  const categories = run.snapshot.map((cat, ci) => {
    const rows = flat.filter((x) => x.ci === ci);
    return { cat, ci, total: rows.length, done: rows.filter((x) => x.result?.status === 'done').length, skipped: rows.filter((x) => x.result?.status === 'skipped').length,
      resolved: rows.every((x) => x.result), elapsedMs: rows.reduce((n, x) => n + (x.result?.active_ms ?? 0), 0) };
  });
  const lastResult = [...byStep.values()].sort((a, b) => b.resolved_at.localeCompare(a.resolved_at))[0] ?? null;
  return { flat, current, done, skipped, total: flat.length, resolved: done + skipped, categories, categoriesDone: categories.filter((c) => c.resolved).length, lastResult, byStep };
}

/** Milliseconds spent on the current step so far, excluding pauses. */
export function stepElapsedMs(run: RoutineRun, now = Date.now()) {
  const end = run.paused_at ? Date.parse(run.paused_at) : now;
  return Math.max(0, end - Date.parse(run.step_started_at) - Number(run.step_paused_ms || 0));
}

export const dayLabel = (days: number[] | null | undefined) => {
  if (!days?.length) return 'No days';
  if (days.length === 7) return 'Every day';
  if (days.join() === '1,2,3,4,5') return 'Weekdays';
  if (days.join() === '6,7') return 'Weekends';
  return days.map((d) => weekdays[d - 1]).join(', ');
};
export const isoDay = (date: string) => (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7 + 1;
export const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const duration = (ms: number) => { const m = Math.round(ms / 60000); return m < 1 ? 'under a minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
export const timeOfDay = (iso: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).format(new Date(iso));
export const startTimes = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
export const time12 = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

/**
 * How long a step usually takes: the median of its past Done times (capped at an hour, so a
 * forgotten run doesn't skew it), else its timer, else the typical step overall (or a minute).
 */
export function stepEstimator(results: StepResult[]) {
  const byStep = new Map<string, number[]>();
  for (const r of results) if (r.status === 'done' && r.active_ms > 0) byStep.set(r.step_id, [...(byStep.get(r.step_id) ?? []), Math.min(r.active_ms, 3_600_000)]);
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const all = [...byStep.values()].flat(), typical = all.length ? median(all) : 60_000;
  const estimate = (step: { id: string; timer_seconds: number | null }) => { const xs = byStep.get(step.id); return xs?.length ? median(xs) : step.timer_seconds ? step.timer_seconds * 1000 : typical; };
  /** Whether a step's estimate comes from history or a timer (not just a guess). */
  const known = (step: { id: string; timer_seconds: number | null }) => byStep.has(step.id) || !!step.timer_seconds;
  return { estimate, known };
}

/** Rough length, rounded to whole minutes: "about 46 min". */
export const roughLength = (ms: number) => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };

/** The moment a wall-clock time (HH:MM) happens on a date in America/New_York, the app's accounting zone. */
export function eastTime(date: string, hhmm: string) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(new Date(guess)).map((p) => [p.type, Number(p.value)]));
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return guess - (shown - guess);
}

/** Which part of the day a routine belongs to, from its start time. */
export const routinePeriod = (r: Routine): 'morning' | 'afternoon' | 'evening' | 'anytime' => {
  if (!r.start_time) return 'anytime';
  const h = Number(r.start_time.slice(0, 2));
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
};

/** Draft shape used by the builder (and sent to save_routine). */
export type DraftStep = { id: string; title: string; instruction: string; weekdays: number[] | null; timer_seconds: number | null; habit_task_id: string | null; record_time: boolean; enabled: boolean };
export type DraftCategory = { id: string; title: string; steps: DraftStep[] };
export type Draft = { id: string; name: string; active_days: number[]; start_time: string | null; reminder_enabled: boolean; categories: DraftCategory[]; revision: number };

export const newStep = (title = '', extra: Partial<DraftStep> = {}): DraftStep => ({ id: crypto.randomUUID(), title, instruction: '', weekdays: null, timer_seconds: null, habit_task_id: null, record_time: false, enabled: true, ...extra });
export const newCategory = (title = '', steps: DraftStep[] = []): DraftCategory => ({ id: crypto.randomUUID(), title, steps });

/** The morning routine from the planning example, as an editable starting point. */
export function morningExample(): Draft {
  return {
    id: crypto.randomUUID(), name: 'Morning routine', active_days: [1, 2, 3, 4, 5, 6, 7], start_time: '06:30', reminder_enabled: false, revision: 0,
    categories: [
      newCategory('Wake Up', [newStep('Feet on the floor'), newStep('Confirm you’re out of bed', { record_time: true })]),
      newCategory('Room Reset', [newStep('Make the bed'), newStep('Pick up clothes'), newStep('Clear the desk')]),
      newCategory('Bathroom & Gym Prep', [newStep('Brush teeth', { timer_seconds: 120 }), newStep('Take today’s vitamins'), newStep('Wash face'), newStep('Change into gym clothes'), newStep('Check the weather')]),
      newCategory('Gym', [newStep('Leave for the gym'), newStep('Finish your workout')]),
      newCategory('Breakfast', [newStep('Yogurt mixture'), newStep('Egg bite'), newStep('Smoothie')]),
      newCategory('Shower', [newStep('Shower'), newStep('Shampoo & conditioner', { weekdays: [3, 6] }), newStep('Cold finish', { timer_seconds: 30 })]),
      newCategory('Get Ready', [newStep('Work outfit'), newStep('Deodorant & cologne'), newStep('Finish routine')]),
    ],
  };
}

export function draftFrom(routine: Routine, categories: RoutineCategory[], steps: RoutineStep[]): Draft {
  return {
    id: routine.id, name: routine.name, active_days: routine.active_days, start_time: routine.start_time?.slice(0, 5) ?? null, reminder_enabled: routine.reminder_enabled, revision: routine.revision,
    categories: categories.filter((c) => c.routine_id === routine.id).sort((a, b) => a.position - b.position).map((c) => ({
      id: c.id, title: c.title,
      steps: steps.filter((s) => s.category_id === c.id).sort((a, b) => a.position - b.position).map(({ id, title, instruction, weekdays, timer_seconds, habit_task_id, record_time, enabled }) => ({ id, title, instruction, weekdays, timer_seconds, habit_task_id, record_time, enabled })),
    })),
  };
}

/** Steps that appear on a given ISO weekday. */
export const stepShowsOn = (step: DraftStep | RoutineStep, day: number) => step.enabled && (!step.weekdays || step.weekdays.includes(day));

/** Steps a routine has on an ISO weekday, and roughly how long they take (shown only when some timing is known). */
export function routineToday(routine: Routine, categories: RoutineCategory[], steps: RoutineStep[], day: number, est: ReturnType<typeof stepEstimator>) {
  const pos = new Map(categories.map((c) => [c.id, c.position]));
  const list = steps.filter((s) => s.routine_id === routine.id && stepShowsOn(s, day)).sort((a, b) => (pos.get(a.category_id) ?? 0) - (pos.get(b.category_id) ?? 0) || a.position - b.position);
  return { steps: list, ms: list.reduce((n, s) => n + est.estimate(s), 0), timed: list.some(est.known) };
}
