const { test, expect } = require('@playwright/test');

const PASSWORD = 'Demo1234';

const roles = [
  { email: 'parent@demo.test', path: '/parent', heading: 'Ebeveyn paneli', name: 'Ayşe Demir · Ebeveyn' },
  { email: 'teacher@demo.test', path: '/specialist', heading: 'Çocuklarım', name: 'Elif Kaya · Uzman' },
  { email: 'child@demo.test', path: '/child', heading: 'Görevlerim', name: 'Can Demir · Çocuk' },
];

async function logIn(page, email, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre').fill(password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

function storedToken(page) {
  return page.evaluate(() => sessionStorage.getItem('authToken'));
}

// SDD Flow 1: each role lands on their own start screen and is denied the pages of the others.
for (const { email, path, heading, name } of roles) {
  test(`${email} lands on their own start screen`, async ({ page }) => {
    await logIn(page, email);

    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });
}

test('the child sees the sample task from the database', async ({ page }) => {
  await logIn(page, 'child@demo.test');

  const task = page.getByTestId('task').filter({ hasText: '20 dakika kitap oku' });
  await expect(task).toBeVisible();
  await expect(task).toContainText('Yapılmadı');
});

test('a child typing the address of the parent page sees access denied', async ({ page }) => {
  await logIn(page, 'child@demo.test');
  await expect(page.getByRole('heading', { name: 'Görevlerim' })).toBeVisible();

  await page.goto('/parent');

  await expect(page.getByRole('alert')).toHaveText('Bu sayfaya erişim izniniz yok.');
  await expect(page.getByRole('heading', { name: 'Ebeveyn paneli' })).toHaveCount(0);
});

test('the API answers 403 when a child calls a parent and specialist endpoint directly', async ({ page, request }) => {
  await logIn(page, 'child@demo.test');
  await expect(page.getByRole('heading', { name: 'Görevlerim' })).toBeVisible();

  const res = await request.get('/api/children', {
    headers: { Authorization: `Bearer ${await storedToken(page)}` },
  });

  expect(res.status()).toBe(403);
});

test('wrong password and unknown email show the same error and start no session', async ({ page }) => {
  await logIn(page, 'parent@demo.test', 'wrong-password');
  await expect(page.getByRole('alert')).toHaveText('E-posta veya şifre hatalı.');
  await expect(page).toHaveURL(/\/login$/);
  expect(await storedToken(page)).toBeNull();

  await logIn(page, 'nobody@demo.test');
  await expect(page.getByRole('alert')).toHaveText('E-posta veya şifre hatalı.');
  await expect(page).toHaveURL(/\/login$/);
  expect(await storedToken(page)).toBeNull();
});

test('a visitor without a token is sent to the login page', async ({ page }) => {
  await page.goto('/parent');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Giriş yap' })).toBeVisible();
});

test('after logout neither the back button nor the old token gets back in', async ({ page, request }) => {
  await logIn(page, 'child@demo.test');
  await expect(page.getByTestId('task').first()).toBeVisible();

  // Leaves the child's task screen in the history, so "back" has a protected page to return to.
  await page.goto('/parent');
  const token = await storedToken(page);
  await page.getByRole('button', { name: 'Çıkış yap' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await storedToken(page)).toBeNull();

  const visited = [];
  page.on('framenavigated', (frame) => visited.push(new URL(frame.url()).pathname));
  await page.goBack();

  await expect(page).toHaveURL(/\/login$/);
  expect(visited).toContain('/child');
  await expect(page.getByRole('heading', { name: 'Giriş yap' })).toBeVisible();
  await expect(page.getByTestId('task')).toHaveCount(0);

  const res = await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(401);
});
