/**
 * PulseOS Downloads Worker
 * Fetches total app downloads from App Store Connect Sales Reports API.
 * Requires secrets: ISSUER_ID, KEY_ID, PRIVATE_KEY, VENDOR_NUMBER
 * Optional KV binding: DOWNLOADS_KV (for 24h caching)
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
const ALLOWED_ORIGIN = 'https://pulseos.eu';

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
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${unsigned}.${sigB64}`;
}

// ── Sales Reports API ─────────────────────────────────────────────────────────

async function fetchYearlyDownloads(token, vendorNumber, year) {
  const url = new URL('https://api.appstoreconnect.apple.com/v1/salesReports');
  url.searchParams.set('filter[frequency]', 'YEARLY');
  url.searchParams.set('filter[reportDate]', String(year));
  url.searchParams.set('filter[reportType]', 'SALES');
  url.searchParams.set('filter[reportSubType]', 'SUMMARY');
  url.searchParams.set('filter[vendorNumber]', vendorNumber);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/a-gzip' },
  });

  // 404 = no data for this year yet
  if (res.status === 404) return 0;
  if (!res.ok) throw new Error(`App Store Connect API ${res.status} for year ${year}`);

  // Decompress gzip → text
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();

  const lines = text.trim().split('\n');
  if (lines.length < 2) return 0;

  const headers = lines[0].split('\t');
  const unitsIdx = headers.indexOf('Units');
  const appIdIdx = headers.indexOf('Apple Identifier');
  if (unitsIdx === -1 || appIdIdx === -1) return 0;

  let total = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (APP_IDS.has(cols[appIdIdx])) {
      total += parseInt(cols[unitsIdx], 10) || 0;
    }
  }
  return total;
}

// ── CORS ──────────────────────────────────────────────────────────────────────

function cors(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const headers = { 'Content-Type': 'application/json', ...cors(origin) };

    try {
      // Serve from KV cache if available
      if (env.DOWNLOADS_KV) {
        const cached = await env.DOWNLOADS_KV.get('total');
        if (cached) return new Response(cached, { headers });
      }

      const token = await generateJWT(env.ISSUER_ID, env.KEY_ID, env.PRIVATE_KEY);

      const currentYear = new Date().getFullYear();
      let total = 0;
      for (let year = LAUNCH_YEAR; year <= currentYear; year++) {
        total += await fetchYearlyDownloads(token, env.VENDOR_NUMBER, year);
      }

      const body = JSON.stringify({ total, updatedAt: new Date().toISOString().split('T')[0] });

      if (env.DOWNLOADS_KV) {
        ctx.waitUntil(env.DOWNLOADS_KV.put('total', body, { expirationTtl: CACHE_TTL }));
      }

      return new Response(body, { headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  },
};
