import { sendSandboxEmail } from './email.mjs';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const money = cents => `$${(cents / 100).toFixed(2)}`;

export function renderWeeklyReport(snapshot) {
  const { weekStart, weekEnd, completed, scheduled, baseCents, bonusCents, habits = [] } = snapshot;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd)) throw new Error('A complete week is required');
  if (![completed, scheduled, baseCents, bonusCents].every(Number.isInteger) || completed < 0 || scheduled < 0 || completed > scheduled) throw new Error('Invalid report totals');
  const rate = scheduled ? `${Math.round(completed / scheduled * 100)}%` : 'No scheduled activities';
  const rows = habits.map(habit => `<li>${escapeHtml(habit.title)}: ${habit.completed} of ${habit.scheduled} scheduled</li>`).join('');
  return `<!doctype html><html><body><h1>Your HNF week</h1><p>${escapeHtml(weekStart)} through ${escapeHtml(weekEnd)}</p><p>${completed} of ${scheduled} scheduled activities completed · ${rate}</p><p>Base rewards ${money(baseCents)} · Bonuses ${money(bonusCents)} · Total ${money(baseCents + bonusCents)}</p>${rows ? `<h2>By activity</h2><ul>${rows}</ul>` : ''}<p>Rest days are not counted as missed activities.</p></body></html>`;
}

export async function sendWeeklySandboxReport({ apiKey, to, snapshot, fetcher, test = false, idempotencyKey }) {
  const html = renderWeeklyReport(snapshot);
  return sendSandboxEmail({
    apiKey,
    to,
    subject: `HNF weekly report${test ? ' test' : ''}: ${snapshot.weekStart}–${snapshot.weekEnd}`,
    html,
    idempotencyKey,
    fetcher,
  });
}
