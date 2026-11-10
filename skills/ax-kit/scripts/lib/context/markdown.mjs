import { isHtml, loadEntryDoc } from './html.mjs';

const NEGOTIATION_HEADERS = { accept: 'text/markdown' };
const ROOT_PATHS = ['/index.md', '/index.html.md'];

const mediaTypeOf = (snapshot) => (snapshot.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();

export const isMarkdownFile = (snapshot) => snapshot.status === 200 && snapshot.body.trim() !== '' && !isHtml(snapshot);

export const isNegotiatedMarkdown = (snapshot) => isMarkdownFile(snapshot) && mediaTypeOf(snapshot) === 'text/markdown';

const withPath = (pageUrl, pathname) => Object.assign(new URL(pageUrl), { pathname, search: '', hash: '' }).href;

export function markdownUrlsOf(pageUrl) {
  const { pathname } = new URL(pageUrl);
  const path = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const paths = path === '' ? ROOT_PATHS : [`${path}.md`, `${path}/index.md`];
  return paths.map((candidate) => withPath(pageUrl, candidate));
}

export function loadNegotiatedMarkdown(ctx) {
  return ctx.once('negotiatedMarkdown', async () => {
    const snapshot = await ctx.get(ctx.entryUrl, { headers: NEGOTIATION_HEADERS });
    return { snapshot, found: isNegotiatedMarkdown(snapshot) };
  });
}

export function loadMarkdownFile(ctx) {
  return ctx.once('markdownFile', async () => {
    const entry = await loadEntryDoc(ctx);
    const snapshots = [];
    for (const url of markdownUrlsOf(entry.snapshot.finalUrl)) {
      const snapshot = await ctx.get(url);
      snapshots.push(snapshot);
      if (isMarkdownFile(snapshot)) return { snapshot, snapshots, found: true };
    }
    return { snapshot: null, snapshots, found: false };
  });
}

export async function loadMarkdownVersion(ctx) {
  const negotiated = await loadNegotiatedMarkdown(ctx);
  if (negotiated.found) return negotiated.snapshot;
  return (await loadMarkdownFile(ctx)).snapshot;
}
