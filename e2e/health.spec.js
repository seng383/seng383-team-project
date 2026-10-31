const { test, expect } = require('@playwright/test');

// Walking skeleton: browser -> React -> Express -> SQLite and back.
test('home page shows that the system is running with the seeded users', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Çocuk Gelişim Platformu' })).toBeVisible();
  await expect(page.getByTestId('health')).toContainText('çalışıyor');
  await expect(page.getByTestId('health')).toContainText('Kayıtlı kullanıcı: 5');
});

test('home page shows the sample task from the database', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Görevler' })).toBeVisible();
  const task = page.getByTestId('task').filter({ hasText: '20 dakika kitap oku' });
  await expect(task).toBeVisible();
  await expect(task).toContainText('Yapılmadı');
});
