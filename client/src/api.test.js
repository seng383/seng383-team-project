import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, ApiError, getToken, setToken, setUnauthorizedHandler } from './api.js';
import { mockApi, requestTo } from './testUtils.js';

describe('api', () => {
  afterEach(() => setUnauthorizedHandler(() => {}));

  test('adds the Authorization header when there is a token', async () => {
    setToken('abc');
    const fetchMock = mockApi({ 'GET /api/tasks': { body: [] } });

    await api('/api/tasks');

    expect(requestTo(fetchMock, '/api/tasks').headers.Authorization).toBe('Bearer abc');
  });

  test('sends no Authorization header without a token', async () => {
    const fetchMock = mockApi({ 'GET /api/health': { body: {} } });

    await api('/api/health');

    expect(requestTo(fetchMock, '/api/health').headers.Authorization).toBeUndefined();
  });

  test('sends a body as JSON', async () => {
    const fetchMock = mockApi({ 'POST /api/auth/login': { body: {} } });

    await api('/api/auth/login', { method: 'POST', body: { email: 'a@b.test' } });

    const options = requestTo(fetchMock, '/api/auth/login');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.body).toBe('{"email":"a@b.test"}');
  });

  test('returns the JSON answer', async () => {
    mockApi({ 'GET /api/health': { body: { users: 5 } } });

    await expect(api('/api/health')).resolves.toEqual({ users: 5 });
  });

  test('returns null for an empty 204 answer', async () => {
    mockApi({ 'POST /api/auth/logout': { status: 204 } });

    await expect(api('/api/auth/logout', { method: 'POST' })).resolves.toBeNull();
  });

  test('throws an ApiError with the status of a failed request', async () => {
    mockApi({ 'GET /api/tasks': { status: 403 } });

    const error = await api('/api/tasks').catch((err) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
  });

  test('reports a 401 for the current token', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    setToken('abc');
    mockApi({ 'GET /api/tasks': { status: 401 } });

    await expect(api('/api/tasks')).rejects.toBeInstanceOf(ApiError);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('does not report the 401 of a failed login, which has no session', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockApi({ 'POST /api/auth/login': { status: 401 } });

    await expect(api('/api/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);

    expect(handler).not.toHaveBeenCalled();
  });

  test('does not report a late 401 for a token that was replaced in the meantime', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    setToken('old');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      setToken('new');
      return { ok: false, status: 401 };
    });

    await expect(api('/api/tasks')).rejects.toBeInstanceOf(ApiError);

    expect(handler).not.toHaveBeenCalled();
    expect(getToken()).toBe('new');
  });
});
