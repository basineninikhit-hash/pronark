const TAB = 'HNF Records';
const HEADERS = ['row_key', 'entity', 'record_id', 'revision', 'owner_id', 'changed_at', 'payload_json'];
const encode = value => btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const json64 = value => encode(new TextEncoder().encode(JSON.stringify(value)));

export async function googleAccessToken(service, fetcher = fetch, now = Date.now()) {
  if (!service?.client_email || !service.private_key || !service.token_uri) throw new Error('Incomplete Google service account');
  const pem = service.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const bytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const issued = Math.floor(now / 1000);
  const unsigned = `${json64({ alg: 'RS256', typ: 'JWT' })}.${json64({ iss: service.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: service.token_uri, iat: issued, exp: issued + 300 })}`;
  const signature = encode(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))));
  const response = await fetcher(service.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) });
  if (!response.ok) throw new Error(`Google OAuth rejected the service account (${response.status})`);
  const token = (await response.json()).access_token;
  if (!token) throw new Error('Google OAuth returned no access token');
  return token;
}

export function sheetsClient(sheetId, token, fetcher = fetch) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(sheetId) || !token) throw new Error('Invalid Sheets configuration');
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
  return async (path, init = {}) => {
    const response = await fetcher(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
    if (!response.ok) throw new Error(`Sheets request failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
    return response.json();
  };
}

const range = address => encodeURIComponent(`'${TAB}'!${address}`);

export async function upsertMirrorRow(google, record) {
  const rowKey = `${record.entity}:${record.record_id}`;
  if (!/^[a-z_]+$/.test(record.entity) || !record.record_id || !Number.isInteger(record.revision)) throw new Error('Invalid mirror record');
  const metadata = await google('?fields=sheets.properties(title)');
  if (!metadata.sheets?.some(sheet => sheet.properties?.title === TAB)) {
    try {
      await google(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB } } }] }) });
    } catch (error) {
      const refreshed = await google('?fields=sheets.properties(title)');
      if (!refreshed.sheets?.some(sheet => sheet.properties?.title === TAB)) throw error;
    }
  }
  const existing = await google(`/values/${range('A1:A')}?valueRenderOption=UNFORMATTED_VALUE`);
  const keys = (existing.values ?? []).map(row => String(row[0] ?? ''));
  if (keys[0] !== HEADERS[0]) {
    await google(`/values/${range('A1:G1')}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [HEADERS] }) });
  }
  const row = [rowKey, record.entity, record.record_id, record.revision, record.owner_id ?? '', record.changed_at ?? '', JSON.stringify(record.payload ?? null)];
  const index = keys.indexOf(rowKey);
  if (index >= 1) {
    await google(`/values/${range(`A${index + 1}:G${index + 1}`)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [row] }) });
    return { rowKey, action: 'updated' };
  }
  await google(`/values/${range('A:G')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: [row] }) });
  return { rowKey, action: 'appended' };
}

const checked = async promise => {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
};

export async function runSheetMirror({ db, service, sheetId, now = new Date(), fetcher = fetch, rowWriter = upsertMirrorRow, limit = 25 }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error('Invalid mirror batch limit');
  const token = await googleAccessToken(service, fetcher, now.getTime());
  const google = sheetsClient(sheetId, token, fetcher);
  const due = now.toISOString();
  const pending = await checked(db.from('sheet_jobs').select('*').in('state', ['pending', 'error']).lte('next_attempt_at', due).order('id', { ascending: true }).limit(25));
  const expired = await checked(db.from('sheet_jobs').select('*').eq('state', 'leased').lt('lease_until', due).order('id', { ascending: true }).limit(25));
  let synced = 0, failed = 0, skipped = 0;
  for (const job of [...(pending ?? []), ...(expired ?? [])].slice(0, limit)) {
    if (job.attempts >= 5) { skipped++; continue; }
    const claimed = await checked(db.from('sheet_jobs').update({ state: 'leased', attempts: job.attempts + 1, lease_until: new Date(now.getTime() + 300000).toISOString() }).eq('id', job.id).eq('state', job.state).eq('attempts', job.attempts).select('*').maybeSingle());
    if (!claimed) { skipped++; continue; }
    try {
      const already = await checked(db.from('sheet_records').select('revision').eq('entity', job.entity).eq('record_id', job.record_id).maybeSingle());
      if (!already || already.revision < job.revision) {
        const event = await checked(db.from('audit_events').select('owner_id,after_value,created_at').eq('entity', job.entity).eq('entity_id', job.record_id).order('created_at', { ascending: false }).limit(1).maybeSingle());
        if (!event) throw new Error('No source audit event for mirror job');
        const revision = Math.max(job.revision, Number(event.after_value?.revision) || job.revision);
        const result = await rowWriter(google, { entity: job.entity, record_id: job.record_id, revision, owner_id: event.owner_id, changed_at: event.created_at, payload: event.after_value });
        await checked(db.from('sheet_records').upsert({ entity: job.entity, record_id: job.record_id, revision, row_key: result.rowKey, synced_at: now.toISOString() }, { onConflict: 'entity,record_id' }));
        synced++;
      } else skipped++;
      await checked(db.from('sheet_jobs').update({ state: 'done', lease_until: null, error: null }).eq('id', job.id).eq('state', 'leased'));
    } catch (error) {
      failed++;
      await checked(db.from('sheet_jobs').update({ state: 'error', lease_until: null, next_attempt_at: new Date(now.getTime() + Math.min(60, 2 ** claimed.attempts) * 60000).toISOString(), error: String(error).slice(0, 500) }).eq('id', job.id).eq('state', 'leased'));
    }
  }
  if (synced) await checked(db.from('sheet_status').update({ last_success_at: now.toISOString(), last_error: null, spreadsheet_id: sheetId }).eq('singleton', true));
  if (failed) await checked(db.from('sheet_status').update({ last_error: `${failed} mirror job(s) failed` }).eq('singleton', true));
  return { scanned: (pending?.length ?? 0) + (expired?.length ?? 0), synced, failed, skipped };
}
