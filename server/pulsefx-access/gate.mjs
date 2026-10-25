// MARK: - Gedeelde toegang vóór de PulseFX-webapp
const encoder = new TextEncoder();
const lifetime = 12 * 60 * 60;
const attemptWindow = 15 * 60;
const protectedRoots = ['/pulsefx/app', '/pulsefx/login', '/pulsefx/dashboard', '/pulsefx/icloud'];
const accessRoot = '/pulsefx/access';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Cookie' };
const pageCSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const equal = (a, b) => { if (a.length !== b.length) return false; let result = 0; for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i]; return result === 0; };
const json = (error, status) => new Response(JSON.stringify({ error, login: '/pulsefx/access/' }), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

// Comment NL: Decodeer ook gecodeerde routenamen voordat toegangsregels worden toegepast.
export function canonicalPath(path) {
  try { return new URL(decodeURIComponent(path).replaceAll('\\', '/'), 'https://route.invalid').pathname; }
  catch { return null; }
}
export function needsAccess(path) {
  const p = canonicalPath(path);
  if (p === null) return true;
  if (protectedRoots.some(root => p === root || p.startsWith(root + '/'))) return true;
  if (p === '/api/pulsefx-config' || p.startsWith('/api/pulsefx-config/')) return true;
  // Comment NL: Native aankoopbevestiging heeft eigen Apple-verificatie en geen browsercookie.
  return p.startsWith('/api/pulsefx-premium/') && p !== '/api/pulsefx-premium/confirm';
}
function safeNext(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.length > 1000) return '/pulsefx/icloud/';
  const url = new URL(raw, 'https://route.invalid');
  const path = canonicalPath(url.pathname);
  return url.origin === 'https://route.invalid' && protectedRoots.some(root => path === root || path?.startsWith(root + '/'))
    ? url.pathname + url.search + url.hash : '/pulsefx/icloud/';
}
function cookieSettings(url) {
  return { name: url.protocol === 'https:' ? '__Host-pulsefx-friends' : 'pulsefx-friends-local-preview', secure: url.protocol === 'https:' ? '; Secure' : '' };
}
function sessionCookie(url, value = '', age = 0) {
  const { name, secure } = cookieSettings(url);
  return `${name}=${value}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${age}`;
}
function readCookie(request, url) {
  const name = cookieSettings(url).name;
  const value = request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(name + '='))?.slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}
const redirect = (target, cookie) => new Response(null, { status: 303, headers: { ...headers, Location: target, ...(cookie ? { 'Set-Cookie': cookie } : {}) } });

// MARK: - Toegangsscherm zonder geheime browsercode
function page({ message = '', next = '/pulsefx/icloud/', enabled = true, logout = false, local = false, status = 200 }) {
  const title = logout ? 'Leave the friends area?' : 'A space for friends.';
  const form = logout ? `<form method="post" action="/pulsefx/access/logout"><button type="submit">Lock this browser</button><a class="access-secondary" href="/pulsefx/icloud/">Stay in PulseFX</a></form>`
    : `<form method="post" action="/pulsefx/access/" autocomplete="on"><input type="hidden" name="next" value="${escape(next)}"><label for="password">Access password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256" ${enabled ? '' : 'disabled'} aria-describedby="access-note"><button type="submit" ${enabled ? '' : 'disabled'}>Continue to PulseFX <span aria-hidden="true">→</span></button></form>`;
  const body = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>PulseFX — Friends access</title><script src="/theme.js"></script><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/pulsefx/access/access.css"><link rel="icon" href="/pulseos-logo.png"></head>
<body class="access-page"><header><a class="access-brand" href="/pulsefx/">Pulse<span>FX</span></a><button id="themeToggle" class="theme-toggle" data-theme-label aria-label="Switch to light mode">Light mode</button></header><main><section class="access-card"><p class="access-eyebrow">PULSEFX · FRIENDS ACCESS</p><h1>${title}</h1><p>${logout ? 'This ends access to the website in this browser. It does not delete your trading data.' : 'Enter the shared access password to open the web app. You can connect your own iCloud account after entering.'}</p>${local ? '<p class="access-notice">Local preview only. Test password: <strong>pulsefx-friends-preview</strong>. Apple connections are disabled.</p>' : ''}${message ? `<p class="access-notice" role="alert">${escape(message)}</p>` : ''}${form}<p id="access-note" class="access-caption">${logout ? 'To end your Apple session too, use Disconnect and clear data in the workspace before leaving.' : 'Use the password shared by the site owner. This is not your Apple password. Access lasts up to 12 hours.'}</p><a class="access-back" href="/pulsefx/">← Back to PulseFX</a></section></main><footer>A private entrance. Your own iCloud data.<a href="/privacy/">Privacy</a></footer></body></html>`;
  // Comment NL: Behoud de Origin-header voor eigen POST-formulieren; stuur extern geen referrer.
  return new Response(body, { status, headers: { ...headers, 'Referrer-Policy': 'same-origin', 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': pageCSP } });
}
async function formData(request) {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw new Error('INVALID_FORM');
  if (Number(request.headers.get('content-length')) > 4096) throw new Error('INVALID_FORM');
  const reader = request.body?.getReader(); let size = 0; const chunks = [];
  if (reader) while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new Error('INVALID_FORM'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new URLSearchParams(new TextDecoder().decode(bytes));
}

// MARK: - Middleware en servercontrole
export async function friendsAccess(context, { now = () => Math.floor(Date.now() / 1000) } = {}) {
  const { request, env } = context; const url = new URL(request.url); const path = canonicalPath(url.pathname);
  const accessPage = [accessRoot, accessRoot + '/', accessRoot + '/logout'].includes(path);
  if (!accessPage && !needsAccess(url.pathname)) return context.next();
  const local = env.PULSEFX_FRIENDS_LOCAL_PREVIEW === 'true' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  const configured = (url.protocol === 'https:' || local) && env.PULSEFX_FRIENDS_ORIGIN === url.origin
    && typeof env.PULSEFX_FRIENDS_PASSWORD === 'string' && env.PULSEFX_FRIENDS_PASSWORD.length >= 16 && env.PULSEFX_FRIENDS_PASSWORD.length <= 256
    && typeof env.PULSEFX_FRIENDS_SESSION_SECRET === 'string' && env.PULSEFX_FRIENDS_SESSION_SECRET.length >= 32
    && env.PULSEFX_ACCESS_DB?.prepare && env.PULSEFX_ACCESS_DB?.batch;
  if (!configured) return url.pathname.startsWith('/api/') ? json('FRIENDS_ACCESS_UNAVAILABLE', 503)
    : page({ enabled: false, message: 'Friends access is not configured yet. Please contact the site owner.', status: 503 });
  try {
    const db = env.PULSEFX_ACCESS_DB;
    const hmacKey = await crypto.subtle.importKey('raw', encoder.encode(env.PULSEFX_FRIENDS_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sign = async value => hex(await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(value)));
    const version = await sign(`version:${url.origin}:${env.PULSEFX_FRIENDS_PASSWORD}`);
    const token = readCookie(request, url); const id = token ? await sign(`session:${token}`) : null;
    if (accessPage && request.method === 'POST') {
      if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return json('ORIGIN_REJECTED', 403);
      if (path === accessRoot + '/logout') {
        if (id) await db.prepare('DELETE FROM friends_sessions WHERE id = ?').bind(id).run();
        return redirect('/pulsefx/access/', sessionCookie(url));
      }
      const form = await formData(request); const next = safeNext(form.get('next'));
      const ip = local ? 'local-preview' : request.headers.get('cf-connecting-ip');
      if (!ip) return page({ message: 'Access could not be verified. Please try again.', next, status: 503 });
      const timestamp = now(); const bucket = Math.floor(timestamp / attemptWindow);
      const attemptID = await sign(`attempt:${ip}:${bucket}`);
      const result = await db.batch([
        db.prepare('DELETE FROM friends_attempts WHERE expires_at <= ?').bind(timestamp),
        db.prepare('DELETE FROM friends_sessions WHERE expires_at <= ? OR version <> ?').bind(timestamp, version),
        db.prepare('INSERT INTO friends_attempts (id, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET attempts = attempts + 1 RETURNING attempts')
          .bind(attemptID, (bucket + 1) * attemptWindow),
      ]);
      const attempts = result[2]?.results?.[0]?.attempts;
      if (!Number.isInteger(attempts)) throw new Error('LIMIT_UNAVAILABLE');
      if (attempts > 10) {
        const response = page({ message: 'Too many attempts. Please wait up to 15 minutes and try again.', next, local, status: 429 });
        response.headers.set('Retry-After', String((bucket + 1) * attemptWindow - timestamp)); return response;
      }
      const password = form.get('password');
      if (typeof password !== 'string' || password.length > 256 || !equal(await digest(password), await digest(env.PULSEFX_FRIENDS_PASSWORD))) {
        return page({ message: 'That password is not correct. Please try again.', next, local, status: 401 });
      }
      const session = hex(crypto.getRandomValues(new Uint8Array(32)));
      const sessionID = await sign(`session:${session}`);
      const statements = [db.prepare('INSERT INTO friends_sessions (id, version, expires_at) VALUES (?, ?, ?)').bind(sessionID, version, timestamp + lifetime)];
      if (id) statements.push(db.prepare('DELETE FROM friends_sessions WHERE id = ?').bind(id));
      await db.batch(statements);
      return redirect(next, sessionCookie(url, session, lifetime));
    }
    if (!['GET', 'HEAD'].includes(request.method) && accessPage) return json('METHOD_NOT_ALLOWED', 405);
    const session = id ? await db.prepare('SELECT id FROM friends_sessions WHERE id = ? AND version = ? AND expires_at > ?').bind(id, version, now()).first() : null;
    if (accessPage) {
      if (path === accessRoot + '/logout') return page({ logout: true, local });
      const next = safeNext(url.searchParams.get('next'));
      return session ? redirect(next) : page({ next, local });
    }
    if (!session) {
      if (url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method)) return json('FRIENDS_ACCESS_REQUIRED', 401);
      return redirect(`/pulsefx/access/?next=${encodeURIComponent(safeNext(url.pathname + url.search))}`, sessionCookie(url));
    }
    const upstream = await context.next();
    const response = new Response(upstream.body, upstream);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  } catch (error) {
    const invalid = error.message === 'INVALID_FORM';
    return url.pathname.startsWith('/api/') ? json(invalid ? 'INVALID_REQUEST' : 'FRIENDS_ACCESS_UNAVAILABLE', invalid ? 400 : 503)
      : page({ message: invalid ? 'Please submit the access form again.' : 'Access is temporarily unavailable. Please try again later.', local, status: invalid ? 400 : 503 });
  }
}
