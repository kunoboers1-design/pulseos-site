import { createServer } from 'node:http';
import { readFileSync, chmodSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { AppStoreServerAPIClient, SignedDataVerifier, Environment } from '@apple/app-store-server-library';
import { createApplication } from './application.mjs';
import { createApplePurchases, bundleID } from './apple.mjs';
import { createStore } from './store.mjs';

// MARK: - Configuratie zonder ontwikkelomweg
const required = name => { const value = process.env[name]; if (!value) throw new Error(`Missing configuration: ${name}`); return value; };
const origin = required('PULSEFX_WEB_ORIGIN');
if (new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new Error('HTTPS origin required');
const secret = required('PULSEFX_SERVICE_SECRET');
if (secret.length < 64) throw new Error('Service secret must contain at least 64 characters');
const environmentName = required('APPLE_ENVIRONMENT');
if (!['Production', 'Sandbox'].includes(environmentName)) throw new Error('Invalid Apple environment');
if (environmentName === 'Sandbox' && origin === 'https://pulseos.eu') throw new Error('Sandbox requires an isolated staging origin');
const environment = environmentName === 'Production' ? Environment.PRODUCTION : Environment.SANDBOX;
const appAppleId = Number(required('APPLE_APP_ID'));
if (!Number.isSafeInteger(appAppleId) || appAppleId <= 0) throw new Error('Invalid Apple app ID');
const roots = required('APPLE_ROOT_CERTIFICATES').split(',').map(path => readFileSync(path.trim()));
const verifier = new SignedDataVerifier(roots, true, environment, bundleID, appAppleId);
const client = new AppStoreServerAPIClient(readFileSync(required('APPLE_IAP_KEY_FILE'), 'utf8'), required('APPLE_KEY_ID'), required('APPLE_ISSUER_ID'), bundleID, environment);
const keyHex = required('PULSEFX_SESSION_KEY');
if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) throw new Error('Invalid session encryption key');
const databasePath = required('PULSEFX_SESSION_DB');
process.umask(0o077);
const store = createStore(databasePath, Buffer.from(keyHex, 'hex'));
chmodSync(databasePath, 0o600);
const cleanupTimer = setInterval(() => store.prune(), 60_000);
cleanupTimer.unref();
const handle = createApplication({ store, purchases: createApplePurchases({ verifier, client, environment }), origin });
const expectedAuth = Buffer.from(`Bearer ${secret}`);

// MARK: - Alleen bereikbaar via de Pages-proxy
const server = createServer(async (incoming, outgoing) => {
  outgoing.setHeader('Cache-Control', 'no-store');
  const receivedAuth = Buffer.from(incoming.headers.authorization || '');
  if (receivedAuth.length !== expectedAuth.length || !timingSafeEqual(receivedAuth, expectedAuth)) { outgoing.writeHead(403); outgoing.end(); return; }
  try {
    let length = 0; const chunks = [];
    for await (const chunk of incoming) {
      length += chunk.length;
      if (length > 8_000_000) { outgoing.writeHead(413); outgoing.end(); return; }
      chunks.push(chunk);
    }
    const request = new Request(`https://premium.internal${incoming.url}`, {
      method: incoming.method, headers: incoming.headers,
      body: ['GET', 'HEAD'].includes(incoming.method) ? undefined : Buffer.concat(chunks),
    });
    const response = await handle(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  } catch { outgoing.writeHead(503); outgoing.end('{"error":"SERVICE_UNAVAILABLE"}'); }
});
server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.listen(Number(process.env.PORT || 8788), process.env.HOST || '127.0.0.1');
process.on('SIGTERM', () => server.close(() => { clearInterval(cleanupTimer); store.close(); process.exit(0); }));
