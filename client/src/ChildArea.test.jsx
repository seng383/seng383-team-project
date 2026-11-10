import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { setToken } from './api.js';
import { AuthProvider } from './AuthContext.jsx';
import ChildArea from './ChildArea.jsx';
import ChildTabs, { CHILD_TABS } from './ChildTabs.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import { mockApi } from './testUtils.js';

const users = {
  parent: { id: 1, name: 'Ayşe Demir', role: 'parent' },
  specialist: { id: 3, name: 'Elif Kaya', role: 'specialist' },
};
const can = { id: 2, name: 'Can Demir' };
const ali = { id: 9, name: 'Ali Demir' };

function renderArea(path, { role = 'parent', routes } = {}) {
  setToken('abc');
  mockApi({
    'GET /api/auth/me': { body: users[role] },
    'GET /api/children': { body: [can, ali] },
    ...routes,
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/children/:childId"
            element={
              <ProtectedRoute role={['parent', 'specialist']}>
                <ChildArea />
              </ProtectedRoute>
            }
          >
            <Route path="schedule" element={<p>schedule page</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('ChildArea', () => {
  test.each([
    ['parent', '/parent'],
    ['specialist', '/specialist'],
  ])('shows the %s the name of the child, the tabs, the page and the way back to %s', async (role, start) => {
    renderArea('/children/2/schedule', { role });

    expect(await screen.findByRole('heading', { level: 1, name: 'Can Demir' })).toBeInTheDocument();
    expect(screen.getByText('schedule page')).toBeInTheDocument();
    const tab = screen.getByRole('link', { name: 'Haftalık program' });
    expect(tab).toHaveAttribute('href', '/children/2/schedule');
    expect(tab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Başlangıç ekranına dön' })).toHaveAttribute('href', start);
  });

  test('shows the child of the address when the list has several', async () => {
    renderArea('/children/9/schedule');

    expect(await screen.findByRole('heading', { level: 1, name: 'Ali Demir' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Haftalık program' })).toHaveAttribute('href', '/children/9/schedule');
  });

  test.each(['/children/7/schedule', '/children/02/schedule', '/children/abc/schedule'])(
    'denies %s, which is no child in the list, and shows nothing of the page',
    async (path) => {
      renderArea(path);

      expect(await screen.findByRole('alert')).toHaveTextContent('Bu çocuğa erişim izniniz yok.');
      expect(screen.queryByText('schedule page')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Haftalık program' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Başlangıç ekranına dön' })).toHaveAttribute('href', '/parent');
    }
  );

  test('denies the child when the API answers 403', async () => {
    renderArea('/children/2/schedule', { routes: { 'GET /api/children': { status: 403 } } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu çocuğa erişim izniniz yok.');
    expect(screen.queryByText('schedule page')).not.toBeInTheDocument();
  });

  test('says so when the children cannot be loaded', async () => {
    renderArea('/children/2/schedule', { routes: { 'GET /api/children': { status: 500 } } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Çocuk bilgileri yüklenemedi.');
    expect(screen.queryByText('schedule page')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Başlangıç ekranına dön' })).toBeInTheDocument();
  });
});

describe('ChildTabs', () => {
  test('links each page of a child to that child, and marks none as open on another page', () => {
    render(
      <MemoryRouter initialEntries={['/parent']}>
        <ChildTabs childId={9} />
      </MemoryRouter>
    );

    const links = screen.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(
      CHILD_TABS.map(({ label, path }) => [label, `/children/9/${path}`])
    );
    expect(links[0]).not.toHaveAttribute('aria-current');
  });
});
