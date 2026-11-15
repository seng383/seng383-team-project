import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setToken } from './api.js';
import { AuthProvider } from './AuthContext.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import { mockApi, requestTo } from './testUtils.js';
import WeeklySchedulePage, { ChildSchedulePage } from './WeeklySchedulePage.jsx';

const EVENTS = '/api/children/2/events';
const WEEK = `${EVENTS}?week=2026-11-09`;
const NEXT_WEEK = `${EVENTS}?week=2026-11-16`;
const users = {
  parent: { id: 1, name: 'Ayşe Demir', role: 'parent' },
  specialist: { id: 3, name: 'Elif Kaya', role: 'specialist' },
  child: { id: 2, name: 'Can Demir', role: 'child' },
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
    <MemoryRouter initialEntries={[role === 'child' ? '/child/schedule' : '/children/2/schedule']}>
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
          <Route
            path="/child/schedule"
            element={
              <ProtectedRoute role="child">
                <ChildSchedulePage />
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

async function openForm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Etkinlik ekle' }));
}

function fillAndSave({ title = 'Kütüphane ziyareti', eventDate = '2026-11-09', startTime = '12:00', endTime = '13:00' } = {}) {
  fireEvent.change(screen.getByLabelText('Başlık'), { target: { value: title } });
  fireEvent.change(screen.getByLabelText('Tarih'), { target: { value: eventDate } });
  fireEvent.change(screen.getByLabelText('Başlangıç'), { target: { value: startTime } });
  fireEvent.change(screen.getByLabelText('Bitiş'), { target: { value: endTime } });
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
}

function posts(fetchMock) {
  return fetchMock.mock.calls.filter(([, options]) => options.method === 'POST');
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

  describe('adding an event (FR-M3-01, FR-M3-02)', () => {
    test.each(['parent', 'specialist'])('the %s opens the form with "Etkinlik ekle" and closes it with "Vazgeç"', async (role) => {
      const fetchMock = renderSchedule(role);
      expect(screen.queryByRole('heading', { name: 'Yeni etkinlik' })).not.toBeInTheDocument();

      await openForm();
      expect(screen.getByRole('heading', { name: 'Yeni etkinlik' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));

      expect(screen.queryByRole('heading', { name: 'Yeni etkinlik' })).not.toBeInTheDocument();
      expect(posts(fetchMock)).toHaveLength(0);
    });

    test('sends the event and shows it in its day in time order, without loading the week again (FR-M3-01)', async () => {
      const fetchMock = renderSchedule('parent', {
        [`GET ${WEEK}`]: {
          body: [event(11, '2026-11-09', '09:30', '10:15', 'Dil terapisi'), event(15, '2026-11-09', '16:00', '17:00', 'Yüzme')],
        },
        [`POST ${EVENTS}`]: { status: 201, body: event(30, '2026-11-09', '12:00', '13:00', 'Kütüphane ziyareti') },
      });
      await openForm();

      fillAndSave();

      expect(await screen.findByRole('status')).toHaveTextContent('Etkinlik kaydedildi: 09.11.2026, 12:00–13:00.');
      expect((await eventsByDay())[0]).toEqual([
        '09:30–10:15 Dil terapisi',
        '12:00–13:00 Kütüphane ziyareti',
        '16:00–17:00 Yüzme',
      ]);
      expect(JSON.parse(requestTo(fetchMock, EVENTS).body)).toEqual({
        title: 'Kütüphane ziyareti',
        eventDate: '2026-11-09',
        startTime: '12:00',
        endTime: '13:00',
      });
      expect(fetchMock.mock.calls.filter(([url]) => url === WEEK)).toHaveLength(1);
      expect(screen.queryByRole('heading', { name: 'Yeni etkinlik' })).not.toBeInTheDocument();
    });

    test('saves an event of another week without putting it into the week on the screen', async () => {
      renderSchedule('parent', {
        [`POST ${EVENTS}`]: { status: 201, body: event(31, '2026-11-20', '10:00', '11:00', 'Bayram ziyareti') },
      });
      await openForm();

      fillAndSave({ title: 'Bayram ziyareti', eventDate: '2026-11-20', startTime: '10:00', endTime: '11:00' });

      expect(await screen.findByRole('status')).toHaveTextContent('Etkinlik kaydedildi: 20.11.2026, 10:00–11:00.');
      expect(screen.getAllByTestId('event')).toHaveLength(4);
      expect(screen.queryByText('Bayram ziyareti')).not.toBeInTheDocument();
    });

    test('takes an end time equal to the start time, as the API does', async () => {
      const fetchMock = renderSchedule('parent', {
        [`POST ${EVENTS}`]: { status: 201, body: event(32, '2026-11-10', '15:00', '15:00', 'Telefon görüşmesi') },
      });
      await openForm();

      fillAndSave({ title: 'Telefon görüşmesi', eventDate: '2026-11-10', startTime: '15:00', endTime: '15:00' });

      expect((await eventsByDay())[1]).toEqual(['15:00–15:00 Telefon görüşmesi']);
      expect(posts(fetchMock)).toHaveLength(1);
    });

    test.each([
      ['no title', { title: '' }, 'Başlık boş olamaz.'],
      ['a title of spaces only', { title: '   ' }, 'Başlık boş olamaz.'],
      ['no date', { eventDate: '' }, 'Tarih boş olamaz.'],
      ['no start time', { startTime: '' }, 'Başlangıç ve bitiş saati boş olamaz.'],
      ['no end time', { endTime: '' }, 'Başlangıç ve bitiş saati boş olamaz.'],
      ['an end before the start', { startTime: '15:00', endTime: '14:30' }, 'Bitiş saati başlangıç saatinden önce olamaz.'],
    ])('shows an error for %s and sends nothing (FR-M3-02)', async (_, values, message) => {
      const fetchMock = renderSchedule();
      await openForm();

      fillAndSave(values);

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(posts(fetchMock)).toHaveLength(0);
      expect(screen.getByRole('heading', { name: 'Yeni etkinlik' })).toBeInTheDocument();
    });

    test('keeps what was typed after an error, so only the wrong field needs fixing', async () => {
      renderSchedule();
      await openForm();

      fillAndSave({ startTime: '15:00', endTime: '14:30' });

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByLabelText('Başlık')).toHaveValue('Kütüphane ziyareti');
      expect(screen.getByLabelText('Tarih')).toHaveValue('2026-11-09');
      expect(screen.getByLabelText('Bitiş')).toHaveValue('14:30');
    });

    test.each([
      [400, 'Etkinlik kaydedilemedi. Lütfen bilgileri kontrol edin.'],
      [403, 'Bu çocuğa erişim izniniz yok.'],
      [500, 'Etkinlik kaydedilemedi. Lütfen tekrar deneyin.'],
    ])('shows a Turkish error and keeps the form when the API answers %i (FR-M3-02)', async (status, message) => {
      renderSchedule('parent', { [`POST ${EVENTS}`]: { status } });
      await openForm();

      fillAndSave();

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.getByLabelText('Başlık')).toHaveValue('Kütüphane ziyareti');
      expect(screen.getByRole('button', { name: 'Kaydet' })).toBeEnabled();
      expect(screen.getAllByTestId('event')).toHaveLength(4);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('the child (FR-M3-04)', () => {
    test('sees their week under "Takvimim" and no way to add an event', async () => {
      renderSchedule('child');

      expect(await screen.findByRole('heading', { level: 1, name: 'Takvimim' })).toBeInTheDocument();
      expect(await screen.findAllByTestId('event')).toHaveLength(4);
      expect(screen.getByRole('button', { name: 'Sonraki hafta' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Etkinlik ekle' })).not.toBeInTheDocument();
      expect(screen.queryByText('Yeni etkinlik')).not.toBeInTheDocument();
    });

    test('asks only for the events of the logged-in child', async () => {
      const fetchMock = renderSchedule('child', {
        'GET /api/auth/me': { body: { id: 6, name: 'Ela Yıldız', role: 'child' } },
        'GET /api/children/6/events?week=2026-11-09': { body: [] },
      });

      expect(await screen.findByText('Bu hafta etkinlik yok.')).toBeInTheDocument();
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/auth/me', '/api/children/6/events?week=2026-11-09']);
    });
  });
});
