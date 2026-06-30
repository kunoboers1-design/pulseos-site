/**
 * PulseOS Ratings — Cloudflare Pages Function
 * Endpoint: GET /api/ratings
 * Fetches app ratings from Apple's public iTunes Lookup API (no auth needed).
 * Cached at the Cloudflare edge for 24h.
 */

const APP_IDS = ['6751821638', '6772808092', '6760773764', '6763062516', '6763711631'];
const CACHE_KEY = 'https://pulseos.eu/_internal/ratings-cache';
const CACHE_TTL = 86400;

// Try multiple storefronts in order; merge ratings taking the one with the most reviews per app.
const COUNTRIES = ['us', 'gb', 'nl', 'de'];

async function fetchRatingsForCountry(country) {
  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${APP_IDS.join(',')}&country=${country}`,
    { headers: { 'User-Agent': 'PulseOS/1.0' } }
  );
  if (!res.ok) return [];
  const { results } = await res.json();
  return results || [];
}

export async function onRequestGet({ waitUntil }) {
  const headers = { 'Content-Type': 'application/json' };

  const edgeCache = caches.default;
  const cached = await edgeCache.match(CACHE_KEY);
  if (cached) return new Response(await cached.text(), { headers });

  try {
    const allResults = await Promise.all(COUNTRIES.map(fetchRatingsForCountry));

    const byId = {};
    for (const results of allResults) {
      for (const item of results) {
        const id = String(item.trackId);
        const rating = item.averageUserRating ?? null;
        const count = item.userRatingCount ?? 0;
        // Keep whichever storefront has the most reviews for this app
        if (!byId[id] || count > (byId[id].count ?? 0)) {
          byId[id] = { rating, count };
        }
      }
    }

    let totalScore = 0, totalCount = 0;
    for (const { rating, count } of Object.values(byId)) {
      if (rating && count > 0) { totalScore += rating * count; totalCount += count; }
    }

    const avgRating = totalCount > 0
      ? Math.round((totalScore / totalCount) * 10) / 10
      : null;

    const body = JSON.stringify({ byId, avgRating });
    const toCache = new Response(body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL}` }
    });
    waitUntil(edgeCache.put(CACHE_KEY, toCache));

    return new Response(body, { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
