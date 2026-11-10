import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { runCheckOn, statusOf } from '../fixtures/run-check.mjs';
import { html, json, text } from '../fixtures/server.mjs';

const SITEMAP = '<?xml version="1.0"?><urlset><url><loc>https://x.test/</loc></url></urlset>';
const LLMS = '# Acme\n\n> Summary.\n\n## Docs\n\n- [Start](/start.md)\n- [API](/api.md)\n';
const OPENAPI = { openapi: '3.1.0', info: { title: 'Acme', version: '1' }, paths: { '/items': {} } };
const API = { profile: 'api' };

test('sitemap passes at the default path', async () => {
  assert.equal(await statusOf({ '/robots.txt': text('User-agent: *\nAllow: /'), '/sitemap.xml': text(SITEMAP) }, 'discover.sitemap'), 'pass');
});

test('sitemap follows the Sitemap line of robots.txt and ignores the default path', async () => {
  const routes = { '/robots.txt': text('User-agent: *\nSitemap: /maps/main.xml'), '/maps/main.xml': text(SITEMAP) };
  const { status, site } = await runCheckOn(routes, 'discover.sitemap');
  assert.equal(status, 'pass');
  assert.equal(site.hitsFor('/sitemap.xml').length, 0);
});

test('sitemap fails for a missing file and for a file with no location', async () => {
  assert.equal(await statusOf({}, 'discover.sitemap'), 'fail');
  assert.equal(await statusOf({ '/sitemap.xml': text('<urlset></urlset>') }, 'discover.sitemap'), 'fail');
  assert.equal(await statusOf({ '/sitemap.xml': html('<html>Not found</html>') }, 'discover.sitemap'), 'fail');
});

test('sitemap is not applicable to the api profile and makes no request', async () => {
  const { status, site } = await runCheckOn({}, 'discover.sitemap', API);
  assert.equal(status, 'not_applicable');
  assert.equal(site.hits.length, 0);
});

test('sitemap is not assessed when the server fails', async () => {
  const { result } = await runCheckOn({ '/robots.txt': { status: 503 } }, 'discover.sitemap');
  assert.deepEqual([result.status, result.reason], ['not_assessed', 'server_error']);
});

test('llms.txt passes with a title and links', async () => {
  assert.equal(await statusOf({ '/llms.txt': text(LLMS) }, 'discover.llms-txt'), 'pass');
});

test('llms.txt is partial with no links or with an HTML content type', async () => {
  assert.equal(await statusOf({ '/llms.txt': text('# Acme\n\n> Summary.') }, 'discover.llms-txt'), 'partial');
  assert.equal(await statusOf({ '/llms.txt': html(LLMS) }, 'discover.llms-txt'), 'partial');
});

test('llms.txt fails when it is missing, has no title, or is an HTML page', async () => {
  assert.equal(await statusOf({}, 'discover.llms-txt'), 'fail');
  assert.equal(await statusOf({ '/llms.txt': text('Welcome\n[a](/a.md)') }, 'discover.llms-txt'), 'fail');
  assert.equal(await statusOf({ '/llms.txt': html('<!doctype html><html># Acme</html>') }, 'discover.llms-txt'), 'fail');
});

const goodLlms = { '/llms.txt': text(LLMS), '/start.md': text('# Start'), '/api.md': text('# API') };

test('llms.txt quality passes when the file is small, links to Markdown, and the links resolve', async () => {
  assert.equal(await statusOf(goodLlms, 'discover.llms-txt-quality'), 'pass');
});

test('llms.txt quality is partial when one criterion fails', async () => {
  assert.equal(await statusOf({ ...goodLlms, '/api.md': { status: 404 } }, 'discover.llms-txt-quality'), 'partial');
  const large = { ...goodLlms, '/llms.txt': text(`${LLMS}${'x'.repeat(50000)}`) };
  assert.equal(await statusOf(large, 'discover.llms-txt-quality'), 'partial');
});

test('llms.txt quality fails when two criteria fail', async () => {
  const routes = { '/llms.txt': text('# Acme\n\n- [Start](/start.html)\n- [API](/api.html)\n') };
  assert.equal(await statusOf(routes, 'discover.llms-txt-quality'), 'fail');
});

test('llms.txt quality accepts exactly 50,000 characters', async () => {
  const padded = LLMS + 'x'.repeat(50000 - LLMS.length);
  assert.equal(await statusOf({ ...goodLlms, '/llms.txt': text(padded) }, 'discover.llms-txt-quality'), 'pass');
});

test('llms.txt quality is blocked by a missing llms.txt', async () => {
  const { result } = await runCheckOn({}, 'discover.llms-txt-quality');
  assert.deepEqual([result.status, result.blockedBy], ['fail', 'discover.llms-txt']);
});

test('link headers pass for an agent relation or a Markdown alternate', async () => {
  const withLink = (link) => ({ '/': html('<html></html>', { link }) });
  assert.equal(await statusOf(withLink('</.well-known/api-catalog>; rel="api-catalog"'), 'discover.link-headers'), 'pass');
  assert.equal(await statusOf(withLink('</index.md>; rel="alternate"; type="text/markdown"'), 'discover.link-headers'), 'pass');
});

test('link headers fail for other relations and for no header', async () => {
  const withLink = (link) => ({ '/': html('<html></html>', { link }) });
  assert.equal(await statusOf(withLink('</style.css>; rel="preload"'), 'discover.link-headers'), 'fail');
  assert.equal(await statusOf(withLink('</feed.xml>; rel="alternate"; type="application/rss+xml"'), 'discover.link-headers'), 'fail');
  assert.equal(await statusOf({ '/': html('<html></html>') }, 'discover.link-headers'), 'fail');
});

test('the API catalog passes with a linkset entry and fails with an empty linkset', async () => {
  const catalog = (linkset) => ({ '/.well-known/api-catalog': json({ linkset }) });
  assert.equal(await statusOf(catalog([{ anchor: 'https://x.test/v1' }]), 'discover.api-catalog', API), 'pass');
  assert.equal(await statusOf(catalog([]), 'discover.api-catalog', API), 'fail');
  assert.equal(await statusOf({}, 'discover.api-catalog', API), 'fail');
});

test('the API catalog request asks for the linkset media type', async () => {
  const { site } = await runCheckOn({}, 'discover.api-catalog', API);
  assert.match(site.hitsFor('/.well-known/api-catalog')[0].headers.accept, /application\/linkset\+json/);
});

test('the service-desc link passes from a header or from the page, when the target is an API description', async () => {
  const target = { '/spec.json': json(OPENAPI) };
  const header = { '/': html('<html></html>', { link: '</spec.json>; rel="service-desc"' }), ...target };
  const element = { '/': html('<html><head><link rel="service-desc" href="/spec.json"></head></html>'), ...target };
  assert.equal(await statusOf(header, 'discover.service-desc-link', API), 'pass');
  assert.equal(await statusOf(element, 'discover.service-desc-link', API), 'pass');
});

test('the service-desc link fails with no link or with a target that is not an API description', async () => {
  const broken = { '/': html('<html></html>', { link: '</spec.json>; rel="service-desc"' }), '/spec.json': json({ hello: 1 }) };
  assert.equal(await statusOf(broken, 'discover.service-desc-link', API), 'fail');
  assert.equal(await statusOf({ '/': html('<html></html>') }, 'discover.service-desc-link', API), 'fail');
});

test('the OpenAPI path passes for JSON and for YAML at a conventional path', async () => {
  assert.equal(await statusOf({ '/openapi.json': json(OPENAPI) }, 'discover.openapi-path', API), 'pass');
  assert.equal(await statusOf({ '/openapi.yaml': text('openapi: 3.0.3\npaths:\n  /a: {}\n') }, 'discover.openapi-path', API), 'pass');
  assert.equal(await statusOf({ '/v3/api-docs': json(OPENAPI) }, 'discover.openapi-path', API), 'pass');
});

test('the OpenAPI path fails for JSON that is not an API description', async () => {
  assert.equal(await statusOf({ '/openapi.json': json({ openapi: '3.1.0' }) }, 'discover.openapi-path', API), 'fail');
  assert.equal(await statusOf({}, 'discover.openapi-path', API), 'fail');
});

test('the OpenAPI path prefers a JSON document to a YAML document', async () => {
  const routes = { '/openapi.yaml': text('openapi: 3.0.3\npaths:\n  /a: {}\n'), '/swagger.json': json({ swagger: '2.0', paths: {} }) };
  const { result } = await runCheckOn(routes, 'discover.openapi-path', API);
  assert.match(result.summary, /swagger\.json/);
});

const card = { name: 'acme', version: '1.0.0', description: 'Acme MCP' };

test('the MCP Server Card passes at the recommended location and asks for its media type', async () => {
  const { status, site } = await runCheckOn({ '/mcp/server-card': json(card) }, 'discover.mcp-server-card');
  assert.equal(status, 'pass');
  assert.equal(site.hitsFor('/mcp/server-card')[0].headers.accept, 'application/mcp-server-card+json');
  assert.equal(await statusOf({ '/mcp/server-card': json({ serverInfo: { name: 'acme' } }) }, 'discover.mcp-server-card'), 'pass');
});

test('the MCP Server Card fails with no name and at the legacy path only', async () => {
  assert.equal(await statusOf({ '/mcp/server-card': json({ version: '1' }) }, 'discover.mcp-server-card'), 'fail');
  assert.equal(await statusOf({ '/.well-known/mcp.json': json(card) }, 'discover.mcp-server-card'), 'fail');
});

test('the legacy MCP path is reported when it exists', async () => {
  assert.equal(await statusOf({ '/.well-known/mcp/server-card.json': json(card) }, 'discover.mcp-well-known'), 'pass');
  assert.equal(await statusOf({}, 'discover.mcp-well-known'), 'fail');
});

const entry = { identifier: 'urn:air:x.test:mcp:acme', displayName: 'Acme', type: 'application/mcp-server-card+json', url: 'https://x.test/mcp/server-card' };

test('the agent catalog passes at the current path and at the predecessor path', async () => {
  assert.equal(await statusOf({ '/.well-known/ard.json': json({ entries: [entry] }) }, 'discover.ai-catalog'), 'pass');
  assert.equal(await statusOf({ '/.well-known/ai-catalog.json': json({ specVersion: '1.0', entries: [entry] }) }, 'discover.ai-catalog'), 'pass');
});

test('the agent catalog fails for no entries or for an entry with two locations', async () => {
  const catalog = (entries) => ({ '/.well-known/ard.json': json({ entries }) });
  assert.equal(await statusOf(catalog([]), 'discover.ai-catalog'), 'fail');
  assert.equal(await statusOf(catalog([{ ...entry, data: {} }]), 'discover.ai-catalog'), 'fail');
  assert.equal(await statusOf(catalog([{ ...entry, url: undefined }]), 'discover.ai-catalog'), 'fail');
  assert.equal(await statusOf(catalog([{ ...entry, identifier: undefined }]), 'discover.ai-catalog'), 'fail');
});

const SKILL = '---\nname: acme\ndescription: Use Acme.\n---\n# Acme\n';
const digestOf = (body) => `sha256:${createHash('sha256').update(body).digest('hex')}`;
const skillsIndex = (overrides = {}) => ({
  $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
  skills: [{ name: 'acme', type: 'skill-md', description: 'Use Acme.', url: 'acme/SKILL.md', digest: digestOf(SKILL), ...overrides }],
});
const skillsSite = (index) => ({ '/.well-known/agent-skills/index.json': json(index), '/.well-known/agent-skills/acme/SKILL.md': text(SKILL) });

test('the Agent Skills index passes with the current schema and a correct digest', async () => {
  assert.equal(await statusOf(skillsSite(skillsIndex()), 'discover.agent-skills'), 'pass');
});

test('the Agent Skills index is partial for a wrong digest, an old schema, or the legacy path', async () => {
  assert.equal(await statusOf(skillsSite(skillsIndex({ digest: `sha256:${'0'.repeat(64)}` })), 'discover.agent-skills'), 'partial');
  assert.equal(await statusOf(skillsSite({ skills: skillsIndex().skills }), 'discover.agent-skills'), 'partial');
  assert.equal(await statusOf({ '/.well-known/skills/index.json': json(skillsIndex()) }, 'discover.agent-skills'), 'partial');
});

test('the Agent Skills index fails when it is missing or empty', async () => {
  assert.equal(await statusOf({}, 'discover.agent-skills'), 'fail');
  assert.equal(await statusOf({ '/.well-known/agent-skills/index.json': json({ skills: [] }) }, 'discover.agent-skills'), 'fail');
});

test('the A2A agent card needs a name and the supported interfaces', async () => {
  const a2a = (value) => ({ '/.well-known/agent-card.json': json(value) });
  assert.equal(await statusOf(a2a({ name: 'Acme', supportedInterfaces: [] }), 'discover.a2a-agent-card'), 'pass');
  assert.equal(await statusOf(a2a({ name: 'Acme' }), 'discover.a2a-agent-card'), 'fail');
});

test('llms-full.txt is reported when it exists as text', async () => {
  assert.equal(await statusOf({ '/llms-full.txt': text('# All content') }, 'discover.llms-full-txt'), 'pass');
  assert.equal(await statusOf({ '/llms-full.txt': html('<!doctype html><html></html>') }, 'discover.llms-full-txt'), 'fail');
});
