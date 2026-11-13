import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { setToken } from './api.js';
import { AuthProvider } from './AuthContext.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import SpecialistChildrenPage from './SpecialistChildrenPage.jsx';
import { mockApi, requestTo } from './testUtils.js';

const can = { id: 2, name: 'Can Demir', parentName: 'Ayşe Demir', linkedAt: '2026-10-12 09:00:00' };
const ela = { id: 7, name: 'Ela Yıldız', parentName: 'Selin Yıldız', linkedAt: '2026-09-03 09:00:00' };

function renderPage(routes) {
  setToken('abc');
  const fetchMock = mockApi({
    'GET /api/auth/me': { body: { id: 3, name: 'Elif Kaya', role: 'specialist' } },
    'GET /api/children': { body: [can, ela] },
    ...routes,
  });
  render(
    <MemoryRouter>
      <AuthProvider>
        <ProtectedRoute role="specialist">
          <SpecialistChildrenPage />
        </ProtectedRoute>
      </AuthProvider>
    </MemoryRouter>
  );
  return fetchMock;
}

async function view(rowIndex = 0) {
  const rows = await screen.findAllByTestId('child');
  fireEvent.click(within(rows[rowIndex]).getByRole('button', { name: 'Görüntüle' }));
  return rows[rowIndex];
}

describe('SpecialistChildrenPage', () => {
  test('lists exactly the children the API gives, with parent and link date (FR-M2-06)', async () => {
    renderPage();

    const rows = await screen.findAllByTestId('child');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Can Demir');
    expect(rows[0]).toHaveTextContent('Ebeveyn: Ayşe Demir · Bağlantı tarihi: 12.10.2026');
    expect(rows[1]).toHaveTextContent('Ela Yıldız');
    expect(rows[1]).toHaveTextContent('Ebeveyn: Selin Yıldız · Bağlantı tarihi: 03.09.2026');
  });

  test('says so when no child is linked', async () => {
    renderPage({ 'GET /api/children': { body: [] } });

    expect(await screen.findByText('Şu anda bağlı olduğunuz bir çocuk yok.')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  test('shows an error when the children cannot be loaded', async () => {
    renderPage({ 'GET /api/children': { status: 500 } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Çocuklar yüklenemedi.');
  });

  test('asks for the tasks of the chosen child and lists them with their status', async () => {
    const fetchMock = renderPage({
      'GET /api/tasks?childId=7': { body: [{ id: 1, childId: 7, title: 'Resim yap', status: 'done' }] },
    });

    const row = await view(1);

    expect(await within(row).findByTestId('task')).toHaveTextContent('Resim yap · Yapıldı');
    expect(requestTo(fetchMock, '/api/tasks?childId=2')).toBeUndefined();
  });

  test('says so when the child has no tasks', async () => {
    renderPage({ 'GET /api/tasks?childId=2': { body: [] } });

    const row = await view();

    expect(await within(row).findByText('Bu çocuğun henüz görevi yok.')).toBeInTheDocument();
  });

  test('shows access denied and drops the child after a 403 (Flow 3)', async () => {
    renderPage({ 'GET /api/tasks?childId=2': { status: 403 } });

    await view();

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu çocuğa erişim izniniz yok.');
    expect(screen.queryByText('Can Demir')).not.toBeInTheDocument();
    expect(screen.getByText('Ela Yıldız')).toBeInTheDocument();
  });

  test('shows the empty message once the only child is dropped', async () => {
    renderPage({ 'GET /api/children': { body: [can] }, 'GET /api/tasks?childId=2': { status: 403 } });

    await view();

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu çocuğa erişim izniniz yok.');
    expect(screen.getByText('Şu anda bağlı olduğunuz bir çocuk yok.')).toBeInTheDocument();
  });

  test('keeps the child and says the tasks failed for any other error', async () => {
    renderPage({ 'GET /api/tasks?childId=2': { status: 500 } });

    const row = await view();

    expect(await within(row).findByRole('alert')).toHaveTextContent('Görevler yüklenemedi.');
    expect(screen.getByText('Can Demir')).toBeInTheDocument();
  });
});
