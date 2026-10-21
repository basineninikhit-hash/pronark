import { dayNumber, formatDate, isDue, settingFor, type Completion, type Setting, type Task } from '@/lib/domain';

/* ---------- data: one month of scheduled checkoffs, and the patterns found in it ---------- */

export type Record_ = { day: string; task: Task; done: boolean };
export type Insight = {
  id: string; kind: 'win' | 'pattern'; task: Task;
  headline: string;   // card title ("Reading was your most completed habit.")
  short: string;      // list title ("Reading led September")
  detail: string;     // "6 of 8 scheduled days"
  summary: string;    // detail screen statement
  link: string;       // card link text
  days: Record_[];
  tip?: { title: string; body: string; weekday?: string };
};
const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const addDays = (date: string, n: number) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const monthEnd = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
export const short = (d: string) => formatDate(d, { month: 'short', day: 'numeric' });
export const lower = (title: string) => title.charAt(0).toLowerCase() + title.slice(1);

export function monthRecords(owner: string, month: string, today: string, tasks: Task[], settings: Setting[], completions: Completion[]) {
  const mine = tasks.filter((t) => t.owner_id === owner), through = monthEnd(month) < today ? monthEnd(month) : today, out: Record_[] = [];
  for (let day = month; day <= through; day = addDays(day, 1))
    for (const task of mine) if (isDue(task, settingFor(settings, task.id, day), day)) out.push({ day, task, done: completions.some((c) => c.task_id === task.id && c.local_date === day && c.completed) });
  return out;
}

export function findInsights(records: Record_[], monthName: string): Insight[] {
  const byTask = new Map<string, Record_[]>();
  for (const r of records) byTask.set(r.task.id, [...(byTask.get(r.task.id) ?? []), r]);
  const rate = (rows: Record_[]) => rows.filter((r) => r.done).length / rows.length;
  const count = (rows: Record_[]) => `${rows.filter((r) => r.done).length} of ${rows.length}`;
  const wins: Insight[] = [], patterns: Insight[] = [];
  const tasks = [...byTask.values()].filter((rows) => rows.length >= 3);

  // Most completed habit of the month.
  const top = [...tasks].sort((a, b) => rate(b) - rate(a) || b.length - a.length)[0];
  if (top && rate(top) >= 0.6) {
    const task = top[0].task;
    wins.push({ id: 'top-' + task.id, kind: 'win', task, headline: `${task.title} was your most completed habit.`, short: `${task.title} led ${monthName}`, detail: `${count(top)} scheduled days`,
      summary: `Completed on ${count(top)} scheduled days in ${monthName}.`, link: 'See the days', days: top });
  }
  // Weekend strength, and steady habits.
  for (const rows of tasks) {
    const task = rows[0].task, weekend = rows.filter((r) => dayNumber(r.day) >= 6);
    if (weekend.length >= 3 && rate(weekend) >= 0.8 && !wins.some((w) => w.task.id === task.id))
      wins.push({ id: 'weekend-' + task.id, kind: 'win', task, headline: `${task.title} worked well on weekends.`, short: `Weekend ${lower(task.title)}`, detail: `${count(weekend)} scheduled weekend days`,
        summary: `Completed on ${count(weekend)} scheduled weekend days in ${monthName}.`, link: 'See weekend history', days: weekend });
    else if (rows.length >= 5 && rate(rows) >= 0.85 && !wins.some((w) => w.task.id === task.id))
      wins.push({ id: 'steady-' + task.id, kind: 'win', task, headline: `${task.title} stayed steady.`, short: `${task.title} stayed steady`, detail: `${count(rows)} scheduled days`,
        summary: `Completed on ${count(rows)} scheduled days in ${monthName}.`, link: 'See the days', days: rows });
  }
  // Weekday-specific misses (a pattern to check, not a cause).
  for (const rows of tasks) {
    const task = rows[0].task;
    for (let wd = 1; wd <= 7; wd++) {
      const on = rows.filter((r) => dayNumber(r.day) === wd), missed = on.filter((r) => !r.done).length;
      if (on.length >= 3 && missed >= 2 && missed / on.length >= 0.5) {
        const name = weekdayNames[wd - 1];
        patterns.push({ id: `day-${task.id}-${wd}`, kind: 'pattern', task, headline: `${task.title} was incomplete on ${missed} of ${on.length} ${name}s.`, short: `${task.title} incomplete on ${missed} of ${on.length} ${name}s`,
          detail: `A ${name} reminder may help.`, summary: `Incomplete on ${missed} of ${on.length} scheduled ${name}s in ${monthName}.`, link: 'Explore this pattern', days: on,
          tip: { title: `Try a ${name} reminder`, body: 'A gentle reminder can help you stay on track for this routine.', weekday: name } });
      }
    }
    if (rows.length >= 4 && rate(rows) < 0.4 && !patterns.some((p) => p.task.id === task.id))
      patterns.push({ id: 'hard-' + task.id, kind: 'pattern', task, headline: `${task.title} was hard to fit in.`, short: `${task.title} was hard to fit in`, detail: `${count(rows)} scheduled days completed.`,
        summary: `Completed on ${count(rows)} scheduled days in ${monthName}.`, link: 'Explore this pattern', days: rows,
        tip: { title: 'Try fewer days or a smaller version', body: 'A lighter schedule you can keep often beats an ambitious one you can’t.' } });
  }
  patterns.sort((a, b) => b.days.filter((r) => !r.done).length / b.days.length - a.days.filter((r) => !r.done).length / a.days.length);
  return [...wins, ...patterns];
}

export function weeklyTrend(records: Record_[], month: string, today: string) {
  const weeks: { start: string; end: string; done: number; total: number }[] = [];
  const last = monthEnd(month) < today ? monthEnd(month) : today;
  for (let start = month; start <= last;) {
    const weekEnd = addDays(start, 6 - (dayNumber(start) % 7));
    const end = [weekEnd, monthEnd(month), today].sort()[0]; // the current week ends today
    const rows = records.filter((r) => r.day >= start && r.day <= end);
    weeks.push({ start, end, done: rows.filter((r) => r.done).length, total: rows.length });
    start = addDays(end, 1);
  }
  return weeks;
}

