import { Transient } from '../context/context.mjs';
import { seen } from '../checks/result.mjs';

const notAssessed = (id, reason, evidence = []) => ({ id, status: 'not_assessed', reason, summary: '', evidence });

async function runCheck(check, ctx) {
  if (!check.profiles.includes(ctx.profile)) return { id: check.id, status: 'not_applicable', summary: '', evidence: [] };
  if (check.evidence === 'judged') return notAssessed(check.id, 'not_reviewed');
  try {
    return { id: check.id, ...(await check.run(ctx)) };
  } catch (error) {
    if (!(error instanceof Transient)) throw error;
    return notAssessed(check.id, error.reason, [seen(error.snapshot, error.reason)]);
  }
}

export const runChecks = (checks, ctx) => Promise.all(checks.map((check) => runCheck(check, ctx)));
