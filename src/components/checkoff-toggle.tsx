import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { prefersReducedMotion, useSpring } from '@/lib/motion';

type Phase = 'idle' | 'loading' | 'success' | 'saved';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Morphing check-off button (after Watermelon's SaveToggle): a "Check off" pill shrinks to a
 * spinner while the real save runs, pops a check when it lands, then settles as a "Done" pill.
 * Tapping "Done" unchecks. Width is driven by a spring, so taps mid-morph blend smoothly.
 */
export function CheckoffToggle({ checked, onToggle, disabled, label }: {
  checked: boolean;
  /** Performs the save; resolves true when it succeeded. */
  onToggle: () => Promise<boolean>;
  disabled?: boolean;
  /** Activity name, for the accessible label. */
  label: string;
}) {
  const [busy, setBusy] = useState<'loading' | 'success' | null>(null);
  const phase: Phase = busy ?? (checked ? 'saved' : 'idle');
  const buttonRef = useRef<HTMLButtonElement>(null), checkRef = useRef<HTMLSpanElement>(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Widths come from the button's height so the circle state is always a true circle.
  const widthFor = (p: Phase) => {
    const h = buttonRef.current?.offsetHeight ?? 36;
    return p === 'loading' || p === 'success' ? h : p === 'saved' ? h * 2.55 : h * 2.9;
  };
  const width = useSpring(0, (v) => { if (buttonRef.current) buttonRef.current.style.width = `${v.toFixed(2)}px`; }, { damping: 0.75, response: 0.4, precision: 0.1 });
  const pop = useSpring(1, (v) => { if (checkRef.current) checkRef.current.style.scale = String(v); }, { damping: 0.55, response: 0.35, precision: 0.001 });
  const first = useRef(true);
  useLayoutEffect(() => {
    const target = widthFor(phase);
    if (first.current || prefersReducedMotion()) width.set(target); else width.to(target);
    first.current = false;
    if (phase === 'success' && !prefersReducedMotion()) { pop.set(0.4); pop.to(1); }
  }, [phase, width, pop]);

  async function press() {
    if (busy || disabled) return;
    const willCheck = !checked;
    setBusy('loading');
    const [ok] = await Promise.all([onToggle(), delay(600)]);
    if (!alive.current) return;
    if (ok && willCheck) { setBusy('success'); await delay(650); if (!alive.current) return; }
    setBusy(null);
  }

  const layer = 'absolute inset-0 flex items-center justify-center gap-1.5 transition-[opacity,translate,filter] duration-200 ease-out';
  return (
    <button ref={buttonRef} type="button" onClick={press} disabled={disabled} aria-pressed={checked} aria-busy={phase === 'loading'}
      aria-label={(checked ? 'Mark incomplete: ' : 'Mark complete: ') + label}
      className={cn(
        'relative h-9 shrink-0 overflow-hidden rounded-full text-sm font-semibold tracking-tight outline-none select-none',
        'transition-[background-color,color,box-shadow,scale] duration-200 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 pointer-coarse:h-10',
        phase === 'idle' && 'bg-muted text-foreground hover:bg-muted/70',
        phase === 'loading' && 'bg-foreground text-background',
        phase === 'success' && 'bg-primary text-primary-foreground',
        phase === 'saved' && 'bg-primary/10 text-primary ring-1 ring-primary/30 ring-inset dark:bg-primary/25 dark:text-sidebar-primary dark:ring-primary/50',
      )}>
      <span aria-hidden="true" className={cn(layer, phase === 'idle' ? 'opacity-100' : '-translate-y-2 opacity-0 blur-[2px]')}>Check off</span>
      <span aria-hidden="true" className={cn(layer, phase === 'loading' ? 'opacity-100' : 'scale-75 opacity-0')}>
        <svg viewBox="0 0 26 26" className="size-5 animate-spin">
          <circle cx="13" cy="13" r="10" fill="none" strokeWidth="3" className="stroke-background/30" />
          <path d="M13 3 A10 10 0 0 1 23 13" fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-background" />
        </svg>
      </span>
      <span aria-hidden="true" className={cn(layer, phase === 'success' || phase === 'saved' ? 'opacity-100' : 'translate-y-2 opacity-0 blur-[2px]')}>
        <span ref={checkRef} className={cn('grid place-items-center rounded-full', phase === 'success' ? 'size-6 bg-primary-foreground text-primary' : 'size-4 bg-primary text-primary-foreground')}>
          <Check className={phase === 'success' ? 'size-4' : 'size-3'} strokeWidth={3.5} />
        </span>
        {phase === 'saved' && <span>Done</span>}
      </span>
    </button>
  );
}
