import assert from 'node:assert/strict';
import { coachTip, daysLeftLabel, inviteToken, laneProgress, leaders, podium } from '../src/lib/group-game.ts';

const look = { color: 'mint', hat: 'none', outfit: 'none' };
const m = (user_id, name, points, extra = {}) => ({ user_id, name, visible: true, character: look, points, checkoffs: points, out_on: null, alive: true, due_today: 4, done_today: 1, cheered_today: false, ...extra });
const game = { kind: 'race', starts_on: '2026-10-19', ends_on: '2026-10-25', team_target: null, team_total: 0, chosen: false };
const state = (members, g = {}) => ({ group: { id: 'g', name: 'Fam', owner_id: 'me' }, today: '2026-10-21', game: { ...game, ...g }, next: null, members, last: null });

// Race tips: catchable gap, tie, lead, fresh week, and nobody else yet.
assert.equal(coachTip(state([m('me', 'Nick', 18), m('sam', 'Sam Lee', 21)]), 'me'), '3 points behind Sam. Finish today and you take first!');
assert.equal(coachTip(state([m('me', 'Nick', 10, { done_today: 4 }), m('sam', 'Sam', 21)]), 'me'), '11 points behind Sam. Every check-off counts!');
assert.equal(coachTip(state([m('me', 'Nick', 21), m('sam', 'Sam', 21)]), 'me'), 'Tied with Sam. One more check-off breaks the tie!');
assert.match(coachTip(state([m('me', 'Nick', 25), m('sam', 'Sam', 21)]), 'me'), /^You’re in the lead!/);
assert.equal(coachTip(state([m('me', 'Nick', 0), m('sam', 'Sam', 0)]), 'me'), 'First check-off of the week takes the lead!');
assert.equal(coachTip(state([m('me', 'Nick', 5)]), 'me'), 'Invite a friend so you have someone to play with!');
assert.equal(coachTip(state([m('me', 'Nick', 5), m('sam', 'Sam', 30, { visible: false, points: 0 })]), 'me'), 'Your friends keep their scores private. Every check-off still counts!', 'hidden scores are never compared');
// Team and streak tips.
assert.equal(coachTip(state([m('me', 'Nick', 5), m('sam', 'Sam', 5)], { kind: 'team', team_target: 60, team_total: 49 }), 'me'), '11 check-offs to go. Your 3 left today would help a lot!');
assert.equal(coachTip(state([m('me', 'Nick', 5), m('sam', 'Sam', 5)], { kind: 'team', team_target: 40, team_total: 41 }), 'me'), 'Goal reached! The team plant is in full bloom.');
assert.equal(coachTip(state([m('me', 'Nick', 5, { alive: false, out_on: '2026-10-20' }), m('sam', 'Sam', 5)], { kind: 'streak' }), 'me'), 'You’re out this round. Cheer on whoever’s still going!');
assert.equal(coachTip(state([m('me', 'Nick', 5, { done_today: 3 }), m('sam', 'Sam', 5)], { kind: 'streak' }), 'me'), 'Still standing! Finish your 1 habit today to stay in.');

// Crown: ties share it; nobody leads at zero; hidden members never lead.
assert.deepEqual(leaders([m('a', 'A', 9), m('b', 'B', 9), m('c', 'C', 3)]), ['a', 'b']);
assert.deepEqual(leaders([m('a', 'A', 0), m('b', 'B', 0)]), []);
assert.deepEqual(leaders([m('a', 'A', 4), m('b', 'B', 9, { visible: false })]), ['a']);

// Lanes: leader near (not on) the flag; streak outs stop where they fell; hidden stay at the start.
const all = [m('a', 'A', 20), m('b', 'B', 10)];
assert.equal(laneProgress('race', all[0], all, game, '2026-10-21'), 0.92);
assert.equal(laneProgress('race', all[1], all, game, '2026-10-21'), 0.46);
assert.equal(laneProgress('race', m('h', 'H', 9, { visible: false }), all, game, '2026-10-21'), 0);
assert.equal(laneProgress('streak', m('o', 'O', 0, { alive: false, out_on: '2026-10-20' }), all, game, '2026-10-21'), 1 / 7);
assert.equal(laneProgress('streak', m('s', 'S', 0), all, game, '2026-10-21'), 2 / 7);

// Podium order per game type.
const last = (kind, standings) => ({ kind, starts_on: '2026-10-12', ends_on: '2026-10-18', team_target: null, team_total: 0, standings, badges: [] });
assert.deepEqual(podium(last('race', [m('a', 'A', 5), m('b', 'B', 9), m('c', 'C', 7), m('d', 'D', 1)])).map((x) => x.user_id), ['b', 'c', 'a']);
assert.deepEqual(podium(last('streak', [m('a', 'A', 5, { alive: false, out_on: '2026-10-14' }), m('b', 'B', 1), m('c', 'C', 9, { alive: false, out_on: '2026-10-16' })])).map((x) => x.user_id), ['b', 'c', 'a'], 'survivors first, then whoever lasted longest');
assert.ok(!podium(last('race', [m('a', 'A', 5), m('h', 'H', 50, { visible: false })])).some((x) => x.user_id === 'h'), 'private scores stay off the podium');

assert.equal(daysLeftLabel('2026-10-25', '2026-10-21'), '5 days left');
assert.equal(daysLeftLabel('2026-10-21', '2026-10-21'), 'Last day');
const code = 'ab'.repeat(24);
assert.equal(inviteToken(`https://x.github.io/pronark/?join=${code}`), code);
assert.equal(inviteToken(`  ${code.toUpperCase()} `), code);
assert.equal(inviteToken('hello'), null);
console.log('PASS group game logic: coach tips, crowns, lanes, podium order, invite links');
