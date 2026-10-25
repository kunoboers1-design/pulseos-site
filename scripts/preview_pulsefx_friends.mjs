import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { friendsAccess } from '../server/pulsefx-access/gate.mjs';
import { memoryD1 } from '../tests/pulsefx-access/d1.mjs';
// MARK: - Geïsoleerde lokale wachtwoordpreview
const origin = 'http://127.0.0.1:8767';
const root = resolve('dist');
const env = { PULSEFX_FRIENDS_ORIGIN: origin, PULSEFX_FRIENDS_PASSWORD: 'pulsefx-friends-preview',
  PULSEFX_FRIENDS_SESSION_SECRET: randomBytes(32).toString('hex'), PULSEFX_FRIENDS_LOCAL_PREVIEW: 'true', PULSEFX_ACCESS_DB: memoryD1() };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
async function serveStatic(request) {
  const url = new URL(request.url);
  // Comment NL: Apple en Premium blijven uitgeschakeld; geen productieconfiguratie lezen.
  if (url.pathname.startsWith('/api/')) return Response.json({ enabled: false, error: 'NOT_CONFIGURED' }, { status: url.pathname === '/api/pulsefx-config' ? 200 : 503 });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
  try {
    let path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(root + sep) && path !== root) return new Response('Not found', { status: 404 });
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    return new Response(await readFile(path), { headers: { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
  } catch { return new Response('Not found', { status: 404 }); }
}
const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.headers.host !== new URL(origin).host) { outgoing.writeHead(403); outgoing.end(); return; }
    const init = { method: incoming.method, headers: incoming.headers };
    if (!['GET', 'HEAD'].includes(incoming.method)) { init.body = incoming; init.duplex = 'half'; }
    const request = new Request(new URL(incoming.url, origin), init);
    const response = await friendsAccess({ request, env, next: () => serveStatic(request) });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('Preview unavailable'); }
});
server.listen(8767, '127.0.0.1', () => console.log('Friends preview: ' + origin + '/pulsefx/icloud/?statistics=demo#premium-statistics'));
