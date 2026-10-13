import assert from 'node:assert/strict';
import { sendSandboxEmail, SANDBOX_FROM, SANDBOX_RECIPIENT } from '../supabase/functions/hnf-worker/email.mjs';

let calls = 0;
const fetcher = async (url, options) => {
  calls++;
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(options.method, 'POST');
  assert.deepEqual(JSON.parse(options.body), {
    from: SANDBOX_FROM,
    to: [SANDBOX_RECIPIENT],
    subject: 'Weekly HNF report',
    html: '<p>Test report</p>',
  });
  return { ok: true, json: async () => ({ id: 'test-message-id' }) };
};
const message = { apiKey: 'test-key', subject: 'Weekly HNF report', html: '<p>Test report</p>', fetcher };
assert.equal(await sendSandboxEmail({ ...message, to: SANDBOX_RECIPIENT }), 'test-message-id');
await assert.rejects(sendSandboxEmail({ ...message, to: 'other@example.com' }), /verified test recipient/);
await assert.rejects(sendSandboxEmail({ ...message, apiKey: '', to: SANDBOX_RECIPIENT }), /RESEND_API_KEY/);
assert.equal(calls, 1);
console.log('PASS Resend sandbox sender and recipient restriction');
