import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { prefersReducedMotion, useSpring } from '@/lib/motion';

type Phase = 'idle' | 'counting' | 'running';

/**
 * Destructive button with a grace period (after Watermelon's TimedUndoAction). Pressing it
 * starts a countdown; pressing again cancels. Only when the countdown ends does `onConfirm`
 * run. If the button disappears mid-countdown (e.g. its sheet is closed), nothing happens.
 */
export function TimedUndoButton({ label, undoLabel = 'Undo', runningLabel = 'Working…', seconds = 5, onConfirm, disabled, icon, size = 'default', tone = 'danger', className }: {
  label: ReactNode;
  /** `neutral` for actions that aren't destructive (still with the countdown to undo). */
  tone?: 'danger' | 'neutral';
  undoLabel?: string;
  runningLabel?: string;
  seconds?: number;
  onConfirm: () => unknown | Promise<unknown>;
  disabled?: boolean;
  icon?: ReactNode;
  size?: 'sm' | 'default';
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [left, setLeft] = useState(seconds);
  const buttonRef = useRef<HTMLButtonElement>(null), contentRef = useRef<HTMLSpanElement>(null), numberRef = useRef<HTMLSpanElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;

  // The pill's width follows its content on a spring, so swapping labels morphs smoothly.
  const width = useSpring(0, (v) => { if (buttonRef.current) buttonRef.current.style.width = `${v.toFixed(2)}px`; }, { damping: 0.8, response: 0.38, precision: 0.1 });
  const flip = useSpring(0, (v) => { if (numberRef.current) { numberRef.current.style.translate = `0 ${(v * -10).toFixed(2)}px`; numberRef.current.style.opacity = String(1 - Math.abs(v)); } }, { damping: 0.7, response: 0.3, precision: 0.002 });
  const first = useRef(true);
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const place = (animate: boolean) => { const target = content.offsetWidth; if (animate && !prefersReducedMotion()) width.to(target); else width.set(target); };
    place(!first.current);
    first.current = false;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(content);
    return () => observer.disconnect();
  }, [phase, width]);

  // Countdown measured from a start time so it never drifts.
  useEffect(() => {
    if (phase !== 'counting') return;
    const end = Date.now() + seconds * 1000;
    let shown = seconds;
    const tick = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      if (remaining === shown) return;
      shown = remaining;
      setLeft(remaining);
      if (!prefersReducedMotion()) { flip.set(-1); flip.to(0); }
      if (remaining === 0) {
        clearInterval(tick);
        setPhase('running');
        Promise.resolve().then(() => confirmRef.current()).finally(() => { if (buttonRef.current) setPhase('idle'); });
      }
    }, 250);
    return () => clearInterval(tick);
  }, [phase, seconds, flip]);

  // If the action stops being allowed mid-countdown (e.g. the DELETE text changed), cancel it.
  useEffect(() => { if (disabled && phase === 'counting') setPhase('idle'); }, [disabled, phase]);

  // Closing the surface mid-countdown cancels, and says so.
  useEffect(() => () => { if (phaseRef.current === 'counting') toast('Canceled. Nothing was changed.'); }, []);

  const press = () => {
    if (phase === 'idle') { setLeft(seconds); setPhase('counting'); navigator.vibrate?.(10); }
    else if (phase === 'counting') setPhase('idle');
  };

  return (
    <button ref={buttonRef} type="button" onClick={press} disabled={(disabled && phase === 'idle') || phase === 'running'}
      aria-label={phase === 'counting' ? `${undoLabel}. ${left} second${left === 1 ? '' : 's'} left` : undefined}
      className={cn(
        'relative inline-flex shrink-0 overflow-hidden rounded-full font-semibold outline-none select-none',
        'transition-[background-color,color,scale] duration-300 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:opacity-60',
        size === 'sm' ? 'h-8 text-xs pointer-coarse:h-10' : 'h-10 text-sm pointer-coarse:h-11',
        phase === 'counting' ? 'bg-destructive/10 text-destructive dark:bg-destructive/20' : tone === 'neutral' ? 'bg-card text-foreground ring-1 ring-inset ring-foreground/15 hover:bg-muted' : 'bg-destructive text-white hover:bg-destructive/90',
        className,
      )}>
      <span ref={contentRef} className={cn('flex h-full w-max items-center gap-2 whitespace-nowrap', phase === 'counting' ? 'pr-1 pl-1' : size === 'sm' ? 'px-3.5' : 'px-5')}>
        {phase === 'counting' && <span className={cn('grid shrink-0 place-items-center rounded-full bg-destructive text-white', size === 'sm' ? 'size-6' : 'size-8')}><Undo2 className="size-4" aria-hidden="true" /></span>}
        {phase === 'running' && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {phase === 'idle' && icon}
        <span>{phase === 'counting' ? undoLabel : phase === 'running' ? runningLabel : label}</span>
        {phase === 'counting' && (
          <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full bg-destructive px-2.5 text-white tabular', size === 'sm' ? 'h-6 min-w-6' : 'h-8 min-w-8')}>
            <span ref={numberRef} className="block">{left}</span>
          </span>
        )}
      </span>
      {phase === 'counting' && (
        // Linear drain so the remaining time reads at a glance.
        <span aria-hidden="true" className="drain-bar absolute inset-x-0 bottom-0 h-0.5 origin-left bg-destructive/50"
          style={{ animation: `pronark-drain ${seconds}s linear forwards` }} />
      )}
      <span className="sr-only" aria-live="polite">{phase === 'counting' ? `Happens in ${left} seconds. Press to cancel.` : ''}</span>
    </button>
  );
}
