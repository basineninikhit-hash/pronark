import assert from 'node:assert/strict';
import { pushWindow, buildPushContent } from '../supabase/functions/hnf-worker/push-automation.mjs';

assert.deepEqual(pushWindow(new Date('2026-07-01T10:05:00Z')), { date: '2026-07-01', kind: 'morning' });
assert.deepEqual(pushWindow(new Date('2026-01-01T11:05:00Z')), { date: '2026-01-01', kind: 'morning' });
assert.equal(pushWindow(new Date('2026-07-01T22:05:00Z')).kind, 'evening');
assert.equal(pushWindow(new Date('2026-07-01T15:05:00Z')).kind, null);

const tasks = [{ id: 'one', start_date: '2026-06-01', archive_date: null }];
const settings = [{ task_id: 'one', month: '2026-07-01', weekdays: [1, 2, 3, 4, 5] }];
const complete = [{ task_id: 'one', local_date: '2026-07-01', completed: true }];
assert.equal(buildPushContent({ kind: 'evening', date: '2026-07-01', tasks, settings, completions: complete }), null);
assert.match(buildPushContent({ kind: 'evening', date: '2026-07-01', tasks, settings, completions: [] }).body, /1 scheduled activity left/);
assert.match(buildPushContent({ kind: 'morning', date: '2026-07-02', tasks, settings, completions: complete, quote: 'Keep going.' }).body, /Yesterday: 1\/1/);
console.log('PASS Eastern push windows, rest-day/complete suppression, and morning summary');
