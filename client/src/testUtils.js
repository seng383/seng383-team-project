import { vi } from 'vitest';

// Answers each request from a table like { 'GET /api/health': { body: { users: 5 } } }, as the real server does.
// A missing `status` means 200, and a request that is not in the table fails like an unreachable server.
export function mockApi(routes) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, { method = 'GET' } = {}) => {
    const route = routes[`${method} ${url}`];
    if (!route) {
      throw new TypeError(`No answer for ${method} ${url}`);
    }
    const { status = 200, body } = route;
    return { ok: status < 400, status, json: async () => body };
  });
}

// The options of the first request to the given address, or undefined if there was none.
export function requestTo(fetchMock, url) {
  return fetchMock.mock.calls.find(([calledUrl]) => calledUrl === url)?.[1];
}
