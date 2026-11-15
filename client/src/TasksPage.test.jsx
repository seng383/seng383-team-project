import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { setToken } from './api.js';
import { AuthProvider } from './AuthContext.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import TasksPage from './TasksPage.jsx';
import { mockApi, requestTo } from './testUtils.js';

const TASKS = '/api/tasks?childId=2';
const users = {
  parent: { id: 1, name: 'Ayşe Demir', role: 'parent' },
  specialist: { id: 3, name: 'Elif Kaya', role: 'specialist' },
};

function task(id, title, developmentArea, dueDate, status, assignedBy) {
  return { id, childId: 2, title, description: null, developmentArea, dueDate, status, completedAt: null, assignedBy, assignedByName: '' };
}

// In the order the API gives: by due date.
const childTasks = [
  task(21, 'Hikâyeyi kendi cümlelerinle anlat', 'language', '2026-11-11', 'done', 3),
  task(22, 'Ayakkabı bağcıklarını bağla', 'self_care', '2026-11-12', 'not_done', 1),
  task(23, 'Makasla çizgi boyunca kes', 'motor_skills', '2026-11-14', 'not_done', 3),
];

function renderTasks(role = 'specialist', routes = {}) {
  setToken('abc');
  const fetchMock = mockApi({
    'GET /api/auth/me': { body: users[role] },
    [`GET ${TASKS}`]: { body: childTasks },
    ...routes,
  });
  render(
    <MemoryRouter initialEntries={['/children/2/tasks']}>
      <AuthProvider>
        <Routes>
          <Route
            path="/children/:childId/tasks"
            element={
              <ProtectedRoute role={['parent', 'specialist']}>
                <TasksPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  return fetchMock;
}

function fillForm({ title = '', description = '', developmentArea = '', dueDate = '' }) {
  fireEvent.change(screen.getByLabelText('Başlık *'), { target: { value: title } });
  fireEvent.change(screen.getByLabelText(/^Açıklama/), { target: { value: description } });
  fireEvent.change(screen.getByLabelText(/^Gelişim alanı/), { target: { value: developmentArea } });
  fireEvent.change(screen.getByLabelText('Son tarih *'), { target: { value: dueDate } });
}

function titlesAndStatus() {
  return screen.getAllByTestId('task').map((item) => [item.querySelector('strong').textContent, within(item).getByTestId('task-status').textContent]);
}

const newTask = { title: '5 yeni kelimeyi cümle içinde kullan', description: 'Ailene beş kısa cümle kur.', developmentArea: 'language', dueDate: '2026-11-13' };

describe('TasksPage', () => {
  // FR-M4-05: the list holds the tasks this user assigned, each with its current status.
  test('lists the tasks the user assigned with area, due date and status, and not the tasks of others', async () => {
    renderTasks('specialist');

    await screen.findAllByTestId('task');
    expect(titlesAndStatus()).toEqual([
      ['Hikâyeyi kendi cümlelerinle anlat', 'Yapıldı'],
      ['Makasla çizgi boyunca kes', 'Yapılmadı'],
    ]);
    expect(screen.getAllByTestId('task')[1]).toHaveTextContent('Motor beceriler · 14.11.2026');
  });

  test('says so when the user has assigned no task to the child', async () => {
    renderTasks('parent', { [`GET ${TASKS}`]: { body: [childTasks[0]] } });

    expect(await screen.findByText('Bu çocuğa henüz görev atamadınız.')).toBeInTheDocument();
  });

  test.each([
    [403, 'Bu çocuğa erişim izniniz yok.'],
    [500, 'Görevler yüklenemedi.'],
  ])('shows an error when the tasks are answered with %i', async (status, message) => {
    renderTasks('specialist', { [`GET ${TASKS}`]: { status } });

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  // FR-M4-02: a task without a title, a development area or a due date is not sent.
  test.each([
    [{ ...newTask, title: '   ' }, 'Başlık boş olamaz.'],
    [{ ...newTask, developmentArea: '' }, 'Gelişim alanı seçilmelidir.'],
    [{ ...newTask, dueDate: '' }, 'Son tarih boş olamaz.'],
  ])('refuses %o with an error and sends nothing', async (values, message) => {
    const fetchMock = renderTasks('specialist');
    await screen.findAllByTestId('task');

    fillForm(values);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(requestTo(fetchMock, '/api/tasks')).toBeUndefined();
  });

  // FR-M4-01: the saved task joins the list as "not done", in due-date order, and the form is empty again.
  test('saves a task and shows it under the assigned tasks as not done', async () => {
    const saved = task(24, newTask.title, 'language', '2026-11-13', 'not_done', 3);
    const fetchMock = renderTasks('specialist', { 'POST /api/tasks': { status: 201, body: saved } });
    await screen.findAllByTestId('task');

    fillForm(newTask);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('status')).toHaveTextContent(`Görev kaydedildi: ${newTask.title}`);
    expect(JSON.parse(requestTo(fetchMock, '/api/tasks').body)).toEqual({ childId: '2', ...newTask });
    expect(titlesAndStatus()).toEqual([
      ['Hikâyeyi kendi cümlelerinle anlat', 'Yapıldı'],
      [newTask.title, 'Yapılmadı'],
      ['Makasla çizgi boyunca kes', 'Yapılmadı'],
    ]);
    expect(screen.getByLabelText('Başlık *')).toHaveValue('');
  });

  test.each([
    [400, 'Görev kaydedilemedi. Lütfen bilgileri kontrol edin.'],
    [403, 'Bu çocuğa erişim izniniz yok.'],
    [500, 'Görev kaydedilemedi. Lütfen tekrar deneyin.'],
  ])('keeps the form and shows an error when saving is answered with %i', async (status, message) => {
    renderTasks('specialist', { 'POST /api/tasks': { status } });
    await screen.findAllByTestId('task');

    fillForm(newTask);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Başlık *')).toHaveValue(newTask.title);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kaydet' })).toBeEnabled());
    expect(screen.getAllByTestId('task')).toHaveLength(2);
  });

  test('"Vazgeç" empties the form and clears the error', async () => {
    renderTasks('specialist');
    await screen.findAllByTestId('task');

    fillForm({ ...newTask, title: '' });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Açıklama/)).toHaveValue('');
    expect(screen.getByLabelText(/^Gelişim alanı/)).toHaveValue('');
  });
});
