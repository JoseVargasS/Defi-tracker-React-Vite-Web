// Proxy Cloudflare Worker: reenvia el chat a opencode.ai y agrega CORS + la key server-side.
// La key NUNCA va en el bundle publico; vive como secret del worker (OPENCODE_GO_KEY).
// Ademas proxyfea GET /mexc/* hacia los futuros de MEXC (contract.mexc.com no manda CORS).
const UPSTREAM = 'https://opencode.ai/zen/v1/chat/completions';
const MEXC_UPSTREAM = 'https://contract.mexc.com/api/v1';

// ponytail: allowlist fija; agregar dominios si cambia el hosting
const ALLOWED_ORIGINS = new Set([
  'https://josevargass.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]);

function corsHeaders(origin, methods = 'POST, OPTIONS') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
  };
}

async function handleMexc(request, origin) {
  const url = new URL(request.url);
  const upstreamUrl = `${MEXC_UPSTREAM}${url.pathname.replace(/^\/mexc/, '')}${url.search}`;
  const upstream = await fetch(upstreamUrl, { method: 'GET' });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...corsHeaders(origin, 'GET, OPTIONS'),
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    if (!ALLOWED_ORIGINS.has(origin)) {
      return new Response('Origin no permitido', { status: 403 });
    }
    if (request.method === 'OPTIONS') {
      const pathname = new URL(request.url).pathname;
      const methods = pathname === '/mexc' || pathname.startsWith('/mexc/') ? 'GET, OPTIONS' : 'POST, OPTIONS';
      return new Response(null, { status: 204, headers: corsHeaders(origin, methods) });
    }
    const pathname = new URL(request.url).pathname;
    if (pathname === '/mexc' || pathname.startsWith('/mexc/')) {
      if (request.method !== 'GET') {
        return new Response('Metodo no permitido', { status: 405, headers: corsHeaders(origin, 'GET, OPTIONS') });
      }
      return handleMexc(request, origin);
    }
    if (request.method !== 'POST') {
      return new Response('Metodo no permitido', { status: 405, headers: corsHeaders(origin) });
    }
    const apiKey = env.OPENCODE_GO_KEY;
    if (!apiKey) {
      return new Response('Worker sin OPENCODE_GO_KEY configurada', { status: 500, headers: corsHeaders(origin) });
    }
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: await request.text(),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      },
    });
  },
};
