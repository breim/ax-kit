import { PROFILES } from '../model.mjs';

export class UsageError extends Error {}

export const USAGE = `ax-kit scanner

Usage:
  ax.mjs scan <url> [--profile <profile>] [--json] [--min-score <0-100>]
  ax.mjs catalog [--markdown | --json]
  ax.mjs --help | --version

Profiles: ${PROFILES.join(', ')}

scan      Run the checks against <url> and print the AX Score.
          --profile     The type of the target. If you omit it, the scanner detects it.
          --json        Print the full report as JSON.
          --min-score   Exit 1 if the score is below this value. Requires --profile.
catalog   Print the check catalog.

Exit codes: 0 ok, 1 gate failed, 2 usage error, 3 gate inconclusive, 4 no score, 5 internal error.`;

const VALUE_OPTIONS = new Set(['--profile', '--min-score']);
const FLAG_OPTIONS = new Set(['--json', '--markdown', '--help', '--version']);

function tokenize(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (VALUE_OPTIONS.has(token)) {
      options[token] = argv[index + 1];
      index += 1;
    } else if (FLAG_OPTIONS.has(token)) options[token] = true;
    else if (token.startsWith('--')) throw new UsageError(`Unknown option: ${token}`);
    else positional.push(token);
  }
  return { positional, options };
}

function parseTarget(value) {
  if (!value) throw new UsageError('scan needs a URL.');
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(candidate).href;
  } catch {
    throw new UsageError(`Not a valid URL: ${value}`);
  }
}

function parseProfile(value) {
  if (value === undefined) return null;
  if (!PROFILES.includes(value)) throw new UsageError(`Unknown profile: ${value}. Use one of: ${PROFILES.join(', ')}.`);
  return value;
}

function parseMinScore(value, profile) {
  if (value === undefined) return null;
  const minimum = Number(value);
  if (!Number.isInteger(minimum) || minimum < 0 || minimum > 100) throw new UsageError('--min-score needs an integer from 0 to 100.');
  if (profile === null) throw new UsageError('--min-score requires --profile, because a detected profile can change.');
  return minimum;
}

function parseScan(positional, options) {
  const profile = parseProfile(options['--profile']);
  return {
    command: 'scan',
    target: parseTarget(positional[1]),
    profile,
    minScore: parseMinScore(options['--min-score'], profile),
    json: Boolean(options['--json']),
  };
}

export function parseArgs(argv) {
  const { positional, options } = tokenize(argv);
  if (options['--help']) return { command: 'help' };
  if (options['--version']) return { command: 'version' };
  if (positional[0] === 'scan') return parseScan(positional, options);
  if (positional[0] === 'catalog') return { command: 'catalog', format: options['--json'] ? 'json' : 'markdown' };
  throw new UsageError(positional[0] ? `Unknown command: ${positional[0]}` : 'No command was given.');
}
