import { readOpenings } from '../../server/pulsefx-link-count.mjs';

// Alleen de hash staat op de server. De leessleutel staat lokaal bij PulseOS Dashboard.
const keyHash = '2889a82ce5769758d03c146f07e0d7ef099612314d2cc1143783f6b3da4b171b';
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

export async function onRequestGet({ request, env }) {
  const token = (request.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (token) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token[1]));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash === keyHash) {
      try {
        const counts = await readOpenings(env.PULSEFX_ACCESS_DB);
        return Response.json(counts, { headers });
      } catch {
        return new Response(null, { status: 503, headers });
      }
    }
  }
  return new Response(null, { status: 401, headers });
}
