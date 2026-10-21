import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, PartyPopper, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Meter } from '@/components/pronark';
import { cn } from '@/lib/utils';
import { prefersReducedMotion, useSpring } from '@/lib/motion';

export type OnboardingStep = {
  id: number | string;
  title: string;
  isCompleted: boolean;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * Getting-started checklist. Steps complete themselves from real data; the first
 * unfinished step is highlighted with its action. Hideable, and it celebrates when done.
 */
export function OnboardingChecklist({ steps, title = 'Get started with Pronark', onDismiss, className }: {
  steps: OnboardingStep[];
  title?: string;
  onDismiss?: () => void;
  className?: string;
}) {
  const [showDone, setShowDone] = useState(false);
  const done = steps.filter((s) => s.isCompleted).length;
  const next = steps.find((s) => !s.isCompleted);
  const allDone = !next;

  return (
    <Card className={cn('gap-3', className)} aria-labelledby="getting-started-title">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="getting-started-title" className="text-headline">{allDone ? 'You’re all set!' : title}</h2>
            <p className="text-xs text-muted-foreground">{allDone ? 'You’ve tried everything Pronark has to offer. Nice work.' : `${done} of ${steps.length} done · next up: ${next.title.toLowerCase()}`}</p>
          </div>
          {onDismiss && <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1 rounded-full text-muted-foreground" onClick={onDismiss} aria-label="Hide getting started checklist"><X /></Button>}
        </div>
        <Meter value={done} max={steps.length} label={`${done} of ${steps.length} getting-started steps done`} />
        {allDone ? (
          <div className="flex items-center gap-3 rounded-xl bg-primary/8 p-3 text-sm">
            <PartyPopper className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="flex-1">Every step is complete. You can hide this checklist now.</span>
            {onDismiss && <Button size="sm" onClick={onDismiss}>Hide</Button>}
          </div>
        ) : (
          <ol className="flex flex-col">
            {steps.map((step, i) => {
              const current = step.id === next?.id;
              if (step.isCompleted && !showDone) return null;
              return (
                <li key={step.id} className={cn('flex items-center gap-3 rounded-xl px-2 py-2', current && 'bg-primary/6 ring-1 ring-primary/15')}>
                  <StepMark index={i + 1} completed={step.isCompleted} current={current} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', step.isCompleted ? 'text-muted-foreground line-through decoration-muted-foreground/50' : 'font-medium')}>
                      <span className="sr-only">{step.isCompleted ? 'Done: ' : 'Not done: '}</span>{step.title}
                    </p>
                    {current && step.description && <p className="text-xs text-muted-foreground">{step.description}</p>}
                  </div>
                  {!step.isCompleted && step.onAction && (current
                    ? <Button size="sm" onClick={step.onAction}>{step.actionLabel ?? 'Start'}</Button>
                    : <Button variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground" onClick={step.onAction} aria-label={step.actionLabel ? `${step.actionLabel}: ${step.title}` : step.title}><ChevronRight /></Button>)}
                </li>
              );
            })}
          </ol>
        )}
        {!allDone && done > 0 && (
          <Button variant="link" size="sm" className="self-start px-0 text-muted-foreground" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
            {showDone ? 'Hide completed steps' : `Show ${done} completed step${done === 1 ? '' : 's'}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Numbered circle that pops into a check when its step completes. */
function StepMark({ index, completed, current }: { index: number; completed: boolean; current: boolean }) {
  const ref = useRef<HTMLSpanElement>(null), was = useRef(completed);
  const pop = useSpring(1, (v) => { if (ref.current) ref.current.style.scale = String(v); }, { damping: 0.6, response: 0.35, precision: 0.001 });
  useEffect(() => {
    if (completed && !was.current && !prefersReducedMotion()) { pop.set(0.6); pop.to(1); }
    was.current = completed;
  }, [completed, pop]);
  return (
    <span ref={ref} aria-hidden="true"
      className={cn('grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular',
        completed ? 'bg-primary text-primary-foreground' : current ? 'bg-background text-primary ring-2 ring-primary' : 'bg-muted text-muted-foreground')}>
      {completed ? <Check className="size-4" strokeWidth={3} /> : index}
    </span>
  );
}
