import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, Flame, Info, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AnimatedNumber, EmptyState, Meter } from '@/components/pronark';
import { BarsDoodle, CoinsDoodle, Sparkle, WalletDoodle } from '@/components/doodles';
import { HabitBubble, PlayStat } from '@/components/playful';
import { cn } from '@/lib/utils';
import { cents, periodLabels, settingFor, streakFor, type ActivityKpi, type ActivityKpiLog, type BonusProgress, type Completion, type Setting, type Task, type TaskPeriod } from '@/lib/domain';
import { prefersReducedMotion, useSpring } from '@/lib/motion';
import { CheckoffToggle } from '@/components/checkoff-toggle';
import type { CharacterStyle } from '@/components/companion-character';

type HomeProps = {
  character: CharacterStyle; name: string; due: Task[]; activities: Task[]; orderedIds: string[]; periods: TaskPeriod[]; grouped: boolean; presentationReady: boolean;
  onMove: (task: Task, direction: number) => void; onGrouped: (grouped: boolean) => void; onPeriod: (task: Task, period: TaskPeriod['period']) => void;
  settings: Setting[]; completions: Completion[]; kpis: ActivityKpi[]; kpiLogs: ActivityKpiLog[]; today: string;
  earnedToday: number; earnedWeek: number; earnedMonth: number; balance: number; bonusProgress: BonusProgress[]; bonusProgressReady: boolean;
  busy: boolean; readOnly: boolean; onToggle: (task: Task, date: string) => Promise<boolean>; onLog: (task: Task, date: string) => void;
  onAdd: () => void; onDetails: (task: Task) => void; onWallet: () => void;
  /** Shown under the greeting, e.g. the getting-started checklist. */
  intro?: ReactNode;
};

export function HomePage(props: HomeProps) {
  const { due, activities, orderedIds, periods, grouped, presentationReady, settings, completions, kpis, kpiLogs, today, busy, readOnly } = props;
  const [manage, setManage] = useState(false);
  // Optimistic checkoffs: the row responds on tap; the server confirms (or we roll back) afterwards.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const saved = (t: Task) => completions.some((c) => c.task_id === t.id && c.local_date === today && c.completed);
  const isDone = (t: Task) => pending[t.id] ?? saved(t);
  const done = due.filter(isDone).length;
  const streaks = activities.map((task) => ({ task, streak: streakFor(task.id, completions, settings, today) })).filter((x) => x.streak > 0).sort((a, b) => b.streak - a.streak || a.task.title.localeCompare(b.task.title));
  const periodOf = (t: Task) => periods.find((p) => p.task_id === t.id)?.period ?? 'anytime';

  async function toggle(t: Task) {
    if (readOnly || t.id in pending) return false; // other rows can save at the same time
    const next = !isDone(t);
    if (next) navigator.vibrate?.(8);
    setPending((p) => ({ ...p, [t.id]: next }));
    const ok = await props.onToggle(t, today);
    setPending((p) => { const { [t.id]: _, ...rest } = p; return rest; });
    return ok;
  }


  return (
    <div className="flex w-full flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <PlayStat className="col-span-2 sm:col-span-1" tone="mint" icon={<BarsDoodle />} label="Today’s progress" value={<>{done} of {due.length}</>}
          hint={!due.length ? 'A rest day is a win too.' : done === 0 ? 'A fresh start is a win.' : done === due.length ? 'Every one. Wow.' : `${due.length - done} to go. You’ve got this.`} />
        <PlayStat tone="lavender" icon={<CoinsDoodle />} label="Today’s earned" value={<AnimatedNumber value={props.earnedToday} format={cents} />} />
        <button type="button" onClick={props.onWallet} className="rounded-3xl text-left transition-[scale] duration-100 active:scale-[0.98]" aria-label={`Available in wallet ${cents(props.balance)}. Open rewards.`}>
          <PlayStat tone="peach" icon={<WalletDoodle />} label="Available in wallet" value={<AnimatedNumber value={props.balance} format={cents} />} className="h-full" />
        </button>
      </div>

      {props.intro}

      {/* Wide screens: habits on the left; a note, streaks and progress beside them. Phones: note, habits, streaks, progress. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex flex-col gap-3 rounded-3xl bg-card p-4 ring-1 ring-foreground/8 md:p-6 lg:col-start-1 lg:row-span-3 lg:row-start-1" aria-labelledby="checklist-title">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 id="checklist-title" className="text-title text-2xl font-bold md:text-3xl">Today’s habits</h2>
              <p className="text-sm text-muted-foreground">{due.length ? `${due.length} habit${due.length === 1 ? '' : 's'} for a healthier, happier you.` : 'Nothing scheduled today.'}</p>
            </div>
            {!readOnly && (
              <div className="flex gap-1.5">
                <Button variant="outline" onClick={props.onAdd}><Plus data-icon="inline-start" />Add</Button>
                <Button variant={manage ? 'default' : 'outline'} onClick={() => setManage(!manage)} aria-pressed={manage}><Pencil data-icon="inline-start" />{manage ? 'Done' : 'Edit'}</Button>
              </div>
            )}
          </div>
          {presentationReady ? (
            <label className="flex items-center gap-2 self-start text-xs text-muted-foreground">
              <Switch checked={grouped} disabled={busy || readOnly} onCheckedChange={(v) => props.onGrouped(v)} />
              Group by time of day
            </label>
          ) : <p className="text-xs text-muted-foreground">Checklist organization needs the new database update.</p>}

          {due.length ? (
            <div className="scroll-area -mr-2 flex max-h-[65dvh] flex-col gap-2 overflow-y-auto pr-2 lg:max-h-[36rem]" tabIndex={0} role="region" aria-label="Today’s habits list">
              {due.map((t, i) => {
                const period = periodOf(t);
                const header = grouped && (i === 0 || periodOf(due[i - 1]) !== period);
                return (
                  <Fragment key={t.id}>
                    {header && <h3 className="text-eyebrow px-2 pt-3 pb-1 text-muted-foreground">{periodLabels[period]}</h3>}
                    <TaskRow task={t} completed={isDone(t)} setting={settingFor(settings, t.id, today)} kpi={kpis.find((k) => k.task_id === t.id)}
                      logged={kpiLogs.find((k) => k.task_id === t.id && k.local_date === today)} readOnly={readOnly} busy={busy} manage={manage}
                      period={period} presentationReady={presentationReady} canMoveUp={orderedIds.indexOf(t.id) > 0} canMoveDown={orderedIds.indexOf(t.id) < orderedIds.length - 1}
                      onToggle={() => toggle(t)} onLog={() => props.onLog(t, today)} onDetails={() => props.onDetails(t)}
                      onPeriod={(p) => props.onPeriod(t, p)} onMove={(d) => props.onMove(t, d)} />
                  </Fragment>
                );
              })}
            </div>
          ) : <EmptyState>Nothing scheduled today. Rest is part of the plan.</EmptyState>}
        </section>

        <PostIt today={today} />


      <section className="flex flex-col gap-3 lg:col-start-2" aria-labelledby="streaks-title">
        <h2 id="streaks-title" className="text-title">Your streaks</h2>
        {props.balance <= 0 && <Alert variant="warning"><AlertDescription>Your activity streaks still count. Bonus progress is paused until your wallet is positive.</AlertDescription></Alert>}
        {!props.bonusProgressReady && <Alert variant="info"><AlertDescription>Bonus progress will appear after the Rewards database update.</AlertDescription></Alert>}
        {streaks.length ? (
          <div className="scroll-area -mr-1 grid max-h-[23rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1" tabIndex={0} role="region" aria-label="Your streaks, longest first">
            {streaks.map(({ task, streak }) => {
              const eligible = props.bonusProgress.find((p) => p.task_id === task.id)?.eligible_days ?? 0, milestone = eligible < 14 ? 14 : 28, remaining = Math.max(0, milestone - eligible);
              return (
                <div key={task.id} className="flex items-center gap-3 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-butter text-butter-ink"><Flame className="size-5" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <strong className="truncate text-sm font-semibold">{task.title}</strong>
                      <span className="tabular shrink-0 text-xs font-medium">{streak} day{streak === 1 ? '' : 's'}</span>
                    </div>
                    <p className="mb-1.5 truncate text-xs text-muted-foreground">
                      {!props.bonusProgressReady ? 'Bonus counter unavailable' : eligible >= 28 ? '28 bonus-eligible days reached' : props.balance <= 0 ? `${eligible} bonus-eligible days · paused while wallet is not positive` : `${remaining} bonus-eligible day${remaining === 1 ? '' : 's'} to ${milestone}`}
                    </p>
                    <Meter value={eligible} max={milestone} tone="warning" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : <EmptyState icon={<Flame className="size-5" aria-hidden="true" />}>Complete a scheduled activity to start a streak. Your active streaks will appear here.</EmptyState>}
      </section>

      <section className="flex flex-col gap-3 rounded-3xl bg-card p-4 ring-1 ring-foreground/8 lg:col-start-2" aria-labelledby="progress-title">
        <h2 id="progress-title" className="text-headline">Progress this week!</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl bg-mint p-3 text-mint-ink"><p className="text-xs font-medium">Earned this week</p><p className="tabular mt-0.5 text-xl font-bold text-foreground">{cents(props.earnedWeek)}</p></div>
          <div className="rounded-2xl bg-lavender p-3 text-lavender-ink"><p className="text-xs font-medium">Earned this month</p><p className="tabular mt-0.5 text-xl font-bold text-foreground">{cents(props.earnedMonth)}</p></div>
        </div>
      </section>
      </div>
    </div>
  );
}

function TaskRow({ task, completed, setting, kpi, logged, readOnly, busy, manage, period, presentationReady, canMoveUp, canMoveDown, onToggle, onLog, onDetails, onPeriod, onMove }: {
  task: Task; completed: boolean; setting?: Setting; kpi?: ActivityKpi; logged?: ActivityKpiLog; readOnly: boolean; busy: boolean; manage: boolean;
  period: TaskPeriod['period']; presentationReady: boolean; canMoveUp: boolean; canMoveDown: boolean;
  onToggle: () => Promise<boolean>; onLog: () => void; onDetails: () => void; onPeriod: (p: TaskPeriod['period']) => void; onMove: (direction: number) => void;
}) {
  const strikeRef = useRef<HTMLSpanElement>(null);
  const sweep = useSpring(completed ? 1 : 0, (v) => { if (strikeRef.current) strikeRef.current.style.scale = `${Math.min(1, Math.max(0, v))} 1`; }, { damping: 1, response: 0.4, precision: 0.002 });
  useEffect(() => {
    const target = completed ? 1 : 0;
    if (prefersReducedMotion()) sweep.set(target); else sweep.to(target);
  }, [completed, sweep]);

  return (
    <div className={cn('rounded-2xl transition-colors duration-200', completed ? 'bg-mint/50' : 'bg-muted/50')}>
      <div className="flex min-h-18 items-center gap-3 py-2.5 pr-1.5 pl-2.5">
        <HabitBubble title={task.title} className="size-11 sm:size-12" />
        <div className="min-w-0 flex-1">
          <span className="relative inline">
            <span className={cn('text-[0.9375rem] font-semibold transition-colors duration-200', completed && 'text-muted-foreground')}>{task.title}</span>
            <span ref={strikeRef} aria-hidden="true" className="absolute top-1/2 left-0 h-px w-full origin-left bg-muted-foreground" style={{ scale: completed ? '1 1' : '0 1' }} />
          </span>
          <span className={cn('tabular block text-xs', completed ? 'text-primary dark:text-sidebar-primary' : 'text-muted-foreground')}>{cents(setting?.reward_cents ?? 0)} {completed ? 'earned' : 'reward'}</span>
          {kpi && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Meter value={logged?.value ?? 0} max={kpi.target} className="w-full sm:max-w-36" />
              <span className="tabular text-xs text-muted-foreground">{(logged?.value ?? 0).toLocaleString()} / {kpi.target.toLocaleString()} {kpi.unit}{logged && logged.value >= kpi.target ? ' · Goal reached' : ''}</span>
            </div>
          )}
          {kpi && !readOnly && <Button variant="outline" size="sm" className="mt-1.5" onClick={onLog}>{logged ? 'Update number' : 'Log number'}</Button>}
        </div>
        {readOnly
          ? completed && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"><Check className="size-3.5" strokeWidth={3} aria-hidden="true" />Done</span>
          : <CheckoffToggle checked={completed} onToggle={onToggle} label={task.title} />}
        <Button variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground" onClick={onDetails} aria-label={'Information about ' + task.title}><Info /></Button>
      </div>
      {manage && (
        <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
          <Button variant="outline" size="sm" onClick={onDetails}>Edit activity</Button>
          {presentationReady && (
            <>
              <NativeSelect size="sm" className="w-auto min-w-36" aria-label={'Time of day for ' + task.title} value={period} onChange={(e) => onPeriod(e.target.value as TaskPeriod['period'])}>
                {(Object.keys(periodLabels) as TaskPeriod['period'][]).map((p) => <NativeSelectOption key={p} value={p}>{periodLabels[p]}</NativeSelectOption>)}
              </NativeSelect>
              <div className="ml-auto flex gap-1">
                <Button variant="outline" size="icon-sm" disabled={busy || !canMoveUp} onClick={() => onMove(-1)} aria-label={'Move ' + task.title + ' up'}><ArrowUp /></Button>
                <Button variant="outline" size="icon-sm" disabled={busy || !canMoveDown} onClick={() => onMove(1)} aria-label={'Move ' + task.title + ' down'}><ArrowDown /></Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Encouraging notes; one per day, with a button for another. */
const notes = [
  'Small steps still move you forward.', 'You don’t have to be perfect. Just keep showing up.', 'Future you is already proud of today.',
  'Progress, not perfection.', 'Every check-off is a vote for who you’re becoming.', 'Rest days count too. Be kind to yourself.',
  'Start with the easiest one. Momentum does the rest.', 'You’ve done hard things before. This is one more.', 'Consistency beats intensity.',
  'One good choice makes the next one easier.', 'Done is better than perfect.', 'Tiny habits, big life.',
];

function PostIt({ today }: { today: string }) {
  const base = [...today].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const [offset, setOffset] = useState(0);
  const note = notes[(base + offset) % notes.length];
  return (
    <aside aria-label="Note for today" className="order-first px-3 pt-3 lg:order-none lg:col-start-2 lg:row-start-1 lg:px-3">
      <div className="relative -rotate-1 rounded-sm rounded-br-3xl bg-butter lg:-rotate-2 px-5 pt-7 pb-4 shadow-[0_16px_30px_-16px_rgb(30_27_43/0.5)] ring-1 ring-butter-pop/40 transition-[rotate] duration-300 hover:rotate-0">
        <span aria-hidden="true" className="absolute -top-3 left-1/2 h-6 w-20 -translate-x-1/2 rotate-3 rounded-sm bg-lavender/80 ring-1 ring-lavender-pop/30" />
        <p className="text-eyebrow text-butter-ink">Note to self</p>
        <p className="font-hand mt-1 text-2xl leading-snug text-foreground" aria-live="polite">{note}</p>
        <button type="button" onClick={() => setOffset((o) => o + 1)} className="mt-2 ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-butter-ink hover:bg-card/50">
          <Sparkle className="size-4" />Another note
        </button>
      </div>
    </aside>
  );
}
