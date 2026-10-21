import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlarmClock, ArrowDown, ArrowLeft, ArrowUp, Bell, Check, ChevronDown, Clock, GripVertical, Link2, Pause, Pencil, Play, Plus, SkipForward, Sparkles, Sunrise, Timer, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Disclosure, EmptyState, ErrorText, FieldRow, FormField, Meter, NotePanel } from '@/components/pronark';
import { TimedUndoButton } from '@/components/timed-undo-button';
import { companionReact } from '@/components/companion-character';
import { companionSay } from '@/lib/companion-lines';
import { moveItem, useReorder } from '@/components/reorder';
import { cn } from '@/lib/utils';
import { formatDate, settingFor, weekdays, type Setting, type Task } from '@/lib/domain';
import { errorText, rpc } from '@/lib/supabase';
import {
  clock, dayLabel, draftFrom, duration, isoDay, morningExample, newCategory, newStep, runProgress, startTimes, stepElapsedMs, stepShowsOn, time12, timeOfDay,
  type Draft, type DraftCategory, type DraftStep, type Routine, type RoutineCategory, type RoutineRun, type RoutineStep, type StepResult,
} from '@/lib/routines';

type Screen = { name: 'list' } | { name: 'run'; runId: string } | { name: 'build'; draft: Draft } | { name: 'summary'; runId: string };

export function RoutinesPage({ ready, readOnly, routines, categories, steps, runs, results, tasks, settings, today, initialRoutine, onRefresh, onEnablePush, pushStatus }: {
  ready: boolean; readOnly: boolean; routines: Routine[]; categories: RoutineCategory[]; steps: RoutineStep[]; runs: RoutineRun[]; results: StepResult[];
  tasks: Task[]; settings: Setting[]; today: string; initialRoutine?: string | null; onRefresh: () => Promise<void>; onEnablePush: () => Promise<void>; pushStatus: string;
}) {
  const [screen, setScreen] = useState<Screen>({ name: 'list' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const go = (next: Screen) => { setScreen(next); setError(''); window.scrollTo({ top: 0 }); };

  /** Server action, then reload. Nothing is shown as saved until this resolves. */
  async function act<T>(name: string, args: Record<string, unknown>): Promise<{ ok: true; value: T } | { ok: false }> {
    setBusy(true); setError('');
    try { const value = await rpc<T>(name, args); await onRefresh(); return { ok: true, value }; }
    catch (e) { setError(friendly(errorText(e))); return { ok: false }; }
    finally { setBusy(false); }
  }

  // A reminder link (?routine=…) opens straight into that routine's run if one is active.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !initialRoutine || !ready) return;
    opened.current = true;
    const run = runs.find((r) => r.routine_id === initialRoutine && r.state === 'active');
    if (run) go({ name: 'run', runId: run.id });
  }, [initialRoutine, ready, runs]);

  if (!ready) return <Alert variant="info"><AlertDescription>Routines need the latest database update (202610220025_guided_routines.sql) before they can be used.</AlertDescription></Alert>;
  if (readOnly) return <EmptyState>Routines are private. Only their owner can see them.</EmptyState>;

  const start = async (routine: Routine) => {
    const res = await act<string>('start_routine_run', { p_routine: routine.id });
    if (res.ok) go({ name: 'run', runId: res.value });
  };

  if (screen.name === 'build') return <Builder key={screen.draft.id} draft={screen.draft} tasks={tasks} settings={settings} today={today} busy={busy} error={error} pushStatus={pushStatus}
    onEnablePush={onEnablePush} onCancel={() => go({ name: 'list' })}
    onArchive={routines.some((r) => r.id === screen.draft.id) ? async () => { const r = await act('archive_routine', { p_id: screen.draft.id, p_archived: true }); if (r.ok) { toast.success('Routine archived. Its history is kept.'); go({ name: 'list' }); } } : undefined}
    onSave={async (d) => {
      const r = await act<number>('save_routine', { p_id: d.id, p_name: d.name, p_active_days: d.active_days, p_start_time: d.start_time, p_reminder: d.reminder_enabled && !!d.start_time,
        p_categories: d.categories.map((c) => ({ id: c.id, title: c.title.trim(), steps: c.steps.map((s) => ({ ...s, title: s.title.trim() })) })), p_expected_revision: d.revision });
      if (r.ok) { toast.success('Routine saved.'); go({ name: 'list' }); }
    }} />;

  if (screen.name === 'run' || screen.name === 'summary') {
    const run = runs.find((r) => r.id === screen.runId), routine = routines.find((r) => r.id === run?.routine_id);
    if (!run || !routine) return <><BackLink onClick={() => go({ name: 'list' })} /><EmptyState>This run isn’t available anymore.</EmptyState></>;
    if (screen.name === 'summary' || run.state !== 'active') return <Summary run={run} routine={routine} results={results} tasks={tasks} busy={busy} error={error}
      onBack={() => go({ name: 'list' })} onUndo={run.state === 'finished' ? async () => { const r = await act('undo_routine_step', { p_run: run.id }); if (r.ok) go({ name: 'run', runId: run.id }); } : undefined} />;
    return <Runner run={run} routine={routine} results={results} tasks={tasks} today={today} busy={busy} error={error} onBack={() => go({ name: 'list' })} act={act}
      onFinished={() => go({ name: 'summary', runId: run.id })} />;
  }

  // ---------- list ----------
  const active = routines.filter((r) => !r.archived_at), archived = routines.filter((r) => r.archived_at);
  const dow = isoDay(today);
  const scheduled = active.filter((r) => r.active_days.includes(dow)), others = active.filter((r) => !r.active_days.includes(dow));
  const stepsToday = (r: Routine) => steps.filter((s) => s.routine_id === r.id && stepShowsOn(s, dow)).length;
  const card = (r: Routine, featured: boolean) => {
    const open = runs.find((x) => x.routine_id === r.id && x.state === 'active');
    const todays = runs.find((x) => x.routine_id === r.id && x.start_date === today && x.state !== 'active');
    const count = stepsToday(r), offDay = !r.active_days.includes(dow);
    const p = open ? runProgress(open, results) : todays ? runProgress(todays, results) : null;
    return (
      <div key={r.id} className={cn('flex flex-col gap-4 rounded-3xl p-5 ring-1 ring-inset', featured ? 'bg-mint text-mint-ink ring-mint-pop/30' : 'bg-card ring-foreground/8')}>
        <div className="flex items-start gap-3">
          <span className={cn('grid size-12 shrink-0 place-items-center rounded-full', featured ? 'bg-card/80 text-ink' : 'bg-lavender text-lavender-ink')}><Sunrise className="size-6" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-foreground">{r.name}</h3>
            <p className="text-sm opacity-90">{dayLabel(r.active_days)}{r.start_time ? ` · ${time12(r.start_time.slice(0, 5))}` : ''}{r.reminder_enabled ? ' · reminder on' : ''}</p>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label={'Edit ' + r.name} onClick={() => go({ name: 'build', draft: draftFrom(r, categories, steps) })}><Pencil /></Button>
        </div>
        {open && p ? (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm"><span>{open.start_date !== today ? `Started ${formatDate(open.start_date, { weekday: 'long' })}` : 'In progress'}</span><span className="tabular">{p.resolved} of {p.total} steps</span></div>
            <Meter value={p.resolved} max={p.total} className="h-2 bg-card/70" />
            <Button size="lg" className="mt-1 h-12 text-base" onClick={() => go({ name: 'run', runId: open.id })}><Play data-icon="inline-start" />Resume</Button>
          </div>
        ) : todays && p ? (
          <button type="button" onClick={() => go({ name: 'summary', runId: todays.id })} className="flex items-center gap-3 rounded-2xl bg-card/70 p-3 text-left text-sm text-foreground">
            <Check className="size-5 text-primary" aria-hidden="true" /><span className="flex-1">{todays.state === 'finished' ? 'Finished today' : 'Ended early today'} · {p.done} done · {p.skipped} skipped</span><span className="font-medium underline underline-offset-4">Summary</span>
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {offDay && <p className="flex items-center gap-2 text-sm"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" />Not scheduled today. You can still start it.</p>}
            {count ? <Button size="lg" className={cn('h-12 text-base', !featured && 'w-full sm:w-auto sm:self-start')} disabled={busy} onClick={() => start(r)}><Play data-icon="inline-start" />{offDay ? 'Start anyway' : 'Start'} · {count} step{count === 1 ? '' : 's'}</Button>
              : <p className="text-sm opacity-90">No steps are set for {weekdays[dow - 1]}. Edit the routine to add some.</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Turn your habits into a plan you can follow one step at a time.</p>
        <Button onClick={() => go({ name: 'build', draft: { ...morningExample(), name: '', categories: [newCategory('', [newStep()])] } })}><Plus data-icon="inline-start" />New routine</Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {!active.length ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-card p-8 text-center ring-1 ring-foreground/8">
          <span className="grid size-16 place-items-center rounded-full bg-lavender text-lavender-ink"><Sunrise className="size-8" aria-hidden="true" /></span>
          <div><h2 className="text-title font-bold">Build your first routine</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">Group small steps into categories, add timers where they help, and link key steps to your habits so they check off as you go.</p></div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" onClick={() => go({ name: 'build', draft: morningExample() })}><Sparkles data-icon="inline-start" />Start from a morning routine</Button>
            <Button size="lg" variant="outline" onClick={() => go({ name: 'build', draft: { ...morningExample(), name: '', categories: [newCategory('', [newStep()])] } })}>Start blank</Button>
          </div>
        </div>
      ) : (
        <>
          {scheduled.length > 0 && <section className="flex flex-col gap-3" aria-labelledby="today-routines"><h2 id="today-routines" className="text-title font-bold">Today</h2><div className="grid gap-3 md:grid-cols-2">{scheduled.map((r) => card(r, true))}</div></section>}
          {others.length > 0 && <section className="flex flex-col gap-3" aria-labelledby="other-routines"><h2 id="other-routines" className="text-headline">{scheduled.length ? 'Other routines' : 'Your routines'}</h2><div className="grid gap-3 md:grid-cols-2">{others.map((r) => card(r, false))}</div></section>}
        </>
      )}
      {archived.length > 0 && (
        <Disclosure summary={`Archived routines (${archived.length})`}>
          <ul className="flex flex-col gap-2">{archived.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span>{r.name}</span><Button variant="outline" size="sm" disabled={busy} onClick={() => act('archive_routine', { p_id: r.id, p_archived: false })}>Restore</Button></li>)}</ul>
        </Disclosure>
      )}
    </div>
  );
}

const friendly = (message: string) => /schema cache|does not exist/i.test(message) ? 'Routines need the latest database update. Nothing was changed.' : message;
const BackLink = ({ onClick, label = 'Routines' }: { onClick: () => void; label?: string }) => <Button variant="ghost" className="-ml-2 self-start" onClick={onClick}><ArrowLeft data-icon="inline-start" />{label}</Button>;

/* ---------- runner ---------- */

function Runner({ run, routine, results, tasks, today, busy, error, onBack, act, onFinished }: {
  run: RoutineRun; routine: Routine; results: StepResult[]; tasks: Task[]; today: string; busy: boolean; error: string; onBack: () => void;
  act: <T>(name: string, args: Record<string, unknown>) => Promise<{ ok: true; value: T } | { ok: false }>; onFinished: () => void;
}) {
  const p = runProgress(run, results), cur = p.current;
  const [now, setNow] = useState(Date.now()), [showAll, setShowAll] = useState(false), [showCat, setShowCat] = useState(false), [pending, setPending] = useState<'done' | 'skipped' | null>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const timerMs = cur?.step.timer_seconds ? cur.step.timer_seconds * 1000 - stepElapsedMs(run, now) : null;
  // Timers are recalculated from saved timestamps, so time keeps counting while the app is closed.
  useEffect(() => {
    if (!cur?.step.timer_seconds || run.paused_at) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [cur?.step.id, run.paused_at]);
  const timeUp = timerMs !== null && timerMs <= 0, wasUp = useRef(false);
  useEffect(() => { if (timeUp && !wasUp.current) { navigator.vibrate?.([120, 80, 120]); toast('Time is up', { description: 'Tap Done or Skip when you’re ready.' }); } wasUp.current = timeUp; }, [timeUp]);
  useEffect(() => { if (!cur && run.state !== 'active') onFinished(); }, [cur, run.state]);
  if (!cur) return null;

  const habit = cur.step.habit_task_id ? tasks.find((t) => t.id === cur.step.habit_task_id) : undefined;
  const catInfo = p.categories[cur.ci];
  const resolve = async (status: 'done' | 'skipped') => {
    setPending(status);
    const r = await act<string>('resolve_routine_step', { p_run: run.id, p_step: cur.step.id, p_status: status });
    setPending(null);
    if (!r.ok) return;
    if (status === 'done') {
      companionReact('cheer');
      if (r.value === 'checked') toast.success(`${habit?.title ?? 'Habit'} checked off.`);
      else if (r.value === 'already') toast(`${habit?.title ?? 'That habit'} was already checked off today.`);
      else if (r.value === 'not_scheduled') toast(`${habit?.title ?? 'That habit'} isn’t scheduled today, so it wasn’t checked off.`);
      if (cur.si === cur.cat.steps.length - 1) companionSay(`${cur.cat.title} done. On to the next one.`);
    }
    if (p.resolved + 1 === p.total) navigator.vibrate?.(20);
  };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 pb-28 md:pb-0">
      <div className="flex items-center justify-between gap-2">
        <BackLink onClick={onBack} />
        <div className="flex gap-1.5">
          <Button variant="outline" disabled={busy} onClick={() => act('set_routine_run_paused', { p_run: run.id, p_paused: !run.paused_at })}>{run.paused_at ? <><Play data-icon="inline-start" />Resume</> : <><Pause data-icon="inline-start" />Pause</>}</Button>
        </div>
      </div>

      <section className="flex flex-col gap-2 rounded-3xl bg-card p-4 ring-1 ring-foreground/8" aria-label="Routine progress">
        <div className="flex items-baseline justify-between gap-2"><h2 className="text-headline text-lg">{routine.name}</h2><span className="tabular text-sm font-medium">{p.resolved} of {p.total} steps</span></div>
        <Meter value={p.resolved} max={p.total} className="h-2.5" label={`${p.resolved} of ${p.total} steps resolved`} />
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{p.done} done · {p.skipped} skipped</span><span>{p.categoriesDone} of {p.categories.length} categories complete</span>
        </div>
      </section>

      <section ref={activeRef} className="flex flex-col gap-4 rounded-3xl bg-mint p-5 text-mint-ink ring-1 ring-inset ring-mint-pop/30 md:p-6" aria-live="polite" aria-labelledby="active-step">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold">Category {cur.ci + 1} of {p.categories.length} · {cur.cat.title}</span>
          <span>{catInfo.done} done · {catInfo.skipped} skipped · {catInfo.total - catInfo.done - catInfo.skipped} left</span>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase opacity-80">Step {cur.si + 1} of {cur.cat.steps.length}</p>
          <h3 id="active-step" className="text-display mt-1 text-foreground">{cur.step.title}</h3>
          {cur.step.instruction && <p className="mt-2 whitespace-pre-wrap text-base text-foreground/80">{cur.step.instruction}</p>}
        </div>
        {habit && (
          <p className="flex items-center gap-2 rounded-xl bg-card/70 px-3 py-2 text-sm text-foreground">
            <Link2 className="size-4 shrink-0" aria-hidden="true" />Done checks off <strong>{habit.title}</strong>.
          </p>
        )}
        {cur.step.record_time && <p className="flex items-center gap-2 text-sm"><Clock className="size-4" aria-hidden="true" />Done records the time.</p>}
        {timerMs !== null && (
          <div className={cn('flex items-center justify-between gap-3 rounded-2xl px-4 py-3', timeUp ? 'bg-butter text-butter-ink ring-2 ring-butter-pop' : 'bg-card/70 text-foreground')} role="timer" aria-label={timeUp ? 'Time is up' : `${clock(timerMs)} left`}>
            <span className="flex items-center gap-2 text-sm font-medium">{timeUp ? <AlarmClock className="size-5 animate-pulse" aria-hidden="true" /> : <Timer className="size-5" aria-hidden="true" />}{timeUp ? 'Time is up' : run.paused_at ? 'Paused' : 'Time left'}</span>
            <span className="tabular text-3xl font-bold">{timeUp ? '0:00' : clock(timerMs)}</span>
          </div>
        )}
        <ErrorText>{error && <>{error} <button type="button" className="font-semibold underline" onClick={() => resolve(pending ?? 'done')}>Retry</button></>}</ErrorText>
        <div className="sticky bottom-24 z-10 -mx-1 flex gap-2 md:static">
          <Button size="lg" className="h-14 flex-1 text-lg shadow-lg md:shadow-none" disabled={busy} onClick={() => resolve('done')}>{pending === 'done' ? 'Saving…' : <><Check data-icon="inline-start" />Done</>}</Button>
          <Button size="lg" variant="outline" className="h-14 bg-card px-6 text-base" disabled={busy} onClick={() => resolve('skipped')}>{pending === 'skipped' ? 'Saving…' : <><SkipForward data-icon="inline-start" />Skip</>}</Button>
        </div>
        {p.lastResult && <Button variant="ghost" size="sm" className="self-start" disabled={busy} onClick={() => act('undo_routine_step', { p_run: run.id })}><Undo2 data-icon="inline-start" />Undo last ({p.lastResult.status === 'done' ? 'Done' : 'Skip'})</Button>}
      </section>

      <section className="rounded-3xl bg-card ring-1 ring-foreground/8">
        <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold" aria-expanded={showCat} onClick={() => setShowCat(!showCat)}>
          {cur.cat.title} steps<ChevronDown className={cn('size-4 transition-transform', showCat && 'rotate-180')} aria-hidden="true" />
        </button>
        {showCat && <StepList rows={p.flat.filter((x) => x.ci === cur.ci)} currentId={cur.step.id} />}
      </section>
      <section className="rounded-3xl bg-card ring-1 ring-foreground/8">
        <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
          View full routine<ChevronDown className={cn('size-4 transition-transform', showAll && 'rotate-180')} aria-hidden="true" />
        </button>
        {showAll && p.categories.map((c) => (
          <div key={c.cat.id} className="border-t border-foreground/6 px-4 py-2">
            <p className="flex justify-between py-1 text-xs font-semibold text-muted-foreground"><span>{c.ci + 1}. {c.cat.title}</span><span>{c.resolved ? `${duration(c.elapsedMs)}` : `${c.done + c.skipped}/${c.total}`}</span></p>
            <StepList rows={p.flat.filter((x) => x.ci === c.ci)} currentId={cur.step.id} />
          </div>
        ))}
      </section>
      {(showAll || showCat) && <Button variant="secondary" className="self-center" onClick={() => activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Back to current step</Button>}
      <div className="flex flex-col items-start gap-1.5">
        <TimedUndoButton size="sm" disabled={busy} label="End routine for today" undoLabel="Keep going" runningLabel="Ending…" onConfirm={async () => { const r = await act('end_routine_run', { p_run: run.id }); if (r.ok) onFinished(); }} />
        <p className="text-xs text-muted-foreground">Your Done and Skipped steps stay saved. {run.start_date !== today && 'This run started on ' + formatDate(run.start_date, { weekday: 'long' }) + '.'}</p>
      </div>
    </div>
  );
}

function StepList({ rows, currentId }: { rows: ReturnType<typeof runProgress>['flat']; currentId: string }) {
  return (
    <ol className="flex flex-col pb-2">
      {rows.map((x) => (
        <li key={x.step.id} className={cn('flex items-center gap-3 px-4 py-1.5 text-sm', x.step.id === currentId && 'font-semibold')}>
          <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[0.6875rem]', x.result?.status === 'done' ? 'bg-mint text-primary' : x.result?.status === 'skipped' ? 'bg-muted text-muted-foreground' : x.step.id === currentId ? 'bg-primary text-primary-foreground' : 'ring-1 ring-foreground/15')} aria-hidden="true">
            {x.result?.status === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : x.result?.status === 'skipped' ? <SkipForward className="size-3" /> : x.si + 1}
          </span>
          <span className={cn('flex-1', x.result?.status === 'skipped' && 'text-muted-foreground line-through')}>{x.step.title}</span>
          <span className="sr-only">{x.result ? x.result.status : x.step.id === currentId ? 'current' : 'upcoming'}</span>
          {x.step.timer_seconds && <Timer className="size-3.5 text-muted-foreground" aria-label="Has a timer" />}
        </li>
      ))}
    </ol>
  );
}

/* ---------- summary ---------- */

function Summary({ run, routine, results, tasks, busy, error, onBack, onUndo }: { run: RoutineRun; routine: Routine; results: StepResult[]; tasks: Task[]; busy: boolean; error: string; onBack: () => void; onUndo?: () => void }) {
  const p = runProgress(run, results);
  const wake = p.flat.find((x) => x.step.record_time && x.result?.status === 'done');
  const linked = p.flat.filter((x) => x.result?.habit_task_id);
  const total = p.categories.reduce((n, c) => n + c.elapsedMs, 0);
  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <BackLink onClick={onBack} />
      <section className="flex flex-col items-center gap-2 rounded-3xl bg-mint p-6 text-center text-mint-ink ring-1 ring-inset ring-mint-pop/30">
        <Sparkles className="size-8 text-butter-pop" aria-hidden="true" />
        <h2 className="text-title text-2xl font-bold text-foreground">{run.state === 'finished' ? `${routine.name} complete` : `${routine.name} ended early`}</h2>
        <p className="text-sm">{formatDate(run.start_date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </section>
      <div className="grid grid-cols-3 gap-2 text-center">
        {([['Done', p.done], ['Skipped', p.skipped], ['Categories', `${p.categoriesDone}/${p.categories.length}`]] as const).map(([l, v]) => <div key={l} className="rounded-2xl bg-card p-3 ring-1 ring-foreground/8"><p className="tabular text-2xl font-bold">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>)}
      </div>
      <Card><CardContent className="flex flex-col gap-3 text-sm">
        {wake?.result && <p className="flex items-center gap-2"><Sunrise className="size-4 text-peach-ink" aria-hidden="true" />{wake.step.title}: <strong>{timeOfDay(wake.result.resolved_at)}</strong></p>}
        <p className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" aria-hidden="true" />Active time: <strong>{duration(total)}</strong></p>
        <ul className="flex flex-col divide-y divide-foreground/6">{p.categories.map((c) => <li key={c.cat.id} className="flex justify-between py-1.5"><span>{c.cat.title}</span><span className="text-muted-foreground">{c.done} done{c.skipped ? ` · ${c.skipped} skipped` : ''} · {duration(c.elapsedMs)}</span></li>)}</ul>
      </CardContent></Card>
      {linked.length > 0 && (
        <Card><CardContent className="flex flex-col gap-2 text-sm">
          <h3 className="text-headline">Habits</h3>
          {linked.map((x) => {
            const t = tasks.find((t) => t.id === x.result!.habit_task_id);
            const label = x.result!.status === 'skipped' ? 'Skipped, not checked off' : { checked: 'Checked off', already: 'Already checked off', not_scheduled: 'Not scheduled that day', none: '' }[x.result!.habit_outcome];
            return <p key={x.step.id} className="flex items-center justify-between gap-2"><span>{t?.title ?? 'Habit'}</span><span className={cn(x.result!.habit_outcome === 'checked' ? 'text-primary' : 'text-muted-foreground')}>{label}</span></p>;
          })}
          <p className="text-xs text-muted-foreground">Routines don’t pay extra. Each habit earns its usual reward once.</p>
        </CardContent></Card>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={onBack}>Back to Routines</Button>
        {onUndo && <Button size="lg" variant="ghost" disabled={busy} onClick={onUndo}><Undo2 data-icon="inline-start" />Undo last step</Button>}
      </div>
    </div>
  );
}

/* ---------- builder ---------- */

function Builder({ draft: initial, tasks, settings, today, busy, error, pushStatus, onEnablePush, onCancel, onArchive, onSave }: {
  draft: Draft; tasks: Task[]; settings: Setting[]; today: string; busy: boolean; error: string; pushStatus: string;
  onEnablePush: () => Promise<void>; onCancel: () => void; onArchive?: () => void; onSave: (d: Draft) => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [preview, setPreview] = useState(isoDay(today)), [openStep, setOpenStep] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setCat = (id: string, patch: Partial<DraftCategory>) => setD((x) => ({ ...x, categories: x.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const setStep = (catId: string, stepId: string, patch: Partial<DraftStep>) => setD((x) => ({ ...x, categories: x.categories.map((c) => (c.id === catId ? { ...c, steps: c.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) } : c)) }));
  const catReorder = useReorder((from, to) => set({ categories: moveItem(d.categories, from, to) }));
  const myTasks = tasks.filter((t) => !t.archive_date);
  const linkedElsewhere = (stepId: string) => new Set(d.categories.flatMap((c) => c.steps).filter((s) => s.id !== stepId && s.habit_task_id).map((s) => s.habit_task_id));
  const habitDays = (taskId: string) => settingFor(settings, taskId, today)?.weekdays ?? [];
  const allSteps = d.categories.flatMap((c) => c.steps);
  const problems = [
    !d.name.trim() && 'Give the routine a name.',
    !d.active_days.length && 'Choose at least one day.',
    !d.categories.length && 'Add at least one category.',
    d.categories.some((c) => !c.title.trim()) && 'Every category needs a name.',
    allSteps.some((s) => !s.title.trim()) && 'Every step needs a name.',
    d.categories.some((c) => !c.steps.length) && 'Every category needs at least one step.',
  ].filter(Boolean) as string[];
  const showsCount = allSteps.filter((s) => stepShowsOn(s, preview)).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-5 pb-28 md:pb-6">
      <BackLink onClick={onCancel} label="Cancel" />
      <Card><CardContent className="flex flex-col gap-4">
        <FormField label="Routine name"><Input value={d.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="Morning routine" /></FormField>
        <DayChips legend="Active days" value={d.active_days} onChange={(active_days) => set({ active_days })} />
        <FieldRow>
          <FormField label="Start time (optional)" hint="Shown in the app, and used for the reminder.">
            <NativeSelect value={d.start_time ?? ''} onChange={(e) => set({ start_time: e.target.value || null, reminder_enabled: e.target.value ? d.reminder_enabled : false })}>
              <NativeSelectOption value="">No start time</NativeSelectOption>
              {startTimes.map((t) => <NativeSelectOption key={t} value={t}>{time12(t)}</NativeSelectOption>)}
            </NativeSelect>
          </FormField>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm">
              <span className="flex items-center gap-2"><Bell className="size-4" aria-hidden="true" />Phone reminder</span>
              <Switch checked={d.reminder_enabled} disabled={!d.start_time} onCheckedChange={async (v) => { set({ reminder_enabled: v }); if (v && typeof Notification !== 'undefined' && Notification.permission !== 'granted') await onEnablePush(); }} />
            </label>
            <span className="text-xs text-muted-foreground">{!d.start_time ? 'Pick a start time to turn this on.' : d.reminder_enabled ? `One “Time for your routine” notification on active days, unless you’ve already started. ${pushStatus && pushStatus !== 'Not checked' ? pushStatus : ''}` : 'Off.'}</span>
          </div>
        </FieldRow>
      </CardContent></Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-title font-bold">Steps</h2>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Preview
          <NativeSelect size="sm" className="w-24" value={preview} onChange={(e) => setPreview(Number(e.target.value))}>{weekdays.map((w, i) => <NativeSelectOption key={w} value={i + 1}>{w}</NativeSelectOption>)}</NativeSelect>
          <span className="tabular">{showsCount} step{showsCount === 1 ? '' : 's'}{!d.active_days.includes(preview) && ' · off day'}</span>
        </label>
      </div>

      <div ref={(el) => { catReorder.container.current = el; }} className="flex flex-col gap-3">
        {d.categories.map((c, ci) => (
          <CategoryCard key={c.id} cat={c} index={ci} count={d.categories.length} dragging={catReorder.dragging === c.id} handle={catReorder.handleProps(c.id)}
            onTitle={(title) => setCat(c.id, { title })} onMove={(dir) => set({ categories: moveItem(d.categories, ci, ci + dir) })}
            onDelete={() => { const before = d; set({ categories: d.categories.filter((x) => x.id !== c.id) }); toast(`Removed “${c.title || 'category'}”`, { action: { label: 'Undo', onClick: () => setD(before) } }); }}
            onSteps={(steps) => setCat(c.id, { steps })}>
            {(s, si, handle, dragging) => {
              const shows = stepShowsOn(s, preview), open = openStep === s.id;
              const days = s.habit_task_id ? habitDays(s.habit_task_id) : [];
              const offDays = s.habit_task_id ? d.active_days.filter((x) => (!s.weekdays || s.weekdays.includes(x)) && !days.includes(x)) : [];
              return (
                <div data-reorder-id={s.id} key={s.id} className={cn('rounded-2xl ring-1 transition-[box-shadow,background-color]', dragging ? 'bg-lavender ring-2 ring-lavender-pop shadow-lg' : 'bg-muted/40 ring-foreground/6', !shows && 'opacity-55')}>
                  <div className="flex items-center gap-1.5 p-2">
                    <button type="button" {...handle} aria-label={`Drag ${s.title || 'step'}`} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground"><GripVertical className="size-4" /></button>
                    <Input aria-label={`Step ${si + 1} name`} value={s.title} maxLength={80} onChange={(e) => setStep(c.id, s.id, { title: e.target.value })} placeholder="What’s the step?" className="flex-1 bg-card" />
                    <div className="flex shrink-0 items-center">
                      {s.timer_seconds && <Timer className="mx-1 size-4 text-muted-foreground" aria-label="Has a timer" />}
                      {s.habit_task_id && <Link2 className="mx-1 size-4 text-primary" aria-label="Linked to a habit" />}
                      <Button variant="ghost" size="icon-sm" aria-label={`Move ${s.title || 'step'} up`} disabled={si === 0} onClick={() => setCat(c.id, { steps: moveItem(c.steps, si, si - 1) })}><ArrowUp /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Move ${s.title || 'step'} down`} disabled={si === c.steps.length - 1} onClick={() => setCat(c.id, { steps: moveItem(c.steps, si, si + 1) })}><ArrowDown /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`${open ? 'Hide' : 'Show'} settings for ${s.title || 'step'}`} aria-expanded={open} onClick={() => setOpenStep(open ? null : s.id)}><ChevronDown className={cn('transition-transform', open && 'rotate-180')} /></Button>
                    </div>
                  </div>
                  {open && (
                    <div className="flex flex-col gap-3 border-t border-foreground/6 p-3">
                      <FormField label="Instruction (optional)"><Textarea rows={2} maxLength={500} value={s.instruction} onChange={(e) => setStep(c.id, s.id, { instruction: e.target.value })} placeholder="A short note for this step" /></FormField>
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={!!s.weekdays} onChange={(e) => setStep(c.id, s.id, { weekdays: e.target.checked ? [...d.active_days] : null })} />Only on certain days</label>
                        {s.weekdays && <DayChips legend="Days for this step" value={s.weekdays} onChange={(weekdays) => setStep(c.id, s.id, { weekdays: weekdays.length ? weekdays : s.weekdays })} />}
                      </div>
                      <FieldRow>
                        <FormField label="Timer">
                          <NativeSelect value={s.timer_seconds ?? ''} onChange={(e) => setStep(c.id, s.id, { timer_seconds: e.target.value ? Number(e.target.value) : null })}>
                            <NativeSelectOption value="">No timer</NativeSelectOption>
                            {[30, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, 5400].map((sec) => <NativeSelectOption key={sec} value={sec}>{sec < 60 ? `${sec} seconds` : `${sec / 60} minute${sec === 60 ? '' : 's'}`}</NativeSelectOption>)}
                          </NativeSelect>
                        </FormField>
                        <FormField label="Key step for a habit">
                          <NativeSelect value={s.habit_task_id ?? ''} onChange={(e) => setStep(c.id, s.id, { habit_task_id: e.target.value || null })}>
                            <NativeSelectOption value="">Not linked</NativeSelectOption>
                            {myTasks.map((t) => <NativeSelectOption key={t.id} value={t.id} disabled={linkedElsewhere(s.id).has(t.id)}>{t.title}{linkedElsewhere(s.id).has(t.id) ? ' (linked to another step)' : ''}</NativeSelectOption>)}
                          </NativeSelect>
                        </FormField>
                      </FieldRow>
                      {s.habit_task_id && <p className="text-xs text-muted-foreground">Marking this step Done checks off the habit and earns its usual reward once. Skip never checks it off.</p>}
                      {offDays.length > 0 && <p className="flex gap-2 rounded-xl bg-butter px-3 py-2 text-xs text-butter-ink"><TriangleAlert className="size-4 shrink-0" aria-hidden="true" />This habit isn’t scheduled on {offDays.map((x) => weekdays[x - 1]).join(', ')}. On those days, Done finishes the step but won’t check off the habit.</p>}
                      <label className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Clock className="size-4" aria-hidden="true" />Record the time when done (like getting out of bed)</span><Switch checked={s.record_time} onCheckedChange={(v) => setStep(c.id, s.id, { record_time: v })} /></label>
                      <label className="flex items-center justify-between gap-3 text-sm"><span>Step is on</span><Switch checked={s.enabled} onCheckedChange={(v) => setStep(c.id, s.id, { enabled: v })} /></label>
                      <Button variant="destructive" size="sm" className="self-start" onClick={() => { const before = d; setCat(c.id, { steps: c.steps.filter((x) => x.id !== s.id) }); toast(`Removed “${s.title || 'step'}”`, { action: { label: 'Undo', onClick: () => setD(before) } }); }}><Trash2 data-icon="inline-start" />Delete step</Button>
                    </div>
                  )}
                </div>
              );
            }}
          </CategoryCard>
        ))}
      </div>
      <Button variant="outline" size="lg" className="self-start" onClick={() => set({ categories: [...d.categories, newCategory('', [newStep()])] })}><Plus data-icon="inline-start" />Add category</Button>

      <NotePanel icon={<Link2 className="!size-6" />} title="How key steps work">Link a step to one of your habits and marking it Done checks the habit off, with its usual reward. A routine never pays extra, and skipped steps never count as done.</NotePanel>

      {problems.length > 0 && <p className="text-sm text-muted-foreground">{problems[0]}</p>}
      <ErrorText>{error}</ErrorText>
      <div className="sticky bottom-24 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-card/90 p-2 shadow-lg ring-1 ring-foreground/10 backdrop-blur md:static md:bg-transparent md:p-0 md:shadow-none md:ring-0">
        <Button size="lg" className="flex-1 sm:flex-none" disabled={busy || problems.length > 0} onClick={() => onSave(d)}>{busy ? 'Saving…' : 'Save routine'}</Button>
        <Button size="lg" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      {onArchive && (
        <div className="flex flex-col items-start gap-1.5 border-t border-foreground/8 pt-4">
          <TimedUndoButton size="sm" disabled={busy} label="Archive routine" undoLabel="Keep routine" runningLabel="Archiving…" onConfirm={onArchive} />
          <p className="text-xs text-muted-foreground">Archiving hides it from your list. Past runs and habit checkoffs stay.</p>
        </div>
      )}
    </div>
  );
}

function CategoryCard({ cat, index, count, dragging, handle, onTitle, onMove, onDelete, onSteps, children }: {
  cat: DraftCategory; index: number; count: number; dragging: boolean; handle: ReturnType<ReturnType<typeof useReorder>['handleProps']>;
  onTitle: (t: string) => void; onMove: (dir: number) => void; onDelete: () => void; onSteps: (s: DraftStep[]) => void;
  children: (step: DraftStep, index: number, handle: ReturnType<ReturnType<typeof useReorder>['handleProps']>, dragging: boolean) => ReactNode;
}) {
  const stepReorder = useReorder((from, to) => onSteps(moveItem(cat.steps, from, to)));
  return (
    <section data-reorder-id={cat.id} className={cn('flex flex-col gap-2 rounded-3xl bg-card p-3 ring-1 transition-[box-shadow] md:p-4', dragging ? 'ring-2 ring-lavender-pop shadow-xl' : 'ring-foreground/8')} aria-label={`Category ${index + 1}: ${cat.title || 'untitled'}`}>
      <div className="flex items-center gap-1.5">
        <button type="button" {...handle} aria-label={`Drag ${cat.title || 'category'}`} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground"><GripVertical className="size-5" /></button>
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-lavender text-xs font-bold text-lavender-ink">{index + 1}</span>
        <Input aria-label={`Category ${index + 1} name`} value={cat.title} maxLength={60} onChange={(e) => onTitle(e.target.value)} placeholder="Category name (e.g. Wake Up)" className="flex-1 font-semibold" />
        <Button variant="ghost" size="icon-sm" aria-label={`Move ${cat.title || 'category'} up`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Move ${cat.title || 'category'} down`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${cat.title || 'category'}`} onClick={onDelete}><Trash2 /></Button>
      </div>
      <div ref={(el) => { stepReorder.container.current = el; }} className="flex flex-col gap-1.5 pl-1">
        {cat.steps.map((s, si) => children(s, si, stepReorder.handleProps(s.id), stepReorder.dragging === s.id))}
      </div>
      <Button variant="ghost" size="sm" className="self-start" onClick={() => onSteps([...cat.steps, newStep()])}><Plus data-icon="inline-start" />Add step</Button>
    </section>
  );
}

function DayChips({ legend, value, onChange }: { legend: string; value: number[]; onChange: (days: number[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-xs font-medium">{legend}</legend>
      <div className="grid grid-cols-7 gap-1.5">
        {weekdays.map((w, i) => {
          const on = value.includes(i + 1);
          return <button key={w} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== i + 1) : [...value, i + 1].sort())}
            className={cn('h-9 rounded-lg text-xs font-medium ring-1 transition-[background-color,scale] duration-100 active:scale-95 pointer-coarse:h-11', on ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card text-muted-foreground ring-foreground/10')}>{w}</button>;
        })}
      </div>
    </fieldset>
  );
}

