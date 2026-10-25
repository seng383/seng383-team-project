import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App from './App.jsx';

afterEach(() => vi.restoreAllMocks());

describe('App', () => {
  test('shows the system status from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', database: 'ok', users: 5 }),
    });

    render(<App />);

    expect(await screen.findByTestId('health')).toHaveTextContent('Kayıtlı kullanıcı: 5');
  });

  test('shows an error when the API cannot be reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya ulaşılamadı');
  });
});
