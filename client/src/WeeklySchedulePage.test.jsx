import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setToken } from './api.js';
import { AuthProvider } from './AuthContext.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import { mockApi, requestTo } from './testUtils.js';
import WeeklySchedulePage from './WeeklySchedulePage.jsx';

const EVENTS = '/api/children/2/events';
const WEEK = `${EVENTS}?week=2026-11-09`;
const NEXT_WEEK = `${EVENTS}?week=2026-11-16`;
const users = {
  parent: { id: 1, name: 'Ayşe Demir', role: 'parent' },
  specialist: { id: 3, name: 'Elif Kaya', role: 'specialist' },
};

function event(id, eventDate, startTime, endTime, title) {
  return { id, childId: 2, title, eventDate, startTime, endTime, createdBy: 1, createdByName: 'Ayşe Demir' };
}

// In the order the API gives: by day, then by time.
const weekEvents = [
  event(11, '2026-11-09', '09:30', '10:15', 'Dil terapisi'),
  event(12, '2026-11-11', '16:00', '17:00', 'Yüzme'),
  event(13, '2026-11-13', '10:00', '12:00', 'Okul gezisi'),
  event(14, '2026-11-13', '15:30', '16:30', 'Resim kursu'),
];

// The page starts at the week of the clock: Wednesday 11 November 2026 here, so 9 to 15 November.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

function renderSchedule(role = 'parent', routes = {}) {
  setToken('abc');
  const fetchMock = mockApi({
    'GET /api/auth/me': { body: users[role] },
    [`GET ${WEEK}`]: { body: weekEvents },
    ...routes,
  });
  render(
    <MemoryRouter initialEntries={['/children/2/schedule']}>
      <AuthProvider>
        <Routes>
          <Route
            path="/children/:childId/schedule"
            element={
              <ProtectedRoute role={['parent', 'specialist']}>
                <WeeklySchedulePage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  return fetchMock;
}

// Holds back the answers to one address, so a test can look at the page while that request is pending.
function holdAnswers(fetchMock, heldUrl) {
  const answerOthers = fetchMock.getMockImplementation();
  let answer;
  fetchMock.mockImplementation((url, options) =>
    url === heldUrl ? new Promise((resolve) => (answer = resolve)) : answerOthers(url, options)
  );
  // The page sends the request from an effect, a moment after it shows "loading", so the answer waits for it.
  return async (status, body) => {
    await waitFor(() => expect(answer).toBeDefined());
    await act(async () => answer({ ok: status < 400, status, json: async () => body }));
  };
}

// The events of each day as they read, from Monday to Sunday.
async function eventsByDay() {
  const days = await screen.findAllByTestId('day');
  return days.map((day) => within(day).queryAllByTestId('event').map((item) => item.textContent));
}

describe('WeeklySchedulePage', () => {
  describe('week view (FR-M3-03)', () => {
    test('opens on the current week and shows its days from Monday to Sunday with their dates', async () => {
      const fetchMock = renderSchedule();

      expect(await screen.findByRole('heading', { name: '9 Kasım – 15 Kasım 2026' })).toBeInTheDocument();
      const days = await screen.findAllByTestId('day');
      expect(days.map((day) => within(day).getByRole('heading').textContent)).toEqual([
        'Pazartesi',
        'Salı',
        'Çarşamba',
        'Perşembe',
        'Cuma',
        'Cumartesi',
        'Pazar',
      ]);
      expect(days[0]).toHaveTextContent('09.11');
      expect(days[6]).toHaveTextContent('15.11');
      expect(requestTo(fetchMock, WEEK).headers.Authorization).toBe('Bearer abc');
    });

    test('puts each event under its day, in the order of the times', async () => {
      renderSchedule();

      expect(await eventsByDay()).toEqual([
        ['09:30–10:15 Dil terapisi'],
        [],
        ['16:00–17:00 Yüzme'],
        [],
        ['10:00–12:00 Okul gezisi', '15:30–16:30 Resim kursu'],
        [],
        [],
      ]);
    });

    test('says so when the week has no events, and still shows its days', async () => {
      renderSchedule('parent', { [`GET ${WEEK}`]: { body: [] } });

      expect(await screen.findByText('Bu hafta etkinlik yok.')).toBeInTheDocument();
      expect(screen.getAllByTestId('day')).toHaveLength(7);
    });

    test('says that the events are loading until they arrive', async () => {
      const fetchMock = renderSchedule();
      const answerWeek = holdAnswers(fetchMock, WEEK);

      expect(await screen.findByText('Etkinlikler yükleniyor…')).toBeInTheDocument();
      expect(screen.queryByTestId('day')).not.toBeInTheDocument();

      await answerWeek(200, weekEvents);

      expect(screen.queryByText('Etkinlikler yükleniyor…')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('event')).toHaveLength(4);
    });

    test.each([
      [500, 'Etkinlikler yüklenemedi.'],
      [403, 'Bu çocuğa erişim izniniz yok.'],
    ])('shows an error and no days when the API answers %i', async (status, message) => {
      renderSchedule('parent', { [`GET ${WEEK}`]: { status } });

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByTestId('day')).not.toBeInTheDocument();
    });

    test('the week buttons open the next and the previous week', async () => {
      const fetchMock = renderSchedule('parent', {
        [`GET ${NEXT_WEEK}`]: { body: [event(21, '2026-11-17', '08:00', '09:00', 'Diş hekimi')] },
        [`GET ${EVENTS}?week=2026-11-02`]: { body: [] },
      });
      await screen.findAllByTestId('event');

      fireEvent.click(screen.getByRole('button', { name: 'Sonraki hafta' }));

      expect(await screen.findByRole('heading', { name: '16 Kasım – 22 Kasım 2026' })).toBeInTheDocument();
      expect(await eventsByDay()).toEqual([[], ['08:00–09:00 Diş hekimi'], [], [], [], [], []]);
      expect(screen.getAllByTestId('day')[1]).toHaveTextContent('17.11');

      fireEvent.click(screen.getByRole('button', { name: 'Önceki hafta' }));
      fireEvent.click(screen.getByRole('button', { name: 'Önceki hafta' }));

      expect(await screen.findByRole('heading', { name: '2 Kasım – 8 Kasım 2026' })).toBeInTheDocument();
      expect(await screen.findByText('Bu hafta etkinlik yok.')).toBeInTheDocument();
      expect(requestTo(fetchMock, `${EVENTS}?week=2026-11-02`)).toBeDefined();
    });

    test('shows none of the old events while the next week loads', async () => {
      const fetchMock = renderSchedule();
      await screen.findAllByTestId('event');
      const answerNextWeek = holdAnswers(fetchMock, NEXT_WEEK);

      fireEvent.click(screen.getByRole('button', { name: 'Sonraki hafta' }));

      expect(screen.getByText('Etkinlikler yükleniyor…')).toBeInTheDocument();
      expect(screen.queryByTestId('event')).not.toBeInTheDocument();

      await answerNextWeek(200, []);

      expect(screen.getByText('Bu hafta etkinlik yok.')).toBeInTheDocument();
    });

    test('a late answer for the week before does not replace the week on the screen', async () => {
      const fetchMock = renderSchedule('parent', { [`GET ${NEXT_WEEK}`]: { body: [] } });
      const answerFirstWeek = holdAnswers(fetchMock, WEEK);
      await screen.findByText('Etkinlikler yükleniyor…');

      fireEvent.click(screen.getByRole('button', { name: 'Sonraki hafta' }));
      expect(await screen.findByText('Bu hafta etkinlik yok.')).toBeInTheDocument();
      await answerFirstWeek(200, weekEvents);

      expect(screen.getByRole('heading', { name: '16 Kasım – 22 Kasım 2026' })).toBeInTheDocument();
      expect(screen.getByText('Bu hafta etkinlik yok.')).toBeInTheDocument();
      expect(screen.queryByTestId('event')).not.toBeInTheDocument();
    });

    test('takes the week from the local date, also in the first hours of a Monday that are still Sunday in UTC', async () => {
      const machineTimeZone = process.env.TZ;
      process.env.TZ = 'Europe/Istanbul';
      try {
        vi.setSystemTime(new Date(2026, 10, 16, 0, 30));
        renderSchedule('parent', { [`GET ${NEXT_WEEK}`]: { body: [] } });

        expect(await screen.findByRole('heading', { name: '16 Kasım – 22 Kasım 2026' })).toBeInTheDocument();
        expect(await screen.findByText('Bu hafta etkinlik yok.')).toBeInTheDocument();
      } finally {
        if (machineTimeZone === undefined) {
          delete process.env.TZ;
        } else {
          process.env.TZ = machineTimeZone;
        }
      }
    });
  });
});
