import { recordOpening } from '../../server/pulsefx-link-count.mjs';

const appStoreURL = 'https://apps.apple.com/app/apple-store/id6751821638?pt=128059620&ct=Instagram&mt=8';

function redirect() {
  return new Response(null, {
    status: 302,
    headers: { Location: appStoreURL, 'Cache-Control': 'no-store' },
  });
}

export function onRequestGet({ request, env, waitUntil }) {
  const purpose = [request.headers.get('purpose'), request.headers.get('sec-purpose')].join(' ');
  const agent = request.headers.get('user-agent') || '';
  const preview = /prefetch|prerender|preview/i.test(purpose)
    || /facebookexternalhit|meta-externalagent|meta-externalfetcher|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|googlebot|bingbot/i.test(agent);

  if (!preview && new URL(request.url).hostname === 'pulseos.eu') {
    waitUntil(recordOpening(env.PULSEFX_ACCESS_DB).catch(() => {
      console.error('PulseFX download link count could not be stored.');
    }));
  }
  return redirect();
}

export const onRequestHead = redirect;
