export const CONTENT_SIGNAL = { labels: ['search', 'ai-input', 'ai-train'], values: ['yes', 'no'] };
export const CONTENT_USAGE = { labels: ['train-ai', 'ai-use', 'search'], values: ['y', 'n'] };

const withoutParameters = (member) => member.split(';')[0];

const parseMembers = (expression) =>
  expression
    .split(',')
    .map((member) => withoutParameters(member).split('='))
    .map(([label = '', value = '']) => [label.trim(), value.trim()]);

function splitPath(rule) {
  const text = rule.trim();
  if (!text.startsWith('/')) return { path: '', expression: text };
  const end = text.search(/\s/);
  return end === -1 ? { path: text, expression: '' } : { path: text.slice(0, end), expression: text.slice(end) };
}

export function parsePreference(rule, vocabulary) {
  const { path, expression } = splitPath(String(rule ?? ''));
  const stated = parseMembers(expression).filter(
    ([label, value]) => vocabulary.labels.includes(label) && vocabulary.values.includes(value),
  );
  return { path, preferences: Object.fromEntries(stated) };
}

export const statedPreferences = (rules, vocabulary) =>
  rules.map((rule) => parsePreference(rule, vocabulary)).filter((rule) => Object.keys(rule.preferences).length > 0);

export const formatPreferences = ({ path, preferences }) =>
  [path, Object.entries(preferences).map(([label, value]) => `${label}=${value}`).join(', ')].filter(Boolean).join(' ');
