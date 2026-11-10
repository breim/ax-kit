const unquote = (value) => value.trim().replace(/^"(.*)"$/, '$1');

function parseParameters(source) {
  const parameters = {};
  for (const part of source.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    parameters[part.slice(0, separator).trim().toLowerCase()] = unquote(part.slice(separator + 1));
  }
  return parameters;
}

export function parseLinkHeader(value = '') {
  return value
    .split(/,\s*(?=<)/)
    .map((part) => /^\s*<([^>]*)>(.*)$/.exec(part))
    .filter(Boolean)
    .map(([, href, rest]) => {
      const parameters = parseParameters(rest);
      return { href, rel: (parameters.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean), type: parameters.type ?? '' };
    });
}

export const linksWithRel = (links, rel) => links.filter((link) => link.rel.includes(rel));
