import { isJsonObject, parseJson } from '../json.mjs';
import { loadEntryDoc } from './html.mjs';
import { linksWithRel, parseLinkHeader } from './link-header.mjs';

const CATALOG_PATH = '/.well-known/api-catalog';
const CATALOG_ACCEPT = 'application/linkset+json, application/json';
const MAX_ANNOUNCED_DESCRIPTIONS = 3;

export const CONVENTIONAL_PATHS = [
  '/openapi.json',
  '/openapi.yaml',
  '/.well-known/openapi.json',
  '/api/openapi.json',
  '/swagger.json',
  '/v3/api-docs',
];

export const describesApi = (document) =>
  isJsonObject(document) &&
  (typeof document.openapi === 'string' || typeof document.swagger === 'string') &&
  isJsonObject(document.paths);

const looksLikeYamlDescription = (body) => /^(openapi|swagger):\s*['"]?[23]/m.test(body) && /^paths:/m.test(body);

export function readDescription(snapshot) {
  if (snapshot.status !== 200) return null;
  const document = parseJson(snapshot.body);
  if (describesApi(document)) return { format: 'json', document };
  if (looksLikeYamlDescription(snapshot.body)) return { format: 'yaml', document: null };
  return null;
}

async function firstDescription(ctx, urls) {
  let yaml = null;
  for (const url of urls) {
    const snapshot = await ctx.get(url);
    const description = readDescription(snapshot);
    if (description?.format === 'json') return { ...description, url: snapshot.url, snapshot };
    if (description && !yaml) yaml = { ...description, url: snapshot.url, snapshot };
  }
  return yaml;
}

const hrefsOf = (entries) => (Array.isArray(entries) ? entries.map((entry) => entry?.href).filter(Boolean) : []);

export function loadApiCatalog(ctx) {
  return ctx.once('apiCatalog', async () => {
    const snapshot = await ctx.get(ctx.at(CATALOG_PATH), { headers: { accept: CATALOG_ACCEPT } });
    const linkset = snapshot.status === 200 ? parseJson(snapshot.body)?.linkset : null;
    const entries = Array.isArray(linkset) ? linkset.filter(isJsonObject) : [];
    return {
      snapshot,
      entries,
      descriptions: entries.flatMap((entry) => hrefsOf(entry['service-desc'])),
      hasLinksetType: /application\/linkset\+json/i.test(snapshot.headers['content-type'] ?? ''),
    };
  });
}

export function loadServiceDescLinks(ctx) {
  return ctx.once('serviceDescLinks', async () => {
    const entryDoc = await loadEntryDoc(ctx);
    const headerLinks = linksWithRel(parseLinkHeader(entryDoc.snapshot.headers.link), 'service-desc');
    const htmlLinks = entryDoc.links.filter((link) => link.rel.includes('service-desc'));
    return [...headerLinks, ...htmlLinks].map((link) => link.href).filter(Boolean);
  });
}

export function loadConventionalDescription(ctx) {
  return ctx.once('conventionalDescription', () => firstDescription(ctx, CONVENTIONAL_PATHS.map(ctx.at)));
}

export function loadOpenapi(ctx) {
  return ctx.once('openapi', async () => {
    const catalog = await loadApiCatalog(ctx);
    const linked = await loadServiceDescLinks(ctx);
    const announced = [...catalog.descriptions, ...linked].slice(0, MAX_ANNOUNCED_DESCRIPTIONS);
    const found = (await firstDescription(ctx, announced)) ?? (await loadConventionalDescription(ctx));
    if (!found) return { state: 'missing' };
    return { state: found.format === 'json' ? 'found' : 'yaml_only', ...found };
  });
}
