import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Info, Star } from 'lucide-react';
import { MonthSwitcher } from '@/components/month-switcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ActivityIcon } from '@/components/pronark';
import { cn } from '@/lib/utils';
import { cents, dayNumber, formatDate, isDue, monthStart, settingFor, streakFor, weekdays, type ActivityKpi, type ActivityKpiLog, type Completion, type Earning, type Setting, type Task } from '@/lib/domain';
import { prefersReducedMotion, useSpring } from '@/lib/motion';

type DayState = 'completed' | 'partial' | 'missed' | 'rest' | 'future';
// Cell colors from the calendar reference: green all done, yellow partly done, red none done, gray rest / not tracked.
const cellStyles: Record<DayState, string> = {
  completed: 'bg-mint text-mint-ink',
  partial: 'bg-warning/15 text-warning-foreground',
  missed: 'bg-destructive/12 text-destructive',
  rest: 'bg-muted text-muted-foreground',
  future: 'bg-card text-muted-foreground ring-1 ring-inset ring-foreground/6',
};
const legend: [DayState, string, string][] = [
  ['completed', 'Completed', 'All done'],
  ['partial', 'Partial', 'Some done'],
  ['missed', 'Missed', 'None done'],
  ['rest', 'Rest day', 'Not tracked'],
];
// Sunday-first week, like a wall calendar.
const sundayFirst = [weekdays[6], ...weekdays.slice(0, 6)];
const addDays = (date: string, n: number) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const scheduleText = (days: number[] | undefined) => {
  if (!days?.length) return 'Not scheduled';
  if (days.length === 7) return 'Daily';
  if (days.join() === '1,2,3,4,5') return 'Weekdays';
  if (days.join() === '6,7') return 'Weekends';
  return days.map((d) => weekdays[d - 1]).join(', ');
};

export function CalendarPage({ owner, tasks, settings, completions, kpis, kpiLogs, earnings, today, readOnly, busy, toggle, onLog }: {
  owner: string; tasks: Task[]; settings: Setting[]; completions: Completion[]; kpis: ActivityKpi[]; kpiLogs: ActivityKpiLog[]; earnings: Earning[];
  today: string; readOnly: boolean; busy: boolean; toggle: (task: Task, date: string) => Promise<boolean>; onLog: (task: Task, date: string) => void;
}) {
  const [cursor, setCursor] = useState(monthStart(today)), [selected, setSelected] = useState(today), [filter, setFilter] = useState(''), [correcting, setCorrecting] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null), direction = useRef(0);
  // Months slide in from the side you moved toward (spatial consistency), on an interruptible spring.
  const slide = useSpring(0, (v) => { if (gridRef.current) { gridRef.current.style.translate = `${(v * 28).toFixed(2)}px 0`; gridRef.current.style.opacity = String(1 - Math.min(1, Math.abs(v)) * 0.7); } }, { damping: 1, response: 0.35, precision: 0.002 });
  useEffect(() => { setFilter(''); setSelected(today); setCursor(monthStart(today)); }, [owner]);
  useEffect(() => { if (direction.current && !prefersReducedMotion()) { slide.set(direction.current); slide.to(0); } direction.current = 0; }, [cursor, slide]);
  useEffect(() => { setCorrecting(false); }, [selected]);

  const shift = (n: number) => { const d = new Date(cursor + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); const next = d.toISOString().slice(0, 7) + '-01'; direction.current = n; setCursor(next); setSelected(next); };
  const stepDay = (n: number) => { const next = addDays(selected, n); if (monthStart(next) !== cursor) { direction.current = n; setCursor(monthStart(next)); } setSelected(next); };

  const ownerTasks = tasks.filter((t) => t.owner_id === owner), shownTasks = ownerTasks.filter((t) => !filter || filter === t.id);
  const dueOn = (date: string, list = shownTasks) => list.filter((t) => isDue(t, settingFor(settings, t.id, date), date));
  const completedOn = (task: Task, date: string) => completions.some((c) => c.task_id === task.id && c.local_date === date && c.completed);
  const stateOf = (date: string): { state: DayState; done: number; due: number } => {
    const due = dueOn(date), done = due.filter((t) => completedOn(t, date)).length;
    const state: DayState = !due.length ? 'rest' : date > today ? 'future' : done === due.length ? 'completed' : done > 0 ? 'partial' : date === today ? 'future' : 'missed';
    return { state, done, due: due.length };
  };

  // Grid starts on the Sunday on/before the 1st and includes faded neighbor-month days.
  const end = new Date(Date.UTC(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)), 0)).getUTCDate();
  const lead = dayNumber(cursor) % 7; // Sun = 0
  const cells = Array.from({ length: Math.ceil((lead + end) / 7) * 7 }, (_, i) => addDays(cursor, i - lead));
  const bonuses = earnings.filter((e) => e.earned_date.startsWith(cursor.slice(0, 7)) && e.kind !== 'base').sort((a, b) => b.earned_date.localeCompare(a.earned_date));
  const bonusDays = new Set(earnings.filter((e) => e.kind !== 'base').map((e) => e.earned_date));

  const canCorrect = !readOnly && selected <= today && monthStart(selected) === monthStart(today);
  const selectedDue = dueOn(selected, ownerTasks), selectedDone = selectedDue.filter((t) => completedOn(t, selected)).length;
  const selectedState = !selectedDue.length ? 'rest' : selected > today ? 'future' : selectedDone === selectedDue.length ? 'completed' : selectedDone > 0 ? 'partial' : selected === today ? 'future' : 'missed';
  const bestStreak = selectedDue.filter((t) => completedOn(t, selected)).map((task) => ({ task, streak: streakFor(task.id, completions, settings, selected) })).sort((a, b) => b.streak - a.streak).find((x) => x.streak >= 2);
  const isToday = selected === today;
  const summary = !selectedDue.length ? 'Rest day. Nothing was scheduled.'
    : selected > today ? 'Coming up. Check back on the day.'
    : selectedDone === selectedDue.length ? `Great job! You completed all your habits ${isToday ? 'today' : 'that day'}.`
    : selectedDone > 0 ? `Nice progress. ${selectedDue.length - selectedDone} more ${isToday ? 'to go today' : 'were left that day'}.`
    : isToday ? 'Nothing checked off yet. You’ve got this!' : 'No habits were checked off that day.';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NativeSelect className="w-full sm:w-56" aria-label="Show activity" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <NativeSelectOption value="">All activities</NativeSelectOption>
          {ownerTasks.map((t) => <NativeSelectOption key={t.id} value={t.id}>{t.title}</NativeSelectOption>)}
        </NativeSelect>
        <MonthSwitcher className="w-full sm:w-auto" label={formatDate(cursor, { month: 'long', year: 'numeric' })} onPrev={() => shift(-1)} onNext={() => shift(1)} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-3">
          <Card className="py-2">
            <CardContent className="px-2 sm:px-3">
              <div className="overflow-hidden">
                <div ref={gridRef} className="grid grid-cols-7 gap-1 sm:gap-1.5">
                  {sundayFirst.map((d) => <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>)}
                  {cells.map((date) => {
                    const inMonth = monthStart(date) === cursor;
                    const { state, done, due } = stateOf(date);
                    return (
                      <button key={date} type="button" onClick={() => { if (!inMonth) { direction.current = date < cursor ? -1 : 1; setCursor(monthStart(date)); } setSelected(date); }}
                        aria-label={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' }) + ': ' + (bonusDays.has(date) ? 'bonus earned, ' : '') + (due ? `${done} of ${due} completed` : 'rest day')}
                        aria-pressed={date === selected}
                        className={cn('relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl text-sm transition-[background-color,scale,box-shadow,opacity] duration-100 active:scale-95 sm:aspect-[1/0.92]',
                          cellStyles[state], !inMonth && 'opacity-40', date === selected && 'ring-2 ring-primary ring-inset', date === today && 'font-bold')}>
                        <span className="tabular font-semibold">{Number(date.slice(-2))}</span>
                        <span className="tabular text-[0.6875rem] font-medium sm:text-xs">{!due ? '—' : date > today ? '\u00a0' : `${done}/${due}`}</span>
                        {bonusDays.has(date) && <Star className="absolute top-1 right-1 size-3 fill-warning text-warning sm:size-3.5" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-card px-4 py-3 text-xs ring-1 ring-foreground/8 sm:grid-cols-4">
            {legend.map(([state, label, hint]) => (
              <span key={state} className="flex items-center gap-2">
                <span className={cn('size-5 shrink-0 rounded-full', cellStyles[state])} aria-hidden="true" />
                <span><span className="block font-medium">{label}</span><span className="text-muted-foreground">{hint}</span></span>
              </span>
            ))}
          </div>
          {bonuses.length > 0 && (
            <div className="flex flex-wrap gap-2 text-sm">
              {bonuses.map((e) => <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 ring-1 ring-foreground/8"><Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />{e.kind === 'bonus14' ? '14-day' : '28-day'} bonus · {formatDate(e.earned_date, { month: 'short', day: 'numeric' })}<b className="tabular text-primary">+{cents(e.cents)}</b></span>)}
            </div>
          )}
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-headline text-lg">{formatDate(selected, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</h2>
              <div className="flex gap-1.5">
                <Button variant="outline" size="icon" className="rounded-full" aria-label="Previous day" onClick={() => stepDay(-1)}><ChevronLeft /></Button>
                <Button variant="outline" size="icon" className="rounded-full" aria-label="Next day" onClick={() => stepDay(1)}><ChevronRight /></Button>
              </div>
            </div>

            <div className={cn('flex items-center gap-4 rounded-2xl p-4', selectedState === 'completed' ? 'bg-mint text-mint-ink' : selectedState === 'partial' ? 'bg-warning/15 text-warning-foreground' : selectedState === 'missed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')} role="status">
              <strong className="tabular shrink-0 text-4xl font-bold tracking-tight text-foreground">{selectedDue.length ? `${selectedDone}/${selectedDue.length}` : '—'}</strong>
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground">{selectedDue.length ? 'habits completed' : 'Rest day'}</p>
                <p className="text-sm">{summary}</p>
              </div>
            </div>
            {bestStreak && <p className="-mt-1 text-sm text-muted-foreground">🔥 <strong className="text-foreground">{bestStreak.task.title}</strong>: {bestStreak.streak} days in a row.</p>}

            <ul className="scroll-area -mr-2 flex max-h-[60dvh] flex-col divide-y divide-foreground/8 overflow-y-auto pr-2 lg:max-h-[30rem]" tabIndex={0} aria-label="Habits on this day">
              {ownerTasks.length ? ownerTasks.map((t) => {
                const done = completedOn(t, selected), setting = settingFor(settings, t.id, selected), dueToday = isDue(t, setting, selected);
                const kpi = kpis.find((k) => k.task_id === t.id), logged = kpiLogs.find((l) => l.task_id === t.id && l.local_date === selected);
                const editable = correcting && canCorrect && dueToday;
                return (
                  <li key={t.id} className={cn('flex items-center gap-3 py-3', !dueToday && 'opacity-55')}>
                    <span className="grid size-10 shrink-0 place-items-center"><ActivityIcon title={t.title} className="size-6 text-ink" /></span>
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-semibold">{t.title}</strong>
                      <span className="text-xs text-muted-foreground">{scheduleText(setting?.weekdays)}</span>
                      {kpi && dueToday && (
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="tabular">{(logged?.value ?? 0).toLocaleString()} / {kpi.target.toLocaleString()} {kpi.unit}</span>
                          {editable && <Button variant="outline" size="sm" onClick={() => onLog(t, selected)}>{logged ? 'Update number' : 'Log number'}</Button>}
                        </span>
                      )}
                    </div>
                    {editable ? (
                      <button type="button" disabled={busy} onClick={() => toggle(t, selected)} aria-pressed={done} aria-label={(done ? 'Mark incomplete: ' : 'Mark complete: ') + t.title}
                        className={cn('grid size-9 shrink-0 place-items-center rounded-full border-2 transition-[background-color,border-color,scale] duration-100 active:scale-90 disabled:opacity-60 pointer-coarse:size-11',
                          done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary/60')}>
                        {done && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
                      </button>
                    ) : dueToday ? (
                      <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', done ? 'bg-mint text-primary' : 'bg-muted')} aria-hidden="true">{done && <Check className="size-4" strokeWidth={3} />}</span>
                    ) : null}
                    <span className="w-24 shrink-0 text-right text-xs">
                      {!dueToday ? <span className="text-muted-foreground">Not scheduled</span> : done ? <><span className="block text-muted-foreground">Completed</span><b className="tabular text-sm font-semibold text-primary">+ {cents(setting?.reward_cents ?? 0)}</b></> : <><span className="block text-muted-foreground">{selected > today ? 'Upcoming' : 'Not completed'}</span><span className="tabular text-sm text-muted-foreground">{cents(setting?.reward_cents ?? 0)}</span></>}
                    </span>
                  </li>
                );
              }) : <li className="py-3 text-sm text-muted-foreground">No activities yet.</li>}
            </ul>

            {canCorrect ? (
              correcting ? (
                <div className="flex flex-col gap-2">
                  <p className="flex gap-2 rounded-xl bg-lavender px-3 py-2 text-xs text-lavender-ink"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Please remember to be honest. Your progress is most meaningful when it’s accurate.</p>
                  <Button variant="ghost" className="self-start" onClick={() => setCorrecting(false)}>Done correcting</Button>
                </div>
              ) : <Button variant="link" className="self-start px-0" onClick={() => setCorrecting(true)}>Correct a checkoff</Button>
            ) : <p className="text-xs text-muted-foreground">{readOnly ? 'Only the owner can correct their checkoffs.' : 'Current-month dates through today can be corrected. Other dates are read-only.'}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
