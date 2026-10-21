// Guided routine reminders: at most one generic push per routine per active day, at the routine's
// preferred quarter-hour start time, and never once that day's run has started or finished.
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
const isoDays = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const checked = async (query) => { const { data, error } = await query; if (error) throw error; return data; };

/** Eastern date, quarter-hour slot (null between slots) and ISO weekday for `now`. */
export function routineWindow(now = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(now).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  const minute = Number(p.minute);
  return { date: `${p.year}-${p.month}-${p.day}`, slot: minute % 15 === 0 ? `${p.hour}:${p.minute}` : null, weekday: isoDays[p.weekday] };
}

/** Whether a routine should be reminded now. `runs` are this routine's runs (any state). */
export function routineReminderDue({ routine, runs, date, weekday }) {
  if (!routine.reminder_enabled || routine.archived_at || !routine.start_time) return false;
  if (!routine.active_days?.includes(weekday)) return false;
  if (runs.some((r) => r.start_date === date || r.state === 'active')) return false; // started, finished, or still in progress
  return true;
}

export const reminderContent = (routine, date) => ({ title: 'Pronark', body: 'Time for your routine', url: `/?view=Routines&routine=${routine.id}`, tag: `pronark-routine-${routine.id}-${date}` });

export async function runRoutineReminders({ db, send, now = new Date() }) {
  const { date, slot, weekday } = routineWindow(now);
  if (!slot) return { windowOpen: false, queued: 0, sent: 0, skipped: 0, failed: 0 };
  const routines = await checked(db.from('routines').select('id,owner_id,active_days,start_time,reminder_enabled,archived_at').eq('reminder_enabled', true).is('archived_at', null).eq('start_time', `${slot}:00`));
  let queued = 0, sent = 0, skipped = 0, failed = 0;
  for (const routine of routines ?? []) {
    try {
      const [runs, push, subs] = await Promise.all([
        checked(db.from('routine_runs').select('start_date,state').eq('routine_id', routine.id).or(`start_date.eq.${date},state.eq.active`)),
        checked(db.from('notification_preferences').select('enabled').eq('owner_id', routine.owner_id).maybeSingle()),
        checked(db.from('push_subscriptions').select('id,endpoint,keys_json').eq('owner_id', routine.owner_id).eq('active', true)),
      ]);
      if (!push?.enabled || !subs?.length || !routineReminderDue({ routine, runs: runs ?? [], date, weekday })) { skipped++; continue; }
      const created = await checked(db.from('routine_reminder_jobs').upsert({ owner_id: routine.owner_id, routine_id: routine.id, local_date: date }, { onConflict: 'routine_id,local_date', ignoreDuplicates: true }).select('*').maybeSingle());
      const job = created ?? await checked(db.from('routine_reminder_jobs').select('*').eq('routine_id', routine.id).eq('local_date', date).single());
      if (job.state === 'sent' || job.state === 'skipped' || job.attempts >= 5 || (job.state === 'leased' && job.lease_until > now.toISOString())) { skipped++; continue; }
      const lease = await checked(db.from('routine_reminder_jobs').update({ state: 'leased', attempts: job.attempts + 1, lease_until: new Date(now.getTime() + 120000).toISOString() }).eq('id', job.id).eq('state', job.state).eq('attempts', job.attempts).select('*').maybeSingle());
      if (!lease) { skipped++; continue; }
      queued++;
      try {
        // Re-check right before sending: the run may have started a moment ago.
        const fresh = await checked(db.from('routine_runs').select('start_date,state').eq('routine_id', routine.id).or(`start_date.eq.${date},state.eq.active`));
        if (fresh?.length) { await checked(db.from('routine_reminder_jobs').update({ state: 'skipped', lease_until: null }).eq('id', lease.id)); skipped++; continue; }
        let delivered = 0;
        for (const sub of subs) {
          try { await send({ endpoint: sub.endpoint, keys: sub.keys_json }, reminderContent(routine, date)); delivered++; }
          catch (error) { if ([404, 410].includes(error?.statusCode)) await checked(db.from('push_subscriptions').update({ active: false }).eq('id', sub.id)); }
        }
        if (!delivered) throw new Error('No active device accepted the reminder');
        await checked(db.from('routine_reminder_jobs').update({ state: 'sent', sent_at: now.toISOString(), lease_until: null, last_error: null }).eq('id', lease.id));
        sent++;
      } catch (error) {
        await checked(db.from('routine_reminder_jobs').update({ state: 'failed', lease_until: null, last_error: String(error).slice(0, 500) }).eq('id', lease.id));
        failed++;
      }
    } catch { failed++; }
  }
  return { windowOpen: true, queued, sent, skipped, failed };
}
