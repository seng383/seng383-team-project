import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { getToken, setToken } from './api.js';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { mockApi, requestTo } from './testUtils.js';

const parent = { id: 1, name: 'Ayşe Demir', role: 'parent' };
const coach = { id: 5, name: 'Zeynep Arslan', role: 'specialist' };

function Probe() {
  const { user, loading, login, logout } = useAuth();

  return (
    <>
      <p data-testid="state">{loading ? 'loading' : user ? user.name : 'logged out'}</p>
      <button onClick={() => login('parent@demo.test', 'Demo1234').catch(() => {})}>login</button>
      <button onClick={logout}>logout</button>
    </>
  );
}

function renderProbe() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

function restoreFromBackForwardCache() {
  act(() => {
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  });
}

describe('AuthContext', () => {
  test('starts logged out and asks the API nothing without a token', () => {
    const fetchMock = mockApi({});

    renderProbe();

    expect(screen.getByTestId('state')).toHaveTextContent('logged out');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('login keeps the token and the user', async () => {
    mockApi({ 'POST /api/auth/login': { body: { token: 'abc', user: parent } } });
    renderProbe();

    fireEvent.click(screen.getByText('login'));

    expect(await screen.findByText('Ayşe Demir')).toBeInTheDocument();
    expect(getToken()).toBe('abc');
  });

  test('a failed login stores nothing', async () => {
    const fetchMock = mockApi({ 'POST /api/auth/login': { status: 401 } });
    renderProbe();

    await act(async () => fireEvent.click(screen.getByText('login')));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getToken()).toBeNull();
    expect(screen.getByTestId('state')).toHaveTextContent('logged out');
  });

  test('restores the user of a stored token through GET /api/auth/me', async () => {
    setToken('abc');
    const fetchMock = mockApi({ 'GET /api/auth/me': { body: parent } });

    renderProbe();

    expect(screen.getByTestId('state')).toHaveTextContent('loading');
    expect(await screen.findByText('Ayşe Demir')).toBeInTheDocument();
    expect(requestTo(fetchMock, '/api/auth/me').headers.Authorization).toBe('Bearer abc');
  });

  test('ends the session when the API rejects the stored token', async () => {
    setToken('old');
    mockApi({ 'GET /api/auth/me': { status: 401 } });

    renderProbe();

    expect(await screen.findByText('logged out')).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  test('keeps the token when the server cannot be reached, so a reload can restore the session', async () => {
    setToken('abc');
    mockApi({});

    renderProbe();

    expect(await screen.findByText('logged out')).toBeInTheDocument();
    expect(getToken()).toBe('abc');
  });

  test('logout calls the API with the token first, then deletes the token and the user', async () => {
    setToken('abc');
    const fetchMock = mockApi({ 'GET /api/auth/me': { body: parent }, 'POST /api/auth/logout': { status: 204 } });
    renderProbe();
    await screen.findByText('Ayşe Demir');

    fireEvent.click(screen.getByText('logout'));

    expect(await screen.findByText('logged out')).toBeInTheDocument();
    expect(requestTo(fetchMock, '/api/auth/logout').headers.Authorization).toBe('Bearer abc');
    expect(getToken()).toBeNull();
  });

  test('logout ends the session here even when the server cannot be reached', async () => {
    setToken('abc');
    mockApi({ 'GET /api/auth/me': { body: parent } });
    renderProbe();
    await screen.findByText('Ayşe Demir');

    fireEvent.click(screen.getByText('logout'));

    expect(await screen.findByText('logged out')).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  test('a page restored from the back/forward cache after logout is logged out', async () => {
    setToken('abc');
    mockApi({ 'GET /api/auth/me': { body: parent } });
    renderProbe();
    await screen.findByText('Ayşe Demir');

    sessionStorage.clear();
    restoreFromBackForwardCache();

    expect(screen.getByTestId('state')).toHaveTextContent('logged out');
  });

  test('a restored page drops the old user and asks the API whose the stored token is now (FR-M1-03)', async () => {
    setToken('token-of-the-parent');
    mockApi({ 'GET /api/auth/me': { body: parent } });
    renderProbe();
    await screen.findByText('Ayşe Demir');

    setToken('token-of-the-coach');
    const fetchMock = mockApi({ 'GET /api/auth/me': { body: coach } });
    restoreFromBackForwardCache();

    expect(screen.getByTestId('state')).toHaveTextContent('loading');
    expect(await screen.findByText('Zeynep Arslan')).toBeInTheDocument();
    expect(fetchMock.mock.lastCall[1].headers.Authorization).toBe('Bearer token-of-the-coach');
  });

  test('a restored page does not keep the old user when the server cannot be reached', async () => {
    setToken('token-of-the-parent');
    mockApi({ 'GET /api/auth/me': { body: parent } });
    renderProbe();
    await screen.findByText('Ayşe Demir');

    setToken('token-of-the-coach');
    mockApi({});
    restoreFromBackForwardCache();

    expect(await screen.findByText('logged out')).toBeInTheDocument();
    expect(getToken()).toBe('token-of-the-coach');
  });

  test('the pageshow of a normal page load does not ask the API again', async () => {
    setToken('abc');
    const fetchMock = mockApi({ 'GET /api/auth/me': { body: parent } });
    renderProbe();
    await screen.findByText('Ayşe Demir');

    act(() => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state')).toHaveTextContent('Ayşe Demir');
  });
});
