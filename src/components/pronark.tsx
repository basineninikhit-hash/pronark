import { useEffect, useId, useRef, type ComponentType, type ReactNode } from 'react';
import { Apple, CandyOff, ChevronDown, Dumbbell, Droplet, Footprints, Moon, Sparkles, Sun, UtensilsCrossed, type LucideProps } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { weekdays } from '@/lib/domain';
import { prefersReducedMotion, useSpring } from '@/lib/motion';

const asset = (name: string) => import.meta.env.BASE_URL + name;
/**
 * Pronark logo. `full` is the arch with the PRONARK wordmark; `mark` is the arch alone for
 * tight spaces. Dark mode swaps in the cream version (the gold sun stays gold).
 */
export function Logo({ variant = 'full', className }: { variant?: 'full' | 'mark'; className?: string }) {
  const name = variant === 'full' ? 'pronark-logo' : 'pronark-mark';
  return (
    <picture>
      <source srcSet={asset(name + '-dark.png')} media="(prefers-color-scheme: dark)" />
      <img src={asset(name + '.png')} alt="Pronark" className={cn('w-auto object-contain', className)} />
    </picture>
  );
}

const activityIcons: [RegExp, ComponentType<LucideProps>][] = [
  [/gym|workout|exercise|strength/, Dumbbell],
  [/step|walk|run/, Footprints],
  [/lunch|fruit|apple/, Apple],
  [/dinner|meal|food/, UtensilsCrossed],
  [/sugar|sweet/, CandyOff],
  [/skin|care|night/, Moon],
  [/morning|sun/, Sun],
  [/water|drink/, Droplet],
];

export function ActivityIcon({ title, className }: { title: string; className?: string }) {
  const s = title.toLowerCase();
  const Icon = activityIcons.find(([pattern]) => pattern.test(s))?.[1] ?? Sparkles;
  return <Icon aria-hidden="true" strokeWidth={1.75} className={cn('size-5 text-primary', className)} />;
}

/** Page heading. Visible title on desktop; phones show it under the translucent app bar. */
export function PageIntro({ eyebrow, title, description, actions, className }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <div className="text-eyebrow mb-1.5 text-muted-foreground">{eyebrow}</div>}
        <h2 className="text-title">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeading({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="text-headline">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({ label, value, hint, icon, tone = 'default', className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'default' | 'primary'; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 rounded-xl p-3.5 ring-1', tone === 'primary' ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card ring-foreground/10', className)}>
      <div className={cn('flex items-center gap-1.5 text-xs', tone === 'primary' ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <strong className="tabular truncate text-lg font-semibold tracking-tight md:text-xl">{value}</strong>
      {hint && <span className={cn('text-xs', tone === 'primary' ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{hint}</span>}
    </div>
  );
}

/** Thin progress bar. `tone` colours the fill. */
export function Meter({ value, max = 100, className, label, tone = 'primary' }: { value: number; max?: number; className?: string; label?: string; tone?: 'primary' | 'warning' | 'muted' }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div role={label ? 'progressbar' : undefined} aria-label={label} aria-valuenow={label ? Math.round(percent) : undefined} aria-valuemin={label ? 0 : undefined} aria-valuemax={label ? 100 : undefined}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', tone === 'primary' ? 'bg-primary' : tone === 'warning' ? 'bg-warning' : 'bg-muted-foreground/40')} style={{ width: percent + '%' }} />
    </div>
  );
}

/** A number that springs to its new value instead of jumping (respecting reduced motion). */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const formatRef = useRef(format);
  formatRef.current = format;
  const spring = useSpring(value, (v) => { if (ref.current) ref.current.textContent = formatRef.current(Math.round(v)); }, { damping: 1, response: 0.5, precision: 0.5 });
  useEffect(() => { prefersReducedMotion() ? spring.set(value) : spring.to(value); }, [value, spring]);
  return <span ref={ref} className={cn('tabular', className)}>{format(value)}</span>;
}

/** Circular progress driven by a spring, so taps in quick succession blend instead of jumping. */
export function ProgressRing({ value, size = 120, stroke = 10, children, className, label }: { value: number; size?: number; stroke?: number; children?: ReactNode; className?: string; label?: string }) {
  const circleRef = useRef<SVGCircleElement>(null);
  const r = (size - stroke) / 2, circumference = 2 * Math.PI * r;
  const spring = useSpring(value, (v) => {
    if (circleRef.current) circleRef.current.style.strokeDashoffset = String(circumference * (1 - Math.min(1, Math.max(0, v))));
  }, { damping: 1, response: 0.55, precision: 0.001 });
  useEffect(() => { prefersReducedMotion() ? spring.set(value) : spring.to(value); }, [value, spring]);
  return (
    <div className={cn('relative grid shrink-0 place-items-center', className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-primary/15" />
        <circle ref={circleRef} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className="stroke-primary"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value)} />
      </svg>
      <div className="relative">{children}</div>
    </div>
  );
}

/** Label + control + optional hint, stacked. Wraps the control in a real <label> for hit area. */
export function FormField({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

export function Form({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-4', className)}>{children}</div>;
}

/** Inline checkbox with a generous hit area, styled like the shadcn checkbox. */
export function CheckRow({ checked, onChange, disabled, children, description }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; children: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 text-sm', disabled && 'cursor-not-allowed opacity-60')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--primary)] pointer-coarse:size-5" />
      <span className="flex min-w-0 flex-col">
        <span>{children}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
}

export function WeekdayPicker({ value, onChange, disabled = false, legend = 'Scheduled days' }: { value: number[]; onChange: (days: number[]) => void; disabled?: boolean; legend?: string }) {
  const id = useId();
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-1.5 disabled:opacity-60" aria-describedby={id}>
      <legend className="mb-1.5 text-xs font-medium">{legend}</legend>
      <div className="grid grid-cols-7 gap-1.5" id={id}>
        {weekdays.map((d, i) => {
          const on = value.includes(i + 1);
          return (
            <button key={d} type="button" aria-pressed={on} disabled={disabled}
              onClick={() => onChange(on ? value.filter((x) => x !== i + 1) : [...value, i + 1].sort())}
              className={cn('h-9 rounded-lg text-xs font-medium ring-1 transition-[background-color,color,scale] duration-100 active:scale-95 pointer-coarse:h-11',
                on ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card text-muted-foreground ring-foreground/10 hover:text-foreground')}>
              {d}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{children}</p>;
}

/** Question-and-answer disclosure (replaces raw <details>). */
export function Disclosure({ summary, children, className }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Collapsible className={cn('rounded-lg ring-1 ring-foreground/10', className)}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-lg">
        {summary}
        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-200 group-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 text-sm text-muted-foreground">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function EmptyState({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground', className)}>
      {icon}
      {children}
    </div>
  );
}

export { Label };
