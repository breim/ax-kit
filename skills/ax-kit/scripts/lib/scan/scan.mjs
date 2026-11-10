import { createContext } from '../context/context.mjs';
import { detectProfile } from '../profile/detect.mjs';
import { CHECKS, GROUPS } from '../registry.mjs';
import { buildReport } from '../report/json.mjs';
import { runChecks } from './runner.mjs';

const declared = (value) => ({ value, source: 'declared', signals: [] });

export async function scan({ target, profile = null, minScore = null, fetchImpl }) {
  const ctx = createContext({ target, profile, fetchImpl });
  const entry = await ctx.entry();
  const resolved = profile ? declared(profile) : detectProfile(entry);
  ctx.profile = resolved.value;

  const results = await runChecks(CHECKS, ctx);

  return buildReport({
    target: { input: target, entry: entry.finalUrl },
    profile: resolved,
    checks: CHECKS,
    groups: GROUPS,
    results,
    requests: ctx.requests(),
    minScore,
  });
}
