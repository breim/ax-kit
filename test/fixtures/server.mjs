import { createServer } from 'node:http';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const NOT_FOUND = { status: 404, headers: { 'content-type': 'text/plain' }, body: 'Not found' };

function readRequestBody(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
  });
}

const resolveRoute = (route, request) => (typeof route === 'function' ? route(request) : route);

export async function startSite(routes, { notFound = NOT_FOUND } = {}) {
  const hits = [];

  const server = createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url, 'http://fixture');
    const request = {
      method: incoming.method,
      path: url.pathname,
      query: url.search,
      headers: incoming.headers,
      body: await readRequestBody(incoming),
    };
    hits.push(request);

    const route = routes[`${request.method} ${request.path}`] ?? routes[request.path];
    const response = { ...NOT_FOUND, ...resolveRoute(route ?? notFound, request) };
    if (response.delayMs) await delay(response.delayMs);
    outgoing.writeHead(response.status ?? 200, response.headers ?? {});
    outgoing.end(request.method === 'HEAD' ? undefined : response.body);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  return {
    origin,
    hits,
    hitsFor: (path) => hits.filter((hit) => hit.path === path),
    // Node 18 keeps idle keep-alive connections open after close(), so each test would wait for their timeout.
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}

export const html = (body, headers = {}) => ({
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  body,
});

export const text = (body, headers = {}) => ({
  status: 200,
  headers: { 'content-type': 'text/plain; charset=utf-8', ...headers },
  body,
});

export const json = (value, headers = {}) => ({
  status: 200,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(value),
});
