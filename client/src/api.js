const TOKEN_KEY = 'authToken';

// sessionStorage survives the full page load of a typed address, which memory would not,
// and unlike localStorage it ends with the tab.
export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(status) {
    super(`API answered ${status}`);
    this.status = status;
  }
}

let onUnauthorized = () => {};

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

  // A failed login has no session to end, and a late answer to an old token must not end a newer session.
  if (res.status === 401 && token && token === getToken()) {
    onUnauthorized();
  }
  if (!res.ok) {
    throw new ApiError(res.status);
  }
  return res.status === 204 ? null : res.json();
}
