// MARK: - Zelfde-origin toegang tot de aankoopservice
// Comment NL: Geen Apple-sleutels, aankoopbewijzen of responses loggen; ontbrekende configuratie sluit toegang af.
export async function onRequest({ request, env, params }) {
  const reply = (error, status) => new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
  const methods = { pair: ['POST'], confirm: ['POST'], session: ['GET', 'DELETE'], statistics: ['POST'] };
  if (!methods[path]?.includes(request.method)) return reply('NOT_FOUND', 404);
  if (env.PULSEFX_PREMIUM_ENABLED !== 'true') return reply('NOT_CONFIGURED', 503);
  let backend, origin;
  try {
    backend = new URL(env.PULSEFX_PREMIUM_SERVICE_URL);
    origin = new URL(env.PULSEFX_PREMIUM_ORIGIN);
    if (backend.protocol !== 'https:' || backend.username || backend.password || backend.search || backend.hash || backend.pathname !== '/'
      || origin.protocol !== 'https:' || origin.origin !== env.PULSEFX_PREMIUM_ORIGIN
      || new URL(request.url).origin !== origin.origin || env.PULSEFX_SERVICE_SECRET?.length < 64 || !env.PULSEFX_SERVICE_SECRET) throw new Error();
  } catch { return reply('NOT_CONFIGURED', 503); }
  const suppliedOrigin = request.headers.get('origin');
  // Comment NL: GET heeft niet altijd een Origin-header. Sec-Fetch-Site moet dan same-origin zijn.
  const sameOrigin = suppliedOrigin === origin.origin || (!suppliedOrigin && request.headers.get('sec-fetch-site') === 'same-origin');
  const nativeConfirmation = path === 'confirm' && !suppliedOrigin && !request.headers.has('cookie');
  if (!sameOrigin && !nativeConfirmation) return reply('ORIGIN_REJECTED', 403);
  const max = path === 'statistics' ? 8_000_000 : 32_000;
  if (Number(request.headers.get('content-length')) > max) return reply('REQUEST_TOO_LARGE', 413);
  try {
    let body;
    if (request.method === 'POST') {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply('INVALID_REQUEST', 415);
      // Comment NL: Stream begrenzen voordat een grote body in geheugen wordt samengevoegd.
      const reader = request.body?.getReader(); const chunks = []; let size = 0;
      if (reader) while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > max) { await reader.cancel(); return reply('REQUEST_TOO_LARGE', 413); }
        chunks.push(value);
      }
      body = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    }
    const headers = { authorization: `Bearer ${env.PULSEFX_SERVICE_SECRET}`, 'content-type': 'application/json',
      'x-pulsefx-client-ip': request.headers.get('cf-connecting-ip') || 'unknown' };
    if (!nativeConfirmation) { headers.origin = origin.origin; headers.cookie = request.headers.get('cookie') || ''; }
    const response = await fetch(new URL(`/v1/${path}`, backend), { method: request.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(90_000) });
    const outputHeaders = { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
    const setCookie = response.headers.get('set-cookie'); if (setCookie) outputHeaders['set-cookie'] = setCookie;
    return new Response(response.body, { status: response.status, headers: outputHeaders });
  } catch { return reply('SERVICE_UNAVAILABLE', 503); }
}
