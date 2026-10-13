const zone = 'America/New_York';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const parts = now => Object.fromEntries(fmt.formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
const dayBefore = date => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const checked = async query => { const { data, error } = await query; if (error) throw error; return data; };
const due = (task, setting, date) => {
  if (!setting || date < task.start_date || (task.archive_date && date >= task.archive_date)) return false;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  return setting.weekdays?.includes(day);
};

export function pushWindow(now = new Date()) {
  const p = parts(now);
  const hour = Number(p.hour);
  return { date: `${p.year}-${p.month}-${p.day}`, kind: hour === 6 ? 'morning' : hour === 18 ? 'evening' : null };
}

export function buildPushContent({ kind, date, tasks, settings, completions, quote }) {
  const relevant = kind === 'morning' ? dayBefore(date) : date;
  const scheduled = tasks.filter(task => {
    const setting = settings.filter(s => s.task_id === task.id && s.month <= relevant.slice(0, 7) + '-01').sort((a, b) => b.month.localeCompare(a.month))[0];
    return due(task, setting, relevant);
  });
  const completed = scheduled.filter(task => completions.some(c => c.task_id === task.id && c.local_date === relevant && c.completed));
  if (kind === 'evening' && (!scheduled.length || completed.length === scheduled.length)) return null;
  const body = kind === 'morning'
    ? `Yesterday: ${completed.length}/${scheduled.length} scheduled. Today is a fresh start. ${quote ?? ''}`.trim()
    : `${scheduled.length - completed.length} scheduled ${scheduled.length - completed.length === 1 ? 'activity' : 'activities'} left today. Open HNF to see your plan.`;
  return { title: kind === 'morning' ? 'Your HNF morning update' : 'Your HNF evening reminder', body, url: '/?view=Insights', tag: `hnf-${kind}-${date}` };
}

export async function runPushNotifications({ db, send, now = new Date(), testOwner = null }) {
  const { date, kind } = pushWindow(now);
  if (!kind && !testOwner) return { windowOpen: false, queued: 0, sent: 0, failed: 0, skipped: 0 };
  const actualKind = kind ?? 'evening';
  const prefs = await checked(db.from('notification_preferences').select('owner_id').eq('enabled', true));
  const owners = testOwner ? (prefs ?? []).filter(p => p.owner_id === testOwner) : (prefs ?? []);
  let queued = 0, sent = 0, failed = 0, skipped = 0;
  for (const { owner_id: owner } of owners) {
    const modeQuery = await db.from('reminder_preferences').select('mode').eq('owner_id', owner).maybeSingle();
    if (modeQuery.error && modeQuery.error.code !== '42P01' && modeQuery.error.code !== 'PGRST205') throw modeQuery.error;
    if (modeQuery.data?.mode && modeQuery.data.mode !== 'standard') { skipped++; continue; }
    const subscriptions = await checked(db.from('push_subscriptions').select('id,endpoint,keys_json').eq('owner_id', owner).eq('active', true));
    if (!subscriptions?.length) { skipped++; continue; }
    const job = await checked(db.from('notification_jobs').upsert({ owner_id: owner, local_date: date, kind: actualKind }, { onConflict: 'owner_id,local_date,kind', ignoreDuplicates: true }).select('*').maybeSingle());
    const existing = job ?? await checked(db.from('notification_jobs').select('*').eq('owner_id', owner).eq('local_date', date).eq('kind', actualKind).maybeSingle());
    if (!existing || existing.state === 'sent' || existing.state === 'skipped' || existing.attempts >= 5 || (existing.state === 'leased' && existing.lease_until && existing.lease_until > now.toISOString())) { skipped++; continue; }
    const lease = await checked(db.from('notification_jobs').update({ state: 'leased', attempts: existing.attempts + 1, lease_until: new Date(now.getTime() + 120000).toISOString() }).eq('id', existing.id).eq('state', existing.state).eq('attempts', existing.attempts).select('*').maybeSingle());
    if (!lease) { skipped++; continue; }
    queued++;
    try {
      const [pref, tasks, settings, completions, quoteRow] = await Promise.all([
        checked(db.from('notification_preferences').select('enabled').eq('owner_id', owner).single()),
        checked(db.from('tasks').select('id,start_date,archive_date').eq('owner_id', owner)),
        checked(db.from('task_month_settings').select('task_id,month,weekdays').in('task_id', (await checked(db.from('tasks').select('id').eq('owner_id', owner))).map(t => t.id))),
        checked(db.from('completions').select('task_id,local_date,completed').eq('owner_id', owner).in('local_date', [date, dayBefore(date)])),
        checked(db.from('daily_quotes').select('text').eq('day_of_year', Math.floor((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${date.slice(0, 4)}-01-01T12:00:00Z`)) / 86400000) + 1).maybeSingle()),
      ]);
      if (!pref.enabled) { await checked(db.from('notification_jobs').update({ state: 'skipped', lease_until: null }).eq('id', lease.id)); skipped++; continue; }
      const content = buildPushContent({ kind: actualKind, date, tasks, settings, completions, quote: quoteRow?.text });
      if (!content) { await checked(db.from('notification_jobs').update({ state: 'skipped', lease_until: null }).eq('id', lease.id)); skipped++; continue; }
      await checked(db.from('notification_updates').upsert({ owner_id: owner, local_date: date, kind: actualKind, content }, { onConflict: 'owner_id,local_date,kind' }));
      let delivered = 0;
      for (const sub of subscriptions) {
        try { await send({ endpoint: sub.endpoint, keys: sub.keys_json }, content); delivered++; }
        catch (error) {
          if ([404, 410].includes(error?.statusCode)) await checked(db.from('push_subscriptions').update({ active: false }).eq('id', sub.id));
          else throw error;
        }
      }
      if (!delivered) throw new Error('No active device accepted the notification');
      await checked(db.from('notification_jobs').update({ state: 'sent', sent_at: now.toISOString(), lease_until: null, last_error: null }).eq('id', lease.id));
      sent++;
    } catch (error) {
      await checked(db.from('notification_jobs').update({ state: 'failed', lease_until: null, last_error: String(error).slice(0, 500) }).eq('id', lease.id));
      failed++;
    }
  }
  return { windowOpen: Boolean(kind), queued, sent, failed, skipped };
}
