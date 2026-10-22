import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Month slider: ‹ October 2026 ›. Used on Calendar and Insights. */
export function MonthSwitcher({ label, hint, onPrev, onNext, prevDisabled, nextDisabled, className }: {
  label: string; hint?: ReactNode; onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean; className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1 rounded-2xl bg-card p-1 ring-1 ring-foreground/10', className)}>
      <Button variant="ghost" size="icon" className="rounded-xl" onClick={onPrev} disabled={prevDisabled} aria-label="Previous month"><ChevronLeft /></Button>
      <h2 className="tabular min-w-40 flex-1 text-center text-sm font-semibold" aria-live="polite">
        {label}{hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
      </h2>
      <Button variant="ghost" size="icon" className="rounded-xl" onClick={onNext} disabled={nextDisabled} aria-label="Next month"><ChevronRight /></Button>
    </div>
  );
}
