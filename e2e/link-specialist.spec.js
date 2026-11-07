const { test, expect } = require('@playwright/test');

const PASSWORD = 'Demo1234';

async function logIn(page, email) {
  await page.goto('/login');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre').fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

function storedToken(page) {
  return page.evaluate(() => sessionStorage.getItem('authToken'));
}

async function apiToken(request, email) {
  const res = await request.post('/api/auth/login', { data: { email, password: PASSWORD } });
  return (await res.json()).token;
}

// The seed leaves the coach unlinked. A run that stopped halfway must not break the next one
// while a local server is reused, so the link is removed through the API before and after the test.
async function unlinkCoach(request) {
  const headers = bearer(await apiToken(request, 'parent@demo.test'));
  const [child] = await (await request.get('/api/children', { headers })).json();
  const specialists = await (await request.get(`/api/children/${child.id}/specialists`, { headers })).json();
  for (const specialist of specialists.filter(({ name }) => name === 'Zeynep Arslan')) {
    await request.delete(`/api/children/${child.id}/specialists/${specialist.id}`, { headers });
  }
}

test.beforeEach(({ request }) => unlinkCoach(request));
test.afterEach(({ request }) => unlinkCoach(request));

// SDD Flow 3: the coach keeps the same token and the same open page through the whole test.
test('a parent links the coach, the coach sees the child, and the unlink ends the access', async ({ page: parentPage, browser, request }) => {
  const coachContext = await browser.newContext({ baseURL: 'http://localhost:5173' });
  const coachPage = await coachContext.newPage();
  const specialistRows = parentPage.getByTestId('specialist');
  const coachRow = specialistRows.filter({ hasText: 'Zeynep Arslan' });
  const canRow = coachPage.getByTestId('child').filter({ hasText: 'Can Demir' });

  await logIn(coachPage, 'coach@demo.test');
  await expect(coachPage.getByText('Şu anda bağlı olduğunuz bir çocuk yok.')).toBeVisible();

  await logIn(parentPage, 'parent@demo.test');
  await expect(parentPage.getByRole('heading', { name: 'Can Demir' })).toBeVisible();
  await expect(specialistRows).toHaveCount(2);

  // FR-M2-02: an email that is not a specialist links no one.
  await parentPage.getByLabel('Uzmanın e-posta adresi').fill('child@demo.test');
  await parentPage.getByRole('button', { name: 'Uzman ekle' }).click();
  await expect(parentPage.getByRole('alert')).toHaveText('Bu e-posta kayıtlı bir uzmana ait değil.');
  await expect(specialistRows).toHaveCount(2);

  // FR-M2-01: the specialist appears with name and type.
  await parentPage.getByLabel('Uzmanın e-posta adresi').fill('coach@demo.test');
  await parentPage.getByRole('button', { name: 'Uzman ekle' }).click();
  await expect(coachRow).toContainText('Koç');
  await expect(parentPage.getByRole('status')).toHaveText('Uzman bağlandı.');

  // FR-M2-03: linking again adds no second row and is not shown as a failure.
  await parentPage.getByLabel('Uzmanın e-posta adresi').fill('coach@demo.test');
  await parentPage.getByRole('button', { name: 'Uzman ekle' }).click();
  await expect(parentPage.getByRole('status')).toHaveText('Bu uzman zaten bağlı.');
  await expect(parentPage.getByRole('alert')).toHaveCount(0);
  await expect(specialistRows).toHaveCount(3);

  // FR-M2-06: the coach sees the child now and can open it.
  await coachPage.reload();
  await expect(canRow).toContainText('Ebeveyn: Ayşe Demir');
  await canRow.getByRole('button', { name: 'Görüntüle' }).click();
  await expect(canRow.getByTestId('task')).toContainText('20 dakika kitap oku');
  const coachToken = await storedToken(coachPage);

  // FR-M2-04: nothing happens until the parent confirms.
  await coachRow.getByRole('button', { name: 'Bağlantıyı kaldır' }).click();
  await coachRow.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(specialistRows).toHaveCount(3);

  await coachRow.getByRole('button', { name: 'Bağlantıyı kaldır' }).click();
  await expect(coachRow).toContainText('Bağlantı kaldırılsın mı?');
  await coachRow.getByRole('button', { name: 'Evet, kaldır' }).click();
  await expect(specialistRows).toHaveCount(2);

  // FR-M2-05: the page the coach still has open is denied with the same token.
  await canRow.getByRole('button', { name: 'Görüntüle' }).click();
  await expect(coachPage.getByRole('alert')).toHaveText('Bu çocuğa erişim izniniz yok.');
  await expect(coachPage.getByTestId('child')).toHaveCount(0);

  const [child] = await (await request.get('/api/children', { headers: bearer(await storedToken(parentPage)) })).json();
  const tasks = await request.get(`/api/tasks?childId=${child.id}`, { headers: bearer(coachToken) });
  expect(tasks.status()).toBe(403);
  expect(await tasks.json()).toEqual({ error: 'Forbidden' });
  expect((await request.get('/api/auth/me', { headers: bearer(coachToken) })).status()).toBe(200);

  // FR-M2-06: the child stays gone after a new load.
  await coachPage.reload();
  await expect(coachPage.getByText('Şu anda bağlı olduğunuz bir çocuk yok.')).toBeVisible();
  await expect(coachPage.getByText('Can Demir')).toHaveCount(0);

  await coachContext.close();
});
