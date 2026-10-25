const { test, expect } = require('@playwright/test');

// Walking skeleton: browser -> React -> Express -> SQLite and back.
test('home page shows that the system is running with the seeded users', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Çocuk Gelişim Platformu' })).toBeVisible();
  await expect(page.getByTestId('health')).toContainText('çalışıyor');
  await expect(page.getByTestId('health')).toContainText('Kayıtlı kullanıcı: 5');
});
