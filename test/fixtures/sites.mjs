import { html, text } from './server.mjs';

const SITEMAP = '<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>/</loc></url><url><loc>/docs/start</loc></url></urlset>';

const LLMS_TXT = `# Acme

> Acme makes tools for teams.

## Docs

- [Quick start](/docs/start.md): the first steps
- [Pricing](/pricing.md): the plans and the prices
`;

const HOME = `<!doctype html>
<html lang="en">
<head>
  <title>Acme: tools for teams</title>
  <meta name="description" content="Acme makes tools for teams.">
</head>
<body>
  <main>
    <h1>Acme</h1>
    <p>${'Acme makes tools for teams. '.repeat(30)}</p>
  </main>
</body>
</html>`;

const HOME_LINKS = '</llms.txt>; rel="describedby", </index.md>; rel="alternate"; type="text/markdown"';

export const goodContentSite = {
  '/': html(HOME, { link: HOME_LINKS }),
  '/robots.txt': text('User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml\n'),
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
