const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
];

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST']);

export const isPrivateHost = (hostname) => PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));

export function isAllowedUrl(targetUrl, requestUrl) {
  const target = new URL(targetUrl);
  const request = new URL(requestUrl);
  if (!ALLOWED_PROTOCOLS.has(request.protocol)) return false;
  return isPrivateHost(target.hostname) || !isPrivateHost(request.hostname);
}
