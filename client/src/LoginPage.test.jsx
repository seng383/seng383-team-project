import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { getToken, setToken } from './api.js';
import { AuthProvider } from './AuthContext.jsx';
import LoginPage from './LoginPage.jsx';
import { mockApi, requestTo } from './testUtils.js';

const health = { status: 'ok', database: 'ok', users: 5 };

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/parent" element={<p>parent start</p>} />
          <Route path="/specialist" element={<p>specialist start</p>} />
          <Route path="/child" element={<p>child start</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

function submit(email, password) {
  fireEvent.change(screen.getByLabelText('E-posta'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));
}

describe('LoginPage', () => {
  test('shows the system status from the API', async () => {
    mockApi({ 'GET /api/health': { body: health } });

    renderLogin();

    expect(await screen.findByTestId('health')).toHaveTextContent('Sistem durumu: çalışıyor · Kayıtlı kullanıcı: 5');
  });

  test('says so when the server cannot be reached', async () => {
    mockApi({});

    renderLogin();

    expect(await screen.findByText('Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun.')).toBeInTheDocument();
  });

  test('sends the entered email and password', async () => {
    const fetchMock = mockApi({
      'GET /api/health': { body: health },
      'POST /api/auth/login': { body: { token: 'abc', user: { id: 1, name: 'Ayşe', role: 'parent' } } },
    });
    renderLogin();

    submit('parent@demo.test', 'Demo1234');
    await screen.findByText('parent start');

    expect(JSON.parse(requestTo(fetchMock, '/api/auth/login').body)).toEqual({
      email: 'parent@demo.test',
      password: 'Demo1234',
    });
  });

  test.each([
    ['parent', 'parent start'],
    ['specialist', 'specialist start'],
    ['child', 'child start'],
  ])('opens the start screen of the role %s and keeps the token', async (role, start) => {
    mockApi({
      'GET /api/health': { body: health },
      'POST /api/auth/login': { body: { token: 'abc', user: { id: 1, name: 'Test', role } } },
    });
    renderLogin();

    submit('user@demo.test', 'Demo1234');

    expect(await screen.findByText(start)).toBeInTheDocument();
    expect(getToken()).toBe('abc');
  });

  test('shows one Turkish error for wrong login data and starts no session (FR-M1-02)', async () => {
    mockApi({ 'GET /api/health': { body: health }, 'POST /api/auth/login': { status: 401 } });
    renderLogin();

    submit('parent@demo.test', 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent('E-posta veya şifre hatalı.');
    expect(getToken()).toBeNull();
    expect(screen.getByRole('button', { name: 'Giriş yap' })).toBeEnabled();
  });

  test('does not blame the password when the server cannot be reached', async () => {
    mockApi({ 'GET /api/health': { body: health } });
    renderLogin();

    submit('parent@demo.test', 'Demo1234');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya ulaşılamadı');
    expect(screen.getByRole('alert')).not.toHaveTextContent('hatalı');
  });

  test('sends a user who is already logged in to their start screen', async () => {
    setToken('abc');
    mockApi({
      'GET /api/health': { body: health },
      'GET /api/auth/me': { body: { id: 2, name: 'Can', role: 'child' } },
    });

    renderLogin();

    expect(await screen.findByText('child start')).toBeInTheDocument();
  });
});
