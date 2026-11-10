import { createContext } from '../../skills/ax-kit/scripts/lib/context/context.mjs';
import { CHECKS } from '../../skills/ax-kit/scripts/lib/registry.mjs';
import { runChecks } from '../../skills/ax-kit/scripts/lib/scan/runner.mjs';
import { startSite } from './server.mjs';

export async function runCheckOn(routes, checkId, { profile = 'content', notFound } = {}) {
  const site = await startSite(routes, notFound ? { notFound } : undefined);
  try {
    const ctx = createContext({ target: site.origin, profile });
    const check = CHECKS.find((candidate) => candidate.id === checkId);
    if (!check) throw new Error(`Unknown check: ${checkId}`);
    const [result] = await runChecks([check], ctx);
    return { result, site, status: result.status };
  } finally {
    await site.close();
  }
}

export const statusOf = async (routes, checkId, options) => (await runCheckOn(routes, checkId, options)).status;
