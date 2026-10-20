import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { prefersReducedMotion, useSpring } from '@/lib/motion';

type Option<T extends string> = { value: T; label: ReactNode; icon?: ReactNode; describedBy?: string };

/**
 * Segmented control whose highlight slides between options on a critically damped
 * spring. Re-targeting mid-slide continues from the live position (interruptible).
 */
export function Segmented<T extends string>({ value, onChange, options, label, role = 'radiogroup', className, controls }: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  label: string;
  role?: 'radiogroup' | 'tablist';
  className?: string;
  controls?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  const x = useSpring(0, (v) => { if (pillRef.current) pillRef.current.style.translate = `${v.toFixed(2)}px 0`; }, { precision: 0.1 });
  const w = useSpring(0, (v) => { if (pillRef.current) pillRef.current.style.width = `${Math.max(0, v).toFixed(2)}px`; }, { precision: 0.1 });

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const place = (animate: boolean) => {
      const active = list.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) return;
      if (animate && !prefersReducedMotion()) { x.to(active.offsetLeft); w.to(active.offsetWidth); }
      else { x.set(active.offsetLeft); w.set(active.offsetWidth); }
    };
    place(!first.current);
    first.current = false;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(list);
    return () => observer.disconnect();
  }, [value, x, w]);

  const isTabs = role === 'tablist';
  return (
    <div ref={listRef} role={role} aria-label={label} className={cn('relative inline-grid grid-flow-col auto-cols-fr rounded-lg bg-muted p-[3px] text-xs font-medium', className)}>
      <span ref={pillRef} aria-hidden="true" className="absolute top-[3px] bottom-[3px] left-0 rounded-md bg-background shadow-sm ring-1 ring-foreground/5 dark:bg-input/40" />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={isTabs ? 'tab' : 'radio'}
            aria-selected={isTabs ? selected : undefined}
            aria-checked={isTabs ? undefined : selected}
            aria-controls={isTabs ? controls : undefined}
            aria-describedby={option.describedBy}
            data-active={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative z-10 inline-flex min-h-7 items-center justify-center gap-1.5 rounded-md px-3 py-1 whitespace-nowrap text-foreground/60 transition-[color,scale] duration-100 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.97] pointer-coarse:min-h-9',
              selected && 'text-foreground',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
