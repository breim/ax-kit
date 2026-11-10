const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

export function toHttpUrl(value, base) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, base);
    return HTTP_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}
