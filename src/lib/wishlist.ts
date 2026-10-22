import type { Allocation, Category, ItemAllocation, Wish } from '@/lib/domain';

/*
 * Wishlist math. The wallet balance is everything earned minus purchases. Assigning picks a
 * wish category for some of those dollars; unassigning makes them available again. Neither
 * changes the balance. Item savings are a part of their category's assigned dollars.
 */

export const defaultCategoryOrder = ['Clothes', 'Tech', 'Jewelry', 'Home items', 'Experiences', 'Travel', 'Other'];

/** The user's order (from "All wish categories"), then the default order for anything unset. */
export function orderedCategories(categories: Category[], owner: string) {
  return categories.filter((c) => c.owner_id === owner)
    .sort((a, b) => (a.priority_order ?? 1000) - (b.priority_order ?? 1000) || defaultCategoryOrder.indexOf(a.category_key) - defaultCategoryOrder.indexOf(b.category_key));
}

export function walletBreakdown(balance: number, allocations: Allocation[], owner: string) {
  const assigned = allocations.filter((a) => a.owner_id === owner).reduce((n, a) => n + a.cents, 0);
  return { total: balance, assigned, available: Math.max(0, balance - assigned) };
}

export type CategorySummary = { assigned: number; itemTotal: number; goal: number; target: number; heldByItems: number; free: number; percent: number; items: Wish[] };

export function categorySummary(c: Category, wishes: Wish[], allocations: Allocation[], itemAllocations: ItemAllocation[]): CategorySummary {
  const items = wishes.filter((w) => w.category_id === c.id && w.status === 'active');
  const assigned = allocations.filter((a) => a.category_id === c.id).reduce((n, a) => n + a.cents, 0);
  const itemTotal = items.reduce((n, w) => n + w.estimated_cents, 0);
  const heldByItems = items.reduce((n, w) => n + (itemAllocations.find((a) => a.item_id === w.id)?.cents ?? 0), 0);
  const goal = c.general_target_cents ?? 0, target = goal + itemTotal;
  return { assigned, itemTotal, goal, target, heldByItems, free: Math.max(0, assigned - heldByItems), percent: target > 0 ? Math.min(100, Math.round((assigned / target) * 100)) : 0, items };
}

/** Checks a typed dollar amount against a limit. Returns cents, or a friendly reason it can't be used. */
export function checkAmount(text: string, max: number, overLimit: string): { cents: number; error: null } | { cents: null; error: string } {
  const value = text.trim().replace(/^\$/, '');
  if (!value) return { cents: null, error: 'Enter an amount.' };
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return { cents: null, error: 'Use dollars and cents, like 12.50.' };
  const amount = Math.round(Number(value) * 100);
  if (amount <= 0) return { cents: null, error: 'Enter more than $0.' };
  if (amount > max) return { cents: null, error: overLimit };
  return { cents: amount, error: null };
}

/** Moves one entry and returns the new order (unchanged when the move is out of range). */
export function moveCategory(ids: string[], from: number, to: number) {
  if (to < 0 || to >= ids.length || from === to) return ids;
  const next = [...ids];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
