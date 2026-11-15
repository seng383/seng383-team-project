const { test, expect } = require('@playwright/test');

const PASSWORD = 'Demo1234';
const DUE_DATE = '2026-11-20';

async function logIn(page, email) {
  await page.goto('/login');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre').fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function apiToken(request, email) {
  const res = await request.post('/api/auth/login', { data: { email, password: PASSWORD } });
  return (await res.json()).token;
}

// SDD Flow 2 (FR-M4-01, FR-M4-03, FR-M4-05): the teacher assigns a task, the child marks it done,
// and the teacher sees it as done. Every run adds a task with a new title.
test('a specialist assigns a task, the child marks it done and the specialist sees it as done', async ({ page: teacherPage, browser, baseURL }) => {
  const title = `Resimli kitaptan 5 sayfa oku ${Date.now()}`;

  await logIn(teacherPage, 'teacher@demo.test');
  await teacherPage.getByRole('link', { name: 'Haftalık program' }).click();
  await teacherPage.getByRole('link', { name: 'Görevler' }).click();
  await expect(teacherPage).toHaveURL(/\/children\/\d+\/tasks$/);
  await expect(teacherPage.getByRole('heading', { level: 1 })).toHaveText('Can Demir');

  // FR-M4-02: without a development area the task is refused and not listed.
  await teacherPage.getByLabel('Başlık').fill(title);
  await teacherPage.getByLabel('Son tarih').fill(DUE_DATE);
  await teacherPage.getByRole('button', { name: 'Kaydet' }).click();
  await expect(teacherPage.getByRole('alert')).toHaveText('Gelişim alanı seçilmelidir.');
  await expect(teacherPage.getByTestId('task').filter({ hasText: title })).toHaveCount(0);

  await teacherPage.getByLabel('Gelişim alanı').selectOption('language');
  await teacherPage.getByRole('button', { name: 'Kaydet' }).click();
  const assigned = teacherPage.getByTestId('task').filter({ hasText: title });
  await expect(assigned).toContainText('Dil · 20.11.2026');
  await expect(assigned.getByTestId('task-status')).toHaveText('Yapılmadı');

  // FR-M4-03: the child finds the task on their own screen and marks it done.
  const childContext = await browser.newContext({ baseURL });
  const childPage = await childContext.newPage();
  await logIn(childPage, 'child@demo.test');
  await expect(childPage.getByRole('heading', { level: 1 })).toHaveText('Görevlerim');
  const own = childPage.getByTestId('task').filter({ hasText: title });
  await expect(own).toContainText('Yapılmadı');
  await expect(own).toContainText('Dil · Son gün: 20 Kasım Cuma');
  await own.getByRole('button', { name: 'Yapıldı olarak işaretle' }).click();
  await expect(own).toContainText(`${title} · Yapıldı`);
  await expect(own.getByRole('button')).toHaveCount(0);
  await childContext.close();

  // FR-M4-05: the teacher sees the new status when the list is loaded again.
  await teacherPage.reload();
  await expect(teacherPage.getByTestId('task').filter({ hasText: title }).getByTestId('task-status')).toHaveText('Yapıldı');
});

// FR-M4-04, FR-M2-05: the API itself keeps the unlinked coach out and lets a child change only their own task.
test('the API answers 403 to the unlinked coach and to a child assigning or changing a task that is not theirs', async ({ request }) => {
  const parentHeaders = bearer(await apiToken(request, 'parent@demo.test'));
  const [can] = await (await request.get('/api/children', { headers: parentHeaders })).json();
  const task = { childId: can.id, title: 'Erişim denemesi', developmentArea: 'cognitive', dueDate: DUE_DATE };

  const coachHeaders = bearer(await apiToken(request, 'coach@demo.test'));
  expect((await request.get(`/api/tasks?childId=${can.id}`, { headers: coachHeaders })).status()).toBe(403);
  expect((await request.post('/api/tasks', { headers: coachHeaders, data: task })).status()).toBe(403);

  const childHeaders = bearer(await apiToken(request, 'child@demo.test'));
  expect((await request.post('/api/tasks', { headers: childHeaders, data: task })).status()).toBe(403);
  expect((await request.patch('/api/tasks/999999', { headers: childHeaders, data: { status: 'done' } })).status()).toBe(403);

  // The child's list holds only the child's own tasks.
  const own = await (await request.get('/api/tasks', { headers: childHeaders })).json();
  expect(own.every((listed) => listed.childId === can.id)).toBe(true);
});
