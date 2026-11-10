import { isHtml, parseHtml } from '../context/html.mjs';

const COMMERCE_TYPES = /"@type"\s*:\s*"(Product|Offer|Store)"/;
const COMMERCE_LINKS = /\/(cart|checkout|basket)(\/|$|\?)/i;
const COMMERCE_PLATFORMS = /shopify|woocommerce|magento|bigcommerce/i;
const ACCOUNT_LINKS = /\/(login|log-in|signin|sign-in|signup|sign-up|register|dashboard)(\/|$|\?)/i;

function apiSignals(snapshot) {
  const signals = [];
  if (/json/i.test(snapshot.headers['content-type'] ?? '')) signals.push('the entry response is JSON');
  if (snapshot.status === 401 && snapshot.headers['www-authenticate']) signals.push('the entry response asks for credentials');
  if (/^api\./i.test(new URL(snapshot.url).hostname)) signals.push('the host name starts with "api."');
  return signals;
}

function commerceSignals(snapshot, page) {
  const signals = [];
  if (COMMERCE_TYPES.test(JSON.stringify(page.jsonLd.items))) signals.push('product structured data');
  if (page.anchors.some((href) => COMMERCE_LINKS.test(href))) signals.push('a cart or checkout link');
  if (COMMERCE_PLATFORMS.test(page.meta.generator ?? '')) signals.push('a commerce platform generator tag');
  return signals;
}

function webappSignals(snapshot, page) {
  const signals = [];
  if (page.anchors.some((href) => ACCOUNT_LINKS.test(href))) signals.push('a login or signup link');
  if (/<input[^>]*type=["']?password/i.test(snapshot.body)) signals.push('a password field');
  if (/"@type"\s*:\s*"(SoftwareApplication|WebApplication)"/.test(JSON.stringify(page.jsonLd.items))) {
    signals.push('application structured data');
  }
  return signals;
}

const RULES = [
  { profile: 'api', signalsOf: apiSignals },
  { profile: 'commerce', signalsOf: commerceSignals },
  { profile: 'webapp', signalsOf: webappSignals },
];

export function detectProfile(snapshot) {
  const page = parseHtml(isHtml(snapshot) ? snapshot.body : '');
  for (const rule of RULES) {
    const signals = rule.signalsOf(snapshot, page);
    if (signals.length > 0) return { value: rule.profile, source: 'detected', signals };
  }
  return { value: 'content', source: 'detected', signals: ['no API, commerce, or application signal'] };
}
