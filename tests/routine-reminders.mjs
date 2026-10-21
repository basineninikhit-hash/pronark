import assert from 'node:assert/strict';
import { reminderContent, routineReminderDue, routineWindow } from '../supabase/functions/hnf-worker/routine-reminders.mjs';
// Eastern time, including daylight-saving changes.
assert.deepEqual(routineWindow(new Date('2026-07-01T10:15:00Z')), { date: '2026-07-01', slot: '06:15', weekday: 3 });
assert.deepEqual(routineWindow(new Date('2026-01-07T11:15:00Z')), { date: '2026-01-07', slot: '06:15', weekday: 3 });
assert.equal(routineWindow(new Date('2026-07-01T10:16:00Z')).slot, null);
assert.equal(routineWindow(new Date('2026-07-02T03:30:00Z')).date, '2026-07-01', 'late evening stays on the Eastern date');
const routine = { id: 'r1', reminder_enabled: true, archived_at: null, start_time: '06:15:00', active_days: [1, 2, 3, 4, 5] };
assert.equal(routineReminderDue({ routine, runs: [], date: '2026-07-01', weekday: 3 }), true);
assert.equal(routineReminderDue({ routine, runs: [], date: '2026-07-04', weekday: 6 }), false, 'inactive day');
assert.equal(routineReminderDue({ routine, runs: [{ start_date: '2026-07-01', state: 'finished' }], date: '2026-07-01', weekday: 3 }), false, 'already ran today');
assert.equal(routineReminderDue({ routine, runs: [{ start_date: '2026-06-30', state: 'active' }], date: '2026-07-01', weekday: 3 }), false, 'unfinished run still open');
assert.equal(routineReminderDue({ routine: { ...routine, reminder_enabled: false }, runs: [], date: '2026-07-01', weekday: 3 }), false, 'opted out');
assert.equal(routineReminderDue({ routine: { ...routine, archived_at: '2026-06-01' }, runs: [], date: '2026-07-01', weekday: 3 }), false, 'archived');
const content = reminderContent(routine, '2026-07-01');
assert.equal(content.body, 'Time for your routine');
assert.equal(content.title, 'Pronark', 'generic lock-screen copy with no routine or step names');
console.log('PASS routine reminders: Eastern quarter-hour windows, active days, one-run suppression, opt-out, generic copy');
