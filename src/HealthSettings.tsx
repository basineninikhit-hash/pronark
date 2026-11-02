import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HeartPulse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Disclosure, ErrorText, SectionHeading } from '@/components/pronark';
import { cn } from '@/lib/utils';
import { defaultTarget, targetError, workoutTypes, type HealthConnection, type HealthKind, type HealthLink, type WorkoutType } from '@/lib/health';

type Activity = { id: string; title: string; archive_date: string | null };
type Draft = { kind: '' | HealthKind; target: string; types: WorkoutType[] };

const draftFrom = (link: HealthLink | undefined): Draft => link ? { kind: link.kind, target: String(Number(link.target)), types: link.workout_types ?? [] } : { kind: '', target: '', types: [] };
const sameDraft = (a: Draft, b: Draft) => a.kind === b.kind && (a.kind === '' || (Number(a.target) === Number(b.target) && [...a.types].sort().join() === [...b.types].sort().join()));

/** Settings → Apple Health: connection status, which activities use Health data, and disconnect. */
export function HealthSettings({ client, owner, tasks, stepGoal, onChanged }: { client: SupabaseClient; owner: string; tasks: Activity[]; stepGoal: number | null; onChanged: () => Promise<void> }) {
  const [connection, setConnection] = useState<HealthConnection | null>(null), [links, setLinks] = useState<HealthLink[]>([]), [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const active = tasks.filter((t) => !t.archive_date);

  async function load() {
    const [c, l] = await Promise.all([client.from('health_connections').select('*').eq('owner_id', owner).maybeSingle(), client.from('health_activity_links').select('*').eq('owner_id', owner)]);
    if (c.error || l.error) { setError('Apple Health needs the latest database update (202610290029_apple_health.sql).'); setReady(false); return; }
    const rows = (l.data ?? []) as HealthLink[];
    setConnection((c.data ?? null) as HealthConnection | null); setLinks(rows);
    setDrafts(Object.fromEntries(active.map((t) => [t.id, draftFrom(rows.find((x) => x.task_id === t.id))])));
    setError(''); setReady(true);
  }
  useEffect(() => { load(); }, [owner]);

  async function act(action: () => PromiseLike<{ error: { message: string } | null }>, message: string) {
    setBusy(true); setError(''); setStatus('');
    const { error: failure } = await action();
    if (failure) setError(failure.message);
    else { await load(); await onChanged(); setStatus(message); }
    setBusy(false);
  }
  const edit = (id: string, change: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...change } }));
  function saveLink(task: Activity) {
    const d = drafts[task.id];
    if (!d.kind) return act(() => client.rpc('save_health_link', { p_task: task.id, p_kind: null, p_target: null, p_workout_types: null }), `${task.title} no longer uses Apple Health.`);
    const problem = targetError(d.kind, Number(d.target));
    if (problem) { setError(`${task.title}: ${problem}`); return; }
    return act(() => client.rpc('save_health_link', { p_task: task.id, p_kind: d.kind, p_target: Number(d.target), p_workout_types: d.kind === 'workouts' ? d.types : [] }),
      `${task.title} now gets Apple Health suggestions. You still confirm each one.`);
  }

  const kinds = [connection?.steps_enabled && 'steps', connection?.workouts_enabled && 'workouts'].filter(Boolean).join(' and ');
  return (
    <Card><CardContent className="flex flex-col gap-4">
      <SectionHeading title={<span className="flex items-center gap-2"><HeartPulse className="size-5 text-rose-pop" aria-hidden="true" />Apple Health</span>}
        description="Steps and workouts from your iPhone or Apple Watch can suggest check-ins. Nothing is checked off or earned until you confirm it." />
      {!ready ? <p role="status" className="text-sm text-muted-foreground">{error || 'Loading Apple Health settings…'}</p> : <>
        <div className={cn('rounded-2xl p-3.5 text-sm', connection ? 'bg-mint text-mint-ink' : 'bg-muted text-muted-foreground')} role="status">
          {connection
            ? <><strong className="text-foreground">Connected{connection.device_label ? ` on ${connection.device_label}` : ''}.</strong> Reading {kinds || 'nothing yet'}. {connection.last_sync_at ? `Last sync ${new Date(connection.last_sync_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'No sync yet.'}</>
            : <>Not connected. Choose activities below, then open the <strong className="text-foreground">Pronark Health</strong> app on your iPhone and sign in with the same Google account.</>}
        </div>

        <h4 className="text-headline">Which activities use Apple Health?</h4>
        {active.length ? (
          <ul className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
            {active.map((t) => {
              const d = drafts[t.id] ?? draftFrom(undefined), saved = draftFrom(links.find((x) => x.task_id === t.id));
              return (
                <li key={t.id} className="flex flex-col gap-2.5 px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="min-w-32 flex-1 text-sm font-medium">{t.title}</strong>
                    <NativeSelect className="w-40" aria-label={`Health data for ${t.title}`} value={d.kind}
                      onChange={(e) => { const kind = e.target.value as Draft['kind']; edit(t.id, { kind, target: kind ? String(defaultTarget(kind, stepGoal)) : '', types: [] }); }}>
                      <NativeSelectOption value="">Don’t use</NativeSelectOption>
                      <NativeSelectOption value="steps">Step count</NativeSelectOption>
                      <NativeSelectOption value="workouts">Workouts</NativeSelectOption>
                    </NativeSelect>
                    {d.kind && <label className="flex items-center gap-1.5 text-sm"><Input className="w-24" inputMode="numeric" value={d.target} onChange={(e) => edit(t.id, { target: e.target.value })} aria-label={`Target for ${t.title}`} />{d.kind === 'steps' ? 'steps' : 'min'}</label>}
                    <Button variant="outline" size="sm" disabled={busy || sameDraft(d, saved)} onClick={() => saveLink(t)}>Save</Button>
                  </div>
                  {d.kind === 'workouts' && (
                    <fieldset className="flex flex-wrap gap-1.5">
                      <legend className="mb-1 text-xs text-muted-foreground">Count these workouts (none picked = any workout)</legend>
                      {workoutTypes.map(([key, label]) => {
                        const on = d.types.includes(key);
                        return <button key={key} type="button" aria-pressed={on} onClick={() => edit(t.id, { types: on ? d.types.filter((x) => x !== key) : [...d.types, key] })}
                          className={cn('rounded-full px-3 py-1 text-xs ring-1 transition-colors', on ? 'bg-primary text-primary-foreground ring-primary' : 'ring-foreground/15 hover:bg-muted')}>{label}</button>;
                      })}
                    </fieldset>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Add an activity first.</p>}

        {connection && <Button variant="outline" className="self-start" disabled={busy} onClick={() => act(() => client.rpc('disconnect_health'), 'Apple Health disconnected. Your activities were unlinked and stored Health totals deleted; check-ins you confirmed stay.')}>Disconnect and delete Health data</Button>}
        {status && <p className="text-sm text-primary" role="status">{status}</p>}<ErrorText>{error}</ErrorText>
        <Disclosure summary="What does Pronark read and share?">
          Only daily totals for what your linked activities need: your step count, and workout minutes by workout type. Never your location, routes, heart rate or other Health data.
          Totals are kept only for this month, are visible only to you, and are never used for advertising. Group members see an ordinary check-in, never your Health numbers.
          You can turn off access anytime in the iPhone’s Settings → Health → Data Access, or disconnect here.
        </Disclosure>
      </>}
    </CardContent></Card>
  );
}
