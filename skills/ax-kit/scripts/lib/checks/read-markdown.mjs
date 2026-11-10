import { loadEntryDoc } from '../context/html.mjs';
import { loadMarkdownFile, loadMarkdownVersion, loadNegotiatedMarkdown } from '../context/markdown.mjs';
import { PAGE_PROFILES } from '../model.mjs';
import { blocked, byRatio, fail, pass, seen } from './result.mjs';

const PARITY = { passAt: 0.5, partialAt: 0.25 };

async function runMarkdownNegotiation(ctx) {
  const { snapshot, found } = await loadNegotiatedMarkdown(ctx);
  const contentType = snapshot.headers['content-type'] ?? 'none';
  const evidence = [seen(snapshot, `Content-Type: ${contentType}`)];
  return found
    ? pass('The server returns Markdown for a request with Accept: text/markdown.', evidence)
    : fail('The server does not return Markdown for a request with Accept: text/markdown.', evidence);
}

async function runMarkdownUrl(ctx) {
  const file = await loadMarkdownFile(ctx);
  const evidence = file.snapshots.map((snapshot) => seen(snapshot, snapshot === file.snapshot ? 'Markdown file' : 'no Markdown file'));
  return file.found
    ? pass(`A Markdown file for the entry page is at ${new URL(file.snapshot.url).pathname}.`, evidence)
    : fail('No Markdown file for the entry page is at a .md URL.', evidence);
}

const variesOnAccept = (vary) =>
  vary
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .some((name) => name === 'accept' || name === '*');

async function runVaryAccept(ctx) {
  const { snapshot, found } = await loadNegotiatedMarkdown(ctx);
  if (!found) return blocked('read.markdown-negotiation', 'The server does not negotiate Markdown, so the Vary header has no result.');
  const vary = snapshot.headers.vary ?? '';
  const evidence = [seen(snapshot, vary ? `Vary: ${vary}` : 'no Vary header')];
  return variesOnAccept(vary)
    ? pass('The Markdown response has a Vary header that contains Accept.', evidence)
    : fail('The Markdown response has no Vary header that contains Accept, so a cache can give Markdown to a browser.', evidence);
}

async function runMarkdownParity(ctx) {
  const markdown = await loadMarkdownVersion(ctx);
  if (!markdown) return blocked('read.markdown', 'The entry page has no Markdown version, so the comparison with the HTML has no result.');
  const { visibleText } = await loadEntryDoc(ctx);
  const markdownChars = markdown.body.trim().length;
  const evidence = [seen(markdown, `${markdownChars} Markdown characters, ${visibleText.length} visible HTML characters`)];
  if (visibleText.length === 0) return pass('The HTML page has no visible text, so the Markdown version is the readable version.', evidence);
  const ratio = markdownChars / visibleText.length;
  const summary = `The Markdown version has ${Math.floor(ratio * 100)}% of the length of the visible text of the HTML page.`;
  return byRatio(ratio, summary, evidence, PARITY);
}

const SPEC = {
  accept: 'https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.1',
  vary: 'https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.5',
  llmsTxt: 'https://llmstxt.org/',
};

export const markdownGroups = [
  {
    id: 'read.markdown',
    title: 'An agent can get a Markdown version of a page',
    why: 'Markdown gives an agent the content with no navigation, scripts, or styles, so the agent uses fewer tokens.',
    tier: 'recommended',
    stability: 'stable',
    profiles: PAGE_PROFILES,
    playbook: 'markdown-for-agents',
  },
];

export const markdownChecks = [
  {
    id: 'read.markdown-negotiation',
    title: 'The server returns Markdown for a request with Accept: text/markdown',
    group: 'read.markdown',
    stability: 'stable',
    evidence: 'measured',
    spec: SPEC.accept,
    run: runMarkdownNegotiation,
  },
  {
    id: 'read.markdown-url',
    title: 'A Markdown file for the page is at a .md URL',
    group: 'read.markdown',
    stability: 'stable',
    evidence: 'measured',
    spec: SPEC.llmsTxt,
    run: runMarkdownUrl,
  },
  {
    id: 'read.vary-accept',
    title: 'The Markdown response has a Vary header that contains Accept',
    why: 'A cache that ignores the Accept header can give Markdown to a browser, or HTML to an agent that asked for Markdown.',
    tier: 'optional',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.vary,
    playbook: 'markdown-for-agents',
    run: runVaryAccept,
  },
  {
    id: 'read.markdown-parity',
    title: 'The Markdown version has the content of the HTML page',
    why: 'An agent that gets a short stub in Markdown does not know that the HTML page has more content.',
    tier: 'optional',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.llmsTxt,
    playbook: 'markdown-for-agents',
    run: runMarkdownParity,
  },
];
