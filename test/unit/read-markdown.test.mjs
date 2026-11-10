import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createContext } from '../../skills/ax-kit/scripts/lib/context/context.mjs';
import { visibleTextOf } from '../../skills/ax-kit/scripts/lib/context/html.mjs';
import { markdownUrlsOf } from '../../skills/ax-kit/scripts/lib/context/markdown.mjs';
import { CHECKS } from '../../skills/ax-kit/scripts/lib/registry.mjs';
import { runChecks } from '../../skills/ax-kit/scripts/lib/scan/runner.mjs';
import { runCheckOn, statusOf } from '../fixtures/run-check.mjs';
import { html, startSite, text } from '../fixtures/server.mjs';

const NEGOTIATION = 'read.markdown-negotiation';
const URL_CHECK = 'read.markdown-url';
const VARY = 'read.vary-accept';
const PARITY = 'read.markdown-parity';

const HTML_PAGE = `<!doctype html><html><body><p>${'x'.repeat(1000)}</p></body></html>`;
const MARKDOWN = '# Acme\n\nAcme makes tools for teams.\n';

const markdown = (body, headers = {}) => ({ status: 200, headers: { 'content-type': 'text/markdown; charset=utf-8', ...headers }, body });
const wantsMarkdown = (request) => request.headers.accept === 'text/markdown';
const negotiated = (response, page = HTML_PAGE) => ({ '/': (request) => (wantsMarkdown(request) ? response : html(page)) });

async function runOn(routes, ids, path = '/') {
  const site = await startSite(routes);
  try {
    const ctx = createContext({ target: `${site.origin}${path}`, profile: 'content' });
    const results = await runChecks(CHECKS.filter((check) => ids(check.id)), ctx);
    return { site, statusById: Object.fromEntries(results.map((result) => [result.id, result.status])) };
  } finally {
    await site.close();
  }
}

test('negotiation passes for a Markdown response, and the request asks only for Markdown', async () => {
  const { status, site } = await runCheckOn(negotiated(markdown(MARKDOWN)), NEGOTIATION);
  assert.equal(status, 'pass');
  assert.deepEqual(site.hits.map((hit) => hit.headers.accept), ['text/markdown']);
  assert.equal(await statusOf(negotiated({ ...markdown(MARKDOWN), headers: { 'content-type': 'TEXT/Markdown' } }), NEGOTIATION), 'pass');
});

test('negotiation fails when the server ignores the Accept header', async () => {
  assert.equal(await statusOf({ '/': html(HTML_PAGE) }, NEGOTIATION), 'fail');
  assert.equal(await statusOf(negotiated(text(MARKDOWN)), NEGOTIATION), 'fail');
  assert.equal(await statusOf(negotiated({ ...markdown(MARKDOWN), headers: { 'content-type': 'text/markdown-preview' } }), NEGOTIATION), 'fail');
});

test('negotiation fails for an HTML body, an empty body, or an error status with the Markdown type', async () => {
  assert.equal(await statusOf(negotiated(markdown(HTML_PAGE)), NEGOTIATION), 'fail');
  assert.equal(await statusOf(negotiated(markdown(' \n')), NEGOTIATION), 'fail');
  assert.equal(await statusOf(negotiated({ ...markdown(MARKDOWN), status: 406 }), NEGOTIATION), 'fail');
});

test('the Markdown URLs follow llmstxt.org for the root path and for other paths', () => {
  assert.deepEqual(markdownUrlsOf('https://x.test/'), ['https://x.test/index.md', 'https://x.test/index.html.md']);
  assert.deepEqual(markdownUrlsOf('https://x.test/docs/start'), ['https://x.test/docs/start.md', 'https://x.test/docs/start/index.md']);
  assert.deepEqual(markdownUrlsOf('https://x.test/docs/'), ['https://x.test/docs.md', 'https://x.test/docs/index.md']);
  assert.deepEqual(markdownUrlsOf('https://x.test/a.html?page=2#top'), ['https://x.test/a.html.md', 'https://x.test/a.html/index.md']);
});

test('the Markdown URLs stay on the host of the page', () => {
  assert.deepEqual(markdownUrlsOf('https://x.test//other.test/a'), ['https://x.test//other.test/a.md', 'https://x.test//other.test/a/index.md']);
});

test('the Markdown URL passes at the first variant and sends no request for the second variant', async () => {
  const { status, site } = await runCheckOn({ '/': html(HTML_PAGE), '/index.md': markdown(MARKDOWN) }, URL_CHECK);
  assert.equal(status, 'pass');
  assert.deepEqual(site.hits.map((hit) => hit.path), ['/', '/index.md']);
});

test('the Markdown URL passes at the second variant, with a plain text type too', async () => {
  const { result, site } = await runCheckOn({ '/': html(HTML_PAGE), '/index.html.md': text(MARKDOWN) }, URL_CHECK);
  assert.equal(result.status, 'pass');
  assert.match(result.summary, /is at \/index\.html\.md\.$/);
  assert.deepEqual(site.hits.map((hit) => hit.path), ['/', '/index.md', '/index.html.md']);
});

test('the Markdown URL fails for a missing file, a soft 404, an empty file, and an HTML content type', async () => {
  const soft = { notFound: html('<!doctype html><html><body><div id="root"></div></body></html>') };
  assert.equal(await statusOf({ '/': html(HTML_PAGE) }, URL_CHECK), 'fail');
  assert.equal(await statusOf({ '/': html(HTML_PAGE) }, URL_CHECK, soft), 'fail');
  assert.equal(await statusOf({ '/': html(HTML_PAGE), '/index.md': markdown('') }, URL_CHECK), 'fail');
  assert.equal(await statusOf({ '/': html(HTML_PAGE), '/index.md': html(MARKDOWN) }, URL_CHECK), 'fail');
  assert.equal(await statusOf({ '/': html(HTML_PAGE), '/index.md': markdown(HTML_PAGE) }, URL_CHECK), 'fail');
});

test('the Markdown URL uses the path of the entry page, without the query string', async () => {
  const routes = { '/docs/start': html(HTML_PAGE), '/docs/start/index.md': markdown(MARKDOWN) };
  const { statusById, site } = await runOn(routes, (id) => id === URL_CHECK, '/docs/start?utm=1');
  assert.equal(statusById[URL_CHECK], 'pass');
  assert.deepEqual(site.hits.map((hit) => hit.path + hit.query), ['/docs/start?utm=1', '/docs/start.md', '/docs/start/index.md']);
});

test('the Markdown URL uses the final URL of a redirected entry page', async () => {
  const routes = { '/': { status: 301, headers: { location: '/en/' } }, '/en/': html(HTML_PAGE), '/en.md': markdown(MARKDOWN) };
  const { status, site } = await runCheckOn(routes, URL_CHECK);
  assert.equal(status, 'pass');
  assert.deepEqual(site.hits.map((hit) => hit.path), ['/', '/en/', '/en.md']);
});

test('the Markdown URL has no result when the server fails', async () => {
  const { result } = await runCheckOn({ '/': html(HTML_PAGE), '/index.md': { status: 500 } }, URL_CHECK);
  assert.deepEqual([result.status, result.reason], ['not_assessed', 'server_error']);
});

const varyOf = (vary) => statusOf(negotiated(markdown(MARKDOWN, vary === null ? {} : { vary })), VARY);

test('the Vary check passes when the header has the Accept member', async () => {
  assert.equal(await varyOf('Accept'), 'pass');
  assert.equal(await varyOf('accept-encoding , ACCEPT'), 'pass');
  assert.equal(await varyOf('*'), 'pass');
});

test('the Vary check fails with no header and with a header that has only Accept-Encoding', async () => {
  assert.equal(await varyOf(null), 'fail');
  assert.equal(await varyOf('Accept-Encoding'), 'fail');
  assert.equal(await varyOf('Accept-Language, User-Agent'), 'fail');
});

test('the Vary check is blocked when the server does not negotiate Markdown', async () => {
  const routes = { '/': html(HTML_PAGE, { vary: 'Accept' }), '/index.md': markdown(MARKDOWN, { vary: 'Accept' }) };
  const { result } = await runCheckOn(routes, VARY);
  assert.deepEqual([result.status, result.blockedBy], ['fail', 'read.markdown-negotiation']);
});

const parityOf = (chars) => statusOf(negotiated(markdown('m'.repeat(chars))), PARITY);

test('parity passes from 50%, is partial from 25%, and fails below 25%', async () => {
  assert.equal(visibleTextOf(HTML_PAGE).length, 1000);
  assert.equal(await parityOf(500), 'pass');
  assert.equal(await parityOf(499), 'partial');
  assert.equal(await parityOf(250), 'partial');
  assert.equal(await parityOf(249), 'fail');
});

test('parity ignores the white space around the Markdown, and reports the percentage', async () => {
  const padded = markdown(`${' '.repeat(600)}${'m'.repeat(249)}\n\n`);
  const { result } = await runCheckOn(negotiated(padded), PARITY);
  assert.equal(result.status, 'fail');
  assert.equal(result.summary, 'The Markdown version has 24% of the length of the visible text of the HTML page.');
});

test('parity uses the Markdown file when the server does not negotiate', async () => {
  const withFile = (chars) => ({ '/': html(HTML_PAGE), '/index.html.md': text('m'.repeat(chars)) });
  assert.equal(await statusOf(withFile(500), PARITY), 'pass');
  assert.equal(await statusOf(withFile(100), PARITY), 'fail');
});

test('parity prefers the negotiated Markdown to the Markdown file', async () => {
  const routes = { ...negotiated(markdown('m'.repeat(100))), '/index.md': markdown('m'.repeat(900)) };
  assert.equal(await statusOf(routes, PARITY), 'fail');
});

test('parity passes when the HTML page has no visible text', async () => {
  const shell = '<!doctype html><html><body><div id="root"></div></body></html>';
  assert.equal(await statusOf(negotiated(markdown(MARKDOWN), shell), PARITY), 'pass');
});

test('parity is blocked when the page has no Markdown version', async () => {
  const { result } = await runCheckOn({ '/': html(HTML_PAGE) }, PARITY);
  assert.deepEqual([result.status, result.blockedBy], ['fail', 'read.markdown']);
});

test('the Markdown group and its members apply to the page profiles only', async () => {
  const members = CHECKS.filter((check) => check.group === 'read.markdown');
  assert.deepEqual(members.map((check) => check.id), [NEGOTIATION, URL_CHECK]);
  assert.deepEqual(members.map((check) => [check.tier, check.playbook]), Array(2).fill(['recommended', 'markdown-for-agents']));
  const { status, site } = await runCheckOn(negotiated(markdown(MARKDOWN)), NEGOTIATION, { profile: 'api' });
  assert.deepEqual([status, site.hits.length], ['not_applicable', 0]);
});

test('all the Read checks add 3 requests to the request for the entry page', async () => {
  const isRead = (id) => id.startsWith('read.');
  const missing = await runOn({ '/': html(HTML_PAGE) }, isRead);
  assert.deepEqual(missing.site.hits.map((hit) => hit.path).sort(), ['/', '/', '/index.html.md', '/index.md']);
  assert.deepEqual([missing.statusById[NEGOTIATION], missing.statusById[URL_CHECK]], ['fail', 'fail']);

  const complete = await runOn({ ...negotiated(markdown(MARKDOWN, { vary: 'Accept' })), '/index.md': markdown(MARKDOWN) }, isRead);
  assert.equal(complete.site.hits.length, 3);
  assert.deepEqual([NEGOTIATION, URL_CHECK, VARY].map((id) => complete.statusById[id]), ['pass', 'pass', 'pass']);
});
