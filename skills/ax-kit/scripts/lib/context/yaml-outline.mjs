import { parseJson } from '../json.mjs';

export const OPAQUE = Symbol('non-empty flow collection');

const MAX_INDENT = 200;
const IGNORABLE = /^\s*(#.*)?$/;
const DOCUMENT_START = /^---\s*(#.*)?$/;
const DOCUMENT_MARKER = /^(---|\.\.\.)(\s|$)/;
const SEQUENCE_ENTRY = /^-(\s|$)/;
const BLOCK_SCALAR = /^[|>][0-9+-]{0,2}\s*(#.*)?$/;
const SINGLE_QUOTED = /^'((?:[^']|'')*)'(.*)$/;
const DOUBLE_QUOTED = /^"((?:[^"\\]|\\.)*)"(.*)$/;
const FLOW_START = /^[[{]/;
const TRAILING = /^\s*$|^\s+#/;
const NODE_PROPERTY = /^[&*!]/;
const NOT_A_PLAIN_KEY = /^[[\]{},#|>]/;
const RESERVED_START = /^[&*!?%@`]/;

class Unsupported extends Error {}

const unsupported = () => {
  throw new Unsupported();
};

const isIgnorable = (line) => IGNORABLE.test(line);
const isSequenceEntry = (text) => SEQUENCE_ENTRY.test(text);
const spacesBefore = (line) => line.search(/[^ ]|$/);

function endOfDocument(state, text) {
  const rest = state.lines.slice(state.position + 1);
  if (text.startsWith('---') || !rest.every(isIgnorable)) unsupported();
  state.position = state.lines.length;
  return null;
}

function peek(state) {
  while (state.position < state.lines.length && isIgnorable(state.lines[state.position])) state.position += 1;
  const line = state.lines[state.position];
  if (line === undefined) return null;
  const indent = line.length - line.trimStart().length;
  if (line.slice(0, indent).includes('\t') || indent > MAX_INDENT) unsupported();
  const text = line.slice(indent).trimEnd();
  if (indent === 0 && DOCUMENT_MARKER.test(text)) return endOfDocument(state, text);
  return { indent, text };
}

function keySeparator(text) {
  for (let index = text.indexOf(':'); index !== -1; index = text.indexOf(':', index + 1)) {
    if (index === text.length - 1 || /\s/.test(text[index + 1])) return index;
  }
  return -1;
}

function plainKey(text) {
  const separator = keySeparator(text);
  const key = text.slice(0, Math.max(separator, 0)).trimEnd();
  if (key === '' || /\s#/.test(key)) return null;
  return { key, value: text.slice(separator + 1).trim() };
}

function quotedKey(text) {
  const single = text.startsWith("'");
  const match = text.match(single ? SINGLE_QUOTED : DOUBLE_QUOTED);
  const separator = match ? keySeparator(match[2]) : -1;
  if (separator === -1 || match[2].slice(0, separator).trim() !== '') return null;
  return { key: unquote(match[1], single), value: match[2].slice(separator + 1).trim() };
}

const unquote = (inner, single) => (single ? inner.replace(/''/g, "'") : (parseJson(`"${inner}"`) ?? inner));

function splitKey(text) {
  if (RESERVED_START.test(text)) unsupported();
  if (NOT_A_PLAIN_KEY.test(text)) return null;
  return /^['"]/.test(text) ? quotedKey(text) : plainKey(text);
}

function readNested({ state, indent, inMapping }) {
  const next = peek(state);
  if (!next) return null;
  if (next.indent > indent) return parseBlock(state, next, indent);
  if (inMapping && next.indent === indent && isSequenceEntry(next.text)) return parseSequence(state, indent);
  return null;
}

function readBlockScalar({ state, indent }) {
  const content = [];
  for (let line = state.lines[state.position]; line !== undefined; line = state.lines[state.position]) {
    if (line.trim() !== '' && spacesBefore(line) <= indent) break;
    content.push(line.trim());
    state.position += 1;
  }
  return content.join('\n').trim();
}

function continuationLine(state, indent) {
  const line = state.lines[state.position];
  if (line === undefined || (line.trim() !== '' && spacesBefore(line) <= indent)) unsupported();
  state.position += 1;
  return line.trim();
}

const startsComment = (text, index) => text[index] === '#' && (index === 0 || /\s/.test(text[index - 1]));

// One pass with no regular expression on the line, because a site can send a line of 2 MB.
function bareFlowText(text) {
  const bare = [];
  let quote = null;
  for (let index = 0; index < text.length && !(quote === null && startsComment(text, index)); index += 1) {
    const char = text[index];
    if (quote === null) {
      quote = char === '"' || char === "'" ? char : null;
      bare.push(quote === null ? char : '_');
    } else if (quote === '"' && char === '\\') index += 1;
    else if (char === quote) quote = null;
  }
  return quote === null ? bare.join('') : unsupported();
}

function flowDepthAfter(bare, depth) {
  let open = depth;
  for (let index = 0; index < bare.length; index += 1) {
    if ('[{'.includes(bare[index])) open += 1;
    if (']}'.includes(bare[index])) open -= 1;
    if (open === 0) return bare.slice(index + 1).trim() === '' ? 0 : unsupported();
  }
  return open;
}

function readFlow({ state, raw, indent }) {
  const bare = [bareFlowText(raw)];
  let depth = flowDepthAfter(bare[0], 0);
  while (depth > 0) {
    bare.push(bareFlowText(continuationLine(state, indent)));
    depth = flowDepthAfter(bare.at(-1), depth);
  }
  const compact = bare.join('').replace(/\s/g, '');
  if (compact === '[]') return [];
  return compact === '{}' ? {} : OPAQUE;
}

const closingQuote = (text, single) =>
  (single ? text.replace(/''/g, '__') : text.replace(/\\./g, '__')).indexOf(single ? "'" : '"');

function readQuoted({ state, raw, indent }) {
  const single = raw.startsWith("'");
  const parts = [];
  let segment = raw.slice(1);
  let end = closingQuote(segment, single);
  while (end === -1) {
    parts.push(segment);
    segment = continuationLine(state, indent);
    end = closingQuote(segment, single);
  }
  if (!TRAILING.test(segment.slice(end + 1))) unsupported();
  return unquote([...parts, segment.slice(0, end)].join(' '), single);
}

function readPlain({ state, raw, indent }) {
  for (let line = peek(state); line && line.indent > indent; line = peek(state)) {
    if (isSequenceEntry(line.text) || splitKey(line.text)) unsupported();
    state.position += 1;
  }
  return raw.split(/\s#/)[0].trimEnd();
}

const VALUE_READERS = [
  [(raw) => raw === '' || raw.startsWith('#'), readNested],
  [(raw) => NODE_PROPERTY.test(raw), unsupported],
  [(raw) => BLOCK_SCALAR.test(raw), readBlockScalar],
  [(raw) => FLOW_START.test(raw), readFlow],
  [(raw) => /^['"]/.test(raw), readQuoted],
];

function parseValue(state, raw, indent, inMapping) {
  const reader = VALUE_READERS.find(([applies]) => applies(raw))?.[1] ?? readPlain;
  return reader({ state, raw, indent, inMapping });
}

function parseMapping(state, indent) {
  const mapping = {};
  for (let line = peek(state); line && line.indent === indent && !isSequenceEntry(line.text); line = peek(state)) {
    const entry = splitKey(line.text) ?? unsupported();
    if (entry.key === '__proto__' || Object.hasOwn(mapping, entry.key)) unsupported();
    state.position += 1;
    mapping[entry.key] = parseValue(state, entry.value, indent, true);
  }
  return mapping;
}

function parseItem(state, line) {
  const content = line.text.slice(1).trimStart();
  if (line.text[1] === '\t' || isSequenceEntry(content)) unsupported();
  if (content !== '' && splitKey(content)) {
    const column = line.indent + line.text.length - content.length;
    state.lines[state.position] = ' '.repeat(column) + content;
    return parseMapping(state, column);
  }
  state.position += 1;
  return parseValue(state, content, line.indent, false);
}

function parseSequence(state, indent) {
  const items = [];
  for (let line = peek(state); line && line.indent === indent && isSequenceEntry(line.text); line = peek(state)) {
    items.push(parseItem(state, line));
  }
  return items;
}

function parseBlock(state, first, parentIndent) {
  if (FLOW_START.test(first.text)) {
    state.position += 1;
    return readFlow({ state, raw: first.text, indent: parentIndent });
  }
  return isSequenceEntry(first.text) ? parseSequence(state, first.indent) : parseMapping(state, first.indent);
}

function skipDocumentStart(state) {
  while (state.position < state.lines.length && isIgnorable(state.lines[state.position])) state.position += 1;
  if (DOCUMENT_START.test(state.lines[state.position] ?? '')) state.position += 1;
}

// A block stops at the first line that it cannot own. A line that no block owns stays here and makes the document unsupported.
function parseDocument(state) {
  skipDocumentStart(state);
  const first = peek(state);
  const root = first ? parseBlock(state, first, -1) : null;
  return peek(state) ? unsupported() : root;
}

const withoutByteOrderMark = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

export function readYamlOutline(text) {
  const state = { lines: withoutByteOrderMark(text).split(/\r?\n/), position: 0 };
  try {
    return parseDocument(state);
  } catch (error) {
    if (error instanceof Unsupported) return null;
    throw error;
  }
}
