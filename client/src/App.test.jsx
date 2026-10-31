import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App from './App.jsx';

const health = { status: 'ok', database: 'ok', users: 5 };

// Answers every API address with its own JSON body, like the real server does.
function mockApi(bodies) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
    ok: true,
    json: async () => bodies[url],
  }));
}

afterEach(() => vi.restoreAllMocks());

describe('App', () => {
  test('shows the system status from the API', async () => {
    mockApi({ '/api/health': health, '/api/tasks': [] });

    render(<App />);

    expect(await screen.findByTestId('health')).toHaveTextContent('Kayıtlı kullanıcı: 5');
  });

  test('shows the tasks from the API with their status in Turkish', async () => {
    mockApi({
      '/api/health': health,
      '/api/tasks': [
        { id: 1, childId: 2, title: '20 dakika kitap oku', developmentArea: 'language', status: 'not_done' },
        { id: 2, childId: 2, title: 'Ayakkabılarını bağla', developmentArea: 'self_care', status: 'done' },
      ],
    });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Görevler' })).toBeInTheDocument();
    const tasks = screen.getAllByTestId('task');
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toHaveTextContent('20 dakika kitap oku · Yapılmadı');
    expect(tasks[1]).toHaveTextContent('Ayakkabılarını bağla · Yapıldı');
  });

  test('shows an error when the API cannot be reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya ulaşılamadı');
  });
});
