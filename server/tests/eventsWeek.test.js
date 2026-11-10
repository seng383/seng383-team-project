const request = require('supertest');
const { openDatabase } = require('../src/db');
const { seed, DEMO_PASSWORD } = require('../src/db/seed');
const { createApp } = require('../src/app');

const WEEK_ERROR = 'week must be a Monday as YYYY-MM-DD';

describe('GET /api/children/:childId/events', () => {
  let db;
  let app;
  let childId;
  let parentId;
  const week = (monday = '2026-10-26', id = childId) => `/api/children/${id}/events?week=${monday}`;

  beforeEach(() => {
    db = openDatabase(':memory:');
    seed(db);
    app = createApp(db);
    childId = idOf('child@demo.test');
    parentId = idOf('parent@demo.test');
  });

  afterEach(() => db.close());

  function idOf(email) {
    return db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  }

  async function logIn(email) {
    const res = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
    return res.body.token;
  }

  async function as(email) {
    const token = await logIn(email);
    const send = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
    return {
      get: (url) => send('get', url),
      post: (url, body) => send('post', url).send(body),
      delete: (url) => send('delete', url),
    };
  }

  function addEvent(eventDate, startTime, endTime, title, { child = childId, createdBy = parentId } = {}) {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO events (child_id, created_by, title, event_date, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)')
      .run(child, createdBy, title, eventDate, startTime, endTime);
    return Number(lastInsertRowid);
  }

  function titles(res) {
    return res.body.map((event) => event.title);
  }

  // A second family with a task and an event of its own, so cross-family access can be tried.
  function addOtherFamily() {
    const { password_hash: hash } = db.prepare("SELECT password_hash FROM users WHERE email = 'parent@demo.test'").get();
    const insert = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    const otherParentId = insert.run('Selin Yıldız', 'other-parent@demo.test', hash, 'parent').lastInsertRowid;
    const otherChildId = Number(insert.run('Ela Yıldız', 'other-child@demo.test', hash, 'child').lastInsertRowid);
    db.prepare('INSERT INTO children (user_id, parent_id) VALUES (?, ?)').run(otherChildId, otherParentId);
    db.prepare(
      "INSERT INTO tasks (child_id, assigned_by, title, development_area, due_date) VALUES (?, ?, 'Ela görevi', 'cognitive', '2026-10-27')"
    ).run(otherChildId, otherParentId);
    addEvent('2026-10-27', '10:00', '11:00', 'Ela etkinliği', { child: otherChildId, createdBy: otherParentId });
    return otherChildId;
  }

  describe('the week (FR-M3-03)', () => {
    test('gives the events from Monday to Sunday and none of the days around the week', async () => {
      addEvent('2026-10-25', '10:00', '11:00', 'Önceki pazar');
      addEvent('2026-10-26', '00:00', '00:30', 'Pazartesi');
      addEvent('2026-10-29', '12:00', '13:00', 'Perşembe');
      addEvent('2026-11-01', '23:00', '23:59', 'Pazar');
      addEvent('2026-11-02', '00:00', '01:00', 'Sonraki pazartesi');

      const res = await (await as('parent@demo.test')).get(week('2026-10-26'));

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Pazartesi', 'Perşembe', 'Pazar']);
    });

    test('orders the events by day, then by start and end time, then in the order they were added', async () => {
      addEvent('2026-10-30', '15:30', '16:30', 'Resim kursu');
      addEvent('2026-10-26', '09:30', '10:15', 'Dil terapisi');
      addEvent('2026-10-30', '10:00', '12:00', 'Okul gezisi');
      addEvent('2026-10-28', '16:00', '17:00', 'Yüzme');
      addEvent('2026-10-30', '10:00', '11:00', 'Kısa ziyaret');
      addEvent('2026-10-28', '16:00', '17:00', 'Yüzme arkadaşıyla');

      const res = await (await as('parent@demo.test')).get(week());

      expect(titles(res)).toEqual(['Dil terapisi', 'Yüzme', 'Yüzme arkadaşıyla', 'Kısa ziyaret', 'Okul gezisi', 'Resim kursu']);
    });

    test('answers with the fields of each event and the name of who added it', async () => {
      const teacherId = idOf('teacher@demo.test');
      const id = addEvent('2026-10-27', '15:00', '16:00', 'Kütüphane ziyareti', { createdBy: teacherId });

      const res = await (await as('parent@demo.test')).get(week());

      expect(res.body).toEqual([
        {
          id,
          childId,
          title: 'Kütüphane ziyareti',
          eventDate: '2026-10-27',
          startTime: '15:00',
          endTime: '16:00',
          createdBy: teacherId,
          createdByName: 'Elif Kaya',
        },
      ]);
    });

    test('gives an empty list for a week without events', async () => {
      addEvent('2026-10-27', '15:00', '16:00', 'Başka hafta');

      const res = await (await as('parent@demo.test')).get(week('2026-11-09'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('finds the Sunday of a week that runs into a new year', async () => {
      addEvent('2026-12-27', '10:00', '11:00', 'Önceki pazar');
      addEvent('2026-12-31', '20:00', '21:00', 'Yılbaşı');
      addEvent('2027-01-03', '10:00', '11:00', 'Pazar');
      addEvent('2027-01-04', '10:00', '11:00', 'Sonraki pazartesi');

      const res = await (await as('parent@demo.test')).get(week('2026-12-28'));

      expect(titles(res)).toEqual(['Yılbaşı', 'Pazar']);
    });

    test('shows an event added through the API in its week, also to the child', async () => {
      const added = await (await as('teacher@demo.test')).post(`/api/children/${childId}/events`, {
        title: 'Okul gezisi',
        eventDate: '2026-10-30',
        startTime: '10:00',
        endTime: '12:00',
      });

      const res = await (await as('child@demo.test')).get(week());

      expect(res.body).toEqual([added.body]);
    });

    test.each([
      ['no week', ''],
      ['an empty week', '?week='],
      ['a Tuesday', '?week=2026-10-27'],
      ['a Sunday', '?week=2026-11-01'],
      ['a date that does not exist', '?week=2026-02-30'],
      ['the Turkish date format', '?week=26.10.2026'],
      ['a date with a time', '?week=2026-10-26T00:00'],
      ['a word', '?week=this-week'],
      ['a week sent twice', '?week=2026-10-26&week=2026-10-26'],
    ])('answers 400 for %s', async (_, query) => {
      const res = await (await as('parent@demo.test')).get(`/api/children/${childId}/events${query}`);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: WEEK_ERROR });
    });
  });

  describe('who may read', () => {
    test.each(['parent@demo.test', 'teacher@demo.test', 'psychologist@demo.test'])('gives %s the events of the child', async (email) => {
      addEvent('2026-10-27', '15:00', '16:00', 'Kütüphane ziyareti');

      const res = await (await as(email)).get(week());

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Kütüphane ziyareti']);
    });

    test('gives the child their own events and nothing of another child (FR-M3-04)', async () => {
      const otherChildId = addOtherFamily();
      addEvent('2026-10-27', '15:00', '16:00', 'Kütüphane ziyareti');
      const child = await as('child@demo.test');

      const own = await child.get(week());
      const other = await child.get(week('2026-10-26', otherChildId));

      expect(own.status).toBe(200);
      expect(titles(own)).toEqual(['Kütüphane ziyareti']);
      expect(other.status).toBe(403);
      expect(other.body).toEqual({ error: 'Forbidden' });
    });

    test('answers 403 without data to the unlinked coach, whose token is valid (FR-M2-05)', async () => {
      addEvent('2026-10-27', '15:00', '16:00', 'Kütüphane ziyareti');
      const coach = await as('coach@demo.test');
      expect((await coach.get('/api/auth/me')).status).toBe(200);

      const res = await coach.get(week());

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    test('answers 403 without data to the parent of another family', async () => {
      addOtherFamily();

      const res = await (await as('other-parent@demo.test')).get(week());

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    test('answers 403 before it looks at the week, so a bad week tells an outsider nothing', async () => {
      const otherChildId = addOtherFamily();

      const coach = await (await as('coach@demo.test')).get(`/api/children/${childId}/events?week=junk`);
      const child = await (await as('child@demo.test')).get(`/api/children/${otherChildId}/events`);

      expect(coach.status).toBe(403);
      expect(child.status).toBe(403);
    });

    test('stops a specialist with the same token as soon as the parent unlinks them (FR-M2-05)', async () => {
      const teacher = await as('teacher@demo.test');
      expect((await teacher.get(week())).status).toBe(200);

      await (await as('parent@demo.test')).delete(`/api/children/${childId}/specialists/${idOf('teacher@demo.test')}`).expect(204);

      const res = await teacher.get(week());
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    test.each(['abc', '0', '-1', '999999', '1.5', '2.0', '2e0'])('answers 403 to the parent for the childId %s', async (badId) => {
      const res = await (await as('parent@demo.test')).get(week('2026-10-26', badId));

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    test.each([
      ['%s.0', (id) => `${id}.0`],
      ['%se0', (id) => `${id}e0`],
      ['0%s', (id) => `0${id}`],
      ['+%s', (id) => `+${id}`],
    ])('does not read %s as the own id of the child', async (_, spell) => {
      const res = await (await as('child@demo.test')).get(week('2026-10-26', encodeURIComponent(spell(childId))));

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    test('needs a valid token that was not logged out (FR-M1-05)', async () => {
      const token = await logIn('parent@demo.test');
      await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(204);

      const responses = [
        await request(app).get(week()),
        await request(app).get(week()).set('Authorization', 'Bearer junk'),
        await request(app).get(week()).set('Authorization', `Bearer ${token}`),
      ];

      for (const res of responses) {
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Unauthorized' });
      }
    });
  });

  // Opening the own schedule to the child must not open anything else under /api/children.
  describe('the child elsewhere', () => {
    test('still gets 403 for GET /api/children (FR-M1-04)', async () => {
      const res = await (await as('child@demo.test')).get('/api/children');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    test.each([
      ['get', () => `/api/children/${childId}/specialists`],
      ['post', () => `/api/children/${childId}/specialists`],
      ['delete', () => `/api/children/${childId}/specialists/${idOf('teacher@demo.test')}`],
      ['get', () => `/api/children/${childId}/anything`],
      ['delete', () => `/api/children/${childId}/events`],
    ])('still gets 403 for %s on an address about their own id', async (method, url) => {
      const linksBefore = db.prepare('SELECT COUNT(*) AS count FROM specialist_links').get().count;
      const child = await as('child@demo.test');

      const res = method === 'post' ? await child.post(url(), { email: 'coach@demo.test' }) : await child[method](url());

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
      expect(db.prepare('SELECT COUNT(*) AS count FROM specialist_links').get().count).toBe(linksBefore);
    });

    // GET /api/tasks never asked canAccessChild for a child: it answers with the child's own tasks, whatever childId says.
    test('still gets only their own tasks when asking for the tasks of another child', async () => {
      const otherChildId = addOtherFamily();

      const res = await (await as('child@demo.test')).get(`/api/tasks?childId=${otherChildId}`);

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['20 dakika kitap oku']);
      expect(res.body.every((task) => task.childId === childId)).toBe(true);
    });
  });
});
