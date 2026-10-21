import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Circle, Dot, Info, Minus, Moon, Star, X } from 'lucide-react';
import { Burst } from '@/components/doodles';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ActivityIcon, Meter } from '@/components/pronark';
import { cn } from '@/lib/utils';
import { cents, dayNumber, formatDate, isDue, monthStart, settingFor, streakFor, weekdays, type ActivityKpi, type ActivityKpiLog, type Completion, type Earning, type Setting, type Task } from '@/lib/domain';
import { prefersReducedMotion, useSpring } from '@/lib/motion';

type DayState = 'completed' | 'partial' | 'missed' | 'upcoming' | 'rest';
// Day colors from the calendar mockup: mint = done, soft red = missed, lavender = rest, plain = upcoming.
const stateStyles: Record<DayState, string> = {
  completed: 'bg-mint text-mint-ink hover:brightness-[0.97]',
  partial: 'bg-mint/45 text-mint-ink hover:bg-mint/60',
  missed: 'bg-destructive/10 text-destructive hover:bg-destructive/15',
  upcoming: 'bg-card text-foreground ring-1 ring-foreground/8 hover:bg-muted',
  rest: 'bg-lavender text-lavender-ink hover:brightness-[0.97]',
};
const markStyles: Record<DayState, string> = {
  completed: 'bg-primary text-primary-foreground',
  partial: 'bg-card text-primary ring-1 ring-primary/40',
  missed: 'bg-destructive/15 text-destructive',
  upcoming: 'text-muted-foreground/60',
  rest: 'text-lavender-ink',
};

export function CalendarPage({ owner, tasks, settings, completions, kpis, kpiLogs, earnings, today, readOnly, busy, toggle, onLog }: {
  owner: string; tasks: Task[]; settings: Setting[]; completions: Completion[]; kpis: ActivityKpi[]; kpiLogs: ActivityKpiLog[]; earnings: Earning[];
  today: string; readOnly: boolean; busy: boolean; toggle: (task: Task, date: string) => Promise<boolean>; onLog: (task: Task, date: string) => void;
}) {
  const [cursor, setCursor] = useState(monthStart(today)), [selected, setSelected] = useState(today), [filter, setFilter] = useState('');
  const gridRef = useRef<HTMLDivElement>(null), direction = useRef(0);
  // Months slide in from the side you moved toward (spatial consistency), on an interruptible spring.
  const slide = useSpring(0, (v) => { if (gridRef.current) { gridRef.current.style.translate = `${(v * 28).toFixed(2)}px 0`; gridRef.current.style.opacity = String(1 - Math.min(1, Math.abs(v)) * 0.7); } }, { damping: 1, response: 0.35, precision: 0.002 });
  useEffect(() => { setFilter(''); setSelected(today); setCursor(monthStart(today)); }, [owner]);
  useEffect(() => { if (direction.current && !prefersReducedMotion()) { slide.set(direction.current); slide.to(0); } direction.current = 0; }, [cursor, slide]);

  const shift = (n: number) => { const d = new Date(cursor + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); const next = d.toISOString().slice(0, 7) + '-01'; direction.current = n; setCursor(next); setSelected(next); };
  const end = new Date(Date.UTC(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)), 0)).getUTCDate(), offset = dayNumber(cursor) - 1;
  const ownerTasks = tasks.filter((t) => t.owner_id === owner), shownTasks = ownerTasks.filter((t) => !filter || filter === t.id);
  const days = Array.from({ length: end }, (_, i) => cursor.slice(0, 8) + String(i + 1).padStart(2, '0'));
  const dueOn = (date: string) => shownTasks.filter((t) => isDue(t, settingFor(settings, t.id, date), date));
  const completedOn = (task: Task, date: string) => completions.some((c) => c.task_id === task.id && c.local_date === date && c.completed);
  const dateLabel = (date: string) => formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' });
  const canCorrect = !readOnly && selected <= today && monthStart(selected) === monthStart(today);
  const bonuses = earnings.filter((e) => e.earned_date.startsWith(cursor.slice(0, 7)) && e.kind !== 'base').sort((a, b) => b.earned_date.localeCompare(a.earned_date));
  const selectedDue = ownerTasks.filter((t) => isDue(t, settingFor(settings, t.id, selected), selected));
  const selectedDone = selectedDue.filter((t) => completedOn(t, selected)).length;
  // Streak message for the selected day (only counts habits completed that day).
  const bestStreak = selectedDue.filter((t) => completedOn(t, selected)).map((task) => ({ task, streak: streakFor(task.id, completions, settings, selected) })).sort((a, b) => b.streak - a.streak).find((x) => x.streak >= 2);
  const stepDay = (n: number) => {
    const d = new Date(selected + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    const next = d.toISOString().slice(0, 10);
    if (monthStart(next) !== cursor) { direction.current = n; setCursor(monthStart(next)); }
    setSelected(next);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="gap-4">
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></Button>
                <h2 className="text-headline min-w-40 text-center tabular">{formatDate(cursor, { month: 'long', year: 'numeric' })}</h2>
                <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></Button>
              </div>
              <NativeSelect className="w-full sm:w-52" aria-label="Activity filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <NativeSelectOption value="">All activities</NativeSelectOption>
                {ownerTasks.map((t) => <NativeSelectOption key={t.id} value={t.id}>{t.title}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <div className="-m-1.5 overflow-hidden p-1.5">
              <div ref={gridRef} className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {weekdays.map((d) => <div key={d} className="pb-1 text-center text-[0.6875rem] font-medium text-muted-foreground">{d}</div>)}
                {Array.from({ length: offset }, (_, i) => <span key={'b' + i} />)}
                {days.map((date) => {
                  const due = dueOn(date), done = due.filter((t) => completedOn(t, date)).length, bonus = bonuses.some((e) => e.earned_date === date);
                  const state: DayState = date > today ? 'upcoming' : !due.length ? 'rest' : done === due.length ? 'completed' : date === today && done === 0 ? 'upcoming' : done > 0 ? 'partial' : 'missed';
                  const Icon = bonus ? Star : state === 'completed' || state === 'partial' ? Check : state === 'missed' ? X : state === 'rest' ? Moon : Dot;
                  return (
                    <button key={date} type="button" onClick={() => setSelected(date)}
                      aria-label={dateLabel(date) + ': ' + (bonus ? 'bonus earned, ' : '') + (due.length ? done + ' of ' + due.length + ' completed' : 'rest day')}
                      aria-pressed={date === selected}
                      className={cn('relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition-[background-color,scale,box-shadow] duration-100 active:scale-95 sm:aspect-[1.15] sm:items-start sm:justify-between sm:p-2',
                        stateStyles[state], date === selected && 'ring-2 ring-lavender-ink/60 ring-offset-2 ring-offset-card', date === today && 'font-semibold')}>
                      <b className="tabular font-medium">{Number(date.slice(-2))}</b>
                      <span aria-hidden="true" className={cn('grid size-4 place-items-center rounded-full sm:size-5', bonus ? 'text-warning' : markStyles[state])}><Icon className={cn('size-3 sm:size-3.5', bonus && 'fill-warning', state === 'upcoming' && !bonus && 'size-5 sm:size-6')} strokeWidth={state === 'completed' ? 3 : 2.25} /></span>
                      <small className="tabular hidden text-[0.625rem] opacity-80 sm:block">{due.length ? done + '/' + due.length : 'Rest'}</small>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-xl bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
              {([['completed', Check, 'Completed'], ['partial', Check, 'Partly done'], ['missed', X, 'Missed'], ['rest', Moon, 'Rest day'], ['upcoming', Dot, 'Upcoming']] as const).map(([state, Icon, label]) => (
                <span key={state} className="inline-flex items-center gap-1.5"><span className={cn('grid size-5 place-items-center rounded-full', markStyles[state])}><Icon className="size-3" strokeWidth={3} aria-hidden="true" /></span>{label}</span>
              ))}
              <span className="inline-flex items-center gap-1.5"><Star className="size-4 fill-warning text-warning" aria-hidden="true" />Bonus</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-headline">{formatDate(selected, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</h2>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon-sm" className="rounded-full" aria-label="Previous day" onClick={() => stepDay(-1)}><ChevronLeft /></Button>
                    <Button variant="outline" size="icon-sm" className="rounded-full" aria-label="Next day" onClick={() => stepDay(1)}><ChevronRight /></Button>
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{selectedDone} of {selectedDue.length} scheduled activities completed</p>
                {selectedDue.length > 0 && <Meter value={selectedDone} max={selectedDue.length} className="mt-2" />}
              </div>
              <div className="flex flex-col gap-2">
                {ownerTasks.length ? ownerTasks.map((t) => {
                  const done = completedOn(t, selected), setting = settingFor(settings, t.id, selected), dueToday = isDue(t, setting, selected);
                  const kpi = kpis.find((k) => k.task_id === t.id), logged = kpiLogs.find((l) => l.task_id === t.id && l.local_date === selected);
                  return (
                    <div key={t.id} className={cn('flex flex-col gap-2 rounded-xl p-3', done ? 'bg-mint text-mint-ink' : dueToday ? 'bg-card ring-1 ring-foreground/8' : 'bg-muted/50 text-muted-foreground')}>
                      <div className="flex items-center gap-3">
                        {canCorrect && dueToday ? (
                          <button type="button" disabled={busy} onClick={() => toggle(t, selected)} aria-pressed={done} aria-label={(done ? 'Mark incomplete: ' : 'Mark complete: ') + t.title}
                            className={cn('grid size-8 shrink-0 place-items-center rounded-lg border-2 transition-[background-color,border-color,scale] duration-100 active:scale-90 disabled:opacity-60 pointer-coarse:size-10',
                              done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary/60')}>
                            {done && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
                          </button>
                        ) : (
                          <span aria-hidden="true" className={cn('grid size-8 shrink-0 place-items-center rounded-lg pointer-coarse:size-10', done ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                            {done ? <Check className="size-4" /> : dueToday ? <Circle className="size-3" /> : <Minus className="size-4" />}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5"><ActivityIcon title={t.title} className="size-4" /><strong className="truncate text-sm font-medium">{t.title}</strong></div>
                          <p className="text-xs opacity-80">{dueToday ? cents(setting?.reward_cents ?? 0) + ' base reward' : 'Not scheduled · rest for this activity'}</p>
                          {done && <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[0.6875rem] font-semibold">Completed<Check className="size-3" strokeWidth={3} aria-hidden="true" /></span>}
                        </div>
                      </div>
                      {kpi && dueToday && (
                        <div className="ml-11 flex items-center gap-2 pointer-coarse:ml-13">
                          <span className="tabular text-xs text-muted-foreground">{logged?.value ?? 0} / {kpi.target} {kpi.unit}</span>
                          {canCorrect && <Button variant="outline" size="sm" onClick={() => onLog(t, selected)}>{logged ? 'Update number' : 'Log number'}</Button>}
                        </div>
                      )}
                    </div>
                  );
                }) : <p className="text-sm text-muted-foreground">No activities yet.</p>}
              </div>
              {bestStreak && <div className="flex items-center gap-2 text-sm"><p className="min-w-0 flex-1">Great job! You’ve kept <strong>{bestStreak.task.title}</strong> going for {bestStreak.streak} days in a row.</p><Burst className="size-6 shrink-0 text-ink" /></div>}
              <p className="flex gap-2 rounded-lg bg-lavender px-3 py-2 text-xs text-lavender-ink">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {canCorrect ? 'Please remember to be honest. Your progress is most meaningful when it’s accurate.' : 'Current-month dates through today can be corrected by their owner. Other dates are read-only.'}
              </p>
            </CardContent>
          </Card>
          {bonuses.length > 0 && (
            <Card size="sm">
              <CardContent className="flex flex-col gap-2">
                <div className="text-eyebrow text-muted-foreground">Earned bonus</div>
                {bonuses.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{e.kind === 'bonus14' ? '14-day' : '28-day'} bonus · {formatDate(e.earned_date, { month: 'long', day: 'numeric' })}</span>
                    <strong className="tabular inline-flex items-center gap-1 text-primary"><Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />+{cents(e.cents)}</strong>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">Current month can be corrected. Earlier months are read-only. Your partner can view your progress; only you can edit it.</p>
        </div>
      </div>
    </div>
  );
}
