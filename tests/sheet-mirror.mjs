import assert from 'node:assert/strict';
import { googleAccessToken, upsertMirrorRow } from '../supabase/functions/hnf-worker/sheet-mirror.mjs';

await assert.rejects(googleAccessToken({}), /Incomplete Google service account/);
const rows = [];
let writes = 0;
const google = async (path, init = {}) => {
  if (path.startsWith('?fields=')) return { sheets: [{ properties: { title: 'HNF Records' } }] };
  if (path.includes('A1%3AA') && !init.method) return { values: rows.map(row => [row[0]]) };
  if (init.method === 'PUT') {
    const values = JSON.parse(init.body).values[0];
    const match = decodeURIComponent(path).match(/A(\d+):G\d+/);
    rows[Number(match[1]) - 1] = values;
    writes++;
    return {};
  }
  if (path.includes(':append')) {
    rows.push(JSON.parse(init.body).values[0]);
    writes++;
    return {};
  }
  throw new Error(`Unexpected Sheets call: ${path}`);
};
const record = { entity: 'tasks', record_id: 'task-1', revision: 1, owner_id: 'owner-1', changed_at: '2026-09-22T00:00:00Z', payload: { title: '=HYPERLINK("evil")' } };
assert.equal((await upsertMirrorRow(google, record)).action, 'appended');
assert.equal(rows.length, 2);
assert.equal(rows[1][0], 'tasks:task-1');
assert.match(rows[1][6], /^\{/);
assert.equal((await upsertMirrorRow(google, { ...record, revision: 2 })).action, 'updated');
assert.equal(rows.length, 2);
assert.equal(rows[1][3], 2);
assert.equal(writes, 3);
console.log('PASS stable Sheets row update, RAW input, and no duplicate append');
