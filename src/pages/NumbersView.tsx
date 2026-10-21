import { useState, type ReactNode } from 'react';
import { Flame, NotebookPen, Plus, Target, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/segmented';
import { EmptyState, ProgressRing } from '@/components/pronark';
import { HabitBubble, PlayStat, Pop, toneSurface, habitTone } from '@/components/playful';
import { cn } from '@/lib/utils';
import { formatDate, isDue, settingFor, type ActivityKpi, type ActivityKpiLog, type Setting, type Task } from '@/lib/domain';

type Range = '14' | '30' | '90';
type Day = { date: string; value: number | null; hit: boolean | null };
const addDays = (date: string, n: number) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const num = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
const weekdayNames = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const isoDay = (date: string) => (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;

/** One number goal over a range: every scheduled day, its logged value, and whether it hit the target. */
function analyse(kpi: ActivityKpi, task: Task, settings: Setting[], logs: ActivityKpiLog[], today: string, days: number) {
  const out: Day[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    if (!isDue(task, settingFor(settings, task.id, date), date)) continue;
    const log = logs.find((l) => l.task_id === kpi.task_id && l.local_date === date);
    out.push({ date, value: log ? Number(log.value) : null, hit: log ? Number(log.value) >= Number(kpi.target) : null });
  }
  const logged = out.filter((d) => d.value !== null), hits = logged.filter((d) => d.hit).length;
  let streak = 0, best = 0;
  for (const d of out) { if (d.hit) { streak++; best = Math.max(best, streak); } else if (d.value !== null || d.date < today) streak = 0; }
  const avg = logged.length ? logged.reduce((n, d) => n + (d.value ?? 0), 0) / logged.length : null;
  // Pattern to call out: a real trend first, then the strongest weekday, then a streak.
  let pattern: { tone: 'mint' | 'rose' | 'butter' | 'lavender'; icon: 'up' | 'down' | 'trophy' | 'flame'; text: string } | null = null;
  if (logged.length >= 6) {
    const half = Math.floor(logged.length / 2), early = logged.slice(0, half), late = logged.slice(-half);
    const a = early.reduce((n, d) => n + (d.value ?? 0), 0) / early.length, b = late.reduce((n, d) => n + (d.value ?? 0), 0) / late.length;
    const change = a ? Math.round(((b - a) / a) * 100) : 0;
    if (Math.abs(change) >= 10) pattern = change > 0
      ? { tone: 'mint', icon: 'up', text: `Trending up: your recent average is ${change}% higher (${num(b)} vs ${num(a)} ${kpi.unit}).` }
      : { tone: 'rose', icon: 'down', text: `Slipping a little: your recent average is ${Math.abs(change)}% lower. A smaller daily target might help.` };
  }
  if (!pattern && logged.length >= 6) {
    const byDay = Array.from({ length: 7 }, (_, w) => logged.filter((d) => isoDay(d.date) === w)).map((rows, w) => ({ w, n: rows.length, rate: rows.length ? rows.filter((d) => d.hit).length / rows.length : 0 })).filter((x) => x.n >= 2);
    const top = byDay.sort((x, y) => y.rate - x.rate)[0];
    if (top && top.rate >= 0.6) pattern = { tone: 'butter', icon: 'trophy', text: `${weekdayNames[top.w]} are your strongest: you hit the target ${Math.round(top.rate * 100)}% of the time.` };
  }
  if (!pattern && streak >= 2) pattern = { tone: 'mint', icon: 'flame', text: `${streak} target days in a row. Keep it rolling!` };
  return { days: out, logged: logged.length, hits, streak, best, avg, pattern };
}

export function NumbersView({ owner, today, tasks, settings, kpis, kpiLogs, readOnly, onLog, privateSection }: {
  owner: string; today: string; tasks: Task[]; settings: Setting[]; kpis: ActivityKpi[]; kpiLogs: ActivityKpiLog[]; readOnly: boolean;
  onLog: (task: Task, date: string) => void; privateSection: ReactNode;
}) {
  const [range, setRange] = useState<Range>('30');
  const goals = kpis.filter((k) => k.owner_id === owner).map((kpi) => ({ kpi, task: tasks.find((t) => t.id === kpi.task_id && t.owner_id === owner) }))
    .filter((x): x is { kpi: ActivityKpi; task: Task } => !!x.task && !x.task.archive_date)
    .map((x) => ({ ...x, a: analyse(x.kpi, x.task, settings, kpiLogs.filter((l) => l.owner_id === owner), today, Number(range)) }));
  const scheduled = goals.reduce((n, g) => n + g.a.days.filter((d) => d.date <= today).length, 0);
  const logged = goals.reduce((n, g) => n + g.a.logged, 0), hits = goals.reduce((n, g) => n + g.a.hits, 0);
  const bestStreak = Math.max(0, ...goals.map((g) => g.a.best));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Segmented label="Time range" value={range} onChange={setRange} options={[{ value: '14', label: '2 weeks' }, { value: '30', label: 'Month' }, { value: '90', label: '3 months' }]} />
      </div>
      {goals.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <PlayStat layout="stack" tone="mint" icon={<Target strokeWidth={1.75} />} label="Targets hit" value={logged ? `${hits} of ${logged}` : '—'} hint="of the days you logged." />
            <PlayStat layout="stack" tone="lavender" icon={<NotebookPen strokeWidth={1.75} />} label="Logging consistency" value={scheduled ? `${Math.round((logged / scheduled) * 100)}%` : '—'} hint={`${logged} of ${scheduled} scheduled days logged.`} />
            <PlayStat layout="stack" tone="butter" icon={<Flame strokeWidth={1.75} />} label="Best target streak" value={`${bestStreak} day${bestStreak === 1 ? '' : 's'}`} hint="in a row at or above target." />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {goals.map((g) => <GoalCard key={g.kpi.task_id} {...g} today={today} readOnly={readOnly} onLog={() => onLog(g.task, today)} />)}
          </div>
        </>
      ) : (
        <EmptyState icon={<Target className="size-6" aria-hidden="true" />}>
          No number goals yet. Edit a habit on Home and turn on “Track a measurable goal”, like 10,000 steps or 3 liters of water.
        </EmptyState>
      )}
      {privateSection}
    </div>
  );
}

function GoalCard({ kpi, task, a, today, readOnly, onLog }: { kpi: ActivityKpi; task: Task; a: ReturnType<typeof analyse>; today: string; readOnly: boolean; onLog: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const tone = habitTone(task.title);
  const pickedDay = a.days.find((d) => d.date === picked);
  const todayLog = a.days.find((d) => d.date === today);
  const hitRate = a.logged ? a.hits / a.logged : 0;
  const PatternIcon = a.pattern ? { up: TrendingUp, down: TrendingDown, trophy: Trophy, flame: Flame }[a.pattern.icon] : null;
  return (
    <article className="relative flex flex-col gap-4 overflow-hidden rounded-3xl bg-card p-5 ring-1 ring-foreground/8">
      <Pop tone={tone} className="absolute top-4 right-4 size-8" />
      <div className="flex items-center gap-3">
        <HabitBubble title={task.title} />
        <div className="min-w-0 pr-10"><h3 className="text-lg font-semibold leading-snug">{task.title}</h3><p className="text-sm text-muted-foreground">Target: {num(Number(kpi.target))} {kpi.unit} a day</p></div>
      </div>

      <div className="flex items-center gap-5">
        <ProgressRing value={hitRate} size={104} stroke={10} label={`Hit the target on ${a.hits} of ${a.logged} logged days`}>
          <div className="text-center leading-tight"><strong className="tabular block text-2xl font-bold">{a.logged ? Math.round(hitRate * 100) + '%' : '—'}</strong><small className="text-[0.625rem] text-muted-foreground">target hit</small></div>
        </ProgressRing>
        <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div><dt className="text-xs text-muted-foreground">Average</dt><dd className="tabular font-semibold">{a.avg !== null ? `${num(a.avg)} ${kpi.unit}` : '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Today</dt><dd className="tabular font-semibold">{todayLog?.value != null ? `${num(todayLog.value)} ${kpi.unit}` : todayLog ? 'Not logged' : 'Rest day'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Logged</dt><dd className="tabular font-semibold">{a.logged} of {a.days.length} days</dd></div>
          <div><dt className="text-xs text-muted-foreground">Current streak</dt><dd className="tabular font-semibold">{a.streak} day{a.streak === 1 ? '' : 's'}</dd></div>
        </dl>
      </div>

      {/* One dot per scheduled day. Tap a dot to see that day's number. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${task.title}, each scheduled day`}>
          {a.days.map((d) => (
            <button key={d.date} type="button" onClick={() => setPicked(picked === d.date ? null : d.date)} aria-pressed={picked === d.date}
              aria-label={`${formatDate(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}: ${d.value === null ? 'not logged' : `${num(d.value)} ${kpi.unit}, ${d.hit ? 'target hit' : 'below target'}`}`}
              className={cn('size-5 rounded-full transition-[scale,box-shadow] duration-100 active:scale-90 sm:size-6',
                d.value === null ? 'ring-1 ring-inset ring-foreground/20' : d.hit ? 'bg-mint-pop' : 'bg-rose-pop/70',
                picked === d.date && 'ring-2 ring-foreground ring-offset-2 ring-offset-card', d.date === today && 'outline-2 outline-offset-2 outline-dashed outline-foreground/30')} />
          ))}
        </div>
        <p className="min-h-5 text-xs text-muted-foreground" aria-live="polite">
          {pickedDay
            ? <><strong className="text-foreground">{formatDate(pickedDay.date, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>: {pickedDay.value === null ? 'not logged' : <>{num(pickedDay.value)} {kpi.unit} · {Math.round((pickedDay.value / Number(kpi.target)) * 100)}% of target</>}</>
            : <span className="inline-flex flex-wrap gap-x-3"><span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-full bg-mint-pop" />Hit</span><span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-full bg-rose-pop/70" />Below target</span><span className="inline-flex items-center gap-1"><i className="size-2.5 rounded-full ring-1 ring-foreground/25" />Not logged</span><span>Tap a dot for details</span></span>}
        </p>
      </div>

      {a.pattern && PatternIcon && (
        <p className={cn('flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm ring-1 ring-inset', toneSurface[a.pattern.tone])}>
          <PatternIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="text-foreground">{a.pattern.text}</span>
        </p>
      )}
      {!readOnly && todayLog && <Button variant={todayLog.value === null ? 'default' : 'outline'} className="self-start" onClick={onLog}><Plus data-icon="inline-start" />{todayLog.value === null ? 'Log today’s number' : 'Update today'}</Button>}
    </article>
  );
}
