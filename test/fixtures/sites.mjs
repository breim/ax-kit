import { html, json, text } from './server.mjs';

const SITEMAP = '<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>/</loc></url><url><loc>/docs/start</loc></url></urlset>';

const LLMS_TXT = `# Acme

> Acme makes tools for teams.

## Docs

- [Quick start](/docs/start.md): the first steps
- [Pricing](/pricing.md): the plans and the prices
`;

const BODY_TEXT = 'Acme makes tools for teams. '.repeat(30);

const ORGANIZATION = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme', url: 'https://acme.example' };

const HOME = `<!doctype html>
<html lang="en">
<head>
  <title>Acme: tools for teams</title>
  <meta name="description" content="Acme makes tools for teams.">
  <link rel="alternate" type="text/markdown" href="/index.md">
  <script type="application/ld+json">${JSON.stringify(ORGANIZATION)}</script>
</head>
<body>
  <main>
    <h1>Acme</h1>
    <p>${BODY_TEXT}</p>
  </main>
</body>
</html>`;

const HOME_MARKDOWN = `# Acme\n\n${BODY_TEXT}\n`;

const HOME_HEADERS = {
  link: '</llms.txt>; rel="describedby", </index.md>; rel="alternate"; type="text/markdown"',
  vary: 'Accept',
  etag: '"home-1"',
};

const markdown = (body) => ({
  status: 200,
  headers: { 'content-type': 'text/markdown; charset=utf-8', vary: 'Accept', etag: '"home-md-1"' },
  body,
});

const negotiatedHome = (request) =>
  /text\/markdown/.test(request.headers.accept ?? '') ? markdown(HOME_MARKDOWN) : html(HOME, HOME_HEADERS);

const ROBOTS = `User-agent: *
Allow: /
Content-Signal: search=yes, ai-input=yes, ai-train=no

User-agent: GPTBot
Disallow: /

Sitemap: /sitemap.xml
`;

export const goodContentSite = {
  '/': negotiatedHome,
  '/index.md': markdown(HOME_MARKDOWN),
  '/robots.txt': text(ROBOTS),
  '/sitemap.xml': { status: 200, headers: { 'content-type': 'application/xml' }, body: SITEMAP },
  '/llms.txt': text(LLMS_TXT),
  '/docs/start.md': text('# Quick start\n'),
  '/pricing.md': text('# Pricing\n'),
};

export const badContentSite = {
  '/': html('<!doctype html><html><head><title>Acme</title></head><body><p>Welcome to Acme.</p></body></html>'),
};

export const softNotFound = html('<!doctype html><html><body><h1>Page not found</h1></body></html>');

export const blockedSite = {
  '/': { status: 403, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' }, body: '<html><title>Just a moment...</title></html>' },
};

export const unstableContentSite = {
  ...goodContentSite,
  '/llms.txt': { status: 503, headers: { 'content-type': 'text/plain' }, body: 'Service unavailable' },
};

const originOf = (request) => `http://${request.headers.host}`;

const PROBLEM_SCHEMA = { type: 'object', properties: { type: { type: 'string' }, title: { type: 'string' }, status: { type: 'integer' } } };

const openapiDocument = (origin) => ({
  openapi: '3.1.0',
  info: { title: 'Acme API', version: '1.0.0' },
  servers: [{ url: origin }],
  security: [{ oauth: ['items:read'] }],
  components: {
    securitySchemes: {
      oauth: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: `${origin}/token`, scopes: { 'items:read': 'Read the items' } } } },
    },
  },
  paths: {
    '/items': {
      get: {
        operationId: 'listItems',
        summary: 'List the items of the account',
        responses: {
          200: {
            description: 'The items',
            content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } }, example: [{ id: 'item_1' }] } },
          },
          401: { description: 'No valid token', content: { 'application/problem+json': { schema: PROBLEM_SCHEMA } } },
        },
      },
    },
  },
});

const serverMetadata = (origin) => ({
  issuer: origin,
  authorization_endpoint: `${origin}/authorize`,
  token_endpoint: `${origin}/token`,
  registration_endpoint: `${origin}/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'client_credentials'],
  code_challenge_methods_supported: ['S256'],
  scopes_supported: ['items:read'],
  client_id_metadata_document_supported: true,
});

const apiCatalog = (origin) => ({
  linkset: [{ anchor: origin, 'service-desc': [{ href: `${origin}/openapi.json`, type: 'application/openapi+json' }] }],
});

const DISCOVER_RESULT = {
  jsonrpc: '2.0',
  id: 1,
  result: { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: { tools: {} }, ttlMs: 0, cacheScope: 'public' },
};

const API_LINKS = '</.well-known/api-catalog>; rel="api-catalog", </openapi.json>; rel="service-desc"';

const apiRoutes = {
  '/.well-known/api-catalog': (request) => json(apiCatalog(originOf(request)), { 'content-type': 'application/linkset+json' }),
  '/openapi.json': (request) => json(openapiDocument(originOf(request))),
  '/.well-known/oauth-protected-resource': (request) => json({ resource: originOf(request), authorization_servers: [originOf(request)] }),
  '/.well-known/oauth-authorization-server': (request) => json(serverMetadata(originOf(request))),
  'POST /mcp': json(DISCOVER_RESULT),
  '/llms.txt': text(LLMS_TXT),
  '/docs/start.md': text('# Quick start\n'),
  '/pricing.md': text('# Pricing\n'),
};

export const goodApiSite = {
  ...apiRoutes,
  '/': json({ name: 'Acme API', documentation: '/llms.txt' }, { link: API_LINKS }),
};

export const goodWebappSite = {
  ...goodContentSite,
  ...apiRoutes,
  '/': (request) => {
    const response = negotiatedHome(request);
    return { ...response, headers: { ...response.headers, link: `${HOME_HEADERS.link}, ${API_LINKS}` } };
  },
};

const PROBLEM = { type: 'https://acme.example/problems/not-found', title: 'Not found', status: 404, detail: 'No resource is at this path.' };

export const problemNotFound = (request) =>
  /application\/json/.test(request.headers.accept ?? '')
    ? { status: 404, headers: { 'content-type': 'application/problem+json' }, body: JSON.stringify(PROBLEM) }
    : { status: 404, headers: { 'content-type': 'text/plain' }, body: 'Not found' };
