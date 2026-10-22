// Cheer pushes: tells someone a friend cheered them on. Each cheer is pushed at most once,
// only within a day of being sent, and only to people with notifications turned on.
const checked = async (query) => { const { data, error } = await query; if (error) throw error; return data; };
const words = { nice_work: 'Nice work!', you_got_this: 'You got this!', thank_you: 'Thank you!' };

/** Whether a cheer still needs a push at `now`. */
export function cheerPushDue(cheer, now = new Date()) {
  if (!['pending', 'failed', 'leased'].includes(cheer.push_state) || cheer.push_attempts >= 3) return false;
  if (cheer.push_state === 'leased' && cheer.push_lease_until && cheer.push_lease_until > now.toISOString()) return false;
  return now.getTime() - new Date(cheer.created_at).getTime() < 24 * 3600 * 1000;
}

/** Friend's first name and the cheer only: no habits, no group name. */
export const cheerContent = (cheer, senderName) => ({
  title: 'Pronark',
  body: `${(senderName ?? '').trim().split(/\s+/)[0] || 'A friend'} cheered you on: ${words[cheer.kind] ?? 'Nice work!'}`,
  url: `/?view=Groups&group=${cheer.group_id}`,
  tag: `pronark-cheer-${cheer.id}`,
});

export async function runCheerNotifications({ db, send, now = new Date() }) {
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const cheers = await checked(db.from('garden_cheers').select('id,group_id,from_user,to_user,kind,created_at,push_state,push_attempts,push_lease_until').in('push_state', ['pending', 'failed', 'leased']).gte('created_at', since).order('created_at').limit(100));
  let sent = 0, skipped = 0, failed = 0;
  for (const cheer of cheers ?? []) {
    if (!cheerPushDue(cheer, now)) { skipped++; continue; }
    const lease = await checked(db.from('garden_cheers').update({ push_state: 'leased', push_attempts: cheer.push_attempts + 1, push_lease_until: new Date(now.getTime() + 120000).toISOString() })
      .eq('id', cheer.id).eq('push_state', cheer.push_state).eq('push_attempts', cheer.push_attempts).select('id').maybeSingle());
    if (!lease) { skipped++; continue; }
    try {
      const [prefs, subs, sender] = await Promise.all([
        checked(db.from('notification_preferences').select('enabled').eq('owner_id', cheer.to_user).maybeSingle()),
        checked(db.from('push_subscriptions').select('id,endpoint,keys_json').eq('owner_id', cheer.to_user).eq('active', true)),
        checked(db.from('profiles').select('display_name').eq('user_id', cheer.from_user).maybeSingle()),
      ]);
      if (!prefs?.enabled || !subs?.length) { await checked(db.from('garden_cheers').update({ push_state: 'skipped', push_lease_until: null }).eq('id', cheer.id)); skipped++; continue; }
      let delivered = 0;
      for (const sub of subs) {
        try { await send({ endpoint: sub.endpoint, keys: sub.keys_json }, cheerContent(cheer, sender?.display_name)); delivered++; }
        catch (error) { if ([404, 410].includes(error?.statusCode)) await checked(db.from('push_subscriptions').update({ active: false }).eq('id', sub.id)); }
      }
      if (!delivered) throw new Error('No active device accepted the cheer');
      await checked(db.from('garden_cheers').update({ push_state: 'sent', push_lease_until: null }).eq('id', cheer.id));
      sent++;
    } catch {
      await checked(db.from('garden_cheers').update({ push_state: 'failed', push_lease_until: null }).eq('id', cheer.id));
      failed++;
    }
  }
  return { sent, skipped, failed };
}
