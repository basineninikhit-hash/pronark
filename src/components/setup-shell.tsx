import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Logo } from '@/components/pronark';
import { Check } from 'lucide-react';
import { HandNote, PlantPotDoodle } from '@/components/doodles';
import { cn } from '@/lib/utils';
import { prefersReducedMotion, useSpring } from '@/lib/motion';

/** Frame for guided setup and the setup tour: steps slide forward/back along one axis. */
export function SetupShell({ label, actions, step, total, stepKey, hint, children }: {
  label: string; actions?: ReactNode; step: number; total: number; stepKey: number; hint?: ReactNode; children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null), previous = useRef(stepKey);
  const slide = useSpring(0, (v) => { if (cardRef.current) { cardRef.current.style.translate = `${(v * 32).toFixed(2)}px 0`; cardRef.current.style.opacity = String(1 - Math.min(1, Math.abs(v)) * 0.85); } }, { precision: 0.002 });
  useLayoutEffect(() => {
    const direction = Math.sign(stepKey - previous.current);
    previous.current = stepKey;
    if (direction && !prefersReducedMotion()) { slide.set(direction); slide.to(0, { damping: 1, response: 0.4 }); }
    if (direction) window.scrollTo({ top: 0 });
  }, [stepKey, slide]);
  return (
    <main className="relative flex min-h-dvh flex-col bg-background">
      <div aria-hidden="true" className="pronark-blobs" />
      <header className="glass sticky top-0 z-30 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_var(--border)]">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
          <Logo variant="mark" className="h-9" /><span className="text-lg font-bold tracking-tight">Pronark</span>
          <span className="text-eyebrow hidden text-muted-foreground sm:inline">{label}</span>
          <div className="ml-auto flex items-center gap-1.5">{actions}</div>
        </div>
        <ol className="mx-auto flex w-full max-w-5xl items-center px-4 pb-3" aria-label={`Step ${step} of ${total}`}>
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
            <li key={n} className="flex flex-1 items-center last:flex-none" aria-current={n === step ? 'step' : undefined}>
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ring-1 transition-colors duration-300',
                n < step ? 'bg-primary text-primary-foreground ring-primary' : n === step ? 'bg-mint text-mint-ink ring-primary/60' : 'bg-card text-muted-foreground ring-foreground/15')}>
                {n < step ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : n}
              </span>
              {n < total && <span aria-hidden="true" className={cn('mx-1.5 h-px flex-1 transition-colors duration-300', n < step ? 'bg-primary' : 'bg-foreground/15')} />}
            </li>
          ))}
        </ol>
      </header>
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 overflow-x-clip px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))] md:py-10">
        {hint}
        <div ref={cardRef}>{children}</div>
      </div>
    </main>
  );
}

/** Setup step: big title with a plant doodle on the left, the form card on the right (stacked on phones). */
export function SetupCard({ eyebrow, title, children, className }: { eyebrow: ReactNode; title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-10">
      <div className="flex flex-col gap-3 md:sticky md:top-32">
        <div className="text-eyebrow text-mint-ink">{eyebrow}</div>
        <h1 className="text-display font-bold">{title}</h1>
        <div aria-hidden="true" className="mt-4 hidden items-end gap-4 text-ink md:flex">
          <PlantPotDoodle className="h-28 w-24" />
          <HandNote className="pb-4 text-2xl leading-7">Start small.<br />Make it yours.</HandNote>
        </div>
      </div>
      <section className={cn('flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/8 shadow-[0_24px_60px_-36px_oklch(0.45_0.08_292/0.45)] sm:p-7', className)}>
        {children}
      </section>
    </div>
  );
}

export function SetupActions({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:sm:min-w-28">{children}</div>;
}

/** Large selectable tile used for suggestions, companions and planning paths. */
export function ChoiceTile({ selected, onClick, disabled, children, className }: { selected?: boolean; onClick: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected}
      className={cn('flex flex-col items-start gap-1 rounded-xl p-3.5 text-left text-sm ring-1 transition-[background-color,box-shadow,scale] duration-100 active:scale-[0.98] disabled:opacity-50',
        selected ? 'bg-primary/10 ring-2 ring-primary' : 'bg-card ring-foreground/10 hover:bg-muted/50', className)}>
      {children}
    </button>
  );
}
