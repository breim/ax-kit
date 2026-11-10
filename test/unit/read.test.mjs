import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formControlsOf } from '../../skills/ax-kit/scripts/lib/context/form-controls.mjs';
import { visibleTextOf } from '../../skills/ax-kit/scripts/lib/context/html.mjs';
import { CHECKS } from '../../skills/ax-kit/scripts/lib/registry.mjs';
import { runCheckOn, statusOf } from '../fixtures/run-check.mjs';
import { html, text } from '../fixtures/server.mjs';

const GATE = 'read.content-without-js';
const MEBIBYTE = 1024 * 1024;
const EMPTY_MOUNT = '<div id="root"></div>';
const NOSCRIPT = '<noscript>You need to enable JavaScript to run this app.</noscript>';
const NOISE = `<script>${'var a = "text";'.repeat(400)}</script><style>${'p { color: red; }'.repeat(400)}</style>`;

const page = (body, head = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const prose = (chars, extra = '') => page(`<p>${'x'.repeat(chars)}</p>${extra}`);
const site = (body) => ({ '/': html(body) });
const gateOf = (body) => statusOf(site(body), GATE);

test('the content gate changes from partial to pass at 600 visible characters', async () => {
  assert.deepEqual([visibleTextOf(prose(599)).length, visibleTextOf(prose(600)).length], [599, 600]);
  assert.equal(await gateOf(prose(599)), 'partial');
  assert.equal(await gateOf(prose(600)), 'pass');
});

test('the content gate fails below 200 visible characters only with a shell signal', async () => {
  assert.deepEqual([visibleTextOf(prose(199, EMPTY_MOUNT)).length, visibleTextOf(prose(200, EMPTY_MOUNT)).length], [199, 200]);
  assert.equal(await gateOf(prose(199, EMPTY_MOUNT)), 'fail');
  assert.equal(await gateOf(prose(200, EMPTY_MOUNT)), 'partial');
  assert.equal(await gateOf(prose(199, NOSCRIPT)), 'fail');
  assert.equal(await gateOf(prose(199)), 'partial');
  assert.equal(await gateOf(page('')), 'partial');
});

test('the content gate names the shell signal of an application shell', async () => {
  const shell = page(`${EMPTY_MOUNT}<script src="/app.js"></script>`, '<title>App</title>');
  const { result } = await runCheckOn(site(shell), GATE);
  assert.equal(result.status, 'fail');
  assert.match(result.summary, /3 characters of visible text: empty mount element #root\.$/);
});

test('script tags and style tags never change the result of the content gate', async () => {
  assert.equal(await gateOf(prose(199, EMPTY_MOUNT + NOISE)), 'fail');
  assert.equal(await gateOf(prose(199, NOISE)), 'partial');
  assert.equal(await gateOf(prose(599, NOISE)), 'partial');
  assert.equal(await gateOf(prose(600, NOISE)), 'pass');
});

test('a server-rendered page with content in the mount element passes the content gate', async () => {
  const rendered = (chars) => page(`<div id="root"><main><h1>Acme</h1><p>${'x'.repeat(chars)}</p></main></div>${NOSCRIPT}${NOISE}`);
  assert.equal(await gateOf(rendered(600)), 'pass');
  assert.equal(await gateOf(page(`<div id="root"><p>${'x'.repeat(150)}</p></div>`)), 'partial');
});

test('the content gate counts CJK text in characters', async () => {
  const cjk = (chars, extra = '') => page(`<p>${'語'.repeat(chars)}</p>${extra}`);
  assert.equal(await gateOf(cjk(600)), 'pass');
  assert.equal(await gateOf(cjk(599)), 'partial');
  assert.equal(await gateOf(cjk(200, EMPTY_MOUNT)), 'partial');
  assert.equal(await gateOf(cjk(199, EMPTY_MOUNT)), 'fail');
});

test('the content gate passes for an entry response that is not HTML', async () => {
  assert.equal(await statusOf({ '/': text('# Acme\n\nA short page.') }, GATE), 'pass');
});

test('the content gate does not fail for an error page', async () => {
  const blockedPage = { '/': { ...html(prose(20, EMPTY_MOUNT + NOSCRIPT)), status: 403 } };
  assert.equal(await statusOf(blockedPage, GATE), 'partial');
});

test('the content gate is a gate, has no result for a server error, and does not apply to an API', async () => {
  assert.deepEqual(CHECKS.filter((check) => check.gate && check.id.startsWith('read.')).map((check) => check.id), [GATE]);
  const failed = await runCheckOn({ '/': { status: 503 } }, GATE);
  assert.deepEqual([failed.result.status, failed.result.reason], ['not_assessed', 'server_error']);
  const api = await runCheckOn(site(prose(600)), GATE, { profile: 'api' });
  assert.deepEqual([api.status, api.site.hits.length], ['not_applicable', 0]);
});

const TITLE = '<title>Acme</title>';
const DESCRIPTION = '<meta name="description" content="Acme makes tools.">';
const documentWith = (head, htmlAttributes = '') => `<!doctype html><html${htmlAttributes}><head>${head}</head><body></body></html>`;
const metadataOf = (head, htmlAttributes) => statusOf(site(documentWith(head, htmlAttributes)), 'read.metadata');

test('metadata passes with a title, a description, and a language', async () => {
  assert.equal(await metadataOf(TITLE + DESCRIPTION, ' lang="en"'), 'pass');
});

test('metadata is partial with two items and fails with one item or none', async () => {
  assert.equal(await metadataOf(TITLE + DESCRIPTION), 'partial');
  assert.equal(await metadataOf(TITLE, ' lang="en"'), 'partial');
  assert.equal(await metadataOf(DESCRIPTION, ' lang="en"'), 'partial');
  assert.equal(await metadataOf(TITLE), 'fail');
  assert.equal(await metadataOf(''), 'fail');
});

test('metadata does not count an empty value, and names the missing items', async () => {
  const empty = '<title> </title><meta name="description" content=" ">';
  const { result } = await runCheckOn(site(documentWith(empty, ' lang="en"')), 'read.metadata');
  assert.equal(result.status, 'fail');
  assert.equal(result.summary, 'The entry page does not have a title or a meta description.');
});

const headingsOf = (body) => statusOf(site(page(body)), 'read.headings');

test('headings pass with one h1 and no skipped level', async () => {
  assert.equal(await headingsOf('<h1>A</h1><h2>B</h2><h3>C</h3><h4>D</h4><h2>E</h2>'), 'pass');
  assert.equal(await headingsOf('<h1>A</h1>'), 'pass');
});

test('headings are partial when one rule fails', async () => {
  assert.equal(await headingsOf('<h1>A</h1><h2>B</h2><h1>C</h1>'), 'partial');
  assert.equal(await headingsOf('<h1>A</h1><h2>B</h2><h4>C</h4>'), 'partial');
  assert.equal(await headingsOf('<h1>A</h1><h3>B</h3>'), 'partial');
});

test('headings fail with no h1, and when the two rules fail', async () => {
  assert.equal(await headingsOf('<h2>A</h2><h3>B</h3>'), 'fail');
  assert.equal(await headingsOf('<p>No headings.</p>'), 'fail');
  assert.equal(await headingsOf('<h1>A</h1><h1>B</h1><h3>C</h3>'), 'fail');
});

const jsonLd = (value) => `<script type="application/ld+json">${typeof value === 'string' ? value : JSON.stringify(value)}</script>`;
const OPEN_GRAPH = '<meta property="og:title" content="Acme"><meta property="og:type" content="website">';
const structuredDataOf = (head) => statusOf(site(page('', head)), 'read.structured-data');

test('structured data passes for a typed item, a list of items, a graph, and a list of types', async () => {
  assert.equal(await structuredDataOf(jsonLd({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' })), 'pass');
  assert.equal(await structuredDataOf(jsonLd([{ name: 'No type' }, { '@type': 'WebSite' }])), 'pass');
  assert.equal(await structuredDataOf(jsonLd({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Product' }] })), 'pass');
  assert.equal(await structuredDataOf(jsonLd({ '@type': ['Product', 'Thing'] })), 'pass');
  assert.equal(await structuredDataOf(jsonLd('{ broken') + jsonLd({ '@type': 'Organization' })), 'pass');
});

test('structured data is partial for JSON-LD with no type, for invalid JSON-LD, and for Open Graph tags only', async () => {
  assert.equal(await structuredDataOf(jsonLd({ '@context': 'https://schema.org', name: 'Acme' })), 'partial');
  assert.equal(await structuredDataOf(jsonLd({ '@type': '' })), 'partial');
  assert.equal(await structuredDataOf(jsonLd({ '@graph': 'Product' })), 'partial');
  assert.equal(await structuredDataOf(jsonLd('{ "@type": "Organization", }')), 'partial');
  assert.equal(await structuredDataOf(jsonLd('"Organization"')), 'partial');
  assert.equal(await structuredDataOf(OPEN_GRAPH), 'partial');
});

test('structured data fails with no JSON-LD and with one Open Graph tag only', async () => {
  assert.equal(await structuredDataOf(''), 'fail');
  assert.equal(await structuredDataOf('<meta property="og:title" content="Acme">'), 'fail');
  assert.equal(await structuredDataOf('<meta property="og:type" content="website">'), 'fail');
});

const SKELETON = page('<p></p>');
const pageOfBytes = (bytes) => SKELETON.replace('<p></p>', `<p>${'a'.repeat(bytes - SKELETON.length)}</p>`);
const weightOf = (body) => statusOf(site(body), 'read.page-weight');

test('page weight changes from pass to partial above 1 MB', async () => {
  assert.equal(await weightOf(pageOfBytes(MEBIBYTE)), 'pass');
  assert.equal(await weightOf(pageOfBytes(MEBIBYTE + 1)), 'partial');
});

test('page weight fails when the scanner stops at 2 MB', async () => {
  assert.equal(await weightOf(pageOfBytes(2 * MEBIBYTE)), 'partial');
  assert.equal(await weightOf(pageOfBytes(2 * MEBIBYTE + 1)), 'fail');
});

test('page weight counts bytes, not characters', async () => {
  const cjk = page(`<p>${'語'.repeat(400000)}</p>`);
  assert.ok(cjk.length < MEBIBYTE);
  const { result } = await runCheckOn(site(cjk), 'read.page-weight');
  assert.equal(result.status, 'partial');
  assert.match(result.summary, /^The entry page is 1172 KB/);
});

const NAMED_INPUT = '<input type="text" aria-label="Name">';
const UNNAMED_INPUT = '<input type="text" placeholder="Name">';
const form = (named, unnamed) => page(NAMED_INPUT.repeat(named) + UNNAMED_INPUT.repeat(unnamed));
const namesOf = (body) => statusOf(site(body), 'read.accessible-names');

test('accessible names pass at 90%, are partial from 50%, and fail below 50%', async () => {
  assert.equal(await namesOf(form(9, 1)), 'pass');
  assert.equal(await namesOf(form(89, 11)), 'partial');
  assert.equal(await namesOf(form(5, 5)), 'partial');
  assert.equal(await namesOf(form(49, 51)), 'fail');
  assert.equal(await namesOf(form(0, 1)), 'fail');
});

test('accessible names pass for a page with no form control', async () => {
  assert.equal(await namesOf(page('<p>No form.</p><input type="hidden" name="token"><input type="submit">')), 'pass');
  assert.equal(await statusOf({ '/': text('<input type="text">') }, 'read.accessible-names'), 'pass');
});

const namedFlags = (markup) => formControlsOf(markup).map((control) => control.named);

test('a form control gets a name from a label, an ARIA attribute, or a title', () => {
  assert.deepEqual(namedFlags('<label for="email">Email</label><input id="email">'), [true]);
  assert.deepEqual(namedFlags('<label>Email <input></label>'), [true]);
  assert.deepEqual(namedFlags('<input aria-label="Email">'), [true]);
  assert.deepEqual(namedFlags('<span id="hint">Email</span><input aria-labelledby="hint">'), [true]);
  assert.deepEqual(namedFlags('<select title="Country"><option>BR</option></select>'), [true]);
  assert.deepEqual(namedFlags("<textarea aria-label='Message'></textarea>"), [true]);
});

test('a form control has no name from a placeholder, an empty attribute, or a label for a different control', () => {
  assert.deepEqual(namedFlags('<input placeholder="Email">'), [false]);
  assert.deepEqual(namedFlags('<input aria-label="" title=" ">'), [false]);
  assert.deepEqual(namedFlags('<input title>'), [false]);
  assert.deepEqual(namedFlags('<label for="email">Email</label><input id="phone"><input>'), [false, false]);
  assert.deepEqual(namedFlags('<label for="phone">Phone <input id="email"></label>'), [false]);
  assert.deepEqual(namedFlags('<label for="email"></label><input id="email"><label><input></label>'), [false, false]);
  assert.deepEqual(namedFlags('<label>Email</label><input>'), [false]);
});

test('a button gets a name from its text or from the text alternative of its content', () => {
  assert.deepEqual(namedFlags('<button>Save</button>'), [true]);
  assert.deepEqual(namedFlags('<button><img src="/x.svg" alt="Close"></button>'), [true]);
  assert.deepEqual(namedFlags('<button><svg><title>Menu</title></svg></button>'), [true]);
  assert.deepEqual(namedFlags('<button><svg><path d="M0 0"/></svg></button>'), [false]);
  assert.deepEqual(namedFlags('<button><img src="/x.svg" alt=""></button>'), [false]);
  assert.deepEqual(namedFlags('<button title="Close"><i class="icon"></i></button>'), [true]);
});

test('the form control parser counts each control one time and ignores the types with a built-in name', () => {
  const types = ['hidden', 'submit', 'button', 'image', 'reset', 'HIDDEN'].map((type) => `<input type="${type}">`).join('');
  assert.deepEqual(formControlsOf(types), []);
  const wrapped = formControlsOf('<label>Email <input aria-label="Email" title="Email"></label>');
  assert.deepEqual(wrapped, [{ tag: 'input', named: true }]);
  const tags = formControlsOf('<INPUT type="checkbox"><select></select><textarea></textarea><button></button>').map((control) => control.tag);
  assert.deepEqual(tags, ['input', 'select', 'textarea', 'button']);
});

test('the form control parser ignores markup that the browser does not render', () => {
  const hidden = '<script>const field = "<input type=text>";</script><!-- <select></select> --><template><textarea></textarea></template>';
  assert.deepEqual(formControlsOf(hidden), []);
  assert.deepEqual(formControlsOf('<style>input { color: red; }</style><noscript><button></button></noscript>'), []);
  assert.deepEqual(formControlsOf('<button>Unclosed <input'), []);
});

test('the pricing check is a review check with a rubric, and it applies to a product that has prices', async () => {
  const pricing = CHECKS.find((check) => check.id === 'read.pricing');
  assert.deepEqual([pricing.evidence, pricing.tier, pricing.playbook], ['judged', 'recommended', 'structured-data']);
  assert.deepEqual(pricing.profiles, ['api', 'webapp', 'commerce']);
  const reviewed = await runCheckOn({}, 'read.pricing', { profile: 'commerce' });
  assert.deepEqual([reviewed.result.status, reviewed.result.reason, reviewed.site.hits.length], ['not_assessed', 'not_reviewed', 0]);
  assert.equal(await statusOf({}, 'read.pricing', { profile: 'content' }), 'not_applicable');
});
