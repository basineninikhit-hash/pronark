import type React from 'react';

/* Hand-drawn doodles shared by the landing page and the app. Strokes follow the text color
   (use text-ink); fills use the gold and mint doodle accents. */
const ink = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const filled = (color: string) => ({ ...ink, fill: color });
export function Sparkle({ className }: { className?: string }) {
  return <svg viewBox="0 0 48 48" className={className} aria-hidden="true"><path d="M20 6c2 10 5 13 15 15-10 2-13 5-15 15-2-10-5-13-15-15 10-2 13-5 15-15z" {...filled('var(--doodle-gold)')} /><path d="M38 6l1 4M44 14l-4 1M41 38c1 3 2 4 5 5-3 1-4 2-5 5-1-3-2-4-5-5 3-1 4-2 5-5z" {...ink} /></svg>;
}
export function Burst({ className }: { className?: string }) {
  return <svg viewBox="0 0 40 40" className={className} aria-hidden="true"><path d="M8 10l7 6M6 22h9M10 33l6-5" {...ink} /></svg>;
}
export function CurlyArrow({ className }: { className?: string }) {
  return <svg viewBox="0 0 80 50" className={className} aria-hidden="true"><path d="M76 34C60 40 40 38 30 26 24 18 26 9 33 8c8-1 8 12-2 15-9 3-21-1-27-9" {...ink} /><path d="M3 4l1 11 10-3" {...ink} /></svg>;
}
export function LoopArrow({ className }: { className?: string }) {
  return <svg viewBox="0 0 50 70" className={className} aria-hidden="true"><path d="M8 6c26 4 38 22 30 42-3 8-10 14-18 16" {...ink} /><path d="M24 56l-6 8 9 3" {...ink} /></svg>;
}
export function ClipboardDoodle() {
  return <svg viewBox="0 0 64 64" className="size-14 shrink-0" aria-hidden="true"><rect x="12" y="12" width="40" height="46" rx="6" {...ink} /><rect x="22" y="7" width="20" height="10" rx="3" {...filled('var(--doodle-mint)')} /><path d="M21 37l8 8 15-17" {...ink} strokeWidth={3} /><path d="M50 4l2 4M56 10l-4 1" {...ink} /></svg>;
}
export function CoinsDoodle() {
  return <svg viewBox="0 0 64 64" className="size-14 shrink-0" aria-hidden="true">{[44, 35, 26].map((y, i) => { const x = i === 1 ? 36 : 30; return <g key={y}><path d={`M${x - 17} ${y}v6c0 4 8 6.5 17 6.5s17-2.5 17-6.5v-6`} {...filled('var(--doodle-gold)')} /><ellipse cx={x} cy={y} rx="17" ry="6.5" {...filled('var(--doodle-gold)')} /></g>; })}<path d="M50 8l1 5M56 14l-4 1" {...ink} /></svg>;
}
export function GiftDoodle() {
  return <svg viewBox="0 0 64 64" className="size-14 shrink-0" aria-hidden="true"><rect x="12" y="28" width="40" height="28" rx="3" {...ink} /><rect x="9" y="20" width="46" height="10" rx="3" {...filled('var(--doodle-mint)')} /><path d="M32 20v36M32 20c-6-9-16-9-14-2 1 4 9 3 14 2zm0 0c6-9 16-9 14-2-1 4-9 3-14 2z" {...ink} /><path d="M50 6l1 5M56 12l-4 1" {...ink} /></svg>;
}
export function SproutDoodle({ className }: { className?: string }) {
  return <svg viewBox="0 0 64 80" className={className} aria-hidden="true"><path d="M32 74V38" {...ink} /><path d="M32 46c-14 0-20-10-20-20 12 0 20 8 20 20zM32 40c0-14 8-24 22-24 0 14-8 24-22 24z" {...filled('var(--doodle-mint)')} /><path d="M18 74h28" {...ink} /></svg>;
}
export const CoinsIcon = () => <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><ellipse cx="9" cy="7" rx="6" ry="2.5" /><path d="M3 7v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V7" /><path d="M9 13.5v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4c0-1.4-2.7-2.5-6-2.5" /></svg>;

export function SunDoodle({ className }: { className?: string }) {
  return <svg viewBox="0 0 48 48" className={className} aria-hidden="true"><circle cx="24" cy="24" r="8" {...filled('var(--doodle-gold)')} /><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M38 10l-4 4M14 34l-4 4" {...ink} /></svg>;
}
export function BulbDoodle({ className }: { className?: string }) {
  return <svg viewBox="0 0 48 48" className={className} aria-hidden="true"><path d="M24 8c-7 0-12 5-12 11 0 5 3 7 5 10 1 2 1 4 1 5h12c0-1 0-3 1-5 2-3 5-5 5-10 0-6-5-11-12-11z" {...filled('var(--doodle-gold)')} /><path d="M19 39h10M20 43h8M6 10l3 2M42 10l-3 2M24 1v3" {...ink} /></svg>;
}
export function PlantPotDoodle({ className }: { className?: string }) {
  return <svg viewBox="0 0 64 72" className={className} aria-hidden="true"><path d="M32 44V22" {...ink} /><path d="M32 30c-12 0-17-8-17-17 10 0 17 7 17 17zM32 26c0-12 7-20 19-20 0 12-7 20-19 20z" {...filled('var(--doodle-mint)')} /><path d="M14 44h36l-5 24H19z" {...ink} /><path d="M54 8l3-3M58 16l4-1" {...ink} /></svg>;
}
export function SignpostDoodle({ className }: { className?: string }) {
  return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><path d="M28 6v54M20 60h16" {...ink} /><path d="M10 12h34l8 7-8 7H10z" {...filled('var(--card)')} /><path d="M50 30H18l-6 6 6 6h32z" {...filled('var(--card)')} /><path d="M20 19h16M24 36h18" {...ink} strokeWidth={1.6} /></svg>;
}
export function GiftBoxDoodle({ className }: { className?: string }) {
  return <svg viewBox="0 0 64 64" className={className} aria-hidden="true"><rect x="10" y="26" width="44" height="32" rx="3" {...ink} /><rect x="6" y="16" width="52" height="11" rx="3" {...filled('var(--card)')} /><path d="M32 16v42M32 16c-6-10-17-10-15-2 1 4 10 3 15 2zm0 0c6-10 17-10 15-2-1 4-10 3-15 2z" {...ink} /></svg>;
}
/** A handwritten aside, slightly tilted, like the notes in the mockups. */
export function HandNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={'font-hand inline-block -rotate-3 text-xl leading-6 text-ink ' + (className ?? '')}>{children}</span>;
}
export function MagnifierDoodle({ className }: { className?: string }) {
  return <svg viewBox="0 0 56 56" className={className} aria-hidden="true"><circle cx="24" cy="26" r="13" {...filled('var(--card)')} /><path d="M18 22c1-3 4-5 7-5" {...ink} strokeWidth={1.6} /><path d="M33 35l13 13" {...ink} strokeWidth={4} /><path d="M44 6c1 4 2 5 6 6-4 1-5 2-6 6-1-4-2-5-6-6 4-1 5-2 6-6z" {...filled('var(--doodle-gold)')} /><path d="M52 22l1 3" {...ink} /></svg>;
}
export function BarsDoodle({ className }: { className?: string }) {
  return <svg viewBox="0 0 48 48" className={className} aria-hidden="true"><rect x="8" y="26" width="8" height="14" rx="2" {...filled('var(--mint-pop)')} /><rect x="20" y="18" width="8" height="22" rx="2" {...filled('var(--mint-pop)')} /><rect x="32" y="9" width="8" height="31" rx="2" {...filled('var(--mint-pop)')} /><path d="M40 4l2-3M45 9l3-1" {...ink} /></svg>;
}
export function CalendarCheckDoodle({ className }: { className?: string }) {
  return <svg viewBox="0 0 48 48" className={className} aria-hidden="true"><rect x="7" y="10" width="34" height="31" rx="5" {...ink} /><path d="M7 19h34" {...ink} /><path d="M15 6v8M33 6v8" {...ink} /><path d="M13 30l3 3 5-6M27 30l3 3 5-6" {...ink} stroke="var(--mint-pop)" strokeWidth={2.6} /><path d="M42 4l2-3M46 9l2-1" {...ink} /></svg>;
}
export function StarDoodle({ className }: { className?: string }) {
  return <svg viewBox="0 0 48 48" className={className} aria-hidden="true"><path d="M24 7l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" {...filled('var(--card)')} /><path d="M40 6l2-3M45 11l2-1" {...ink} /></svg>;
}
export function TrophyDoodle({ className }: { className?: string }) {
  return <svg viewBox="0 0 48 48" className={className} aria-hidden="true"><path d="M15 8h18v8a9 9 0 0 1-18 0z" {...filled('var(--butter-pop)')} /><path d="M15 11H9c0 6 3 9 7 9M33 11h6c0 6-3 9-7 9M24 25v8M17 40h14l-2-7H19z" {...ink} /><path d="M38 3l1 3M43 7l3-1" {...ink} /></svg>;
}
