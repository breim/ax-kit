import { elementsOf, openTagsOf, parseAttributes, textOf, tokenize } from './html.mjs';

const FIELD_TAGS = ['input', 'select', 'textarea'];
const NOT_RENDERED_TAGS = ['template', 'noscript'];
const UNCOUNTED_INPUT_TYPES = ['hidden', 'submit', 'button', 'image', 'reset'];
const NAME_ATTRIBUTES = ['aria-label', 'aria-labelledby', 'title'];
const CONTENT_NAME_ATTRIBUTES = ['alt', 'aria-label'];
const MAX_CONTROLS = 500;
const MAX_LABELS = 2000;
const MAX_HIDDEN_BLOCKS = 200;

const hasValue = (attributes, names) => names.some((name) => (attributes[name] ?? '').trim() !== '');

const fieldsOf = (html) =>
  openTagsOf(html, FIELD_TAGS).map((tag) => ({ tag: tag.name, attributes: tag.attributes, position: tag.start, content: '' }));

const buttonsOf = (html) =>
  elementsOf(html, ['button']).map((button) => ({
    tag: 'button',
    attributes: button.attributes,
    position: button.start,
    content: button.content,
  }));

const labelsOf = (html) =>
  elementsOf(html, ['label'])
    .slice(0, MAX_LABELS)
    .filter((label) => textOf(label.content) !== '')
    .map((label) => ({ target: label.attributes.for ?? '', start: label.start, end: label.end }));

const isCounted = (control) =>
  control.tag !== 'input' || !UNCOUNTED_INPUT_TYPES.includes((control.attributes.type ?? '').toLowerCase());

const hasNamedChild = (content) =>
  tokenize(content).some((token) => token.type === 'open' && hasValue(parseAttributes(token.source), CONTENT_NAME_ATTRIBUTES));

const hasNameFromContent = (content) => textOf(content) !== '' || hasNamedChild(content);

const isInside = (range, position) => range.start < position && position < range.end;

// A label with a `for` attribute names only its target. A label with no `for` attribute names the controls inside it.
const isLabelFor = (label, control) =>
  label.target === '' ? isInside(label, control.position) : label.target === control.attributes.id;

const hasName = (control, labels) =>
  hasValue(control.attributes, NAME_ATTRIBUTES) ||
  (control.tag === 'button' && hasNameFromContent(control.content)) ||
  labels.some((label) => isLabelFor(label, control));

export function formControlsOf(html) {
  const notRendered = elementsOf(html, NOT_RENDERED_TAGS).slice(0, MAX_HIDDEN_BLOCKS);
  const labels = labelsOf(html);
  return [...fieldsOf(html), ...buttonsOf(html)]
    .filter((control) => !notRendered.some((block) => isInside(block, control.position)))
    .filter(isCounted)
    .slice(0, MAX_CONTROLS)
    .map((control) => ({ tag: control.tag, named: hasName(control, labels) }));
}
