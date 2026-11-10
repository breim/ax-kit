export const MISSING_SEGMENT = 'ax-kit-missing-page-7d1f3a9c';

export function loadMissingPage(ctx) {
  return ctx.once('missingPage', () => ctx.get(ctx.at(`/${MISSING_SEGMENT}`)));
}
