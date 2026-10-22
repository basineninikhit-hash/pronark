import assert from 'node:assert/strict';
import { cheerContent, cheerPushDue, runCheerNotifications } from '../supabase/functions/hnf-worker/cheer-notifications.mjs';

const now = new Date('2026-07-31T16:00:00Z');
const cheer = { id: 'c1', group_id: 'g1', from_user: 'u1', to_user: 'u2', kind: 'nice_work', created_at: '2026-07-31T15:55:00Z', push_state: 'pending', push_attempts: 0, push_lease_until: null };
assert.equal(cheerPushDue(cheer, now), true);
assert.equal(cheerPushDue({ ...cheer, push_state: 'sent' }, now), false, 'pushed once');
assert.equal(cheerPushDue({ ...cheer, push_attempts: 3, push_state: 'failed' }, now), false, 'gives up after three tries');
assert.equal(cheerPushDue({ ...cheer, created_at: '2026-07-30T15:00:00Z' }, now), false, 'stale after a day');
assert.equal(cheerPushDue({ ...cheer, push_state: 'leased', push_lease_until: '2026-07-31T16:01:00Z' }, now), false, 'another run holds it');
const content = cheerContent(cheer, 'Sam Rivera');
assert.equal(content.body, 'Sam cheered you on: Nice work!');
assert.equal(content.url, '/?view=Groups&group=g1');
assert.equal(cheerContent({ ...cheer, kind: 'you_got_this' }, '').body, 'A friend cheered you on: You got this!');

// A tiny fake of the query builder: records updates and answers selects from fixtures.
function fakeDb({ enabled = true, subs = [{ id: 's1', endpoint: 'e', keys_json: {} }] } = {}) {
  const updates = [];
  const rows = { garden_cheers: [cheer], notification_preferences: [{ enabled }], push_subscriptions: subs, profiles: [{ display_name: 'Sam' }] };
  const builder = (table) => {
    let update = null;
    const q = {
      select: () => q, in: () => q, gte: () => q, order: () => q, limit: () => q, eq: () => q,
      update: (values) => { update = values; updates.push({ table, values }); return q; },
      maybeSingle: () => q.then((r) => r),
      then: (resolve) => resolve(update ? { data: { id: 'c1' }, error: null } : { data: table === 'notification_preferences' || table === 'profiles' ? rows[table][0] : rows[table], error: null }),
    };
    q.maybeSingle = () => ({ then: (resolve) => resolve(update ? { data: { id: 'c1' }, error: null } : { data: rows[table][0] ?? null, error: null }) });
    return q;
  };
  return { db: { from: builder }, updates };
}
{
  const sent = [];
  const { db, updates } = fakeDb();
  assert.deepEqual(await runCheerNotifications({ db, send: async (sub, c) => sent.push(c), now }), { sent: 1, skipped: 0, failed: 0 });
  assert.equal(sent[0].body, 'Sam cheered you on: Nice work!');
  assert.equal(updates.at(-1).values.push_state, 'sent');
}
{
  const { db, updates } = fakeDb({ enabled: false });
  assert.deepEqual(await runCheerNotifications({ db, send: async () => { throw new Error('should not send'); }, now }), { sent: 0, skipped: 1, failed: 0 });
  assert.equal(updates.at(-1).values.push_state, 'skipped', 'notifications off');
}
console.log('PASS cheer notifications: once per cheer, one-day window, retries, opt-out, friendly copy');
