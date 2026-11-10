import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAttributes, parseHtml, visibleTextOf } from '../../skills/ax-kit/scripts/lib/context/html.mjs';
import { linksWithRel, parseLinkHeader } from '../../skills/ax-kit/scripts/lib/context/link-header.mjs';
import { parseLlmsTxt } from '../../skills/ax-kit/scripts/lib/context/llms-txt.mjs';
import { parseRobots } from '../../skills/ax-kit/scripts/lib/context/robots.mjs';

const ROBOTS = `
# comment
User-agent: *
Disallow: /private/
Allow: /private/public/
Content-Signal: search=yes, ai-train=no

User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /

User-agent: Claude-User
Disallow: /admin$
Disallow: /*.pdf

Sitemap: https://example.com/sitemap.xml
Agentmap: https://example.com/entries.json
`;

test('robots.txt groups share rules across consecutive user-agent lines', () => {
  const robots = parseRobots(ROBOTS);
  assert.deepEqual(robots.agents, ['*', 'gptbot', 'claudebot', 'claude-user']);
  assert.equal(robots.allows('GPTBot', '/'), false);
  assert.equal(robots.allows('claudebot', '/page'), false);
});

test('robots.txt uses the wildcard group only when no group names the agent', () => {
  const robots = parseRobots(ROBOTS);
  assert.equal(robots.allows('Perplexity-User', '/private/x'), false);
  assert.equal(robots.allows('Claude-User', '/private/x'), true);
  assert.equal(robots.hasGroupFor('Claude-User'), true);
  assert.equal(robots.hasGroupFor('Perplexity-User'), false);
});

test('robots.txt prefers the longest rule, and allow wins a tie', () => {
  const robots = parseRobots(ROBOTS);
  assert.equal(robots.allows('*', '/private/public/page'), true);
  assert.equal(robots.allows('*', '/private/other'), false);
  const tie = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a');
  assert.equal(tie.allows('*', '/a'), true);
});

test('robots.txt supports the wildcard and the end anchor', () => {
  const robots = parseRobots(ROBOTS);
  assert.equal(robots.allows('Claude-User', '/admin'), false);
  assert.equal(robots.allows('Claude-User', '/admin/users'), true);
  assert.equal(robots.allows('Claude-User', '/files/report.pdf'), false);
});

test('robots.txt with an empty disallow allows all paths', () => {
  assert.equal(parseRobots('User-agent: *\nDisallow:').allows('*', '/x'), true);
  assert.equal(parseRobots('').allows('*', '/x'), true);
});

test('robots.txt collects sitemaps and other directives from all places', () => {
  const robots = parseRobots(ROBOTS);
  assert.deepEqual(robots.sitemaps, ['https://example.com/sitemap.xml']);
  assert.deepEqual(robots.directive('content-signal'), ['search=yes, ai-train=no']);
  assert.deepEqual(robots.directive('agentmap'), ['https://example.com/entries.json']);
  assert.deepEqual(robots.directive('license'), []);
});

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <title>Acme &amp; Co</title>
  <meta name="description" content="Tools for teams">
  <meta property="og:title" content="Acme">
  <link rel="alternate service-desc" type="application/json" href="/openapi.json">
  <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
  <script type="application/ld+json">{broken</script>
  <style>.hidden { color: red }</style>
</head>
<body>
  <!-- a comment -->
  <h1>Welcome</h1>
  <h3>Skipped <em>level</em></h3>
  <p>Visible&nbsp;text.</p>
  <a href="/login">Log in</a>
  <script>var hidden = "not visible";</script>
  <noscript>Please enable JavaScript.</noscript>
</body>
</html>`;

test('the HTML parser reads the document metadata', () => {
  const page = parseHtml(PAGE);
  assert.equal(page.title, 'Acme & Co');
  assert.equal(page.lang, 'en');
  assert.deepEqual(page.meta, { description: 'Tools for teams', 'og:title': 'Acme' });
  assert.deepEqual(page.links[0].rel, ['alternate', 'service-desc']);
  assert.deepEqual(page.anchors, ['/login']);
});

test('the HTML parser keeps valid JSON-LD and counts invalid blocks', () => {
  const { jsonLd } = parseHtml(PAGE);
  assert.deepEqual(jsonLd.items, [{ '@type': 'Organization', name: 'Acme' }]);
  assert.equal(jsonLd.invalid, 1);
});

test('the HTML parser lists headings with their levels', () => {
  assert.deepEqual(parseHtml(PAGE).headings, [
    { level: 1, text: 'Welcome' },
    { level: 3, text: 'Skipped level' },
  ]);
});

test('visible text excludes scripts, styles, comments, and noscript content', () => {
  assert.equal(visibleTextOf(PAGE), 'Acme & Co Welcome Skipped level Visible text. Log in');
});

test('the HTML parser reports the signals of an application shell', () => {
  assert.deepEqual(parseHtml(PAGE).shellSignals, ['noscript message asks for JavaScript']);
  assert.deepEqual(parseHtml('<body><div id="root"></div></body>').shellSignals, ['empty mount element #root']);
  assert.deepEqual(parseHtml('<body><div id="root"><p>Rendered</p></div></body>').shellSignals, []);
});

test('attributes can use double quotes, single quotes, or no quotes', () => {
  assert.deepEqual(parseAttributes(` a="1" b='2' c=3 disabled data-x="&lt;"`), { a: '1', b: '2', c: '3', disabled: '', 'data-x': '<' });
});

test('the Link header parser splits links and reads the relation and the type', () => {
  const links = parseLinkHeader('</.well-known/api-catalog>; rel="api-catalog", </index.md>; rel="alternate"; type="text/markdown", </a,b>; rel=service-desc');
  assert.deepEqual(links, [
    { href: '/.well-known/api-catalog', rel: ['api-catalog'], type: '' },
    { href: '/index.md', rel: ['alternate'], type: 'text/markdown' },
    { href: '/a,b', rel: ['service-desc'], type: '' },
  ]);
  assert.deepEqual(linksWithRel(links, 'service-desc').map((link) => link.href), ['/a,b']);
  assert.deepEqual(parseLinkHeader(undefined), []);
});

const LLMS = `# Acme

> Tools for teams.

Some details.

## Docs

- [Quick start](https://acme.test/docs/start.md): first steps
- [API](https://acme.test/docs/api.html)

## Optional

- [Blog](/blog/index.md)
`;

test('the llms.txt parser reads the title, the summary, the sections, and the links', () => {
  const llms = parseLlmsTxt(LLMS);
  assert.equal(llms.title, 'Acme');
  assert.equal(llms.summary, 'Tools for teams.');
  assert.deepEqual(llms.sections, ['Docs', 'Optional']);
  assert.equal(llms.links.length, 3);
  assert.deepEqual(llms.markdownLinks.map((link) => link.name), ['Quick start', 'Blog']);
  assert.equal(llms.chars, LLMS.length);
});

test('the llms.txt parser needs the H1 on the first line with content', () => {
  assert.equal(parseLlmsTxt('\n\n# Title').title, 'Title');
  assert.equal(parseLlmsTxt('\uFEFF# Title').title, 'Title');
  assert.equal(parseLlmsTxt('Intro\n# Title').title, null);
  assert.equal(parseLlmsTxt('## Not an H1').title, null);
  assert.equal(parseLlmsTxt('<!doctype html><html>').looksLikeHtml, true);
});

test('an unquoted id is a mount element, and a self-closing hidden element hides no text', () => {
  assert.deepEqual(parseHtml('<body><div id=root> </div></body>').shellSignals, ['empty mount element #root']);
  assert.equal(visibleTextOf('<p>Before</p><svg/><p>After</p>'), 'Before After');
  assert.equal(visibleTextOf('<p>Before</p><svg><text>Icon</text></svg><p>After</p>'), 'Before After');
});

test('script content with angle brackets does not become visible text or markup', () => {
  const page = '<p>Shown</p><script>if (a < b && c > d) { document.write("<h1>Hidden</h1>"); }</script><p>Also shown</p>';
  assert.equal(visibleTextOf(page), 'Shown Also shown');
  assert.deepEqual(parseHtml(page).headings, []);
});

test('headings keep the document order across levels', () => {
  const page = '<h2>Two</h2><h1>One</h1><h3>Three</h3><H2>Second two</H2>';
  assert.deepEqual(parseHtml(page).headings.map((heading) => `${heading.level}:${heading.text}`), ['2:Two', '1:One', '3:Three', '2:Second two']);
});

test('the parser takes linear time on a page with many unclosed constructs', () => {
  const size = 400000;
  const hostilePages = [
    '<script>'.repeat(size / 8),
    '<!--'.repeat(size / 4),
    '<'.repeat(size),
    '<div '.repeat(size / 5),
    '<h1>'.repeat(size / 4),
    '<noscript>'.repeat(size / 10),
    `<a href="${'"'.repeat(size)}`,
  ];
  const started = Date.now();
  for (const page of hostilePages) parseHtml(page);
  assert.ok(Date.now() - started < 3000, `parsing took ${Date.now() - started} ms`);
});
