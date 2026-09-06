// MARK: - Nieuwsbriefaanmelding
// Comment NL: Elke gekozen app heeft een eigen Brevo-lijst; bestaande inschrijvingen blijven behouden.
// BREVO_API_KEY: bestaande geheime API-sleutel in Cloudflare.
// BREVO_TOPIC_LIST_IDS: JSON-object met numerieke lijst-ID's per app en de optionele sleutel releases.
// BREVO_LIST_ID: bestaande algemene lijst, alleen voor oudere formulieren zonder apps-veld.
const BREVO_API = 'https://api.brevo.com/v3/contacts';
const APPS = new Set(['pulsefx', 'pulsevinyl', 'pulserecipes', 'pulsesidequest', 'pulsereflect', 'pulsewiish', 'pulselift', 'pulsehabits']);
const PREFERENCES = new Set(['updates', 'releases']);
const validListId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

export async function onRequestPost({ request, env }) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://pulseos.eu' };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
  let body;
  try { body = await request.json(); } catch { return reply(400, { error: 'Invalid request' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Invalid request' });
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'Invalid email' });
  const preferences = body.preferences ?? [];
  if (!Array.isArray(preferences) || preferences.some(value => !PREFERENCES.has(value))) return reply(400, { error: 'Invalid preferences' });
  if (!env.BREVO_API_KEY) return reply(503, { error: 'Subscriptions are temporarily unavailable' });

  let listIds;
  let attributes;
  if (Object.hasOwn(body, 'apps')) {
    if (!Array.isArray(body.apps) || body.apps.length > APPS.size || body.apps.some(app => !APPS.has(app))) return reply(400, { error: 'Invalid apps' });
    const topics = [...new Set([...body.apps, ...(preferences.includes('releases') ? ['releases'] : [])])];
    if (!topics.length) return reply(400, { error: 'Choose at least one topic' });
    let mapping;
    try { mapping = JSON.parse(env.BREVO_TOPIC_LIST_IDS || '{}'); } catch { return reply(503, { error: 'Subscriptions are temporarily unavailable' }); }
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || topics.some(topic => !validListId(mapping[topic]))) return reply(503, { error: 'Subscriptions are temporarily unavailable' });
    const configured = Object.values(mapping).map(Number);
    if (new Set(configured).size !== configured.length) return reply(503, { error: 'Subscriptions are temporarily unavailable' });
    listIds = topics.map(topic => Number(mapping[topic]));
  } else {
    // Comment NL: Oude, gecachte formulieren blijven werken via de oorspronkelijke algemene lijst.
    if (!validListId(env.BREVO_LIST_ID)) return reply(503, { error: 'Subscriptions are temporarily unavailable' });
    listIds = [Number(env.BREVO_LIST_ID)];
    if (preferences.length) attributes = { PREFERENCES: [...new Set(preferences)].join(',') };
  }

  try {
    const response = await fetch(BREVO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY },
      body: JSON.stringify({ email, listIds, updateEnabled: true, ...(attributes ? { attributes } : {}) }),
      signal: AbortSignal.timeout(10000)
    });
    if (response.status === 201 || response.status === 204) return reply(200, { ok: true });
    return reply(502, { error: 'Could not save your subscription. Please try again later.' });
  } catch {
    return reply(502, { error: 'Could not save your subscription. Please try again later.' });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: {
    'Access-Control-Allow-Origin': 'https://pulseos.eu',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  } });
}
