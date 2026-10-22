import type { CharacterStyle } from '@/components/companion-character';

/*
 * Group games, as read from `read_group_game`. Points come from check-offs the server already
 * has: +1 per habit, +2 for finishing a day, +1 on a day you cheer or get cheered.
 */

export type GameKind = 'race' | 'team' | 'streak';
export type GameMember = {
  user_id: string; name: string; visible: boolean; character: CharacterStyle;
  points: number; checkoffs: number; out_on: string | null; alive: boolean;
  due_today?: number | null; done_today?: number | null; cheered_today?: boolean;
};
export type Badge = { kind: 'never_missed' | 'comeback' | 'cheerleader'; user_id: string; name: string; detail?: number };
export type GameState = {
  group: { id: string; name: string; owner_id: string };
  today: string;
  game: { kind: GameKind; starts_on: string; ends_on: string; team_target: number | null; team_total: number; chosen: boolean };
  next: { kind: GameKind; starts_on: string; ends_on: string } | null;
  members: GameMember[];
  last: null | { kind: GameKind; starts_on: string; ends_on: string; team_target: number | null; team_total: number; standings: GameMember[]; badges: Badge[] };
};

export const gameNames: Record<GameKind, string> = { race: 'Friendly race', team: 'Team goal', streak: 'Streak duel' };
export const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] || 'Friend';
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5);
export const daysLeftLabel = (endsOn: string, today: string) => { const n = dayDiff(endsOn, today) + 1; return n <= 1 ? 'Last day' : `${n} days left`; };
export const finishedToday = (m: GameMember) => !!m.due_today && m.done_today === m.due_today;

/** Leaders by points (ties share the crown); nobody leads at zero. */
export function leaders(members: GameMember[]) {
  const top = Math.max(0, ...members.filter((m) => m.visible).map((m) => m.points));
  return top > 0 ? members.filter((m) => m.visible && m.points === top).map((m) => m.user_id) : [];
}

/** Where a companion stands on its lane, 0 (start) to 1 (flag). */
export function laneProgress(kind: GameKind, m: GameMember, all: GameMember[], game: GameState['game'], today: string) {
  if (!m.visible) return 0;
  if (kind === 'streak') {
    const length = dayDiff(game.ends_on, game.starts_on) + 1;
    const reached = m.out_on ? dayDiff(m.out_on, game.starts_on) : dayDiff(today, game.starts_on);
    return Math.max(0, Math.min(1, reached / length));
  }
  const top = Math.max(1, ...all.filter((x) => x.visible).map((x) => x.points));
  return Math.min(1, (m.points / top) * 0.92);
}

/** One friendly line from your companion: what to do next to move up. */
export function coachTip(state: GameState, me: string) {
  const { game, members } = state;
  const self = members.find((m) => m.user_id === me);
  const others = members.filter((m) => m.user_id !== me);
  if (!self) return 'Check off a habit to get on the board!';
  if (!others.length) return 'Invite a friend so you have someone to play with!';
  const left = Math.max(0, (self.due_today ?? 0) - (self.done_today ?? 0));
  if (game.kind === 'team') {
    const target = game.team_target ?? 0, togo = Math.max(0, target - game.team_total);
    if (!togo) return 'Goal reached! The team plant is in full bloom.';
    return left ? `${togo} check-offs to go. Your ${left} left today would help a lot!` : `${togo} check-offs to go. Cheer someone on to keep it moving!`;
  }
  if (game.kind === 'streak') {
    if (!self.alive) return 'You’re out this round. Cheer on whoever’s still going!';
    return left ? `Still standing! Finish your ${left} habit${left === 1 ? '' : 's'} today to stay in.` : 'Still standing, and today is done. Nice!';
  }
  const visible = others.filter((m) => m.visible);
  const best = visible.reduce<GameMember | null>((a, m) => (!a || m.points > a.points ? m : a), null);
  if (!best || (best.points === 0 && self.points === 0)) return 'First check-off of the week takes the lead!';
  if (self.points > best.points) return left ? `You’re in the lead! Your ${left} left today keeps you ahead.` : 'You’re in the lead! Nice work today.';
  const gap = best.points - self.points;
  const possible = left + (left > 0 ? 2 : 0);
  if (gap === 0) return `Tied with ${firstName(best.name)}. One more check-off breaks the tie!`;
  if (possible > gap) return `${gap} point${gap === 1 ? '' : 's'} behind ${firstName(best.name)}. Finish today and you take first!`;
  return `${gap} points behind ${firstName(best.name)}. Every check-off counts!`;
}

/** Last game's podium: top three who share their score, winner first. */
export function podium(last: NonNullable<GameState['last']>) {
  const shown = last.standings.filter((m) => m.visible);
  if (last.kind === 'streak') return [...shown].sort((a, b) => Number(b.alive) - Number(a.alive) || (b.out_on ?? '9999').localeCompare(a.out_on ?? '9999') || b.points - a.points).slice(0, 3);
  return [...shown].sort((a, b) => (last.kind === 'team' ? b.checkoffs - a.checkoffs : b.points - a.points)).slice(0, 3);
}

/** A pasted invite: the full link or just its 48-character code. */
export function inviteToken(text: string) {
  const match = text.trim().match(/[0-9a-f]{48}/i);
  return match ? match[0].toLowerCase() : null;
}
