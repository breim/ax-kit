const DIRECTIVE = /^([A-Za-z-]+)\s*:\s*(.*)$/;
const WILDCARD_AGENT = '*';

function parseLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => DIRECTIVE.exec(line.replace(/#.*$/, '').trim()))
    .filter(Boolean)
    .map(([, name, value]) => ({ name: name.toLowerCase(), value: value.trim() }));
}

const addTo = (bucket, name, value) => {
  bucket[name] = [...(bucket[name] ?? []), value];
};

function buildGroups(lines) {
  const state = { groups: [], global: {}, sitemaps: [], current: null, readingAgents: false };
  for (const { name, value } of lines) {
    if (name === 'user-agent') {
      if (!state.readingAgents) {
        state.current = { agents: [], rules: [], directives: {} };
        state.groups.push(state.current);
      }
      state.current.agents.push(value.toLowerCase());
      state.readingAgents = true;
      continue;
    }
    state.readingAgents = false;
    applyDirective(state, name, value);
  }
  return state;
}

function applyDirective(state, name, value) {
  if (name === 'sitemap') state.sitemaps.push(value);
  else if (name === 'allow' || name === 'disallow') state.current?.rules.push({ allow: name === 'allow', path: value });
  else addTo(state.current ? state.current.directives : state.global, name, value);
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern).split('*').map(escapeRegex).join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
}

function decide(rules, path) {
  const matching = rules.filter((rule) => rule.path !== '' && matches(rule.path, path));
  if (matching.length === 0) return true;
  const longest = Math.max(...matching.map((rule) => rule.path.length));
  return matching.some((rule) => rule.path.length === longest && rule.allow);
}

export function parseRobots(text) {
  const { groups, global, sitemaps } = buildGroups(parseLines(text));

  const groupsFor = (agent) => groups.filter((group) => group.agents.includes(agent.toLowerCase()));

  const rulesFor = (agent) => {
    const named = groupsFor(agent);
    const selected = named.length > 0 ? named : groupsFor(WILDCARD_AGENT);
    return selected.flatMap((group) => group.rules);
  };

  return {
    groups,
    sitemaps,
    agents: [...new Set(groups.flatMap((group) => group.agents))],
    hasGroupFor: (agent) => groupsFor(agent).length > 0,
    allows: (agent, path) => decide(rulesFor(agent), path),
    directive: (name) => [...(global[name] ?? []), ...groups.flatMap((group) => group.directives[name] ?? [])],
  };
}

const looksLikeRobots = (snapshot) => snapshot.status === 200 && /^\s*user-agent\s*:/im.test(snapshot.body);

export function loadRobots(ctx) {
  return ctx.once('robots', async () => {
    const snapshot = await ctx.get(ctx.at('/robots.txt'));
    const found = looksLikeRobots(snapshot);
    return { snapshot, found, ...parseRobots(found ? snapshot.body : '') };
  });
}
