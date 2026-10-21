import type { View } from '@/lib/domain';
import { cents } from '@/lib/domain';

/*
 * What the floating companion says. Ambient lines depend on the screen and the day;
 * event lines (first checkoff, reading, movement, all done) are said once when they happen.
 * Picks are stable for a given moment so the bubble doesn't change on every render.
 */

const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const count = (n: number) => words[n] ?? String(n);
const pick = (options: string[], seed: string) => options[[...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % options.length];

export type CompanionContext = {
  page: View; today: string; first: string;
  due: number; done: number; restDay: boolean; missedYesterday: boolean;
  balance: number; insight?: string;
};

export function ambientLine(c: CompanionContext): string {
  const seed = `${c.page}:${c.today}:${c.done}`;
  switch (c.page) {
    case 'Home':
      if (c.restDay) return 'Rest is on the schedule. Excellent planning.';
      if (c.due && c.done === c.due) return pick(['That’s the whole list. Please accept this very official smile.', 'You showed up for every one today.'], seed);
      if (c.done === 0 && c.missedYesterday) return pick(['Welcome back. Today starts at zero, just like it should.', 'Yesterday happened. We’ve got today.'], seed);
      if (c.done === 0) return pick([`${count(c.due)} chance${c.due === 1 ? '' : 's'} to show up. Pick one.`, 'The first checkmark is always the dramatic one.', 'A small start still starts.'], seed);
      if (c.done * 2 >= c.due) return pick(['Look at that—you’ve already made a dent in today.', 'The list is looking less intimidating now.'], seed);
      return pick(['There it is. We’re underway.', 'One down. I knew you had an opening move.'], seed);
    case 'Insights':
      return c.insight ?? 'Check back after a few days of check-offs. I’ll spot the patterns.';
    case 'Wallet':
      return c.balance > 0 ? 'Your wallet is ready when you are.' : 'Every checkoff adds a little to your wallet.';
    case 'Goals':
      return c.balance > 0 ? `You’ve got ${cents(c.balance).replace('.00', '')} in your wallet. Want to assign some to a goal?` : 'Pick something worth saving for. I’ll cheer when it’s funded.';
    case 'Calendar':
      return c.done ? 'Every colored square is a day you showed up.' : 'Tap any day to see how it went.';
    case 'Routines':
      return pick(['One step at a time. I’ll keep count.', 'You don’t have to plan it. Just do the next step.'], seed);
    case 'Groups':
      return 'Cheering is better with company.';
    case 'Profile':
      return 'Looking good. Want to try a new hat?';
    case 'Settings':
      return 'I’ll stay quiet whenever you ask.';
  }
}

type Category = 'reading' | 'movement' | 'other';
export function categoryOf(title: string, reaction?: string): Category {
  if (reaction === 'reading' || /read|book|study|learn/i.test(title)) return 'reading';
  if (reaction === 'movement' || reaction === 'strength' || /gym|walk|run|step|workout|exercise|yoga|bike|swim|move/i.test(title)) return 'movement';
  return 'other';
}

/** Line for a checkoff that just landed (null = keep the ambient line). Milestones win over flavor. */
export function checkoffLine({ doneBefore, due, category, seed }: { doneBefore: number; due: number; category: Category; seed: string }): { text: string; milestone: boolean } | null {
  if (due && doneBefore + 1 >= due) return { text: pick(['That’s the whole list. Please accept this very official smile.', 'You showed up for every one today.'], seed), milestone: true };
  if (category === 'reading') return { text: pick(['Plot twist: you did the reading.', 'A few pages now count as a win later.'], seed), milestone: false };
  if (category === 'movement') return { text: 'You moved! My legs are mostly decorative, so I’m impressed.', milestone: false };
  if (doneBefore === 0) return { text: pick(['There it is. We’re underway.', 'One down. I knew you had an opening move.'], seed), milestone: true };
  return null;
}

export function companionSay(text: string) {
  window.dispatchEvent(new CustomEvent<string>('pronark-companion-say', { detail: text }));
}
