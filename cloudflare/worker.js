// Proxy Cloudflare Worker: reenvia el chat a opencode.ai y agrega CORS + la key server-side.
// La key NUNCA va en el bundle publico; vive como secret del worker (OPENCODE_GO_KEY).
const UPSTREAM = 'https://opencode.ai/zen/v1/chat/completions';

// ponytail: allowlist fija; agregar dominios si cambia el hosting
const ALLOWED_ORIGINS = new Set([
  'https://josevargass.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]);

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    if (!ALLOWED_ORIGINS.has(origin)) {
      return new Response('Origin no permitido', { status: 403 });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
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
