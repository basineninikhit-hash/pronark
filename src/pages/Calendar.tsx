import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Circle, Info, Minus, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ActivityIcon, Meter } from '@/components/pronark';
import { cn } from '@/lib/utils';
import { cents, dayNumber, formatDate, isDue, monthStart, settingFor, weekdays, type ActivityKpi, type ActivityKpiLog, type Completion, type Earning, type Setting, type Task } from '@/lib/domain';
import { prefersReducedMotion, useSpring } from '@/lib/motion';

type DayState = 'completed' | 'missed' | 'upcoming' | 'rest';
const stateStyles: Record<DayState, string> = {
  completed: 'bg-primary/12 text-primary hover:bg-primary/18',
  missed: 'bg-destructive/8 text-destructive hover:bg-destructive/12',
  upcoming: 'bg-card text-foreground ring-1 ring-foreground/10 hover:bg-muted',
  rest: 'bg-muted/60 text-muted-foreground hover:bg-muted',
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

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">Track your progress and build a healthier, happier you.</p>
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
            <div className="overflow-hidden">
              <div ref={gridRef} className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {weekdays.map((d) => <div key={d} className="pb-1 text-center text-[0.6875rem] font-medium text-muted-foreground">{d}</div>)}
                {Array.from({ length: offset }, (_, i) => <span key={'b' + i} />)}
                {days.map((date) => {
                  const due = dueOn(date), done = due.filter((t) => completedOn(t, date)).length, bonus = bonuses.some((e) => e.earned_date === date);
                  const state: DayState = date > today ? 'upcoming' : !due.length ? 'rest' : done === due.length ? 'completed' : date === today ? 'upcoming' : 'missed';
                  const Icon = bonus ? Star : state === 'completed' ? Check : state === 'missed' ? X : state === 'rest' ? Minus : Circle;
                  return (
                    <button key={date} type="button" onClick={() => setSelected(date)}
                      aria-label={dateLabel(date) + ': ' + (bonus ? 'bonus earned, ' : '') + (due.length ? done + ' of ' + due.length + ' completed' : 'rest day')}
                      aria-pressed={date === selected}
                      className={cn('relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition-[background-color,scale,box-shadow] duration-100 active:scale-95 sm:aspect-[1.15] sm:items-start sm:justify-between sm:p-2',
                        stateStyles[state], date === selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background', date === today && 'font-semibold')}>
                      <b className="tabular font-medium">{Number(date.slice(-2))}</b>
                      <Icon aria-hidden="true" className={cn('size-3 sm:size-3.5', bonus && 'fill-warning text-warning')} />
                      <small className="tabular hidden text-[0.625rem] opacity-80 sm:block">{due.length ? done + '/' + due.length : 'Rest'}</small>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" aria-hidden="true" />Completed</span>
              <span className="inline-flex items-center gap-1.5"><X className="size-3.5 text-destructive" aria-hidden="true" />Missed</span>
              <span className="inline-flex items-center gap-1.5"><Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />Bonus</span>
              <span className="inline-flex items-center gap-1.5"><Circle className="size-3.5" aria-hidden="true" />Upcoming</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div>
                <div className="text-eyebrow text-muted-foreground">Selected day</div>
                <h2 className="text-headline mt-1">{dateLabel(selected)}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{selectedDone} of {selectedDue.length} scheduled activities completed</p>
                {selectedDue.length > 0 && <Meter value={selectedDone} max={selectedDue.length} className="mt-2" />}
              </div>
              <div className="flex flex-col divide-y">
                {ownerTasks.length ? ownerTasks.map((t) => {
                  const done = completedOn(t, selected), setting = settingFor(settings, t.id, selected), dueToday = isDue(t, setting, selected);
                  const kpi = kpis.find((k) => k.task_id === t.id), logged = kpiLogs.find((l) => l.task_id === t.id && l.local_date === selected);
                  return (
                    <div key={t.id} className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
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
                          <p className="text-xs text-muted-foreground">{dueToday ? (done ? 'Completed' : 'Not completed') + ' · ' + cents(setting?.reward_cents ?? 0) + ' base reward' : 'Not scheduled · rest for this activity'}</p>
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
              <p className="flex gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
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
