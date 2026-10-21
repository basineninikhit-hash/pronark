import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronRight, Flame, Info, Pencil, Plus, Wallet as WalletIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ActivityIcon, AnimatedNumber, EmptyState, Meter, StatTile } from '@/components/pronark';
import { CoinsIcon, HandNote, Sparkle } from '@/components/doodles';
import { cn } from '@/lib/utils';
import { cents, periodLabels, settingFor, streakFor, type ActivityKpi, type ActivityKpiLog, type BonusProgress, type Completion, type Setting, type Task, type TaskPeriod } from '@/lib/domain';
import { prefersReducedMotion, useSpring } from '@/lib/motion';
import { CheckoffToggle } from '@/components/checkoff-toggle';
import { CompanionCharacter, type CharacterStyle } from '@/components/companion-character';

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
  const { character, name, due, activities, orderedIds, periods, grouped, presentationReady, settings, completions, kpis, kpiLogs, today, busy, readOnly } = props;
  const [manage, setManage] = useState(false);
  // Optimistic checkoffs: the row responds on tap; the server confirms (or we roll back) afterwards.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const saved = (t: Task) => completions.some((c) => c.task_id === t.id && c.local_date === today && c.completed);
  const isDone = (t: Task) => pending[t.id] ?? saved(t);
  const done = due.filter(isDone).length;
  const first = name.split(' ')[0];
  const streaks = activities.map((task) => ({ task, streak: streakFor(task.id, completions, settings, today) })).filter((x) => x.streak > 0).sort((a, b) => b.streak - a.streak);
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

  const message = due.length && done === due.length ? 'Amazing work! Every win counts today.'
    : !due.length ? `Rest day, ${first}. Recharge and come back tomorrow.`
    : done === 0 ? `Ready when you are, ${first}! ${due.length} win${due.length === 1 ? '' : 's'} on the list today.`
    : `Nice work, ${first}! ${done} of ${due.length} wins today.`;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/8">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-mint text-mint-ink"><CoinsIcon /></span>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">Today’s earned</p><AnimatedNumber value={props.earnedToday} format={cents} className="text-2xl font-bold tracking-tight" /></div>
        </div>
        <button type="button" onClick={props.onWallet} className="flex items-center gap-3 rounded-2xl bg-card p-4 text-left ring-1 ring-foreground/8 transition-[scale,background-color] duration-100 hover:bg-card/80 active:scale-[0.98]">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lavender text-lavender-ink"><WalletIcon className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">Available in wallet</p><AnimatedNumber value={props.balance} format={cents} className="text-2xl font-bold tracking-tight" /></div>
          <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
        </button>
        <div aria-hidden="true" className="hidden rotate-6 items-center gap-1 self-center rounded-xl bg-card px-4 py-3 shadow-md ring-1 ring-foreground/10 md:flex">
          <HandNote className="rotate-0 text-2xl leading-6">Progress<br />pays off</HandNote><Sparkle className="size-6 text-ink" />
        </div>
      </div>

      {props.intro}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/8 md:p-5" aria-labelledby="checklist-title">
          <div className="flex items-center justify-between gap-2">
            <h2 id="checklist-title" className="text-title">Today’s habits</h2>
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
            <div className="-mx-2 flex flex-col divide-y divide-foreground/6">
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

        {/* Companion with a handwritten speech bubble; first on phones, beside the list on wide screens. */}
        <aside className="order-first flex items-center gap-4 rounded-2xl bg-card/70 p-4 ring-1 ring-foreground/8 lg:order-none lg:sticky lg:top-20 lg:flex-col lg:p-5" aria-label="Today at a glance">
          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:order-1 lg:w-full">
            <p role="status" className="relative rounded-3xl rounded-bl-md bg-background px-4 py-3 ring-1 ring-foreground/10 lg:rounded-bl-3xl lg:rounded-br-md">
              <HandNote className="rotate-0 text-xl leading-6">{message}</HandNote>
            </p>
            <div className="lg:order-3">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Today</span><span className="tabular">{done} of {due.length}</span></div>
              <Meter value={done} max={Math.max(1, due.length)} label={`${done} of ${due.length} activities complete`} />
            </div>
          </div>
        </aside>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Earned this week" value={cents(props.earnedWeek)} />
        <StatTile label="Earned this month" value={cents(props.earnedMonth)} />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="streaks-title">
        <h2 id="streaks-title" className="text-title">Your streaks</h2>
        {props.balance <= 0 && <Alert variant="warning"><AlertDescription>Your activity streaks still count. Bonus progress is paused until your wallet is positive.</AlertDescription></Alert>}
        {!props.bonusProgressReady && <Alert variant="info"><AlertDescription>Bonus progress will appear after the Rewards database update.</AlertDescription></Alert>}
        {streaks.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {streaks.map(({ task, streak }) => {
              const eligible = props.bonusProgress.find((p) => p.task_id === task.id)?.eligible_days ?? 0, milestone = eligible < 14 ? 14 : 28, remaining = Math.max(0, milestone - eligible);
              return (
                <div key={task.id} className="flex items-center gap-3 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning/15"><Flame className="size-5 text-warning" aria-hidden="true" /></span>
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
    <div className={cn('rounded-xl transition-colors duration-200', completed && 'bg-mint/40')}>
      <div className="flex min-h-16 items-center gap-3 py-2 pr-1.5 pl-3.5">
        <ActivityIcon title={task.title} className="hidden shrink-0 sm:block" />
        <div className="min-w-0 flex-1">
          <span className="relative inline">
            <span className={cn('text-sm font-medium transition-colors duration-200', completed && 'text-muted-foreground')}>{task.title}</span>
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

