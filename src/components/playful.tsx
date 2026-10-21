import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ActivityIcon } from '@/components/pronark';

/** The six palette colors. See the palette note in index.css for what each one means. */
export type Tone = 'mint' | 'lavender' | 'peach' | 'rose' | 'sky' | 'butter';

export const toneSurface: Record<Tone, string> = {
  mint: 'bg-mint text-mint-ink ring-mint-pop/30',
  lavender: 'bg-lavender text-lavender-ink ring-lavender-pop/30',
  peach: 'bg-peach text-peach-ink ring-peach-pop/35',
  rose: 'bg-rose text-rose-ink ring-rose-pop/30',
  sky: 'bg-sky text-sky-ink ring-sky-pop/30',
  butter: 'bg-butter text-butter-ink ring-butter-pop/35',
};
const popText: Record<Tone, string> = { mint: 'text-mint-pop', lavender: 'text-lavender-pop', peach: 'text-peach-pop', rose: 'text-rose-pop', sky: 'text-sky-pop', butter: 'text-butter-pop' };

/** Habit → color, by what kind of habit it is, so the same habit is always the same color. */
export function habitTone(title: string): Tone {
  const s = title.toLowerCase();
  if (/gym|workout|exercise|run|yoga|bike|swim|strength/.test(s)) return 'mint';
  if (/step|walk|move/.test(s)) return 'lavender';
  if (/lunch|fruit|apple|sugar|sweet/.test(s)) return 'rose';
  if (/dinner|meal|food|cook/.test(s)) return 'butter';
  if (/read|book|study|learn|water|drink|sleep|night|skin|care/.test(s)) return 'sky';
  return 'peach';
}

/** Hand-drawn "pop" marks in the card's accent color. */
export function Pop({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('pointer-events-none', popText[tone], className)} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M10 26l6-14M22 30l12-8M20 18l6-9" />
    </svg>
  );
}

/** Colored circle with the habit's icon. */
export function HabitBubble({ title, className }: { title: string; className?: string }) {
  const tone = habitTone(title);
  return (
    <span className={cn('grid size-12 shrink-0 place-items-center rounded-full', toneSurface[tone], className)} aria-hidden="true">
      <ActivityIcon title={title} className="size-6 text-ink" />
    </span>
  );
}

/** Big playful stat: tinted card, white icon bubble, doodle pops. `layout="row"` for Home, "stack" for Insights/Rewards. */
export function PlayStat({ tone, icon, label, value, hint, layout = 'row', className }: {
  tone: Tone; icon: ReactNode; label: ReactNode; value: ReactNode; hint?: ReactNode; layout?: 'row' | 'stack'; className?: string;
}) {
  const bubble = <span className={cn('relative grid shrink-0 place-items-center rounded-full bg-card/80 text-ink shadow-sm md:size-20 md:[&_svg]:size-10', layout === 'row' ? 'size-11 [&_svg]:size-6 sm:size-16 sm:[&_svg]:size-8' : 'size-16 [&_svg]:size-8')}>{icon}</span>;
  return (
    <div className={cn('relative overflow-hidden rounded-3xl ring-1 ring-inset', toneSurface[tone], layout === 'row' ? 'flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4 md:p-5' : 'flex flex-col items-center gap-1 px-4 pt-5 pb-6 text-center', className)}>
      <Pop tone={tone} className={cn('absolute size-9', layout === 'row' ? 'top-3 right-3 hidden sm:block' : 'top-3 right-3')} />
      {bubble}
      <div className={cn('min-w-0', layout === 'stack' && 'mt-2')}>
        <p className="text-xs font-semibold text-foreground/80 sm:text-sm">{label}</p>
        <div className={cn('tabular leading-tight font-bold tracking-tight text-foreground md:text-4xl', layout === 'row' ? 'text-2xl sm:text-3xl' : 'text-3xl')}>{value}</div>
        {hint && <p className="mt-0.5 text-sm opacity-90">{hint}</p>}
      </div>
    </div>
  );
}
