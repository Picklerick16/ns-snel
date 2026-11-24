// Cloudflare Worker: forwards a few read-only NS Reisinformatie API calls and adds the API key.
// The key lives in the Worker secret NS_KEY, never in the web page.
const NS = 'https://gateway.apiportal.ns.nl';
const ALLOWED = [
  '/reisinformatie-api/api/v3/trips',
  '/reisinformatie-api/api/v2/stations',
  '/reisinformatie-api/api/v2/journey',
  '/reisinformatie-api/api/v2/departures',
];

function cors(env, req) {
  const allow = env.ALLOWED_ORIGIN || '*';
  const origin = req.headers.get('Origin') || '';
  const ok = allow === '*' || allow.split(',').map(s => s.trim()).includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (allow === '*' ? '*' : origin) : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(req, env, ctx) {
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    if (req.method !== 'GET') return new Response('method not allowed', { status: 405, headers: h });
    const url = new URL(req.url);
    if (!ALLOWED.some(p => url.pathname === p)) return new Response('not found', { status: 404, headers: h });
    if (!env.NS_KEY) return new Response('NS_KEY secret missing', { status: 500, headers: h });

    const target = NS + url.pathname + url.search;
    const isStations = url.pathname.endsWith('/stations');
    const cache = caches.default;
    if (isStations) {
      const hit = await cache.match(target);
      if (hit) return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), ...h } });
    }
    const r = await fetch(target, { headers: { 'Ocp-Apim-Subscription-Key': env.NS_KEY, 'Accept': 'application/json' } });
    const body = await r.arrayBuffer();
    const headers = { 'Content-Type': r.headers.get('Content-Type') || 'application/json', ...h };
    if (isStations && r.ok) {
      ctx.waitUntil(cache.put(target, new Response(body.slice(0), { headers: { 'Content-Type': headers['Content-Type'], 'Cache-Control': 'max-age=86400' } })));
    }
    return new Response(body, { status: r.status, headers });
  },
};
