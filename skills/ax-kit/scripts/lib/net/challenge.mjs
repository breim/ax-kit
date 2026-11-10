const HEADER_SIGNATURES = [
  { header: 'cf-mitigated', pattern: /challenge/i, name: 'Cloudflare challenge' },
  { header: 'x-vercel-mitigated', pattern: /challenge/i, name: 'Vercel challenge' },
  { header: 'x-amzn-waf-action', pattern: /challenge|captcha/i, name: 'AWS WAF challenge' },
];

// Body signatures are trusted only on error statuses. Some of these strings
// also occur in the normal pages of sites that use the same vendor.
const BODY_SIGNATURES = [
  { pattern: /<title>\s*Just a moment/i, name: 'Cloudflare challenge page' },
  { pattern: /Attention Required! \| Cloudflare/i, name: 'Cloudflare block page' },
  { pattern: /captcha-delivery\.com/i, name: 'DataDome challenge' },
  { pattern: /px-captcha/i, name: 'HUMAN challenge' },
  { pattern: /Incapsula incident ID/i, name: 'Imperva block page' },
  { pattern: /errors\.edgesuite\.net/i, name: 'Akamai block page' },
];

const BLOCK_STATUSES = new Set([403, 429]);
const ERROR_STATUS = 400;

const headerSignal = (snapshot) =>
  HEADER_SIGNATURES.find((signature) => signature.pattern.test(snapshot.headers[signature.header] ?? ''))?.name;

const bodySignal = (snapshot) =>
  snapshot.status >= ERROR_STATUS ? BODY_SIGNATURES.find((signature) => signature.pattern.test(snapshot.body))?.name : undefined;

const htmlBlock = (snapshot, isHtml) =>
  BLOCK_STATUSES.has(snapshot.status) && isHtml ? `HTTP ${snapshot.status} with an HTML body` : undefined;

export const challengeSignal = (snapshot, isHtml) =>
  headerSignal(snapshot) ?? bodySignal(snapshot) ?? htmlBlock(snapshot, isHtml) ?? null;
