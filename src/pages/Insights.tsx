import type { ReactNode } from 'react';
import { CalendarCheck, TrendingUp } from 'lucide-react';
import { Segmented } from '@/components/segmented';

const descriptions = {
  consistency: 'See how often you followed your scheduled routines, including completed and missed days.',
  progress: 'Explore numbers like steps, miles, water and private measurements, separate from checkoffs.',
};

export function InsightsPage({ view, onView, children }: { view: 'consistency' | 'progress'; onView: (view: 'consistency' | 'progress') => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Explore your insights" className="flex flex-col gap-2">
        <Segmented role="tablist" label="Insights sections" controls="insights-panel" value={view} onChange={onView} className="w-full sm:w-auto sm:self-start"
          options={[
            { value: 'consistency', label: 'Your consistency', icon: <CalendarCheck className="size-3.5" aria-hidden="true" /> },
            { value: 'progress', label: 'Your progress', icon: <TrendingUp className="size-3.5" aria-hidden="true" /> },
          ]} />
        <p className="text-xs text-muted-foreground">{descriptions[view]}</p>
      </section>
      <div id="insights-panel" role="tabpanel">{children}</div>
    </div>
  );
}
