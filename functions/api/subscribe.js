/**
 * PulseOS Newsletter Subscribe — Cloudflare Pages Function
 * Endpoint: POST /api/subscribe
 *
 * Secrets (Cloudflare Pages → Settings → Environment variables):
 *   BREVO_API_KEY   Your Brevo API key
 *   BREVO_LIST_ID   Numeric ID of the contact list in Brevo
 */

const BREVO_API = 'https://api.brevo.com/v3/contacts';

export async function onRequestPost({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://pulseos.eu',
  };

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400, headers });
  }

  if (!env.BREVO_API_KEY || !env.BREVO_LIST_ID) {
    return new Response(JSON.stringify({ error: 'Service not configured' }), { status: 503, headers });
  }

  const listId = parseInt(env.BREVO_LIST_ID, 10);
  const preferences = Array.isArray(body.preferences) ? body.preferences.join(',') : '';

  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      email,
      listIds: [listId],
      updateEnabled: true,
      ...(preferences && { attributes: { PREFERENCES: preferences } }),
    }),
  });

  // 204 = created, 400 with "Contact already exist" = already subscribed (treat as success)
  if (res.status === 204 || res.status === 201) {
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 400 && data.message?.toLowerCase().includes('already exist')) {
    return new Response(JSON.stringify({ ok: true, alreadySubscribed: true }), { headers });
  }

  return new Response(JSON.stringify({ error: data.message || `Brevo ${res.status}` }), {
    status: 500,
    headers,
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': 'https://pulseos.eu',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
