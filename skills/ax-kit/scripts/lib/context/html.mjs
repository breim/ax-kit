const ATTRIBUTE = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const HIDDEN_BLOCKS = /<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const TAGS = /<[^>]+>/g;
const MOUNT_IDS = ['root', 'app', '__next', '__nuxt', 'svelte'];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

export function parseAttributes(source) {
  const attributes = {};
  for (const [, name, double, single, bare] of source.matchAll(ATTRIBUTE)) {
    attributes[name.toLowerCase()] = decodeEntities(double ?? single ?? bare ?? '');
  }
  return attributes;
}

export const tagsOf = (html, name) =>
  [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'gi'))].map((match) => parseAttributes(match[1]));

export const blocksOf = (html, name) =>
  [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)</${name}>`, 'gi'))].map((match) => ({
    attributes: parseAttributes(match[1]),
    content: match[2],
  }));

export const textOf = (fragment) => decodeEntities(fragment.replace(TAGS, ' ')).replace(/\s+/g, ' ').trim();

export const visibleTextOf = (html) => textOf(html.replace(COMMENTS, ' ').replace(HIDDEN_BLOCKS, ' '));

function parseJsonLd(html) {
  const blocks = blocksOf(html, 'script').filter(
    (block) => block.attributes.type?.toLowerCase() === 'application/ld+json',
  );
  const parsed = blocks.map((block) => {
    try {
      return JSON.parse(block.content);
    } catch {
      return null;
    }
  });
  return { items: parsed.filter(Boolean), invalid: parsed.filter((item) => item === null).length };
}

function shellSignalsOf(html) {
  const signals = [];
  const emptyMount = MOUNT_IDS.find((id) => new RegExp(`<div[^>]*\\bid=["']${id}["'][^>]*>\\s*</div>`, 'i').test(html));
  if (emptyMount) signals.push(`empty mount element #${emptyMount}`);
  const noscript = blocksOf(html, 'noscript').some((block) => /enable javascript|requires javascript/i.test(block.content));
  if (noscript) signals.push('noscript message asks for JavaScript');
  return signals;
}

function metaOf(html) {
  const meta = {};
  for (const tag of tagsOf(html, 'meta')) {
    const key = (tag.name ?? tag.property ?? '').toLowerCase();
    if (key) meta[key] = tag.content ?? '';
  }
  return meta;
}

const headingsOf = (html) =>
  [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(([, level, content]) => ({
    level: Number(level),
    text: textOf(content),
  }));

export function parseHtml(html) {
  return {
    title: textOf(blocksOf(html, 'title')[0]?.content ?? ''),
    lang: tagsOf(html, 'html')[0]?.lang ?? '',
    meta: metaOf(html),
    links: tagsOf(html, 'link').map((tag) => ({ ...tag, rel: (tag.rel ?? '').toLowerCase().split(/\s+/) })),
    anchors: tagsOf(html, 'a')
      .map((tag) => tag.href)
      .filter(Boolean),
    headings: headingsOf(html),
    jsonLd: parseJsonLd(html),
    visibleText: visibleTextOf(html),
    shellSignals: shellSignalsOf(html),
  };
}

export const isHtml = (snapshot) =>
  /html/i.test(snapshot.headers['content-type'] ?? '') || /^\s*<(!doctype|html)\b/i.test(snapshot.body);

export function loadEntryDoc(ctx) {
  return ctx.once('entryDoc', async () => {
    const snapshot = await ctx.get(ctx.entryUrl);
    return { snapshot, isHtml: isHtml(snapshot), ...parseHtml(isHtml(snapshot) ? snapshot.body : '') };
  });
}
