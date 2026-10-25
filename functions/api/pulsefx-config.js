// MARK: - Publieke browserconfiguratie
// Comment NL: Dit browser-API-token is geen serversleutel. Geen gebruikersdata loopt via deze functie.
export function onRequest({ request, env }) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
  if (request.method !== 'GET') return reply(405, { enabled: false });
  const disabled = () => reply(200, { enabled: false, message: 'The iCloud test is not configured for this deployment.' });
  if (env.PULSEFX_CLOUDKIT_ENABLED !== 'true') return disabled();
  const origin = env.PULSEFX_CLOUDKIT_ORIGIN;
  let allowed;
  try { allowed = new URL(origin); } catch { return disabled(); }
  if (allowed.protocol !== 'https:' || allowed.origin !== origin || allowed.username || allowed.password
    || new URL(request.url).origin !== origin) return disabled();
  const environment = env.PULSEFX_CLOUDKIT_ENVIRONMENT;
  const apiToken = env.PULSEFX_CLOUDKIT_API_TOKEN;
  if (!['development', 'production'].includes(environment) || typeof apiToken !== 'string'
    || !/^[a-zA-Z0-9._-]{16,2048}$/.test(apiToken)) return disabled();
  return reply(200, { enabled: true, containerIdentifier: 'iCloud.PulseOS.FX', environment, origin, apiToken });
}
