/**
 * Narrow, opt-in integration smoke test. It reads Supabase through the
 * publishable key and appends exactly one labelled row to the supplied Sheet.
 * It never creates application records, sends notifications, or deploys code.
 */
import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';

const need = key => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};
const b64 = value => Buffer.from(value).toString('base64url');
const service = JSON.parse(await readFile(need('GOOGLE_APPLICATION_CREDENTIALS'), 'utf8'));
const assertionHeader = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const now = Math.floor(Date.now() / 1000);
const assertionBody = b64(JSON.stringify({
  iss: service.client_email,
  scope: 'https://www.googleapis.com/auth/spreadsheets',
  aud: service.token_uri,
  iat: now,
  exp: now + 300,
}));
const signer = createSign('RSA-SHA256');
signer.update(`${assertionHeader}.${assertionBody}`);
const assertion = `${assertionHeader}.${assertionBody}.${signer.sign(service.private_key).toString('base64url')}`;
const tokenResponse = await fetch(service.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
if (!tokenResponse.ok) throw new Error(`Google OAuth failed: ${tokenResponse.status}`);
const token = (await tokenResponse.json()).access_token;
const sheetId = need('GOOGLE_SHEET_ID');
const google = async (path, init = {}) => {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`Sheets request failed: ${response.status} ${await response.text()}`);
  return response.json();
};

const supabaseUrl = need('SUPABASE_URL').replace(/\/$/, '');
const supabaseKey = need('SUPABASE_PUBLISHABLE_KEY');
const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?select=user_id&limit=1`, { headers: { apikey: supabaseKey, authorization: `Bearer ${supabaseKey}` } });
const supabase = { read: supabaseResponse.ok, status: supabaseResponse.status };
supabase.anonymousReadRejected = supabase.status === 401 || supabase.status === 403;
// A publishable key is intentionally not allowed to create profile records.
// This verifies the write boundary without creating a test account or data.
const writeResponse = await fetch(`${supabaseUrl}/rest/v1/profiles`, { method: 'POST', headers: { apikey: supabaseKey, authorization: `Bearer ${supabaseKey}`, 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify({ user_id: '00000000-0000-4000-8000-000000000000', display_name: 'HNF smoke write probe' }) });
supabase.anonymousWriteRejected = writeResponse.status === 401 || writeResponse.status === 403;
supabase.writeStatus = writeResponse.status;
const meta = await google('?fields=sheets.properties');
const tab = meta.sheets?.[0]?.properties?.title;
if (!tab) throw new Error('The target spreadsheet has no writable worksheet.');
const marker = `HNF integration smoke test — ${new Date().toISOString()}`;
await google(`/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: [[marker, supabase.read ? 'Supabase publishable-key read succeeded' : `Supabase read returned HTTP ${supabase.status}`, supabase.anonymousWriteRejected ? 'Anonymous Supabase write correctly rejected' : `Anonymous write returned HTTP ${supabase.writeStatus}`]] }) });
console.log(JSON.stringify({ ok: (supabase.read || supabase.anonymousReadRejected) && supabase.anonymousWriteRejected, supabase, spreadsheetId: sheetId, worksheet: tab, appendedRows: 1 }, null, 2));
