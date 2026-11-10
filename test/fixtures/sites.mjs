import { html, text } from './server.mjs';

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
