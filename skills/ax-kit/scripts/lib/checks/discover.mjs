import { loadApiCatalog, loadConventionalDescription, loadServiceDescLinks, readDescription } from '../context/api-description.mjs';
import { parseLinkHeader } from '../context/link-header.mjs';
import { loadLlmsTxt } from '../context/llms-txt.mjs';
import { loadRobots } from '../context/robots.mjs';
import { ALL_PROFILES, API_PROFILES, PAGE_PROFILES } from '../model.mjs';
import { watchChecks, watchGroups } from './discover-watch.mjs';
import { blocked, byCount, fail, partial, pass, seen } from './result.mjs';

const LLMS_TXT_MAX_CHARS = 50000;
const LLMS_TXT_LINK_SAMPLE = 5;
const DEFAULT_SITEMAP_PATHS = ['/sitemap.xml', '/sitemap_index.xml'];
const AGENT_LINK_RELATIONS = ['api-catalog', 'service-desc', 'service-doc', 'service-meta', 'describedby', 'ard', 'ai-catalog'];

const isSitemap = (snapshot) =>
  snapshot.status === 200 && /<(urlset|sitemapindex)\b/i.test(snapshot.body) && /<loc>\s*\S/i.test(snapshot.body);

async function sitemapUrls(ctx) {
  const robots = await loadRobots(ctx);
  return robots.sitemaps.length > 0 ? robots.sitemaps.slice(0, 2) : DEFAULT_SITEMAP_PATHS.map(ctx.at);
}

async function runSitemap(ctx) {
  const evidence = [];
  for (const url of await sitemapUrls(ctx)) {
    const snapshot = await ctx.get(url);
    evidence.push(seen(snapshot, isSitemap(snapshot) ? 'valid XML sitemap' : 'no XML sitemap'));
    if (isSitemap(snapshot)) return pass('An XML sitemap lists the pages of the site.', evidence);
  }
  return fail('No XML sitemap was found in robots.txt or at the default paths.', evidence);
}

async function runLlmsTxt(ctx) {
  const llms = await loadLlmsTxt(ctx);
  const evidence = [seen(llms.snapshot, llms.title ? `title "${llms.title}", ${llms.links.length} links` : 'no H1 title')];
  if (!llms.found || llms.looksLikeHtml) return fail('No llms.txt file is at the site root.', evidence);
  if (!llms.title) return fail('llms.txt does not start with an H1 title.', evidence);
  if (llms.links.length === 0) return partial('llms.txt has a title but no links.', evidence);
  if (/html/i.test(llms.snapshot.headers['content-type'] ?? '')) {
    return partial('llms.txt is served with an HTML content type.', evidence);
  }
  return pass(`llms.txt has a title and ${llms.links.length} links.`, evidence);
}

async function sampledLinksResolve(ctx, llms) {
  const sample = llms.links.slice(0, LLMS_TXT_LINK_SAMPLE);
  const snapshots = await Promise.all(sample.map((link) => ctx.get(new URL(link.url, llms.snapshot.finalUrl).href)));
  return { resolved: sample.length > 0 && snapshots.every((snapshot) => snapshot.status === 200), snapshots };
}

async function runLlmsTxtQuality(ctx) {
  const llms = await loadLlmsTxt(ctx);
  if (!llms.found || !llms.title) return blocked('discover.llms-txt', 'llms.txt is missing, so its quality has no result.');
  const links = await sampledLinksResolve(ctx, llms);
  const criteria = {
    'size is within 50,000 characters': llms.chars <= LLMS_TXT_MAX_CHARS,
    'half or more of the links point to Markdown': llms.links.length > 0 && llms.markdownLinks.length * 2 >= llms.links.length,
    'the sampled links resolve': links.resolved,
  };
  const failed = Object.keys(criteria).filter((name) => !criteria[name]);
  const summary = failed.length === 0 ? 'llms.txt is small, links to Markdown, and its links resolve.' : `Not met: ${failed.join('; ')}.`;
  const evidence = links.snapshots.map((snapshot) => seen(snapshot, snapshot.status === 200 ? 'resolves' : 'broken link'));
  return byCount(Object.keys(criteria).length - failed.length, Object.keys(criteria).length, summary, evidence);
}

const isAgentLink = (link) =>
  link.rel.some((rel) => AGENT_LINK_RELATIONS.includes(rel)) || (link.rel.includes('alternate') && /markdown/i.test(link.type));

async function runLinkHeaders(ctx) {
  const entry = await ctx.get(ctx.entryUrl);
  const useful = parseLinkHeader(entry.headers.link).filter(isAgentLink);
  const relations = [...new Set(useful.flatMap((link) => link.rel))].join(', ');
  if (useful.length === 0) return fail('The entry response has no Link header that helps an agent.', [seen(entry, 'no agent relation')]);
  return pass(`The entry response links to agent resources: ${relations}.`, [seen(entry, relations)]);
}

async function runApiCatalog(ctx) {
  const catalog = await loadApiCatalog(ctx);
  const evidence = [seen(catalog.snapshot, `${catalog.entries.length} linkset entries`)];
  if (catalog.entries.length === 0) return fail('No RFC 9727 API catalog is at /.well-known/api-catalog.', evidence);
  return pass(`The API catalog lists ${catalog.entries.length} API entries.`, evidence);
}

async function runServiceDescLink(ctx) {
  const [href] = await loadServiceDescLinks(ctx);
  if (!href) return fail('The entry page has no service-desc link.');
  const snapshot = await ctx.get(new URL(href, ctx.entryUrl).href);
  const evidence = [seen(snapshot, readDescription(snapshot) ? 'API description' : 'not an API description')];
  return readDescription(snapshot)
    ? pass('A service-desc link points to the API description.', evidence)
    : fail('The service-desc link does not point to an API description.', evidence);
}

async function runOpenapiPath(ctx) {
  const description = await loadConventionalDescription(ctx);
  if (!description) return fail('No OpenAPI document is at a conventional path.');
  return pass(`An OpenAPI document is at ${new URL(description.url).pathname}.`, [seen(description.snapshot, description.format)]);
}

const SPEC = {
  sitemap: 'https://www.sitemaps.org/protocol.html',
  llmsTxt: 'https://llmstxt.org/',
  linkHeader: 'https://www.rfc-editor.org/rfc/rfc8288',
  apiCatalog: 'https://www.rfc-editor.org/rfc/rfc9727',
  serviceDesc: 'https://www.rfc-editor.org/rfc/rfc8631',
  openapi: 'https://spec.openapis.org/oas/latest.html',
};

export const groups = [
  {
    id: 'discover.api-description',
    title: 'An agent can find a machine-readable description of the API',
    why: 'An agent cannot call an API that it cannot find and read without a human.',
    tier: 'essential',
    stability: 'stable',
    profiles: API_PROFILES,
    playbook: 'api-catalog',
  },
  ...watchGroups,
];

export const checks = [
  {
    id: 'discover.sitemap',
    title: 'An XML sitemap lists the pages',
    why: 'A sitemap gives an agent the full list of pages in one request.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'measured',
    profiles: PAGE_PROFILES,
    spec: SPEC.sitemap,
    playbook: 'sitemap-and-links',
    run: runSitemap,
  },
  {
    id: 'discover.llms-txt',
    title: 'llms.txt gives a curated map of the site',
    why: 'One small file tells an agent what the site is and where the important pages are.',
    tier: 'recommended',
    stability: 'stable',
    evidence: 'measured',
    profiles: ALL_PROFILES,
    spec: SPEC.llmsTxt,
    playbook: 'llms-txt',
    run: runLlmsTxt,
  },
  {
    id: 'discover.llms-txt-quality',
    title: 'llms.txt is small, links to Markdown, and has no broken links',
    why: 'A large file or a broken link uses the context of the agent and gives nothing back.',
    tier: 'optional',
    stability: 'stable',
    evidence: 'measured',
    profiles: ALL_PROFILES,
    spec: SPEC.llmsTxt,
    playbook: 'llms-txt',
    run: runLlmsTxtQuality,
  },
  {
    id: 'discover.link-headers',
    title: 'Link headers point to agent resources',
    why: 'An agent reads response headers before it reads a page, so a Link header is the cheapest pointer.',
    tier: 'optional',
    stability: 'stable',
    evidence: 'measured',
    profiles: ALL_PROFILES,
    spec: SPEC.linkHeader,
    playbook: 'sitemap-and-links',
    run: runLinkHeaders,
  },
  {
    id: 'discover.api-catalog',
    title: 'An RFC 9727 API catalog is published',
    group: 'discover.api-description',
    stability: 'stable',
    evidence: 'measured',
    spec: SPEC.apiCatalog,
    run: runApiCatalog,
  },
  {
    id: 'discover.service-desc-link',
    title: 'A service-desc link points to the API description',
    group: 'discover.api-description',
    stability: 'stable',
    evidence: 'measured',
    spec: SPEC.serviceDesc,
    run: runServiceDescLink,
  },
  {
    id: 'discover.openapi-path',
    title: 'An OpenAPI document is at a conventional path',
    group: 'discover.api-description',
    stability: 'stable',
    evidence: 'measured',
    spec: SPEC.openapi,
    run: runOpenapiPath,
  },
  ...watchChecks,
];
