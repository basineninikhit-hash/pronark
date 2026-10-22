import { useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import './welcome.css';
import { AnimatedNumber, ErrorText, Logo } from '@/components/pronark';
import { cn } from '@/lib/utils';
import { Burst, ClipboardDoodle, CoinsDoodle, CoinsIcon, CurlyArrow, GiftDoodle, LoopArrow, Sparkle, SproutDoodle } from '@/components/doodles';

const sources = {
  spending: 'https://institute.bankofamerica.com/economic-insights/generational-spending-update.html',
  wellness: 'https://www.mckinsey.com/industries/consumer-packaged-goods/our-insights/future-of-wellness-trends',
  learning: 'https://www.deloitte.com/us/en/insights/topics/talent/2025-gen-z-millennial-survey.html',
};
// Example habits for the interactive hero card (sample data; nothing is saved).
const demoHabits = [
  { title: 'Morning workout', cents: 50 },
  { title: 'Read 20 minutes', cents: 25 },
  { title: 'Drink 8 glasses of water', cents: 25 },
  { title: 'Plan my day', cents: 25 },
];
const SAMPLE_WALLET = 1165;

/* ---------- interactive "Today's habits" card ---------- */
function HabitsCard() {
  const [checked, setChecked] = useState<number[]>([0, 2]);
  const [offset, setOffset] = useState(0);
  const day = new Date(); day.setDate(day.getDate() + offset);
  const earned = demoHabits.reduce((n, h, i) => n + (checked.includes(i) ? h.cents : 0), 0);
  const money = (n: number) => '$' + (n / 100).toFixed(2);
  return (
    <div className="relative">
      <Burst className="absolute -top-6 -right-5 size-9 rotate-12 text-[var(--ink)]" />
      <LoopArrow className="absolute -right-12 bottom-20 hidden h-16 w-11 text-[var(--ink)] lg:block" />
      <div className="landing-card relative rounded-3xl p-5" aria-label="Example of Pronark’s daily habits, sample data">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-headline">Today’s habits</h2>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <button type="button" aria-label="Previous day" onClick={() => setOffset(offset - 1)} className="grid size-7 place-items-center rounded-full ring-1 ring-foreground/10 transition-[scale] duration-100 active:scale-90"><ChevronLeft className="size-3.5" /></button>
            <span className="tabular min-w-[5.5rem] text-center">{new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(day)}</span>
            <button type="button" aria-label="Next day" onClick={() => setOffset(offset + 1)} className="grid size-7 place-items-center rounded-full ring-1 ring-foreground/10 transition-[scale] duration-100 active:scale-90"><ChevronRight className="size-3.5" /></button>
          </div>
        </div>
        <ul className="mt-3 flex flex-col divide-y divide-foreground/5">
          {demoHabits.map((h, i) => {
            const on = checked.includes(i);
            return (
              <li key={h.title}>
                <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
                  <input type="checkbox" className="peer sr-only" checked={on} onChange={() => setChecked((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]))} />
                  <span aria-hidden="true" className={cn('grid size-5 place-items-center rounded-md border-2 transition-[background-color,border-color,scale] duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50 active:scale-90',
                    on ? 'border-[var(--mint-strong)] bg-[var(--mint-strong)] text-white' : 'border-foreground/20')}>{on && <Check className="size-3.5" strokeWidth={3.5} />}</span>
                  <span className="flex-1">{h.title}</span>
                  <b className="tabular text-sm font-semibold text-[var(--mint-ink)]">+ {money(h.cents)}</b>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-center gap-4 rounded-2xl bg-[var(--mint)] p-4 text-[var(--mint-ink)]">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/60 dark:bg-black/20"><CoinsIcon /></span>
          <div className="flex-1" role="status" aria-live="polite"><small className="block text-xs opacity-80">Today’s earned</small><AnimatedNumber value={earned} format={money} className="text-xl font-semibold tracking-tight" /></div>
          <div className="h-10 w-px bg-current opacity-15" />
          <div className="flex-1"><small className="block text-xs opacity-80">Available in wallet</small><AnimatedNumber value={SAMPLE_WALLET + earned} format={money} className="text-xl font-semibold tracking-tight" /></div>
        </div>
      </div>
      <p className="mt-2 text-center text-[0.6875rem] text-muted-foreground">Try it · example data, nothing is saved</p>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <article className="landing-card flex items-center gap-4 rounded-2xl p-5">
      <span className="text-[var(--ink)]">{icon}</span>
      <div><h3 className="text-headline">{title}</h3><p className="mt-0.5 text-sm text-muted-foreground">{children}</p></div>
    </article>
  );
}

export function WelcomePage({ onSignIn, error, signedIn = false }: { onSignIn: () => void; error: string; signedIn?: boolean }) {
  // Someone opened a group invite link; it is redeemed right after sign-in.
  const invited = (() => { try { return !!localStorage.getItem('pronark-join') || new URLSearchParams(location.search).has('join'); } catch { return false; } })();
  const cta = 'landing-cta inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-[scale,background-color] duration-100 active:scale-[0.97]';
  const em = 'not-italic text-[var(--mint-ink)]';
  const kicker = 'text-eyebrow text-[var(--mint-ink)]';
  const heading = 'text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-bold tracking-[-0.03em]';
  return (
    <div id="top" className="landing relative min-h-dvh overflow-x-clip">
      <div aria-hidden="true" className="landing-blobs" />
      <a href="#welcome-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring">Skip to content</a>

      <header className="glass sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 md:px-8">
          <a href="#top" aria-label="Pronark home" className="flex items-center gap-2"><Logo variant="mark" className="h-9" /><span className="text-lg font-bold tracking-tight">Pronark</span></a>
          <nav aria-label="Welcome navigation" className="hidden gap-6 text-sm sm:flex">
            <a className="hover:text-[var(--mint-ink)]" href="#how-it-works">How it works</a>
            <a className="hover:text-[var(--mint-ink)]" href="#why-pronark">Why Pronark</a>
          </nav>
          <button type="button" onClick={onSignIn} className={cn(cta, 'ml-auto h-9 px-4')}>{signedIn ? 'Open app' : 'Get started'}<ArrowRight className="size-4" aria-hidden="true" /></button>
        </div>
      </header>

      <main id="welcome-main" className="relative">
        <section aria-labelledby="welcome-title" className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-12 md:grid-cols-[1.2fr_1fr] md:px-8 md:pt-20">
          <div className="flex flex-col gap-6">
            {invited && <p role="status" className="self-start rounded-2xl bg-[var(--mint)] px-4 py-3 text-sm font-medium text-[var(--mint-ink)] ring-1 ring-inset ring-[color-mix(in_oklch,var(--primary),transparent_55%)]">You’ve been invited to a group! Sign in and you’ll join it right away.</p>}
            <h1 id="welcome-title" className="relative text-[clamp(2.5rem,6.4vw,4.1rem)] leading-[1.03] font-bold tracking-[-0.04em]">
              Your goals.<br />Your wishlist.<br />On the same team.
              <Sparkle className="absolute -top-3 left-[min(68%,21rem)] size-10 text-[var(--ink)]" />
            </h1>
            <p className="max-w-md text-lg text-muted-foreground">Build better habits, earn from your progress, and fund the things you want, one step at a time.</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <button type="button" onClick={onSignIn} className={cta}>{signedIn ? 'Go to your daily wins' : 'Get started'}<ArrowRight className="size-4" aria-hidden="true" /></button>
              <span className="flex items-center gap-1 text-[var(--ink)]">
                <CurlyArrow className="h-8 w-14 -scale-x-100" />
                <span className="font-hand -rotate-6 text-xl leading-5">Small steps<br />towards big things.</span>
              </span>
            </div>
            {error && <ErrorText>{error}</ErrorText>}
          </div>
          <HabitsCard />
        </section>

        <section id="how-it-works" aria-label="How Pronark works" className="mx-auto grid max-w-6xl scroll-mt-20 gap-4 px-4 pb-20 md:grid-cols-3 md:px-8">
          <Feature icon={<ClipboardDoodle />} title="Track habits">Turn your goals into daily actions.</Feature>
          <Feature icon={<CoinsDoodle />} title="Earn progress">See your effort add up over time.</Feature>
          <Feature icon={<GiftDoodle />} title="Fund your goals">Assign your earnings to the things you want.</Feature>
        </section>

        <section id="why-pronark" className="mx-auto grid max-w-6xl scroll-mt-20 gap-8 px-4 py-16 md:grid-cols-2 md:px-8">
          <div><p className={kicker}>The everyday tension</p><h2 className={cn('mt-3', heading)}>A full wishlist.<br />An even fuller <em className={em}>list of goals.</em></h2></div>
          <div className="flex flex-col gap-4 text-muted-foreground md:pt-8"><p>Get stronger. Learn something new. Take care of yourself. Save for that trip. Life in your twenties, thirties, and beyond can feel like a hundred open tabs.</p><p>Enjoying nice things and building a life you feel good about can go together. Pronark connects the routines that matter to you with a spending reward you choose.</p></div>
        </section>

        <section aria-label="Research on younger adults" className="mx-auto grid max-w-6xl gap-4 px-4 md:grid-cols-3 md:px-8">
          {([['The spending side', 'On the rise', 'Gen Z and millennials’ spending growth outpaced older generations in February 2026 in Bank of America’s card data.', sources.spending, 'Bank of America Institute · 2026'], ['The wellness side', 'Nearly 30%', 'of US Gen Z and millennials surveyed said they prioritized wellness much more than a year earlier.', sources.wellness, 'McKinsey · 2025 survey'], ['The ambition side', '70%', 'of Gen Z respondents develop career skills at least weekly. There’s real drive behind the desire to grow.', sources.learning, 'Deloitte · 2025 global survey']] as const).map(([label, stat, body, href, source]) => (
            <article key={label} className="landing-card flex flex-col gap-2 rounded-2xl p-5"><span className="text-eyebrow text-muted-foreground">{label}</span><strong className="text-3xl font-bold tracking-tight">{stat}</strong><p className="text-sm text-muted-foreground">{body}</p><a href={href} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--mint-ink)] hover:underline">{source}<ArrowUpRight className="size-3" aria-hidden="true" /></a></article>
          ))}
        </section>
        <p className="mx-auto max-w-6xl px-4 pt-3 text-xs text-muted-foreground md:px-8">Different studies, different populations, not a claim about everyone. These findings inform the idea behind Pronark; they do not measure its effectiveness.</p>

        <section className="mx-auto max-w-6xl px-4 py-20 md:px-8">
          <p className={kicker}>Your own everyday system</p>
          <h2 className={cn('mt-3', heading)}>Make showing up <em className={em}>feel good.</em></h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {([['1', 'Build a routine that fits.', 'Choose your habits, schedule your days, and save the little details that make your routine yours.'], ['2', 'Give consistency a reward.', 'Set dollar values within your budget. Check off your tasks and see your earnings, streaks, and weekly progress.'], ['3', 'Look forward to something.', 'Organize your wishlist, put rewards toward your savings goals, and record purchases when you choose to spend.']] as const).map(([n, title, body]) => (
              <article key={n} className="landing-card flex flex-col gap-2 rounded-2xl p-5"><span className="grid size-8 place-items-center rounded-full bg-[var(--mint)] text-sm font-bold text-[var(--mint-ink)]">{n}</span><h3 className="text-headline mt-1">{title}</h3><p className="text-sm text-muted-foreground">{body}</p></article>
            ))}
          </div>
          <div className="mt-8 flex items-center justify-center gap-3 text-[var(--ink)]"><SproutDoodle className="h-14 w-11" /><span className="font-hand -rotate-3 text-2xl">Start small. Make it yours.</span></div>
        </section>

        <section className="px-4 pb-16 md:px-8">
          <div className="landing-final mx-auto flex max-w-6xl flex-col items-center gap-5 rounded-[2rem] px-6 py-14 text-center">
            <Sparkle className="size-9 text-[var(--ink)]" />
            <p className="text-eyebrow text-[var(--mint-ink)]">There’s room for all of you</p>
            <h2 className={heading}>One habit today.<br />More to look forward to.</h2>
            <button type="button" onClick={onSignIn} className={cta}>{signedIn ? 'Go to your daily wins' : 'Continue with Google'}<ArrowRight className="size-4" aria-hidden="true" /></button>
            <p className="text-sm text-muted-foreground">Pronark tracks rewards from money you set aside.<br />It doesn’t pay cash or move money for you.</p>
          </div>
        </section>
      </main>

      <footer className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-foreground/10 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-sm text-muted-foreground md:px-8">
        <a href="#top" aria-label="Pronark home"><Logo className="h-16" /></a>
        <p>Small habits. A life that feels like you.</p>
        <a href="#top" className="inline-flex items-center gap-1 hover:text-foreground">Back to top<ArrowUp className="size-3.5" aria-hidden="true" /></a>
      </footer>
    </div>
  );
}
