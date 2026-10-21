import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, ArrowRight, BellRing, CalendarDays, Check, ChartColumn, ChevronRight, FileText, Info, Sparkles, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ActivityIcon, Disclosure, EmptyState, ProgressRing } from '@/components/pronark';
import { cn } from '@/lib/utils';
import { dayNumber, formatDate, isDue, monthStart, settingFor, type ActivityKpi, type ActivityKpiLog, type Completion, type Earning, type Setting, type Task } from '@/lib/domain';
import { prefersReducedMotion, useSpring } from '@/lib/motion';
import { INSIGHT_UNLOCK_DAYS, findInsights, lower, monthRecords, short, trackingDays, weeklyTrend, type Insight, type Record_ } from '@/lib/insights';
import { Meter } from '@/components/pronark';
import { InsightsDashboard } from '@/InsightsDashboard';
import { ProgressPage } from '@/ProgressPage';

/* ---------- screens ---------- */

type View = { name: 'overview' } | { name: 'all' } | { name: 'insight'; id: string } | { name: 'trend' } | { name: 'numbers' } | { name: 'history' };

export function InsightsHub({ client, owner, today, tasks, settings, completions, earnings, kpis, kpiLogs, readOnly, onOpenRecap, onSetReminder, onEditTask }: {
  client: SupabaseClient; owner: string; today: string; tasks: Task[]; settings: Setting[]; completions: Completion[]; earnings: Earning[]; kpis: ActivityKpi[]; kpiLogs: ActivityKpiLog[];
  readOnly: boolean; onOpenRecap: () => void; onSetReminder: () => void; onEditTask: (task: Task) => void;
}) {
  const [view, setView] = useState<View>({ name: 'overview' });
  const currentMonth = monthStart(today);
  const months = useMemo(() => {
    const starts = tasks.filter((t) => t.owner_id === owner).map((t) => monthStart(t.start_date)).sort();
    const list: string[] = [];
    for (let m = currentMonth; list.length < 24; ) { list.push(m); if (!starts.length || m <= starts[0]) break; const d = new Date(m + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); m = d.toISOString().slice(0, 10); }
    return list;
  }, [tasks, owner, currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const monthName = formatDate(month, { month: 'long' });
  const records = useMemo(() => monthRecords(owner, month, today, tasks, settings, completions), [owner, month, today, tasks, settings, completions]);
  const insights = useMemo(() => findInsights(records, monthName), [records, monthName]);
  const weeks = useMemo(() => weeklyTrend(records, month, today), [records, month, today]);
  const done = records.filter((r) => r.done).length;

  // Push/pop between screens, sliding in from the side you're heading.
  const screenRef = useRef<HTMLDivElement>(null), direction = useRef(0);
  const slide = useSpring(0, (v) => { if (screenRef.current) { screenRef.current.style.translate = `${(v * 36).toFixed(2)}px 0`; screenRef.current.style.opacity = String(1 - Math.min(1, Math.abs(v)) * 0.8); } }, { precision: 0.002 });
  const open = (next: View) => { direction.current = next.name === 'overview' ? -1 : 1; setView(next); window.scrollTo({ top: 0 }); };
  useLayoutEffect(() => { if (direction.current && !prefersReducedMotion()) { slide.set(direction.current); slide.to(0, { damping: 1, response: 0.4 }); } direction.current = 0; }, [view, slide]);

  const back = <Button variant="ghost" className="-ml-2 self-start" onClick={() => open({ name: 'overview' })}><ArrowLeft data-icon="inline-start" />Back to insights</Button>;
  const wins = insights.filter((i) => i.kind === 'win'), patterns = insights.filter((i) => i.kind === 'pattern');
  // "What we noticed": lead with a win, then a pattern, then whatever's next.
  const noticed = [wins[0], patterns[0], wins[1] ?? patterns[1]].filter(Boolean) as Insight[];
  // Patterns need enough history to mean anything: hold them back for the first three weeks.
  const tracked = trackingDays(owner, tasks, today), unlocked = tracked >= INSIGHT_UNLOCK_DAYS;
  const insight = view.name === 'insight' ? insights.find((i) => i.id === view.id) : undefined;

  return (
    <div className="w-full max-w-5xl overflow-x-clip">
      <div ref={screenRef} className="flex flex-col gap-6">
        {view.name === 'overview' && (
          <>
            <div className="flex justify-end">
              <NativeSelect className="w-full sm:w-72" aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
                {months.map((m) => <NativeSelectOption key={m} value={m}>{formatDate(m, { month: 'long', year: 'numeric' })} · {m === currentMonth ? 'so far' : 'complete month'}</NativeSelectOption>)}
              </NativeSelect>
            </div>
            <Card>
              <CardContent className="flex items-center gap-5 py-1 sm:gap-6 sm:py-2">
                <ProgressRing value={records.length ? done / records.length : 0} size={116} stroke={11} label={`${done} of ${records.length} scheduled checkoffs completed`}>
                  <strong className="tabular text-2xl font-bold sm:text-3xl">{records.length ? Math.round((done / records.length) * 100) + '%' : '—'}</strong>
                </ProgressRing>
                <div className="hidden h-20 w-px bg-foreground/10 sm:block" />
                <div>
                  <p className="tabular text-2xl font-bold tracking-tight sm:text-3xl">{done} of {records.length}</p>
                  <p className="text-sm text-muted-foreground sm:text-base">scheduled checkoffs completed{month === currentMonth ? ' so far' : ''}</p>
                </div>
              </CardContent>
            </Card>

            {unlocked ? (
            <section className="flex flex-col gap-3" aria-labelledby="noticed-title">
                <div><h2 id="noticed-title" className="text-title font-bold">What we noticed</h2><p className="text-sm text-muted-foreground">A few patterns from your month that might be helpful.</p></div>
                {noticed.length ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {noticed.map((i) => (
                      <button key={i.id} type="button" onClick={() => open({ name: 'insight', id: i.id })}
                        className={cn('group flex flex-col gap-3 rounded-2xl p-4 text-left ring-1 transition-[scale,box-shadow] duration-100 active:scale-[0.98] hover:ring-2',
                          i.kind === 'win' ? 'bg-mint/60 ring-primary/15 hover:ring-primary/30' : 'bg-lavender/70 ring-lavender-ink/10 hover:ring-lavender-ink/25')}>
                        <div className="flex items-start gap-3">
                          <InsightIcon insight={i} />
                          <div className="min-w-0"><p className="font-semibold leading-snug">{i.headline}</p><p className="mt-1 text-sm text-muted-foreground">{i.detail}</p></div>
                        </div>
                        <span className="mt-auto inline-flex items-center gap-1 pl-14 text-sm font-medium text-lavender-ink underline underline-offset-4">{i.link}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
                      </button>
                    ))}
                  </div>
                ) : <EmptyState icon={<Sparkles className="size-5" aria-hidden="true" />}>Patterns show up after a week or two of check-offs. Keep going and check back soon.</EmptyState>}
              </section>
            ) : <LearningCard days={tracked} />}

            <div className="flex flex-col gap-2">
              {unlocked && <NavRow icon={<FileText />} title="View all insights" onClick={() => open({ name: 'all' })}>Explore every win and pattern from {monthName}.</NavRow>}
              <NavRow icon={<ChartColumn />} title="Weekly trend" onClick={() => open({ name: 'trend' })}>See your consistency over time with a simple bar chart.</NavRow>
              <NavRow icon={<TrendingUp />} title="Your numbers" onClick={() => open({ name: 'numbers' })}>Steps, water and other measurements you track.</NavRow>
              <NavRow icon={<CalendarDays />} title="Day-by-day history" onClick={() => open({ name: 'history' })}>Every scheduled day, filters, and a CSV download.</NavRow>
              <NavRow icon={<Sparkles />} title="Monthly recap" onClick={onOpenRecap}>Your last month in a few highlights.</NavRow>
            </div>
            <HowCalculated />
          </>
        )}

        {view.name === 'all' && !unlocked && <>{back}<LearningCard days={tracked} /></>}
        {view.name === 'all' && unlocked && (
          <>
            {back}
            <ScreenTitle title="All insights" subtitle={`A closer look at your habits in ${monthName}.`} />
            <InsightList title="Wins" subtitle="What’s working well for you." items={wins} onOpen={(id) => open({ name: 'insight', id })} empty="No wins yet this month. They’ll appear as you check things off." />
            <InsightList title="Patterns to explore" subtitle="A few things to take a closer look at." items={patterns} onOpen={(id) => open({ name: 'insight', id })} empty="Nothing stands out. Nice and steady.">
              <NavRow icon={<ChartColumn />} title="Weekly trend" onClick={() => open({ name: 'trend' })}>See your consistency over time.</NavRow>
            </InsightList>
          </>
        )}

        {view.name === 'insight' && (insight && unlocked ? (
          <>
            {back}
            <ScreenTitle title={insight.tip?.weekday ? `${insight.tip.weekday} ${lower(insight.task.title)}` : insight.short} subtitle="A closer look at this pattern." />
            <Card>
              <CardContent className="flex flex-col gap-5">
                <p className="text-xl font-bold leading-snug md:text-2xl">{insight.summary}</p>
                <DayTimeline days={insight.days} />
              </CardContent>
            </Card>
            {insight.tip && !readOnly && (
              <div className="flex flex-col gap-3 rounded-2xl bg-lavender p-5 text-lavender-ink sm:flex-row sm:items-start">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-card text-ink"><BellRing className="size-5" aria-hidden="true" /></span>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div><p className="text-lg font-semibold text-foreground">{insight.tip.title}</p><p className="text-sm">{insight.tip.body}</p></div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Button size="lg" className="h-11 px-6 text-sm" onClick={onSetReminder}>Set reminder</Button>
                    <Button variant="link" className="px-0 text-lavender-ink" onClick={() => onEditTask(insight.task)}>Review the schedule<ArrowRight data-icon="inline-end" /></Button>
                  </div>
                </div>
              </div>
            )}
            <p className="flex gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Based on {insight.days.length} scheduled day{insight.days.length === 1 ? '' : 's'}; this is a pattern to check, not a cause.</p>
          </>
        ) : <>{back}<EmptyState>This insight isn’t available for the selected month.</EmptyState></>)}

        {view.name === 'trend' && (
          <>
            {back}
            <ScreenTitle title="Weekly trend" subtitle={`Your consistency rate each week of ${monthName}.`} />
            <WeeklyBars weeks={weeks} />
            <HowCalculated />
          </>
        )}

        {view.name === 'numbers' && (<>{back}<ProgressPage client={client} owner={owner} today={today} readOnly={readOnly} tasks={tasks} kpis={kpis} kpiLogs={kpiLogs} /></>)}
        {view.name === 'history' && (<>{back}<InsightsDashboard owner={owner} today={today} tasks={tasks} settings={settings} completions={completions} earnings={earnings} kpis={kpis} kpiLogs={kpiLogs} onOpenRecap={onOpenRecap} /></>)}
      </div>
    </div>
  );
}

function ScreenTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="-mt-2"><h2 className="text-title text-3xl font-bold md:text-4xl">{title}</h2><p className="mt-1 text-muted-foreground">{subtitle}</p></div>;
}

function InsightIcon({ insight, size = 'md' }: { insight: Insight; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full', size === 'lg' ? 'size-14' : 'size-11', insight.kind === 'win' ? 'bg-card text-ink' : 'bg-card text-lavender-ink')}>
      <ActivityIcon title={insight.task.title} className={cn('text-current', size === 'lg' ? 'size-7' : 'size-5')} />
    </span>
  );
}

function NavRow({ icon, title, children, onClick }: { icon: ReactNode; title: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-4 rounded-2xl bg-card p-4 text-left ring-1 ring-foreground/8 transition-[background-color,scale] duration-100 hover:bg-card/70 active:scale-[0.99]">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-lavender text-lavender-ink [&_svg]:size-5" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1"><strong className="block font-semibold">{title}</strong><span className="text-sm text-muted-foreground">{children}</span></span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function InsightList({ title, subtitle, items, onOpen, empty, children }: { title: string; subtitle: string; items: Insight[]; onOpen: (id: string) => void; empty: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div><h3 className="text-title font-bold">{title}</h3><p className="text-sm text-muted-foreground">{subtitle}</p></div>
      {items.length ? items.map((i) => (
        <button key={i.id} type="button" onClick={() => onOpen(i.id)}
          className={cn('flex items-center gap-4 rounded-2xl p-4 text-left ring-1 transition-[scale] duration-100 active:scale-[0.99]', i.kind === 'win' ? 'bg-mint/60 ring-primary/15' : 'bg-card ring-foreground/8')}>
          <InsightIcon insight={i} size="lg" />
          <span className="min-w-0 flex-1"><strong className="block font-semibold">{i.short}</strong><span className="text-sm text-muted-foreground">{i.detail}</span></span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      )) : <p className="rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{empty}</p>}
      {children}
    </section>
  );
}

/** The scheduled days behind an insight, as a connected timeline (wraps when there are many). */
function DayTimeline({ days }: { days: Record_[] }) {
  const connected = days.length <= 6;
  return (
    <ol className={cn('flex', connected ? 'items-start justify-between' : 'flex-wrap gap-x-3 gap-y-4')}>
      {days.map((r, i) => (
        <li key={r.day} className={cn('relative flex flex-col items-center gap-1.5 text-center', connected ? 'flex-1' : 'w-16')}>
          {connected && i > 0 && <span aria-hidden="true" className="absolute top-6 right-1/2 h-px w-full -translate-y-1/2 bg-foreground/15" />}
          <span className={cn('relative grid size-12 place-items-center rounded-full', r.done ? 'bg-mint text-primary ring-1 ring-primary/30' : 'bg-muted text-muted-foreground')}>
            {r.done ? <Check className="size-5" strokeWidth={3} aria-hidden="true" /> : <X className="size-5" aria-hidden="true" />}
          </span>
          <span className="text-sm font-medium">{short(r.day)}</span>
          <span className="-mt-1 text-xs text-muted-foreground">{r.done ? 'Completed' : 'Incomplete'}</span>
        </li>
      ))}
    </ol>
  );
}

function WeeklyBars({ weeks }: { weeks: { start: string; end: string; done: number; total: number }[] }) {
  const rated = weeks.filter((w) => w.total > 0);
  if (!rated.length) return <EmptyState>No scheduled check-offs this month yet.</EmptyState>;
  const pct = (w: { done: number; total: number }) => Math.round((w.done / w.total) * 100);
  const best = rated.reduce((a, b) => (pct(b) >= pct(a) ? b : a));
  const lastIsBest = rated.at(-1) === best && rated.length > 1;
  const range = (w: { start: string; end: string }) => `${short(w.start)} – ${w.end.slice(5, 7) === w.start.slice(5, 7) ? Number(w.end.slice(-2)) : short(w.end)}`;
  return (
    <>
      <Card>
        <CardContent>
          <div className="flex h-64 items-end gap-3 sm:gap-5" role="img" aria-label={'Weekly consistency: ' + rated.map((w) => `${range(w)} ${pct(w)}%`).join(', ')}>
            {weeks.map((w) => (
              <div key={w.start} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <span className="tabular text-sm font-bold">{w.total ? pct(w) + '%' : '—'}</span>
                <div className="flex w-full flex-1 items-end justify-center">
                  <div className={cn('relative flex w-full max-w-28 items-end justify-center rounded-t-xl pb-2 transition-[height] duration-700 ease-out', w === best ? 'bg-chart-3 text-white' : 'bg-chart-1 text-lavender-ink')}
                    style={{ height: `${Math.max(14, w.total ? pct(w) : 0)}%` }}>
                    {w.total > 0 && <span className="tabular px-1 text-center text-[0.6875rem] font-medium leading-tight sm:text-xs">{w.done} of {w.total}</span>}
                  </div>
                </div>
                <span className="text-center text-[0.6875rem] whitespace-nowrap text-muted-foreground sm:text-xs">{range(w)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="flex items-start gap-4 rounded-2xl bg-lavender p-5 text-lavender-ink">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-card"><ChartColumn className="size-5" aria-hidden="true" /></span>
        <div>
          <p className="text-lg font-semibold text-foreground">{lastIsBest ? 'Your last stretch was your strongest' : `Your strongest week was ${range(best)}`}</p>
          <p className="text-sm">You completed {best.done} of {best.total} scheduled checkoffs from {range(best)}.</p>
        </div>
      </div>
    </>
  );
}

function HowCalculated() {
  return (
    <Disclosure summary={<span className="inline-flex items-center gap-2"><Info className="size-4" aria-hidden="true" />How insights are calculated</span>}>
      <ul className="list-disc space-y-1 pl-5">
        <li>Only scheduled days count. Rest days and days before an activity started are left out.</li>
        <li>Checkoffs include corrections you’ve made. Measurements don’t change these numbers.</li>
        <li>A pattern needs at least three scheduled days, so one off day won’t show up as a trend.</li>
        <li>Patterns are things to check, not causes. You know your week best.</li>
      </ul>
    </Disclosure>
  );
}

/** Shown until insights unlock: what's happening, and how far along it is. */
function LearningCard({ days }: { days: number }) {
  const left = Math.max(0, INSIGHT_UNLOCK_DAYS - days);
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-lavender p-5 text-lavender-ink md:p-6" aria-labelledby="learning-title">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-card text-ink"><Sparkles className="size-5 animate-pulse" aria-hidden="true" /></span>
        <div>
          <h2 id="learning-title" className="text-lg font-semibold text-foreground">We’re finding your insights</h2>
          <p className="mt-1 text-sm">We’re looking for insights based on your daily consistency patterns. They’ll appear here after three weeks of tracking, so they reflect real habits, not one off day.</p>
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-xs font-medium"><span>Day {Math.min(days, INSIGHT_UNLOCK_DAYS)} of {INSIGHT_UNLOCK_DAYS}</span><span>{left ? `${left} day${left === 1 ? '' : 's'} to go` : 'Almost there'}</span></div>
        <Meter value={Math.min(days, INSIGHT_UNLOCK_DAYS)} max={INSIGHT_UNLOCK_DAYS} className="h-2 bg-card/70" label={`Day ${days} of ${INSIGHT_UNLOCK_DAYS} toward your first insights`} />
      </div>
      <p className="text-xs">Keep checking off your habits. Your progress and weekly trend are below in the meantime.</p>
    </section>
  );
}

