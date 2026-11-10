import { Buffer } from 'node:buffer';

import { formControlsOf } from '../context/form-controls.mjs';
import { loadEntryDoc } from '../context/html.mjs';
import { isJsonObject } from '../json.mjs';
import { LIMITS, PAGE_PROFILES } from '../model.mjs';
import { markdownChecks, markdownGroups } from './read-markdown.mjs';
import { byCount, byRatio, fail, partial, pass, seen } from './result.mjs';

const SHELL_TEXT_CHARS = 200;
const FULL_TEXT_CHARS = 600;
const PAGE_WEIGHT_BYTES = LIMITS.bodyBytes / 2;
const TYPES_IN_SUMMARY = 5;

const isSuccess = (status) => status >= 200 && status < 300;
const asList = (value) => (Array.isArray(value) ? value : [value]);
const kilobytes = (bytes) => Math.ceil(bytes / 1024);

async function runContentWithoutJs(ctx) {
  const doc = await loadEntryDoc(ctx);
  if (!doc.isHtml) return pass('The entry response is not HTML, so an agent can read it with no JavaScript.', [seen(doc.snapshot, 'not HTML')]);
  const chars = doc.visibleText.length;
  const signals = doc.shellSignals.join(', ');
  const evidence = [seen(doc.snapshot, `${chars} visible characters, ${signals || 'no application shell signal'}`)];
  const isShell = chars < SHELL_TEXT_CHARS && signals !== '' && isSuccess(doc.snapshot.status);
  if (isShell) return fail(`The entry HTML is an application shell with ${chars} characters of visible text: ${signals}.`, evidence);
  if (chars < FULL_TEXT_CHARS) return partial(`The entry HTML has only ${chars} characters of visible text with no JavaScript.`, evidence);
  return pass(`The entry HTML has ${chars} characters of visible text with no JavaScript.`, evidence);
}

async function runMetadata(ctx) {
  const doc = await loadEntryDoc(ctx);
  const items = { 'a title': doc.title, 'a meta description': doc.meta.description, 'a lang attribute on <html>': doc.lang };
  const missing = Object.keys(items).filter((name) => (items[name] ?? '').trim() === '');
  const summary =
    missing.length === 0
      ? 'The entry page has a title, a meta description, and a language.'
      : `The entry page does not have ${missing.join(' or ')}.`;
  return byCount(3 - missing.length, 3, summary, [seen(doc.snapshot, `${3 - missing.length} of 3 metadata items`)]);
}

const hasLevelJump = (headings) => headings.some((heading, index) => index > 0 && heading.level > headings[index - 1].level + 1);

async function runHeadings(ctx) {
  const doc = await loadEntryDoc(ctx);
  const h1Count = doc.headings.filter((heading) => heading.level === 1).length;
  const evidence = [seen(doc.snapshot, `${h1Count} <h1> in ${doc.headings.length} headings`)];
  if (h1Count === 0) return fail('The entry page has no <h1>.', evidence);
  const problems = [];
  if (h1Count > 1) problems.push(`has ${h1Count} <h1> elements`);
  if (hasLevelJump(doc.headings)) problems.push('has a heading that jumps down by more than one level');
  const summary =
    problems.length === 0 ? 'The entry page has one <h1> and its headings are in order.' : `The entry page ${problems.join(' and ')}.`;
  return byCount(2 - problems.length, 2, summary, evidence);
}

const nodesOf = (item) =>
  asList(item)
    .filter(isJsonObject)
    .flatMap((node) => [node, ...asList(node['@graph'] ?? []).filter(isJsonObject)]);

const typesOf = (node) => asList(node['@type'] ?? []).filter((type) => typeof type === 'string' && type !== '');

async function runStructuredData(ctx) {
  const doc = await loadEntryDoc(ctx);
  const types = [...new Set(doc.jsonLd.items.flatMap(nodesOf).flatMap(typesOf))];
  const blocks = doc.jsonLd.items.length + doc.jsonLd.invalid;
  const evidence = [seen(doc.snapshot, `${blocks} JSON-LD blocks, ${types.length} types`)];
  if (types.length > 0) return pass(`The entry page has JSON-LD with these types: ${types.slice(0, TYPES_IN_SUMMARY).join(', ')}.`, evidence);
  if (blocks > 0) return partial('The entry page has JSON-LD, but no item is valid JSON with an @type.', evidence);
  if (doc.meta['og:title'] && doc.meta['og:type']) return partial('The entry page has Open Graph tags, but no JSON-LD.', evidence);
  return fail('The entry page has no JSON-LD and no Open Graph tags.', evidence);
}

async function runPageWeight(ctx) {
  const { snapshot } = await loadEntryDoc(ctx);
  const bytes = Buffer.byteLength(snapshot.body);
  const evidence = [seen(snapshot, snapshot.truncated ? `more than ${LIMITS.bodyBytes} bytes` : `${bytes} bytes`)];
  if (snapshot.truncated) return fail('The entry page is larger than 2 MB, so the scanner read only a part of it.', evidence);
  if (bytes > PAGE_WEIGHT_BYTES) return partial(`The entry page is ${kilobytes(bytes)} KB, which is more than 1 MB.`, evidence);
  return pass(`The entry page is ${kilobytes(bytes)} KB.`, evidence);
}

async function runAccessibleNames(ctx) {
  const doc = await loadEntryDoc(ctx);
  const controls = formControlsOf(doc.isHtml ? doc.snapshot.body : '');
  const named = controls.filter((control) => control.named).length;
  const evidence = [seen(doc.snapshot, `${named} of ${controls.length} form controls have a name`)];
  if (controls.length === 0) return pass('The entry page has no form control.', evidence);
  const summary = `${named} of the ${controls.length} form controls on the entry page have an accessible name.`;
  return byRatio(named / controls.length, summary, evidence);
}

const SPEC = {
  html: 'https://html.spec.whatwg.org/multipage/',
  metadata: 'https://html.spec.whatwg.org/multipage/semantics.html',
  headings: 'https://www.w3.org/WAI/tutorials/page-structure/headings/',
  jsonLd: 'https://www.w3.org/TR/json-ld11/',
  http: 'https://www.rfc-editor.org/rfc/rfc9110',
  accessibleName: 'https://www.w3.org/TR/html-aam-1.0/#accname-computation',
};

export const groups = [...markdownGroups];

export const checks = [
  {
    id: 'read.content-without-js',
    title: 'The entry page has its content in the HTML, with no JavaScript',
    why: 'Most agents read the HTML response and do not run JavaScript, so an application shell is an empty page for them.',
    tier: 'essential',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    gate: true,
    spec: SPEC.html,
    playbook: 'server-rendering',
    run: runContentWithoutJs,
  },
  ...markdownChecks,
  {
    id: 'read.metadata',
    title: 'The entry page has a title, a meta description, and a language',
    why: 'An agent uses the title, the description, and the language to decide if a page is relevant before it reads the body.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.metadata,
    playbook: 'structured-data',
    run: runMetadata,
  },
  {
    id: 'read.headings',
    title: 'The entry page has one h1 heading and no skipped heading level',
    why: 'An agent uses the headings to find the section that answers a question, and to divide a long page.',
    tier: 'optional',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.headings,
    playbook: 'structured-data',
    run: runHeadings,
  },
  {
    id: 'read.structured-data',
    title: 'The entry page has JSON-LD structured data with a type',
    why: 'Structured data gives an agent facts, for example a price or the name of an organization, with no guess from the layout.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.jsonLd,
    playbook: 'structured-data',
    run: runStructuredData,
  },
  {
    id: 'read.page-weight',
    title: 'The HTML of the entry page is 1 MB or smaller',
    why: 'A large page fills the context of an agent, and a client with a size limit reads only a part of the page.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.http,
    playbook: 'server-rendering',
    run: runPageWeight,
  },
  {
    id: 'read.accessible-names',
    title: 'The form controls of the entry page have accessible names',
    why: 'An agent that drives a browser reads the accessibility tree, and a control with no name there has no meaning for the agent.',
    tier: 'optional',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.accessibleName,
    playbook: 'structured-data',
    run: runAccessibleNames,
  },
  {
    id: 'read.pricing',
    title: 'An agent can read the prices and the plan limits with no JavaScript and no login',
    why: 'An agent that compares products for a person needs the real prices, and it cannot log in or speak to a sales team.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'judged',
    profiles: ['api', 'webapp', 'commerce'],
    playbook: 'structured-data',
    rubric: {
      pass: 'A public first-party page gives each price and each plan limit as text or structured data in the first HTML response. No login and no "contact sales" step hides a price. An agent can compare the plans from that page.',
      partial: 'The prices are public, but an agent cannot get all of them from the first HTML response. Examples: JavaScript loads the prices, an image shows them, the plan limits are absent, or one plan has no public price.',
      fail: 'No public first-party page gives the prices. The prices are behind a login or a "contact sales" form, or only third-party sites show them.',
      evidence: 'The URL of the pricing page. The price and the limits of each plan, as read from the HTML with no JavaScript or from the JSON-LD. Each plan with no public price.',
    },
  },
];
