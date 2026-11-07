import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { setToken } from './api.js';
import { AuthProvider } from './AuthContext.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import { mockApi } from './testUtils.js';

function renderParentPage() {
  render(
    <MemoryRouter initialEntries={['/parent']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>login page</p>} />
          <Route path="/child" element={<p>child start</p>} />
          <Route
            path="/parent"
            element={
              <ProtectedRoute role="parent">
                <p>parent content</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

function logInAs(role) {
  setToken('abc');
  mockApi({ 'GET /api/auth/me': { body: { id: 1, name: 'Test', role } } });
}

describe('ProtectedRoute', () => {
  test('sends a visitor without a token to the login page', () => {
    mockApi({});

    renderParentPage();

    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('parent content')).not.toBeInTheDocument();
  });

  test('shows nothing of the page while the token is being checked', async () => {
    logInAs('parent');

    renderParentPage();

    expect(screen.getByText('Yükleniyor…')).toBeInTheDocument();
    expect(screen.queryByText('parent content')).not.toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
    await screen.findByText('parent content');
  });

  test('shows the page to its own role', async () => {
    logInAs('parent');

    renderParentPage();

    expect(await screen.findByText('parent content')).toBeInTheDocument();
  });

  test.each(['child', 'specialist'])('shows a Turkish access denied message to the role %s', async (role) => {
    logInAs(role);

    renderParentPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu sayfaya erişim izniniz yok.');
    expect(screen.queryByText('parent content')).not.toBeInTheDocument();
  });

  test('offers the way back to the start screen of the own role', async () => {
    logInAs('child');

    renderParentPage();

    const link = await screen.findByRole('link', { name: 'Başlangıç ekranına dön' });
    expect(link).toHaveAttribute('href', '/child');
  });
});
