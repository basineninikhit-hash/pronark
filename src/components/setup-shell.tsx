import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Meter, logoSrc } from '@/components/pronark';
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
    <main className="flex min-h-dvh flex-col bg-gradient-to-b from-primary/10 via-background to-background">
      <header className="glass sticky top-0 z-30 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_var(--border)]">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-4">
          <img src={logoSrc} alt="Pronark" className="dark:invert dark:hue-rotate-180 h-9 w-auto object-contain" />
          <span className="text-eyebrow hidden text-muted-foreground sm:inline">{label}</span>
          <div className="ml-auto flex items-center gap-1.5">{actions}</div>
        </div>
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-3">
          <span className="tabular shrink-0 text-xs text-muted-foreground">Step {step} of {total}</span>
          <Meter value={step} max={total} className="h-1" label={`Step ${step} of ${total}`} />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-x-clip px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {hint}
        <div ref={cardRef}>{children}</div>
      </div>
    </main>
  );
}

export function SetupCard({ eyebrow, title, children, className }: { eyebrow: ReactNode; title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 sm:p-7', className)}>
      <div className="text-eyebrow text-primary">{eyebrow}</div>
      <h1 className="text-display -mt-2">{title}</h1>
      {children}
    </section>
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
