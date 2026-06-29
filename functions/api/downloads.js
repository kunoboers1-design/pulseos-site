/**
 * PulseOS Downloads — Cloudflare Pages Function
 * Endpoint: GET /api/downloads
 *
 * Secrets (set in Cloudflare Pages → Settings → Environment variables):
 *   ISSUER_ID      App Store Connect API issuer UUID
 *   KEY_ID         App Store Connect API key ID
 *   PRIVATE_KEY    Contents of the .p8 private key file
 *   VENDOR_NUMBER  Your vendor number (Payments & Financial Reports)
 *
 * Caching: uses Cloudflare's edge cache (no KV setup needed).
 * The nightly GitHub Actions cron warms the cache so real visitors
 * always get a sub-100ms response.
 */

const APP_IDS = new Set([
  '6751821638', // PulseFX
  '6772808092', // PulseVinyl
  '6760773764', // PulseRecipes
  '6763062516', // PulseReflect
  '6763711631', // PulseWiish
]);

const LAUNCH_YEAR = 2024;
const CACHE_TTL = 86400; // 24 hours
const CACHE_KEY = 'https://pulseos.eu/_internal/downloads-cache';

// ── JWT ──────────────────────────────────────────────────────────────────────

async function generateJWT(issuerId, keyId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);

  const toB64url = obj =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const header = toB64url({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const payload = toB64url({ iss: issuerId, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' });
  const unsigned = `${header}.${payload}`;

  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${unsigned}.${sigB64}`;
}

// ── Sales Reports ─────────────────────────────────────────────────────────────

// Only count first-time downloads; exclude updates (7/F7) and in-app purchases
const DOWNLOAD_TYPES = new Set(['1', '1F', 'F1', 'F1A']);

async function parseTSV(res) {
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  const lines = text.trim().split('\n');
  if (lines.length < 2) return 0;

  const headers = lines[0].split('\t');
  const unitsIdx = headers.indexOf('Units');
  const appIdIdx = headers.indexOf('Apple Identifier');
  const typeIdx = headers.indexOf('Product Type Identifier');
  if (unitsIdx === -1 || appIdIdx === -1) return 0;

  let total = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (!APP_IDS.has(cols[appIdIdx])) continue;
    if (typeIdx >= 0 && !DOWNLOAD_TYPES.has(cols[typeIdx])) continue;
    total += parseInt(cols[unitsIdx], 10) || 0;
  }
  return total;
}

async function fetchReport(token, vendorNumber, frequency, reportDate) {
  const url = new URL('https://api.appstoreconnect.apple.com/v1/salesReports');
  url.searchParams.set('filter[frequency]', frequency);
  url.searchParams.set('filter[reportDate]', reportDate);
  url.searchParams.set('filter[reportType]', 'SALES');
  url.searchParams.set('filter[reportSubType]', 'SUMMARY');
  url.searchParams.set('filter[vendorNumber]', vendorNumber);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/a-gzip' },
  });

  if (res.status === 404) return 0;
  if (!res.ok) throw new Error(`App Store Connect ${res.status} (${frequency} ${reportDate})`);
  return parseTSV(res);
}

async function fetchTotal(token, vendorNumber) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed; last complete month = currentMonth
  const currentDay = now.getDate();

  // Build list of all report fetches and run them all in parallel
  const fetches = [];

  // Past complete years (YEARLY)
  for (let year = LAUNCH_YEAR; year < currentYear; year++) {
    fetches.push(fetchReport(token, vendorNumber, 'YEARLY', String(year)));
  }

  // Current year: complete past months (MONTHLY)
  for (let month = 1; month <= currentMonth; month++) {
    fetches.push(fetchReport(token, vendorNumber, 'MONTHLY',
      `${currentYear}-${String(month).padStart(2, '0')}`));
  }

  // Current month: each day up to yesterday (DAILY)
  if (currentDay > 1) {
    const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    for (let day = 1; day < currentDay; day++) {
      fetches.push(fetchReport(token, vendorNumber, 'DAILY',
        `${monthStr}-${String(day).padStart(2, '0')}`));
    }
  }

  const results = await Promise.all(fetches);
  return results.reduce((sum, n) => sum + n, 0);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function onRequestGet({ request, env, waitUntil }) {
  const jsonHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${CACHE_TTL}`,
  };

  // Serve from Cloudflare edge cache (instant for real visitors)
  const edgeCache = caches.default;
  const cached = await edgeCache.match(CACHE_KEY);
  if (cached) {
    const body = await cached.text();
    return new Response(body, { headers: { 'Content-Type': 'application/json' } });
  }

  // KV fallback if configured
  if (env.DOWNLOADS_KV) {
    const kv = await env.DOWNLOADS_KV.get('total');
    if (kv) return new Response(kv, { headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const token = await generateJWT(env.ISSUER_ID, env.KEY_ID, env.PRIVATE_KEY);
    const total = await fetchTotal(token, env.VENDOR_NUMBER);
    const body = JSON.stringify({ total, updatedAt: new Date().toISOString().split('T')[0] });

    // Store in edge cache + KV (background, doesn't block response)
    const toCache = new Response(body, { headers: jsonHeaders });
    waitUntil(edgeCache.put(CACHE_KEY, toCache));
    if (env.DOWNLOADS_KV) {
      waitUntil(env.DOWNLOADS_KV.put('total', body, { expirationTtl: CACHE_TTL }));
    }

    return new Response(body, { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
