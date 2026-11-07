import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { setToken } from './api.js';
import { AuthProvider } from './AuthContext.jsx';
import ParentDashboard from './ParentDashboard.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import { mockApi } from './testUtils.js';

const LINKS = '/api/children/2/specialists';
const can = { id: 2, name: 'Can Demir' };
const elif = { id: 3, name: 'Elif Kaya', specialistType: 'teacher', linkedAt: '2026-10-12 09:00:00' };
const murat = { id: 4, name: 'Murat Şahin', specialistType: 'psychologist', linkedAt: '2026-10-12 09:00:00' };
const zeynep = { id: 5, name: 'Zeynep Arslan', specialistType: 'coach', linkedAt: '2026-10-13 09:00:00' };

function renderDashboard(routes) {
  setToken('abc');
  const fetchMock = mockApi({
    'GET /api/auth/me': { body: { id: 1, name: 'Ayşe Demir', role: 'parent' } },
    'GET /api/children': { body: [can] },
    [`GET ${LINKS}`]: { body: [elif, murat] },
    ...routes,
  });
  render(
    <MemoryRouter>
      <AuthProvider>
        <ProtectedRoute role="parent">
          <ParentDashboard />
        </ProtectedRoute>
      </AuthProvider>
    </MemoryRouter>
  );
  return fetchMock;
}

async function submitEmail(email) {
  fireEvent.change(await screen.findByLabelText('Uzmanın e-posta adresi'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Uzman ekle' }));
}

describe('ParentDashboard', () => {
  test('shows the child and the linked specialists with their type in Turkish', async () => {
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Can Demir' })).toBeInTheDocument();
    const rows = await screen.findAllByTestId('specialist');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Elif Kaya');
    expect(rows[0]).toHaveTextContent('Öğretmen');
    expect(rows[1]).toHaveTextContent('Murat Şahin');
    expect(rows[1]).toHaveTextContent('Psikolog');
  });

  test('shows a block for each child', async () => {
    renderDashboard({
      'GET /api/children': { body: [can, { id: 9, name: 'Ali Demir' }] },
      'GET /api/children/9/specialists': { body: [] },
    });

    expect(await screen.findByRole('heading', { name: 'Ali Demir' })).toBeInTheDocument();
    expect(await screen.findByText('Henüz bağlı uzman yok.')).toBeInTheDocument();
    expect(await screen.findAllByTestId('specialist')).toHaveLength(2);
  });

  test('says so when the parent has no child', async () => {
    renderDashboard({ 'GET /api/children': { body: [] } });

    expect(await screen.findByText('Henüz kayıtlı çocuğunuz yok.')).toBeInTheDocument();
  });

  test('says so when no specialist is linked', async () => {
    renderDashboard({ [`GET ${LINKS}`]: { body: [] } });

    expect(await screen.findByText('Henüz bağlı uzman yok.')).toBeInTheDocument();
  });

  test('shows an error when the children cannot be loaded', async () => {
    renderDashboard({ 'GET /api/children': { status: 500 } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Çocuk bilgileri yüklenemedi.');
  });

  test('shows an error when the specialists cannot be loaded', async () => {
    renderDashboard({ [`GET ${LINKS}`]: { status: 500 } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Bağlı uzmanlar yüklenemedi.');
    expect(screen.queryByLabelText('Uzmanın e-posta adresi')).not.toBeInTheDocument();
  });

  describe('link form', () => {
    test('sends the email and adds the specialist to the list (FR-M2-01)', async () => {
      const fetchMock = renderDashboard({ [`POST ${LINKS}`]: { status: 201, body: zeynep } });

      await submitEmail('coach@demo.test');

      expect(await screen.findByText('Zeynep Arslan')).toBeInTheDocument();
      expect(await screen.findByRole('status')).toHaveTextContent('Uzman bağlandı.');
      expect(screen.getAllByTestId('specialist')[2]).toHaveTextContent('Koç');
      const post = fetchMock.mock.calls.find(([url, options]) => url === LINKS && options.method === 'POST');
      expect(JSON.parse(post[1].body)).toEqual({ email: 'coach@demo.test' });
      expect(screen.getByLabelText('Uzmanın e-posta adresi')).toHaveValue('');
    });

    test('shows the error of the mockup for an email that is not a specialist (FR-M2-02)', async () => {
      renderDashboard({ [`POST ${LINKS}`]: { status: 400 } });

      await submitEmail('nobody@demo.test');

      expect(await screen.findByRole('alert')).toHaveTextContent('Bu e-posta kayıtlı bir uzmana ait değil.');
      expect(screen.getAllByTestId('specialist')).toHaveLength(2);
      expect(screen.getByLabelText('Uzmanın e-posta adresi')).toHaveValue('nobody@demo.test');
    });

    test('says the specialist is already linked, as a notice and without a second row (FR-M2-03)', async () => {
      renderDashboard({ [`POST ${LINKS}`]: { status: 200, body: elif } });

      await submitEmail('teacher@demo.test');

      expect(await screen.findByRole('status')).toHaveTextContent('Bu uzman zaten bağlı.');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('specialist')).toHaveLength(2);
    });

    test('shows a Turkish error when the server fails', async () => {
      renderDashboard({ [`POST ${LINKS}`]: { status: 500 } });

      await submitEmail('coach@demo.test');

      expect(await screen.findByRole('alert')).toHaveTextContent('Uzman eklenemedi. Lütfen tekrar deneyin.');
    });

    test('a new attempt clears the old error', async () => {
      renderDashboard({ [`POST ${LINKS}`]: { status: 400 } });
      await submitEmail('nobody@demo.test');
      await screen.findByRole('alert');

      mockApi({ [`POST ${LINKS}`]: { status: 201, body: zeynep } });
      await submitEmail('coach@demo.test');

      expect(await screen.findByRole('status')).toHaveTextContent('Uzman bağlandı.');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('links to the child of the form it was sent from', async () => {
      const fetchMock = renderDashboard({
        'GET /api/children': { body: [can, { id: 9, name: 'Ali Demir' }] },
        'GET /api/children/9/specialists': { body: [] },
        'POST /api/children/9/specialists': { status: 201, body: zeynep },
      });
      const ali = (await screen.findByRole('heading', { name: 'Ali Demir' })).closest('section');

      fireEvent.change(await within(ali).findByLabelText('Uzmanın e-posta adresi'), { target: { value: 'coach@demo.test' } });
      fireEvent.click(within(ali).getByRole('button', { name: 'Uzman ekle' }));

      expect(await within(ali).findByText('Zeynep Arslan')).toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([url, options]) => url === '/api/children/9/specialists' && options.method === 'POST')).toBe(true);
    });
  });

  describe('unlink (FR-M2-04)', () => {
    const ELIF_LINK = `${LINKS}/3`;

    function deleteRequests(fetchMock) {
      return fetchMock.mock.calls.filter(([, options]) => options.method === 'DELETE');
    }

    async function openConfirmation(rowIndex = 0) {
      const rows = await screen.findAllByTestId('specialist');
      fireEvent.click(within(rows[rowIndex]).getByRole('button', { name: 'Bağlantıyı kaldır' }));
      return rows[rowIndex];
    }

    // Holds back the next API answer, so a test can act while that request is pending.
    function holdNextAnswer(fetchMock) {
      let answer;
      fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
      return (status, body) => act(async () => answer({ ok: true, status, json: async () => body }));
    }

    test('asks first and sends nothing until the parent confirms', async () => {
      const fetchMock = renderDashboard({ [`DELETE ${ELIF_LINK}`]: { status: 204 } });

      const row = await openConfirmation();

      expect(within(row).getByText('Bağlantı kaldırılsın mı?')).toBeInTheDocument();
      expect(within(row).getByText('Uzman artık kayıtları göremez.')).toBeInTheDocument();
      expect(deleteRequests(fetchMock)).toHaveLength(0);
      expect(screen.getAllByTestId('specialist')).toHaveLength(2);
    });

    test('asks only about the chosen specialist', async () => {
      renderDashboard();

      await openConfirmation(1);

      const rows = screen.getAllByTestId('specialist');
      expect(within(rows[1]).getByRole('button', { name: 'Evet, kaldır' })).toBeInTheDocument();
      expect(within(rows[0]).queryByRole('button', { name: 'Evet, kaldır' })).not.toBeInTheDocument();
    });

    test('cancelling keeps the specialist and sends nothing', async () => {
      const fetchMock = renderDashboard({ [`DELETE ${ELIF_LINK}`]: { status: 204 } });
      const row = await openConfirmation();

      fireEvent.click(within(row).getByRole('button', { name: 'Vazgeç' }));

      expect(screen.queryByText('Bağlantı kaldırılsın mı?')).not.toBeInTheDocument();
      expect(deleteRequests(fetchMock)).toHaveLength(0);
      expect(screen.getAllByTestId('specialist')).toHaveLength(2);
    });

    test('confirming removes the link and the specialist from the list', async () => {
      const fetchMock = renderDashboard({ [`DELETE ${ELIF_LINK}`]: { status: 204 } });
      const row = await openConfirmation();

      fireEvent.click(within(row).getByRole('button', { name: 'Evet, kaldır' }));

      await waitFor(() => expect(screen.getAllByTestId('specialist')).toHaveLength(1));
      expect(screen.getByTestId('specialist')).toHaveTextContent('Murat Şahin');
      expect(deleteRequests(fetchMock).map(([url]) => url)).toEqual([ELIF_LINK]);
    });

    test('shows the empty message after the last specialist is removed', async () => {
      renderDashboard({ [`GET ${LINKS}`]: { body: [elif] }, [`DELETE ${ELIF_LINK}`]: { status: 204 } });
      const row = await openConfirmation();

      fireEvent.click(within(row).getByRole('button', { name: 'Evet, kaldır' }));

      expect(await screen.findByText('Henüz bağlı uzman yok.')).toBeInTheDocument();
    });

    test('keeps the specialist and shows a Turkish error when the API fails', async () => {
      renderDashboard({ [`DELETE ${ELIF_LINK}`]: { status: 500 } });
      const row = await openConfirmation();

      fireEvent.click(within(row).getByRole('button', { name: 'Evet, kaldır' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Bağlantı kaldırılamadı. Lütfen tekrar deneyin.');
      expect(screen.getAllByTestId('specialist')).toHaveLength(2);
      expect(within(row).getByRole('button', { name: 'Evet, kaldır' })).toBeEnabled();
    });

    test('a specialist can be linked again after an unlink', async () => {
      renderDashboard({ [`DELETE ${ELIF_LINK}`]: { status: 204 }, [`POST ${LINKS}`]: { status: 201, body: elif } });
      const row = await openConfirmation();
      fireEvent.click(within(row).getByRole('button', { name: 'Evet, kaldır' }));
      await waitFor(() => expect(screen.getAllByTestId('specialist')).toHaveLength(1));

      await submitEmail('teacher@demo.test');

      expect(await screen.findByRole('status')).toHaveTextContent('Uzman bağlandı.');
      expect(screen.getAllByTestId('specialist')).toHaveLength(2);
    });

    test.each([
      ['coach@demo.test', zeynep, ['Murat Şahin', 'Zeynep Arslan']],
      ['teacher@demo.test', elif, ['Murat Şahin', 'Elif Kaya']],
    ])('holds back the link of %s while an unlink is pending, so the list stays that of the server', async (email, linked, names) => {
      const fetchMock = renderDashboard({ [`POST ${LINKS}`]: { status: 201, body: linked } });
      const row = await openConfirmation();
      const answerDelete = holdNextAnswer(fetchMock);

      fireEvent.click(within(row).getByRole('button', { name: 'Evet, kaldır' }));
      await submitEmail(email);

      expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);

      await answerDelete(204);
      await submitEmail(email);

      expect(await screen.findByRole('status')).toHaveTextContent('Uzman bağlandı.');
      expect(screen.getAllByTestId('specialist').map((specialist) => specialist.querySelector('strong').textContent)).toEqual(names);
    });

    test('holds back an unlink while a link is pending, so the list stays that of the server', async () => {
      const fetchMock = renderDashboard({ [`DELETE ${ELIF_LINK}`]: { status: 204 } });
      const row = await openConfirmation();
      const answerPost = holdNextAnswer(fetchMock);

      await submitEmail('teacher@demo.test');
      fireEvent.click(within(row).getByRole('button', { name: 'Evet, kaldır' }));

      expect(deleteRequests(fetchMock)).toHaveLength(0);

      await answerPost(200, elif);
      fireEvent.click(within(row).getByRole('button', { name: 'Evet, kaldır' }));

      await waitFor(() => expect(screen.getAllByTestId('specialist')).toHaveLength(1));
      expect(screen.getByTestId('specialist')).toHaveTextContent('Murat Şahin');
    });
  });
});
