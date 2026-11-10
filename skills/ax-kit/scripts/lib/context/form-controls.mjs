import { parseAttributes, textOf } from './html.mjs';

const NOT_RENDERED = /<!--[\s\S]*?-->|<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;
const FIELD = /<(input|select|textarea)\b([^>]*)>/gi;
const BUTTON = /<button\b([^>]*)>([\s\S]*?)<\/button\s*>/gi;
const LABEL = /<label\b([^>]*)>([\s\S]*?)<\/label\s*>/gi;
const OPENING_TAG = /<[a-z][^>]*>/gi;

const UNCOUNTED_INPUT_TYPES = ['hidden', 'submit', 'button', 'image', 'reset'];
const NAME_ATTRIBUTES = ['aria-label', 'aria-labelledby', 'title'];
const CONTENT_NAME_ATTRIBUTES = ['alt', 'aria-label'];

const hasValue = (attributes, names) => names.some((name) => (attributes[name] ?? '').trim() !== '');

const fieldsOf = (html) =>
  [...html.matchAll(FIELD)].map((match) => ({
    tag: match[1].toLowerCase(),
    attributes: parseAttributes(match[2]),
    position: match.index,
    content: '',
  }));

const buttonsOf = (html) =>
  [...html.matchAll(BUTTON)].map((match) => ({
    tag: 'button',
    attributes: parseAttributes(match[1]),
    position: match.index,
    content: match[2],
  }));

const labelsOf = (html) =>
  [...html.matchAll(LABEL)]
    .filter((match) => textOf(match[2]) !== '')
    .map((match) => ({
      target: parseAttributes(match[1]).for ?? '',
      start: match.index,
      end: match.index + match[0].length,
    }));

const isCounted = (control) =>
  control.tag !== 'input' || !UNCOUNTED_INPUT_TYPES.includes((control.attributes.type ?? '').toLowerCase());

const hasNameFromContent = (content) =>
  textOf(content) !== '' || (content.match(OPENING_TAG) ?? []).some((tag) => hasValue(parseAttributes(tag), CONTENT_NAME_ATTRIBUTES));

// A label with a `for` attribute names only its target. A label with no `for` attribute names the controls inside it.
const isLabelFor = (label, control) =>
  label.target === '' ? label.start < control.position && control.position < label.end : label.target === control.attributes.id;

const hasName = (control, labels) =>
  hasValue(control.attributes, NAME_ATTRIBUTES) ||
  (control.tag === 'button' && hasNameFromContent(control.content)) ||
  labels.some((label) => isLabelFor(label, control));

export function formControlsOf(html) {
  const rendered = html.replace(NOT_RENDERED, ' ');
  const labels = labelsOf(rendered);
  return [...fieldsOf(rendered), ...buttonsOf(rendered)]
    .filter(isCounted)
    .map((control) => ({ tag: control.tag, named: hasName(control, labels) }));
}
