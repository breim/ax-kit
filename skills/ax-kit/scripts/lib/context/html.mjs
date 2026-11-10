const ATTRIBUTE = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const TAG = /^(\/?)([a-zA-Z][a-zA-Z0-9:-]*)(?=[\s/]|$)([\s\S]*)$/;
const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const MAX_TAG_LENGTH = 4096;
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);
const HIDDEN_ELEMENTS = new Set(['noscript', 'template', 'svg']);
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

function closingTagIndex(html, name, from) {
  for (let index = html.indexOf('</', from); index !== -1; index = html.indexOf('</', index + 2)) {
    if (html.slice(index + 2, index + 2 + name.length).toLowerCase() === name) return index;
  }
  return -1;
}

function consumeRawText(html, tag, tokens) {
  const closeStart = closingTagIndex(html, tag.name, tag.end);
  if (closeStart === -1) return html.length;
  tokens.push({ type: 'raw', start: tag.end, end: closeStart });
  return closeStart;
}

function consumeComment(html, open) {
  const end = html.indexOf('-->', open + 4);
  return end === -1 ? html.length : end + 3;
}

function consumeMarkup(html, open, tokens) {
  if (html.startsWith('<!--', open)) return consumeComment(html, open);
  const close = html.indexOf('>', open + 1);
  if (close === -1) return html.length;
  const match = TAG.exec(html.slice(open + 1, Math.min(close, open + 1 + MAX_TAG_LENGTH)));
  if (!match) return close + 1;
  const tag = { type: match[1] ? 'close' : 'open', name: match[2].toLowerCase(), source: match[3], start: open, end: close + 1 };
  tokens.push(tag);
  return tag.type === 'open' && RAW_TEXT_ELEMENTS.has(tag.name) ? consumeRawText(html, tag, tokens) : close + 1;
}

// The tokenizer uses only forward index searches, so its time is linear in the size of the page.
// A regular expression over the full page can take quadratic time on a page with many unclosed tags.
export function tokenize(html) {
  const tokens = [];
  let position = 0;
  while (position < html.length) {
    const open = html.indexOf('<', position);
    const textEnd = open === -1 ? html.length : open;
    if (textEnd > position) tokens.push({ type: 'text', start: position, end: textEnd });
    position = open === -1 ? html.length : consumeMarkup(html, open, tokens);
  }
  return tokens;
}

let lastPage = { html: null, tokens: [] };

function tokensOf(html) {
  if (lastPage.html !== html) lastPage = { html, tokens: tokenize(html) };
  return lastPage.tokens;
}

const collapse = (text) => decodeEntities(text).replace(/\s+/g, ' ').trim();
const sliceOf = (html, token) => html.slice(token.start, token.end);
const isSelfClosing = (token) => token.source.trimEnd().endsWith('/');

export const openTagsOf = (html, names) =>
  tokensOf(html)
    .filter((token) => token.type === 'open' && names.includes(token.name))
    .map((token) => ({ name: token.name, attributes: parseAttributes(token.source), start: token.start }));

export const tagsOf = (html, name) => openTagsOf(html, [name]).map((tag) => tag.attributes);

// An element is the first opening tag of one of the names, to the next closing tag of the same name.
export function elementsOf(html, names) {
  const elements = [];
  let opened = null;
  for (const token of tokensOf(html)) {
    if (!names.includes(token.name)) continue;
    if (token.type === 'open' && !opened) opened = token;
    else if (token.type === 'close' && opened?.name === token.name) {
      elements.push({
        name: token.name,
        attributes: parseAttributes(opened.source),
        content: html.slice(opened.end, token.start),
        start: opened.start,
        end: token.end,
      });
      opened = null;
    }
  }
  return elements;
}

export const blocksOf = (html, name) =>
  elementsOf(html, [name]).map((element) => ({ attributes: element.attributes, content: element.content }));

export function textOf(fragment) {
  const text = tokenize(fragment)
    .filter((token) => token.type === 'text')
    .map((token) => sliceOf(fragment, token));
  return collapse(text.join(' '));
}

export function visibleTextOf(html) {
  const parts = [];
  let hiddenDepth = 0;
  for (const token of tokensOf(html)) {
    if (HIDDEN_ELEMENTS.has(token.name)) {
      if (token.type === 'close') hiddenDepth = Math.max(0, hiddenDepth - 1);
      else if (!isSelfClosing(token)) hiddenDepth += 1;
    } else if (token.type === 'text' && hiddenDepth === 0) parts.push(sliceOf(html, token));
  }
  return collapse(parts.join(' '));
}

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

const isBlank = (html, token) => token.type === 'text' && sliceOf(html, token).trim() === '';

function emptyMountOf(html) {
  const tokens = tokensOf(html);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'open' || token.name !== 'div') continue;
    const { id } = parseAttributes(token.source);
    if (!MOUNT_IDS.includes(id)) continue;
    const next = tokens.slice(index + 1, index + 3).find((candidate) => !isBlank(html, candidate));
    if (next?.type === 'close' && next.name === 'div') return id;
  }
  return null;
}

function shellSignalsOf(html) {
  const signals = [];
  const emptyMount = emptyMountOf(html);
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
  elementsOf(html, HEADINGS).map((heading) => ({ level: Number(heading.name[1]), text: textOf(heading.content) }));

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
