import { HeartPulse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, type Task } from '@/lib/domain';
import { amountText, type HealthSuggestion } from '@/lib/health';

/** Home card: Apple Health suggestions waiting for the member to confirm or dismiss. */
export function HealthSuggestions({ suggestions, tasks, today, busy, onConfirm, onDismiss }: {
  suggestions: HealthSuggestion[]; tasks: Task[]; today: string; busy: boolean;
  onConfirm: (s: HealthSuggestion) => void; onDismiss: (s: HealthSuggestion) => void;
}) {
  const rows = suggestions.filter((s) => tasks.some((t) => t.id === s.task_id));
  if (!rows.length) return null;
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-rose/60 p-4 text-rose-ink ring-1 ring-foreground/8 md:p-5" aria-labelledby="health-suggestions-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-card"><HeartPulse className="size-5 text-rose-pop" aria-hidden="true" /></span>
        <div>
          <h2 id="health-suggestions-title" className="text-headline text-lg font-bold text-foreground">Apple Health thinks you did {rows.length === 1 ? 'this' : 'these'}</h2>
          <p className="text-sm">Nothing is checked off until you confirm.</p>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((s) => {
          const task = tasks.find((t) => t.id === s.task_id)!;
          const day = s.local_date === today ? 'Today' : formatDate(s.local_date, { weekday: 'short', month: 'short', day: 'numeric' });
          return (
            <li key={s.id} className="flex flex-col gap-3 rounded-2xl bg-card p-3.5 text-foreground sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <strong className="block truncate font-semibold">{task.title}</strong>
                <span className="block text-sm"><span className="font-medium">{day}</span> · <span className="tabular">{amountText(s.kind, s.measured_value)}</span> <span className="text-muted-foreground">(goal {amountText(s.kind, s.target)})</span></span>
                <span className="block text-xs text-muted-foreground">Source: {s.source}</span>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" disabled={busy} onClick={() => onDismiss(s)} aria-label={`Dismiss suggestion for ${task.title} on ${day}`}>Dismiss</Button>
                <Button disabled={busy} onClick={() => onConfirm(s)} aria-label={`Confirm ${task.title} on ${day}`}>Confirm check-in</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
