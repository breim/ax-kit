import { createHash } from 'node:crypto';

import { isJsonObject, parseJson } from '../json.mjs';
import { ALL_PROFILES } from '../model.mjs';
import { fail, partial, pass, seen } from './result.mjs';

const SKILLS_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
const SKILL_FIELDS = ['name', 'type', 'description', 'url', 'digest'];
const SERVER_CARD_ACCEPT = 'application/mcp-server-card+json';

const SPEC = {
  llmsTxt: 'https://llmstxt.org/',
  serverCard: 'https://modelcontextprotocol.io/seps/2127-mcp-server-cards',
  ard: 'https://agenticresourcediscovery.org/spec/',
  agentSkills: 'https://github.com/cloudflare/agent-skills-discovery-rfc',
  a2a: 'https://a2a-protocol.org/latest/specification/',
};

async function fetchJson(ctx, path, headers = {}) {
  const snapshot = await ctx.get(ctx.at(path), { headers });
  return { snapshot, value: snapshot.status === 200 ? parseJson(snapshot.body) : null };
}

async function firstJson(ctx, paths, isValid, headers) {
  const evidence = [];
  for (const path of paths) {
    const { snapshot, value } = await fetchJson(ctx, path, headers);
    evidence.push(seen(snapshot, isValid(value) ? 'valid' : 'absent or invalid'));
    if (isValid(value)) return { path, value, evidence };
  }
  return { path: null, value: null, evidence };
}

const isServerCard = (card) => isJsonObject(card) && typeof (card.name ?? card.serverInfo?.name) === 'string';

async function runMcpServerCard(ctx) {
  const found = await firstJson(ctx, ['/mcp/server-card'], isServerCard, { accept: SERVER_CARD_ACCEPT });
  return found.path
    ? pass('An MCP Server Card is at the recommended location.', found.evidence)
    : fail('No MCP Server Card is at <mcp-endpoint>/server-card.', found.evidence);
}

const hasOneLocation = (entry) => (entry.url === undefined) !== (entry.data === undefined);

const isCatalogEntry = (entry) =>
  isJsonObject(entry) && typeof entry.identifier === 'string' && typeof entry.type === 'string' && hasOneLocation(entry);

const isCatalog = (catalog) =>
  isJsonObject(catalog) && Array.isArray(catalog.entries) && catalog.entries.length > 0 && catalog.entries.every(isCatalogEntry);

async function runAiCatalog(ctx) {
  const found = await firstJson(ctx, ['/.well-known/ard.json', '/.well-known/ai-catalog.json'], isCatalog);
  return found.path
    ? pass(`A catalog of agent resources is at ${found.path} with ${found.value.entries.length} entries.`, found.evidence)
    : fail('No catalog of agent resources is at /.well-known/ard.json or /.well-known/ai-catalog.json.', found.evidence);
}

async function runMcpWellKnown(ctx) {
  const found = await firstJson(ctx, ['/.well-known/mcp.json', '/.well-known/mcp/server-card.json'], isJsonObject);
  return found.path
    ? pass(`A legacy MCP document is at ${found.path}. The MCP specification does not define this path.`, found.evidence)
    : fail('No legacy MCP document was found.', found.evidence);
}

const isSkillEntry = (entry) => isJsonObject(entry) && SKILL_FIELDS.every((field) => typeof entry[field] === 'string');

const hasSkills = (index) => isJsonObject(index) && Array.isArray(index.skills) && index.skills.length > 0;

async function digestMatches(ctx, indexUrl, entry) {
  const snapshot = await ctx.get(new URL(entry.url, indexUrl).href);
  const digest = `sha256:${createHash('sha256').update(snapshot.body).digest('hex')}`;
  return { matches: snapshot.status === 200 && digest === entry.digest, snapshot };
}

// The scanner keeps a response body as text, so it can verify the digest of a text file only.
const isTextSkill = (entry) => entry.type === 'skill-md';

async function runAgentSkills(ctx) {
  const found = await firstJson(ctx, ['/.well-known/agent-skills/index.json', '/.well-known/skills/index.json'], hasSkills);
  if (!found.path) return fail('No Agent Skills index is at /.well-known/agent-skills/index.json.', found.evidence);
  const { skills } = found.value;
  const current = found.value.$schema === SKILLS_SCHEMA && skills.every(isSkillEntry);
  if (!current) return partial('The Agent Skills index does not follow version 0.2.0 of the discovery draft.', found.evidence);
  const textSkill = skills.find(isTextSkill);
  if (!textSkill) return pass(`The Agent Skills index lists ${skills.length} skills. The scanner does not verify the digest of an archive.`, found.evidence);
  const digest = await digestMatches(ctx, ctx.at(found.path), textSkill);
  const evidence = [...found.evidence, seen(digest.snapshot, digest.matches ? 'digest matches' : 'digest differs')];
  return digest.matches
    ? pass(`The Agent Skills index lists ${skills.length} skills with a correct digest.`, evidence)
    : partial(`The digest of the skill ${textSkill.name} does not match its file.`, evidence);
}

const isAgentCard = (card) => isJsonObject(card) && typeof card.name === 'string' && Array.isArray(card.supportedInterfaces);

async function runA2aAgentCard(ctx) {
  const found = await firstJson(ctx, ['/.well-known/agent-card.json'], isAgentCard);
  return found.path
    ? pass('An A2A agent card is at /.well-known/agent-card.json.', found.evidence)
    : fail('No A2A agent card was found. A site needs one only if it runs an A2A agent.', found.evidence);
}

async function runLlmsFullTxt(ctx) {
  const snapshot = await ctx.get(ctx.at('/llms-full.txt'));
  const found = snapshot.status === 200 && !/^\s*<(!doctype|html)\b/i.test(snapshot.body);
  const evidence = [seen(snapshot, found ? `${snapshot.body.length} characters` : 'absent')];
  return found ? pass('llms-full.txt is served.', evidence) : fail('No llms-full.txt was found.', evidence);
}

export const watchGroups = [
  {
    id: 'discover.mcp',
    title: 'An agent can find the MCP server before it connects',
    why: 'Discovery documents let a client configure the server with no manual setup.',
    tier: 'recommended',
    stability: 'emerging',
    profiles: ALL_PROFILES,
    playbook: 'agent-discovery',
  },
];

export const watchChecks = [
  {
    id: 'discover.mcp-server-card',
    title: 'An MCP Server Card is published',
    group: 'discover.mcp',
    stability: 'emerging',
    evidence: 'measured',
    spec: SPEC.serverCard,
    reviewed: '2026-11',
    run: runMcpServerCard,
  },
  {
    id: 'discover.ai-catalog',
    title: 'A catalog of agent resources is published',
    group: 'discover.mcp',
    stability: 'emerging',
    evidence: 'measured',
    spec: SPEC.ard,
    reviewed: '2026-11',
    run: runAiCatalog,
  },
  {
    id: 'discover.mcp-well-known',
    title: 'A legacy MCP document is at a /.well-known/mcp path',
    why: 'Some scanners probe this path, but the MCP specification does not define it.',
    tier: 'info',
    stability: 'legacy',
    evidence: 'measured',
    profiles: ALL_PROFILES,
    spec: SPEC.serverCard,
    playbook: 'agent-discovery',
    supersededBy: 'discover.mcp-server-card',
    reviewed: '2026-11',
    run: runMcpWellKnown,
  },
  {
    id: 'discover.agent-skills',
    title: 'An Agent Skills index is published',
    why: 'A skills index teaches an agent how to use the product, with no search.',
    tier: 'recommended',
    stability: 'emerging',
    evidence: 'measured',
    profiles: ALL_PROFILES,
    spec: SPEC.agentSkills,
    playbook: 'agent-discovery',
    reviewed: '2026-11',
    run: runAgentSkills,
  },
  {
    id: 'discover.a2a-agent-card',
    title: 'An A2A agent card is published',
    why: 'Other agents use the card to find and call an agent that the site runs.',
    tier: 'info',
    stability: 'stable',
    evidence: 'measured',
    profiles: ALL_PROFILES,
    spec: SPEC.a2a,
    playbook: 'agent-discovery',
    run: runA2aAgentCard,
  },
  {
    id: 'discover.llms-full-txt',
    title: 'llms-full.txt is published',
    why: 'This file is a convention with no specification. Some agents read it to get all the content in one request.',
    tier: 'info',
    stability: 'stable',
    evidence: 'measured',
    profiles: ALL_PROFILES,
    spec: SPEC.llmsTxt,
    playbook: 'llms-txt',
    run: runLlmsFullTxt,
  },
];
