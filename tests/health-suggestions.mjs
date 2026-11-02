// Apple Health suggested check-ins: suggestion creation, confirmation, dismissal, duplicate and
// stale imports, changed/deleted data, permission changes, reward idempotency and privacy.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create function digest(text,text) returns bytea language sql immutable as $$ select decode(md5($1),'hex') $$; create function gen_random_bytes(integer) returns bytea language sql volatile as $$ select decode(repeat('ab',$1),'hex') $$;`);
for (const file of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort())
  await db.exec(readFileSync('supabase/migrations/' + file, 'utf8').replace('create extension if not exists pgcrypto;', ''));

const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', outsider = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await query(sql, params))[0];
const as = async (id) => { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub','${id}',false)`); await db.exec('set role authenticated'); };
const admin = async () => { await db.exec('reset role'); };
const reject = async (sql, params, pattern) => { let message = ''; try { await query(sql, params); } catch (e) { message = e.message; } assert.ok(message, `Expected rejection: ${sql}`); if (pattern) assert.match(message, pattern); };
const setDay = async (d) => { await db.exec('reset role'); await db.exec(`create or replace function app.local_day() returns date language sql stable as $$ select date '${d}' $$;`); };

await db.exec(`grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; insert into auth.users(id) values('${a}'),('${b}'),('${outsider}');`);
await setDay('2026-07-01');

// Alice sets up on July 1 with a daily walk ($2) and a daily gym habit ($3); Bob joins her group.
await as(a);
await query('select start_setup($1,$2,$3,$4,$5::jsonb)', ['Alice', 10000, 8, 'cups', JSON.stringify([
  { title: 'Walk', reward_cents: 200, description: '', weekdays: [1, 2, 3, 4, 5, 6, 7] },
  { title: 'Gym', reward_cents: 300, description: '', weekdays: [1, 2, 3, 4, 5, 6, 7] },
])]);
const swim = (await one('select save_task($1,$2,$3,$4,$5,$6) id', [null, 'Swim', '', 100, [1, 3, 5], null])).id;
const invite = (await one('select issue_invitation() token')).token;
await as(b);
await query('select redeem_invitation($1)', [invite]);
await as(a);
const walk = (await one("select id from tasks where title='Walk'")).id, gym = (await one("select id from tasks where title='Gym'")).id;
await setDay('2026-07-15'); // a Wednesday
await as(a);

let batchNo = 0;
const batch = () => `00000000-0000-4000-8000-${String(++batchNo).padStart(12, '0')}`;
const at = (minute) => `2026-07-15T12:${String(minute).padStart(2, '0')}:00Z`;
const submit = async (values, id = batch()) => (await one('select submit_health_values($1,$2::jsonb) r', [id, JSON.stringify(values)])).r;
const suggestion = (task, date) => one('select * from health_suggestions where task_id=$1 and local_date=$2', [task, date]);
const confirm = async (task, date) => (await one('select confirm_health_suggestion($1) r', [(await suggestion(task, date)).id])).r;
const earned = async (task, date) => (await admin(), (await one("select coalesce(sum(cents),0)::int n from earnings where task_id=$1 and earned_date=$2 and active and kind='base'", [task, date])).n);
const completed = async (task, date) => (await admin(), (await one('select count(*)::int n from completions where task_id=$1 and local_date=$2 and completed', [task, date])).n);
const pass = (label) => console.log('PASS health ' + label);

// Nothing uploads until the companion connects; links are owner-only.
await reject('select submit_health_values($1,$2::jsonb)', [batch(), '[]'], /Connect Apple Health first/);
await query('select save_health_connection($1,$2,$3)', [true, true, 'iPhone']);
await query('select save_health_link($1,$2,$3,$4)', [walk, 'steps', 10000, []]);
await query('select save_health_link($1,$2,$3,$4)', [gym, 'workouts', 30, ['running']]);
await query('select save_health_link($1,$2,$3,$4)', [swim, 'steps', 5000, []]);
await reject('select save_health_link($1,$2,$3,$4)', [walk, 'steps', 50, []]);
await as(b);
await reject('select save_health_link($1,$2,$3,$4)', [walk, 'steps', 10000, []], /read-only/);
await as(a);
pass('connection and links: upload needs a connection, targets are validated, only the owner can link');

// Suggestion creation: only current-month, past-or-today, scheduled days that meet the target.
let r = await submit([
  { kind: 'steps', date: '2026-07-14', value: 12000, source: 'Apple Health · iPhone', observed_at: at(1) },
  { kind: 'steps', date: '2026-07-13', value: 8000, observed_at: at(1) },
  { kind: 'steps', date: '2026-07-12', value: 9000, observed_at: at(1) }, // Sunday: Swim isn't scheduled
  { kind: 'steps', date: '2026-06-30', value: 15000, observed_at: at(1) }, // last month
  { kind: 'steps', date: '2026-07-16', value: 15000, observed_at: at(1) }, // tomorrow in New York
  { kind: 'steps', date: '2026-07-11', value: -5, observed_at: at(1) },
  { kind: 'sleep', date: '2026-07-11', value: 8, observed_at: at(1) },
]);
assert.deepEqual(r, { accepted: 3, ignored: 4, suggested: 2 }, 'Walk on the 14th and Swim (M/W/F, 5,000 steps) on Monday the 13th');
let s = await suggestion(walk, '2026-07-14');
assert.equal(s.status, 'pending'); assert.equal(Number(s.measured_value), 12000); assert.equal(Number(s.target), 10000);
assert.equal(s.unit, 'steps'); assert.equal(s.source, 'Apple Health · iPhone');
assert.equal(await suggestion(walk, '2026-07-13'), undefined, 'below target: no suggestion');
assert.equal((await suggestion(swim, '2026-07-13')).status, 'pending', 'Swim target is 5,000 and Monday is scheduled');
assert.equal(await suggestion(swim, '2026-07-12'), undefined, 'not scheduled: no suggestion');
await admin();
assert.equal((await one("select count(*)::int n from health_daily_values where local_date in ('2026-06-30','2026-07-16')")).n, 0, 'ignored days are never stored');
assert.equal(await completed(walk, '2026-07-14'), 0, 'a suggestion alone never checks anything off');
assert.equal(await earned(walk, '2026-07-14'), 0, 'a suggestion alone never earns');
await as(a);
pass('suggestion creation: target, schedule, month and New York day rules; nothing is checked off');

// Duplicate imports: a retried batch is a no-op, and a re-sync never makes a second suggestion.
const retry = batch();
const first = await submit([{ kind: 'steps', date: '2026-07-14', value: 12100, observed_at: at(2) }], retry);
assert.deepEqual(await submit([{ kind: 'steps', date: '2026-07-14', value: 99999, observed_at: at(3) }], retry), { ...first, duplicate: true });
await submit([{ kind: 'steps', date: '2026-07-14', value: 12100, observed_at: at(2) }]);
await admin();
assert.equal((await one("select count(*)::int n from health_suggestions where task_id=$1 and local_date='2026-07-14'", [walk])).n, 1);
assert.equal(Number((await one("select value from health_daily_values where owner_id=$1 and kind='steps' and local_date='2026-07-14'", [a])).value), 12100, 'the retried batch was not applied twice');
await as(a);
// A late upload of an older reading never overwrites a newer one.
await submit([{ kind: 'steps', date: '2026-07-14', value: 3000, observed_at: at(0) }]);
assert.equal((await suggestion(walk, '2026-07-14')).status, 'pending');
assert.equal(Number((await suggestion(walk, '2026-07-14')).measured_value), 12100);
pass('duplicate imports: retried batches, re-syncs and out-of-order uploads');

// Changed or deleted Health data withdraws a pending suggestion; it comes back if the data does.
await submit([{ kind: 'steps', date: '2026-07-14', value: 0, observed_at: at(4) }]);
assert.equal((await suggestion(walk, '2026-07-14')).status, 'withdrawn');
r = await submit([{ kind: 'steps', date: '2026-07-14', value: 12500, observed_at: at(5) }]);
assert.equal(r.suggested, 1); assert.equal((await suggestion(walk, '2026-07-14')).status, 'pending');
pass('changed and deleted data: withdraw, then reopen');

// Confirmation creates exactly one completion and one reward, even when repeated.
assert.deepEqual(await confirm(walk, '2026-07-14'), { status: 'confirmed', rewarded: true });
assert.deepEqual(await confirm(walk, '2026-07-14'), { status: 'confirmed', rewarded: false });
assert.equal(await completed(walk, '2026-07-14'), 1);
assert.equal(await earned(walk, '2026-07-14'), 200);
await as(a);
await submit([{ kind: 'steps', date: '2026-07-14', value: 13000, observed_at: at(6) }]);
assert.equal(await earned(walk, '2026-07-14'), 200, 'a later sync of a confirmed day never pays again');
await as(a);
pass('confirmation: one completion, one $2 reward, repeat-safe');

// Manual check-ins still work and settle a pending suggestion; confirming it then pays nothing.
await submit([{ kind: 'steps', date: '2026-07-15', value: 11000, observed_at: at(7) }]);
assert.equal((await suggestion(walk, '2026-07-15')).status, 'pending');
await query('select save_completion($1,$2,$3,$4)', [walk, '2026-07-15', true, 0]);
assert.equal((await suggestion(walk, '2026-07-15')).status, 'already_done');
assert.deepEqual(await confirm(walk, '2026-07-15'), { status: 'already_done', rewarded: false });
assert.equal(await earned(walk, '2026-07-15'), 200);
await as(a);
// And a manual check-in that comes first means no suggestion is ever made for that day.
await query('select save_completion($1,$2,$3,$4)', [walk, '2026-07-11', true, 0]);
await submit([{ kind: 'steps', date: '2026-07-11', value: 14000, observed_at: at(8) }]);
assert.equal(await suggestion(walk, '2026-07-11'), undefined);
assert.equal(await earned(walk, '2026-07-11'), 200);
await as(a);
pass('reward idempotency with manual check-ins');

// Dismissal never creates a completion and sticks through re-syncs. Workout filters count only
// the chosen workout kinds.
await submit([{ kind: 'workouts', date: '2026-07-13', value: 60, details: { running: 20, yoga: 40 }, observed_at: at(9) }]);
assert.equal(await suggestion(gym, '2026-07-13'), undefined, '20 running minutes is under 30');
await submit([{ kind: 'workouts', date: '2026-07-10', value: 35, details: { running: 35, unknown_kind: 900 }, source: 'Apple Health · Workout', observed_at: at(10) }]);
s = await suggestion(gym, '2026-07-10');
assert.equal(s.status, 'pending'); assert.equal(s.unit, 'minutes'); assert.equal(Number(s.measured_value), 35);
await admin();
assert.deepEqual((await one("select details from health_daily_values where owner_id=$1 and kind='workouts' and local_date='2026-07-10'", [a])).details, { running: 35 }, 'unknown workout kinds are dropped');
await as(a);
assert.equal((await one('select dismiss_health_suggestion($1) r', [s.id])).r, 'dismissed');
assert.equal((await one('select dismiss_health_suggestion($1) r', [s.id])).r, 'dismissed');
await submit([{ kind: 'workouts', date: '2026-07-10', value: 50, details: { running: 50 }, observed_at: at(11) }]);
assert.equal((await suggestion(gym, '2026-07-10')).status, 'dismissed');
await reject('select confirm_health_suggestion($1)', [s.id], /no longer available/);
assert.equal(await completed(gym, '2026-07-10'), 0);
assert.equal(await earned(gym, '2026-07-10'), 0);
await as(a);
pass('dismissal: no completion, no reward, stays dismissed');

// Confirming re-checks the latest data: if it no longer meets the target, nothing is created.
await submit([{ kind: 'steps', date: '2026-07-10', value: 10500, observed_at: at(12) }]);
const stale = await suggestion(walk, '2026-07-10');
await admin();
await db.query("update health_daily_values set value=100 where owner_id=$1 and kind='steps' and local_date='2026-07-10'", [a]);
await as(a);
assert.deepEqual((await one('select confirm_health_suggestion($1) r', [stale.id])).r, { status: 'withdrawn', rewarded: false });
assert.equal(await completed(walk, '2026-07-10'), 0);
await as(a);
pass('confirmation re-checks the latest Health total');

// A confirmed day whose data later drops keeps its check-in but is flagged in history.
await submit([{ kind: 'steps', date: '2026-07-09', value: 15000, observed_at: at(13) }]);
await confirm(walk, '2026-07-09');
await submit([{ kind: 'steps', date: '2026-07-09', value: 4000, observed_at: at(14) }]);
s = await suggestion(walk, '2026-07-09');
assert.equal(s.status, 'confirmed'); assert.equal(s.data_changed, true);
assert.equal(await completed(walk, '2026-07-09'), 1);
await as(a);
pass('confirmed history notes later Health changes without removing the check-in');

// Unchecking a confirmed day removes the reward, marks the suggestion undone and never re-suggests.
const version = (await one("select version from completions where task_id=$1 and local_date='2026-07-14'", [walk])).version;
await query('select save_completion($1,$2,$3,$4)', [walk, '2026-07-14', false, version]);
assert.equal((await suggestion(walk, '2026-07-14')).status, 'undone');
assert.equal(await earned(walk, '2026-07-14'), 0);
await as(a);
await submit([{ kind: 'steps', date: '2026-07-14', value: 20000, observed_at: at(15) }]);
assert.equal((await suggestion(walk, '2026-07-14')).status, 'undone');
pass('undoing a confirmed check-in');

// Permission changes: turning steps off deletes stored step totals and withdraws pending ones.
await submit([{ kind: 'steps', date: '2026-07-08', value: 16000, observed_at: at(16) }]);
assert.equal((await suggestion(walk, '2026-07-08')).status, 'pending');
await query('select save_health_connection($1,$2,$3)', [false, true, 'iPhone']);
assert.equal((await suggestion(walk, '2026-07-08')).status, 'withdrawn');
r = await submit([{ kind: 'steps', date: '2026-07-07', value: 16000, observed_at: at(17) }]);
assert.deepEqual(r, { accepted: 0, ignored: 1, suggested: 0 });
await admin();
assert.equal((await one("select count(*)::int n from health_daily_values where owner_id=$1 and kind='steps'", [a])).n, 0);
await as(a);
// Unlinking an activity withdraws its pending suggestions too.
await query('select save_health_connection($1,$2,$3)', [true, true, 'iPhone']);
await submit([{ kind: 'steps', date: '2026-07-07', value: 16000, observed_at: at(18) }]);
assert.equal((await suggestion(walk, '2026-07-07')).status, 'pending');
await query('select save_health_link($1,$2,$3,$4)', [walk, null, null, null]);
assert.equal((await suggestion(walk, '2026-07-07')).status, 'withdrawn');
pass('permission changes and unlinking');

// Privacy: partner and outsiders see nothing and can't act; nothing reaches the Sheets mirror.
const anyId = (await suggestion(swim, '2026-07-13')).id;
for (const who of [b, outsider]) {
  await as(who);
  assert.equal((await one('select count(*)::int n from health_suggestions')).n, 0);
  assert.equal((await one('select count(*)::int n from health_activity_links')).n, 0);
  assert.equal((await one('select count(*)::int n from health_connections')).n, 0);
  await reject('select * from health_daily_values', [], /permission denied/);
  await reject('select confirm_health_suggestion($1)', [anyId], /not found/);
  await reject('select dismiss_health_suggestion($1)', [anyId], /not found/);
}
await db.exec('reset role'); await db.exec('set role anon');
await reject('select submit_health_values($1,$2::jsonb)', [batch(), '[]']);
await admin();
assert.equal((await one("select count(*)::int n from sheet_jobs where entity like 'health%'")).n, 0);
assert.equal((await one("select count(*)::int n from audit_events where entity like 'health%'")).n, 0);
pass('privacy: owner-only, no group access, no Sheets mirror');

// Disconnect deletes stored totals but keeps confirmed history; Start over removes everything.
await as(a);
await query('select disconnect_health()');
await admin();
assert.equal((await one('select count(*)::int n from health_daily_values where owner_id=$1', [a])).n, 0);
assert.equal((await one('select count(*)::int n from health_connections where owner_id=$1', [a])).n, 0);
assert.equal((await one('select count(*)::int n from health_activity_links where owner_id=$1', [a])).n, 0, 'disconnect unlinks, so a signed-in phone stops reading');
assert.equal((await one("select count(*)::int n from health_suggestions where owner_id=$1 and status='confirmed'", [a])).n, 1);
assert.equal((await one("select count(*)::int n from health_suggestions where owner_id=$1 and status='pending'", [a])).n, 0);
await as(a);
await query('select start_over($1)', ['DELETE']);
await admin();
for (const table of ['health_suggestions', 'health_activity_links', 'health_daily_values', 'health_sync_batches', 'health_connections'])
  assert.equal((await one(`select count(*)::int n from ${table} where owner_id=$1`, [a])).n, 0, table);
pass('disconnect and Start over');
