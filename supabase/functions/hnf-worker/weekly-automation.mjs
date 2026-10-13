import { sendWeeklySandboxReport } from './weekly-report.mjs';
import { SANDBOX_RECIPIENT } from './email.mjs';

const dateOnly = date => date.toISOString().slice(0, 10);
const addDays = (day, count) => dateOnly(new Date(Date.parse(`${day}T12:00:00Z`) + count * 86400000));

export function dueWeek(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  const localDay = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  if (!(parts.weekday === 'Mon' && hour >= 6) && !(parts.weekday === 'Tue' && hour < 6)) return null;
  const monday = parts.weekday === 'Tue' ? addDays(localDay, -1) : localDay;
  return { weekStart: addDays(monday, -7), weekEnd: addDays(monday, -1) };
}

export function makeSnapshot({ weekStart, weekEnd }, rows, earnings) {
  const habits = new Map();
  for (const row of rows) {
    if (!row.due) continue;
    const item = habits.get(row.task_id) ?? { title: row.title, scheduled: 0, completed: 0 };
    item.scheduled++;
    if (row.completed) item.completed++;
    habits.set(row.task_id, item);
  }
  const list = [...habits.values()].sort((a, b) => a.title.localeCompare(b.title));
  const active = earnings.filter(entry => entry.active);
  return {
    weekStart, weekEnd, habits: list,
    scheduled: list.reduce((sum, item) => sum + item.scheduled, 0),
    completed: list.reduce((sum, item) => sum + item.completed, 0),
    baseCents: active.filter(entry => entry.kind === 'base').reduce((sum, entry) => sum + entry.cents, 0),
    bonusCents: active.filter(entry => entry.kind !== 'base').reduce((sum, entry) => sum + entry.cents, 0),
  };
}

const checked = async promise => {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
};

// Invoked only by the authenticated Edge Function. Never send from a browser.
export async function runWeeklyReports({ db, now = new Date(), apiKey, send = sendWeeklySandboxReport }) {
  const week = dueWeek(now);
  if (!week) return { eligible: false, queued: 0, sent: 0 };
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const preferences = await checked(db.from('report_preferences').select('owner_id,verified_email').eq('enabled', true).eq('verification_state', 'verified'));
  let queued = 0, sent = 0;
  for (const preference of preferences ?? []) {
    if (preference.verified_email?.toLowerCase() !== SANDBOX_RECIPIENT) continue;
    const owner = preference.owner_id;
    const existing = await checked(db.from('weekly_reports').select('id,snapshot').eq('owner_id', owner).eq('week_start', week.weekStart).maybeSingle());
    let report = existing;
    if (!report) {
      const [rows, earnings] = await Promise.all([
        checked(db.from('weekly_insight_rows').select('task_id,title,due,completed').eq('owner_id', owner).gte('local_date', week.weekStart).lte('local_date', week.weekEnd)),
        checked(db.from('earnings').select('kind,cents,active').eq('owner_id', owner).gte('earned_date', week.weekStart).lte('earned_date', week.weekEnd)),
      ]);
      const snapshot = makeSnapshot(week, rows ?? [], earnings ?? []);
      await checked(db.from('weekly_reports').upsert({ owner_id: owner, week_start: week.weekStart, snapshot }, { onConflict: 'owner_id,week_start', ignoreDuplicates: true }));
      report = await checked(db.from('weekly_reports').select('id,snapshot').eq('owner_id', owner).eq('week_start', week.weekStart).single());
    }
    await checked(db.from('report_delivery_jobs').upsert({ owner_id: owner, week_start: week.weekStart, recipient_email: preference.verified_email }, { onConflict: 'owner_id,week_start', ignoreDuplicates: true }));
    const job = await checked(db.from('report_delivery_jobs').select('id,state,recipient_email').eq('owner_id', owner).eq('week_start', week.weekStart).single());
    queued++;
    if (job.state === 'sent' || job.state === 'skipped') continue;
    const claimed = await checked(db.rpc('claim_report_delivery', { p_id: job.id }));
    if (!claimed?.id) continue;
    // Check opt-out immediately before provider delivery. The saved snapshot and
    // recipient stay fixed across retries so the idempotency key is meaningful.
    const current = await checked(db.from('report_preferences').select('enabled,verification_state,verified_email').eq('owner_id', owner).single());
    if (!current.enabled || current.verification_state !== 'verified' || current.verified_email !== claimed.recipient_email) {
      await checked(db.from('report_delivery_jobs').update({ state: 'skipped', lease_until: null }).eq('id', job.id).eq('state', 'leased'));
      continue;
    }
    try {
      const providerId = await send({ apiKey, to: claimed.recipient_email, snapshot: report.snapshot, idempotencyKey: `hnf-weekly/${job.id}` });
      await checked(db.from('report_delivery_jobs').update({ state: 'sent', provider_id: providerId, lease_until: null, last_error: null }).eq('id', job.id).eq('state', 'leased'));
      await checked(db.from('weekly_reports').update({ status: 'sent' }).eq('id', report.id));
      sent++;
    } catch (error) {
      await checked(db.from('report_delivery_jobs').update({ state: 'failed', lease_until: null, next_attempt_at: new Date(now.getTime() + Math.min(60, 2 ** claimed.attempts) * 60000).toISOString(), last_error: String(error).slice(0, 500) }).eq('id', job.id).eq('state', 'leased'));
      await checked(db.from('weekly_reports').update({ status: 'failed' }).eq('id', report.id));
    }
  }
  return { eligible: true, queued, sent };
}
