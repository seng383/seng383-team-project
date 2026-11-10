const { test, expect } = require('@playwright/test');

const PASSWORD = 'Demo1234';
// Noon UTC on a Wednesday is that Wednesday from UTC-11 to UTC+11, so the browsers open on the week of
// 9 to 15 November 2026 here and on CI (UTC) alike. Every run adds events with new titles to that week.
const NOW = new Date('2026-11-11T12:00:00Z');
const MONDAY = '2026-11-09';
const WEDNESDAY = '2026-11-11';

async function logIn(page, email) {
  await page.goto('/login');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre').fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

// The token and the user, as the login page gets them.
async function apiLogIn(request, email) {
  const res = await request.post('/api/auth/login', { data: { email, password: PASSWORD } });
  return res.json();
}

function eventsOfTheWeek(page) {
  return {
    on: (dayName, title) => page.getByTestId('day').filter({ hasText: dayName }).getByTestId('event').filter({ hasText: title }),
    all: (title) => page.getByTestId('event').filter({ hasText: title }),
  };
}

// FR-M3-01 to FR-M3-04: the parent adds an event to the week on the screen; the child sees it and cannot add one.
test('a parent adds an event to the shown week and the child sees it under "Takvimim"', async ({ page: parentPage, browser, baseURL, request }) => {
  const title = `Kütüphane ziyareti ${Date.now()}`;
  const parentWeek = eventsOfTheWeek(parentPage);

  await parentPage.clock.setFixedTime(NOW);
  await logIn(parentPage, 'parent@demo.test');
  await parentPage.getByRole('link', { name: 'Haftalık program' }).click();

  await expect(parentPage).toHaveURL(/\/children\/\d+\/schedule$/);
  await expect(parentPage.getByRole('heading', { level: 1 })).toHaveText('Can Demir');
  await expect(parentPage.getByRole('heading', { name: '9 Kasım – 15 Kasım 2026' })).toBeVisible();

  // FR-M3-02: an end before the start is refused with the message of the mockup, and nothing is shown.
  await parentPage.getByRole('button', { name: 'Etkinlik ekle' }).click();
  await parentPage.getByLabel('Başlık', { exact: true }).fill(title);
  await parentPage.getByLabel('Tarih', { exact: true }).fill(WEDNESDAY);
  await parentPage.getByLabel('Başlangıç', { exact: true }).fill('15:00');
  await parentPage.getByLabel('Bitiş', { exact: true }).fill('14:30');
  await parentPage.getByRole('button', { name: 'Kaydet' }).click();
  await expect(parentPage.getByRole('alert')).toHaveText('Bitiş saati başlangıç saatinden önce olamaz.');
  await expect(parentWeek.all(title)).toHaveCount(0);

  // FR-M3-01, FR-M3-03: the corrected event appears under its day without the page being loaded again.
  await parentPage.evaluate(() => (window.openBeforeSaving = true));
  await parentPage.getByLabel('Bitiş', { exact: true }).fill('16:00');
  await parentPage.getByRole('button', { name: 'Kaydet' }).click();
  await expect(parentWeek.on('Çarşamba', title)).toHaveText(`15:00–16:00 ${title}`);
  await expect(parentWeek.all(title)).toHaveCount(1);
  expect(await parentPage.evaluate(() => window.openBeforeSaving)).toBe(true);

  // The server holds the event once, with the corrected end: the refused attempt stored nothing.
  const headers = bearer((await apiLogIn(request, 'parent@demo.test')).token);
  const [can] = await (await request.get('/api/children', { headers })).json();
  const week = await (await request.get(`/api/children/${can.id}/events?week=${MONDAY}`, { headers })).json();
  const stored = week.filter((event) => event.title === title);
  expect(stored.map(({ eventDate, startTime, endTime }) => [eventDate, startTime, endTime])).toEqual([[WEDNESDAY, '15:00', '16:00']]);

  // FR-M3-04: the child finds the event in their own week, with no way to add one.
  const childContext = await browser.newContext({ baseURL });
  const childPage = await childContext.newPage();
  await childPage.clock.setFixedTime(NOW);
  await logIn(childPage, 'child@demo.test');
  await childPage.getByRole('link', { name: 'Takvimim' }).click();

  await expect(childPage).toHaveURL(/\/child\/schedule$/);
  await expect(childPage.getByRole('heading', { level: 1 })).toHaveText('Takvimim');
  await expect(eventsOfTheWeek(childPage).on('Çarşamba', title)).toHaveText(`15:00–16:00 ${title}`);
  await expect(childPage.getByRole('button', { name: 'Etkinlik ekle' })).toHaveCount(0);

  await childContext.close();
});

// FR-M3-04, FR-M2-05: the API itself keeps an unlinked specialist out of the schedule and a child from adding to it.
test('the API answers 403 to the unlinked coach and to the child adding an event', async ({ request }) => {
  const title = `Çocuğun etkinliği ${Date.now()}`;
  const parent = await apiLogIn(request, 'parent@demo.test');
  const child = await apiLogIn(request, 'child@demo.test');
  const coach = await apiLogIn(request, 'coach@demo.test');
  const events = `/api/children/${child.user.id}/events`;

  // The seed leaves the coach unlinked, but a stopped run of link-specialist.spec.js can leave the link on a reused server.
  await request.delete(`/api/children/${child.user.id}/specialists/${coach.user.id}`, { headers: bearer(parent.token) });

  const coachRead = await request.get(`${events}?week=${MONDAY}`, { headers: bearer(coach.token) });
  expect(coachRead.status()).toBe(403);
  expect(await coachRead.json()).toEqual({ error: 'Forbidden' });

  const childAdd = await request.post(events, {
    headers: bearer(child.token),
    data: { title, eventDate: WEDNESDAY, startTime: '10:00', endTime: '11:00' },
  });
  expect(childAdd.status()).toBe(403);

  const childRead = await request.get(`${events}?week=${MONDAY}`, { headers: bearer(child.token) });
  expect(childRead.status()).toBe(200);
  expect((await childRead.json()).map((event) => event.title)).not.toContain(title);
});
