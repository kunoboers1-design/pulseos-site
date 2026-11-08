import { readOpenings, recordOpening } from './link-count.mjs';

// Tabelnamen komen uitsluitend uit deze vaste configuratie.
export const pulseFX = {
  table: 'pulsefx_link_days',
  url: 'https://apps.apple.com/app/apple-store/id6751821638?pt=128059620&ct=Instagram&mt=8',
};
export const pulseVinyl = {
  table: 'pulsevinyl_link_days',
  url: 'https://apps.apple.com/app/apple-store/id6772808092?pt=128059620&ct=instagram&mt=8',
};

export function redirect(app) {
  return new Response(null, {
    status: 302,
    headers: { Location: app.url, 'Cache-Control': 'no-store' },
  });
}

export function openDownload(app, { request, env, waitUntil }) {
  const purpose = [request.headers.get('purpose'), request.headers.get('sec-purpose')].join(' ');
  const agent = request.headers.get('user-agent') || '';
  const preview = /prefetch|prerender|preview/i.test(purpose)
    || /facebookexternalhit|meta-externalagent|meta-externalfetcher|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|googlebot|bingbot/i.test(agent);

  if (!preview && new URL(request.url).hostname === 'pulseos.eu') {
    waitUntil(recordOpening(env.PULSEFX_ACCESS_DB, app.table).catch(() => {
      console.error(`Download link count for ${app.table} could not be stored.`);
    }));
  }
  return redirect(app);
}

// Alleen de hash staat op de server. De leessleutel staat lokaal bij PulseOS Dashboard.
const keyHash = '2889a82ce5769758d03c146f07e0d7ef099612314d2cc1143783f6b3da4b171b';
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

export async function downloadStats(app, { request, env }) {
  const token = (request.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (token) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token[1]));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash === keyHash) {
      try {
        const counts = await readOpenings(env.PULSEFX_ACCESS_DB, app.table);
        return Response.json(counts, { headers });
      } catch {
        return new Response(null, { status: 503, headers });
      }
    }
  }
  return new Response(null, { status: 401, headers });
}
