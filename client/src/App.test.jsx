import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { getToken, setToken } from './api.js';
import App from './App.jsx';
import { mockApi, requestTo } from './testUtils.js';

const health = { body: { status: 'ok', database: 'ok', users: 5 } };
const users = {
  parent: { id: 1, name: 'Ayşe Demir', role: 'parent' },
  specialist: { id: 3, name: 'Elif Kaya', role: 'specialist' },
  child: { id: 2, name: 'Can Demir', role: 'child' },
};
const tasks = [
  { id: 1, childId: 2, title: '20 dakika kitap oku', developmentArea: 'language', status: 'not_done' },
  { id: 2, childId: 2, title: 'Ayakkabılarını bağla', developmentArea: 'self_care', status: 'done' },
];

// Opens an address the way a typed URL does: the session comes back from sessionStorage.
function open(path) {
  window.history.pushState({}, '', path);
  render(<App />);
}

function logInAs(role, routes = {}) {
  setToken('abc');
  return mockApi({
    'GET /api/auth/me': { body: users[role] },
    'GET /api/tasks': { body: tasks },
    'GET /api/children': { body: [] },
    ...routes,
  });
}

describe('App', () => {
  describe('without a session', () => {
    test.each(['/', '/parent', '/specialist', '/child', '/does-not-exist'])('%s opens the login page', async (path) => {
      mockApi({ 'GET /api/health': health });

      open(path);

      expect(await screen.findByRole('heading', { name: 'Giriş yap' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/login');
    });
  });

  describe('role start screens (FR-M1-01)', () => {
    test.each([
      ['parent', '/parent', 'Ebeveyn paneli'],
      ['specialist', '/specialist', 'Çocuklarım'],
      ['child', '/child', 'Görevlerim'],
    ])('the %s opens %s after login', async (role, path, heading) => {
      mockApi({
        'GET /api/health': health,
        'GET /api/tasks': { body: tasks },
        'GET /api/children': { body: [] },
        'POST /api/auth/login': { body: { token: 'abc', user: users[role] } },
      });
      open('/login');

      fireEvent.change(screen.getByLabelText('E-posta'), { target: { value: 'user@demo.test' } });
      fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: 'Demo1234' } });
      fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));

      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
      expect(window.location.pathname).toBe(path);
    });

    test.each([
      ['parent', '/parent', 'Ebeveyn paneli'],
      ['specialist', '/specialist', 'Çocuklarım'],
      ['child', '/child', 'Görevlerim'],
    ])('the home address opens the start screen of a logged-in %s', async (role, path, heading) => {
      logInAs(role);

      open('/');

      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
      expect(window.location.pathname).toBe(path);
    });

    test('the header shows the user and the role in Turkish', async () => {
      logInAs('specialist');

      open('/specialist');

      expect(await screen.findByText(/Elif Kaya · Uzman/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Çıkış yap' })).toBeInTheDocument();
    });
  });

  describe('child task screen', () => {
    test('lists the tasks from the API with their status in Turkish', async () => {
      logInAs('child');

      open('/child');

      const items = await screen.findAllByTestId('task');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('20 dakika kitap oku · Yapılmadı');
      expect(items[1]).toHaveTextContent('Ayakkabılarını bağla · Yapıldı');
    });

    test('says so when there are no tasks', async () => {
      logInAs('child', { 'GET /api/tasks': { body: [] } });

      open('/child');

      expect(await screen.findByText('Henüz görevin yok.')).toBeInTheDocument();
    });

    test('shows an error when the tasks cannot be loaded', async () => {
      logInAs('child', { 'GET /api/tasks': { status: 500 } });

      open('/child');

      expect(await screen.findByRole('alert')).toHaveTextContent('Görevler yüklenemedi.');
    });
  });

  describe('another role\'s address (FR-M1-04)', () => {
    test.each([
      ['child', '/parent'],
      ['child', '/specialist'],
      ['parent', '/child'],
      ['parent', '/specialist'],
      ['specialist', '/parent'],
      ['specialist', '/child'],
    ])('the %s typing %s is denied and no data is requested', async (role, path) => {
      const fetchMock = logInAs(role);

      open(path);

      expect(await screen.findByRole('alert')).toHaveTextContent('Bu sayfaya erişim izniniz yok.');
      expect(window.location.pathname).toBe(path);
      expect(requestTo(fetchMock, '/api/tasks')).toBeUndefined();
      expect(requestTo(fetchMock, '/api/children')).toBeUndefined();
    });
  });

  describe('end of the session', () => {
    test('logging out opens the login page and deletes the token (FR-M1-03)', async () => {
      logInAs('parent', { 'POST /api/auth/logout': { status: 204 }, 'GET /api/health': health });
      open('/parent');

      fireEvent.click(await screen.findByRole('button', { name: 'Çıkış yap' }));

      expect(await screen.findByRole('heading', { name: 'Giriş yap' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/login');
      expect(getToken()).toBeNull();
    });

    test('a page restored from the back/forward cache after another login hides the first user (FR-M1-03)', async () => {
      logInAs('parent', {
        'GET /api/children': { body: [{ id: 2, name: 'Can Demir' }] },
        'GET /api/children/2/specialists': { body: [] },
      });
      open('/parent');
      expect(await screen.findByRole('heading', { name: 'Can Demir' })).toBeInTheDocument();

      logInAs('specialist');
      act(() => {
        window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
      });

      expect(await screen.findByRole('alert')).toHaveTextContent('Bu sayfaya erişim izniniz yok.');
      expect(screen.getByText('Elif Kaya · Uzman')).toBeInTheDocument();
      expect(screen.queryByText('Can Demir')).not.toBeInTheDocument();
      expect(screen.queryByText(/Ayşe Demir/)).not.toBeInTheDocument();
    });

    test('a 401 from the API clears the session and opens the login page', async () => {
      logInAs('child', { 'GET /api/tasks': { status: 401 }, 'GET /api/health': health });

      open('/child');

      expect(await screen.findByRole('heading', { name: 'Giriş yap' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/login');
      expect(getToken()).toBeNull();
    });
  });
});
