const result = (status) => (summary, evidence = []) => ({ status, summary, evidence });

export const pass = result('pass');
export const partial = result('partial');
export const fail = result('fail');
export const info = result('info');

export const blocked = (blockedBy, summary) => ({ status: 'fail', summary, blockedBy, evidence: [] });

export const seen = (snapshot, observed) => ({
  method: snapshot.method,
  url: snapshot.url,
  status: snapshot.status,
  observed,
});

export function byCount(met, total, summary, evidence) {
  if (met === total) return pass(summary, evidence);
  if (met >= total - 1 && total > 1) return partial(summary, evidence);
  return fail(summary, evidence);
}

export function byRatio(ratio, summary, evidence, { passAt = 0.9, partialAt = 0.5 } = {}) {
  if (ratio >= passAt) return pass(summary, evidence);
  if (ratio >= partialAt) return partial(summary, evidence);
  return fail(summary, evidence);
}
