import assert from 'node:assert/strict';
import { categorySummary, checkAmount, moveCategory, orderedCategories, walletBreakdown } from '../src/lib/wishlist.ts';

const me = 'me';
const cat = (id, key, priority, goal = 0) => ({ id, owner_id: me, category_key: key, priority_order: priority, general_target_cents: goal, revision: 1 });
const cats = [cat('t', 'Tech', null), cat('c', 'Clothes', 2), cat('x', 'Travel', 1), { ...cat('o', 'Jewelry', 3), owner_id: 'someone' }];

// Order: the user's ranking first, then the default order; other people's categories never show.
assert.deepEqual(orderedCategories(cats, me).map((c) => c.id), ['x', 'c', 't']);

// Wallet: assigned and available are parts of the total; available never shows below zero.
const allocations = [{ id: '1', owner_id: me, category_id: 'c', cents: 1100 }, { id: '2', owner_id: me, category_id: 'c', cents: -100 }, { id: '3', owner_id: 'someone', category_id: 'o', cents: 999 }];
assert.deepEqual(walletBreakdown(2100, allocations, me), { total: 2100, assigned: 1000, available: 1100 });
assert.deepEqual(walletBreakdown(500, allocations, me), { total: 500, assigned: 1000, available: 0 });

// Category: target = goal + active items; item savings are part of what's assigned.
const wishes = [
  { id: 'w1', category_id: 'c', owner_id: me, title: 'Watch', estimated_cents: 500000, status: 'active' },
  { id: 'w2', category_id: 'c', owner_id: me, title: 'Old', estimated_cents: 9000, status: 'purchased' },
];
const s = categorySummary(cat('c', 'Clothes', 1, 10000), wishes, allocations, [{ item_id: 'w1', owner_id: me, cents: 400, revision: 1 }]);
assert.deepEqual({ assigned: s.assigned, itemTotal: s.itemTotal, goal: s.goal, target: s.target, held: s.heldByItems, free: s.free, percent: s.percent, items: s.items.length },
  { assigned: 1000, itemTotal: 500000, goal: 10000, target: 510000, held: 400, free: 600, percent: 0, items: 1 });

// Amount checks for the Assign / Unassign bubbles.
const over = 'over';
assert.deepEqual(checkAmount('10', 1000, over), { cents: 1000, error: null }, 'exactly the limit is fine');
assert.deepEqual(checkAmount('$2.50', 1000, over), { cents: 250, error: null });
assert.equal(checkAmount('10.01', 1000, over).error, over, 'never more than available or assigned');
assert.equal(checkAmount('0', 1000, over).error, 'Enter more than $0.');
assert.equal(checkAmount('-5', 1000, over).error, 'Use dollars and cents, like 12.50.');
assert.equal(checkAmount('1.234', 1000, over).error, 'Use dollars and cents, like 12.50.');
assert.equal(checkAmount('', 1000, over).error, 'Enter an amount.');
assert.equal(checkAmount('1', 0, over).error, over, 'nothing to give');

// Reordering.
assert.deepEqual(moveCategory(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
const same = ['a', 'b'];
assert.equal(moveCategory(same, 0, -1), same, 'out of range does nothing');
console.log('PASS wishlist math: order, wallet breakdown, category targets, assign/unassign limits, reordering');
