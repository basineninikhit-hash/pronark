import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const decode = value => Buffer.from(value, 'base64url');
const applicationServerKey = Buffer.concat([Buffer.from([4]), decode(pub.x), decode(pub.y)]).toString('base64url');
const path = '.env.local';
const existing = readFileSync(path, 'utf8');
const line = `VITE_VAPID_PUBLIC_KEY=${applicationServerKey}`;
const updated = /^VITE_VAPID_PUBLIC_KEY=.*/m.test(existing)
  ? existing.replace(/^VITE_VAPID_PUBLIC_KEY=.*/m, line)
  : `${existing.trimEnd()}\n${line}\n`;
writeFileSync(path, updated, { mode: 0o600 });
writeFileSync('.env.push.local', `VAPID_PRIVATE_KEY=${priv.d}\n`, { mode: 0o600 });
console.log('Created a local VAPID key pair. Public key is in .env.local; private key is in ignored .env.push.local.');
