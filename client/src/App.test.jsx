import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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

  describe('weekly schedule (FR-M3-03, FR-M3-04)', () => {
    const WEEK = '/api/children/2/events?week=2026-11-09';
    const can = { id: 2, name: 'Can Demir', parentName: 'Ayşe Demir', linkedAt: '2026-10-12 09:00:00' };
    const therapy = {
      id: 11,
      childId: 2,
      title: 'Dil terapisi',
      eventDate: '2026-11-09',
      startTime: '09:30',
      endTime: '10:15',
      createdBy: 1,
      createdByName: 'Ayşe Demir',
    };

    function requestedEvents(fetchMock) {
      return fetchMock.mock.calls.filter(([url]) => url.includes('/events'));
    }

    // Wednesday 11 November 2026, so the schedule opens on the week of 9 November.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 10, 11, 10, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test.each([
      ['parent', '/parent', { 'GET /api/children/2/specialists': { body: [] } }],
      ['specialist', '/specialist', {}],
    ])('the %s opens the schedule of a child from the start screen %s', async (role, start, routes) => {
      logInAs(role, { 'GET /api/children': { body: [can] }, [`GET ${WEEK}`]: { body: [therapy] }, ...routes });
      open(start);

      fireEvent.click(await screen.findByRole('link', { name: 'Haftalık program' }));

      expect(await screen.findByRole('heading', { level: 1, name: 'Can Demir' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/children/2/schedule');
      expect(await screen.findByTestId('event')).toHaveTextContent('09:30–10:15 Dil terapisi');
    });

    test('the child moves between "Görevlerim" and "Takvimim"', async () => {
      logInAs('child', { [`GET ${WEEK}`]: { body: [therapy] } });
      open('/child');

      fireEvent.click(await screen.findByRole('link', { name: 'Takvimim' }));

      expect(await screen.findByRole('heading', { name: 'Takvimim' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/child/schedule');
      expect(screen.getByRole('link', { name: 'Takvimim' })).toHaveAttribute('aria-current', 'page');
      expect(await screen.findByTestId('event')).toHaveTextContent('09:30–10:15 Dil terapisi');

      fireEvent.click(screen.getByRole('link', { name: 'Görevlerim' }));

      expect(await screen.findByRole('heading', { name: 'Görevlerim' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/child');
      expect(screen.getByRole('link', { name: 'Görevlerim' })).toHaveAttribute('aria-current', 'page');
    });

    test('the child typing the schedule address of a child is denied and no data is requested', async () => {
      const fetchMock = logInAs('child');

      open('/children/2/schedule');

      expect(await screen.findByRole('alert')).toHaveTextContent('Bu sayfaya erişim izniniz yok.');
      expect(requestTo(fetchMock, '/api/children')).toBeUndefined();
      expect(requestedEvents(fetchMock)).toHaveLength(0);
    });

    test.each(['parent', 'specialist'])('the %s typing /child/schedule is denied and no events are requested', async (role) => {
      const fetchMock = logInAs(role);

      open('/child/schedule');

      expect(await screen.findByRole('alert')).toHaveTextContent('Bu sayfaya erişim izniniz yok.');
      expect(requestedEvents(fetchMock)).toHaveLength(0);
    });

    test('a specialist typing the address of a child not linked to them sees access denied and no events', async () => {
      const fetchMock = logInAs('specialist', { 'GET /api/children': { body: [] } });

      open('/children/2/schedule');

      expect(await screen.findByRole('alert')).toHaveTextContent('Bu çocuğa erişim izniniz yok.');
      expect(requestedEvents(fetchMock)).toHaveLength(0);
    });
  });
});
