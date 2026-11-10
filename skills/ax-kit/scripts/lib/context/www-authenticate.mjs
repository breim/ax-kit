const TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const QUOTED = '"((?:[^"\\\\]|\\\\.)*)"';
const BARE = '([^\\s,"]+)';
const PART = new RegExp(`(${TOKEN})(?:\\s*=\\s*(?:${QUOTED}|${BARE}))?`, 'g');

const unescape = (quoted) => quoted.replace(/\\(.)/g, '$1');

export function parseChallenges(value = '') {
  const challenges = [];
  for (const [, name, quoted, bare] of String(value).matchAll(PART)) {
    const parameter = quoted !== undefined ? unescape(quoted) : bare;
    if (parameter === undefined) challenges.push({ scheme: name.toLowerCase(), params: {} });
    else if (challenges.length > 0) challenges.at(-1).params[name.toLowerCase()] = parameter;
  }
  return challenges;
}

export const challengesWithScheme = (challenges, scheme) => challenges.filter((challenge) => challenge.scheme === scheme);
