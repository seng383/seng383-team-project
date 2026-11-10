const request = require('supertest');
const { openDatabase } = require('../src/db');
const { seed, DEMO_PASSWORD } = require('../src/db/seed');
const { createApp } = require('../src/app');

const DATE_ERROR = 'eventDate must be a real date as YYYY-MM-DD';
const TIME_ERROR = 'startTime and endTime must be times from 00:00 to 23:59 as HH:MM';
const libraryVisit = { title: 'Kütüphane ziyareti', eventDate: '2026-10-27', startTime: '15:00', endTime: '16:00' };

describe('POST /api/children/:childId/events', () => {
  let db;
  let app;
  let childId;
  const path = () => `/api/children/${childId}/events`;

  beforeEach(() => {
    db = openDatabase(':memory:');
    seed(db);
    app = createApp(db);
    childId = idOf('child@demo.test');
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
    return {
      post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
      delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
    };
  }

  function eventCount() {
    return db.prepare('SELECT COUNT(*) AS count FROM events').get().count;
  }

  function storedEvent(id) {
    return db.prepare('SELECT child_id, created_by, title, event_date, start_time, end_time FROM events WHERE id = ?').get(id);
  }

  // A second family, so cross-family access can be tried.
  function addOtherFamily() {
    const { password_hash: hash } = db.prepare("SELECT password_hash FROM users WHERE email = 'parent@demo.test'").get();
    const insert = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    const otherParentId = insert.run('Selin Yıldız', 'other-parent@demo.test', hash, 'parent').lastInsertRowid;
    const otherChildId = insert.run('Ela Yıldız', 'other-child@demo.test', hash, 'child').lastInsertRowid;
    db.prepare('INSERT INTO children (user_id, parent_id) VALUES (?, ?)').run(otherChildId, otherParentId);
    return Number(otherChildId);
  }

  describe('adding (FR-M3-01)', () => {
    test('lets the parent add an event and answers 201 with it', async () => {
      const parentId = idOf('parent@demo.test');

      const res = await (await as('parent@demo.test')).post(path(), libraryVisit);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        childId,
        title: 'Kütüphane ziyareti',
        eventDate: '2026-10-27',
        startTime: '15:00',
        endTime: '16:00',
        createdBy: parentId,
        createdByName: 'Ayşe Demir',
      });
      expect(storedEvent(res.body.id)).toEqual({
        child_id: childId,
        created_by: parentId,
        title: 'Kütüphane ziyareti',
        event_date: '2026-10-27',
        start_time: '15:00',
        end_time: '16:00',
      });
    });

    test.each([
      ['teacher@demo.test', 'Elif Kaya'],
      ['psychologist@demo.test', 'Murat Şahin'],
    ])('lets the linked specialist %s add an event', async (email, name) => {
      const res = await (await as(email)).post(path(), libraryVisit);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ childId, createdBy: idOf(email), createdByName: name });
    });

    test('stores the title without the spaces around it', async () => {
      const res = await (await as('parent@demo.test')).post(path(), { ...libraryVisit, title: '  Yüzme  ' });

      expect(res.body.title).toBe('Yüzme');
      expect(storedEvent(res.body.id).title).toBe('Yüzme');
    });

    test('takes the child from the address and the creator from the token, whatever the body says', async () => {
      const otherChildId = addOtherFamily();
      const body = { ...libraryVisit, childId: otherChildId, child_id: otherChildId, createdBy: idOf('parent@demo.test'), created_by: 1 };

      const res = await (await as('teacher@demo.test')).post(path(), body);

      expect(res.status).toBe(201);
      expect(storedEvent(res.body.id)).toMatchObject({ child_id: childId, created_by: idOf('teacher@demo.test') });
      expect(db.prepare('SELECT * FROM events WHERE child_id = ?').all(otherChildId)).toEqual([]);
    });

    test.each([
      ['the same start and end time', { startTime: '15:00', endTime: '15:00' }],
      ['the first and the last minute of the day', { startTime: '00:00', endTime: '23:59' }],
      ['29 February of a leap year', { eventDate: '2028-02-29' }],
      ['a title of 200 characters', { title: 'a'.repeat(200) }],
      ['a title of 200 characters with spaces around it', { title: `  ${'a'.repeat(200)}  ` }],
    ])('accepts %s', async (_, change) => {
      const res = await (await as('parent@demo.test')).post(path(), { ...libraryVisit, ...change });

      expect(res.status).toBe(201);
    });
  });

  describe('checks (FR-M3-02)', () => {
    test.each([
      ['no title', { title: undefined }, 'title is required'],
      ['an empty title', { title: '' }, 'title is required'],
      ['a title of spaces only', { title: '   ' }, 'title is required'],
      ['a title that is not text', { title: 42 }, 'title is required'],
      ['a title in a list', { title: ['Yüzme'] }, 'title is required'],
      ['a title of 201 characters', { title: 'a'.repeat(201) }, 'title must be at most 200 characters'],
      ['no date', { eventDate: undefined }, DATE_ERROR],
      ['an empty date', { eventDate: '' }, DATE_ERROR],
      ['30 February', { eventDate: '2026-02-30' }, DATE_ERROR],
      ['29 February of a year that is not a leap year', { eventDate: '2026-02-29' }, DATE_ERROR],
      ['month 13', { eventDate: '2026-13-01' }, DATE_ERROR],
      ['day 0', { eventDate: '2026-10-00' }, DATE_ERROR],
      ['the Turkish date format', { eventDate: '27.10.2026' }, DATE_ERROR],
      ['a date without leading zeros', { eventDate: '2026-10-7' }, DATE_ERROR],
      ['a date with a time', { eventDate: '2026-10-27T15:00' }, DATE_ERROR],
      ['a date that is not text', { eventDate: 20261027 }, DATE_ERROR],
      ['no start time', { startTime: undefined }, TIME_ERROR],
      ['no end time', { endTime: undefined }, TIME_ERROR],
      ['an empty start time', { startTime: '' }, TIME_ERROR],
      ['24:00', { endTime: '24:00' }, TIME_ERROR],
      ['9:5', { startTime: '9:5' }, TIME_ERROR],
      ['9:05 without the leading zero', { startTime: '9:05' }, TIME_ERROR],
      ['minute 60', { startTime: '09:60' }, TIME_ERROR],
      ['a time with seconds', { startTime: '15:00:00' }, TIME_ERROR],
      ['a time that is not text', { startTime: 1500 }, TIME_ERROR],
      ['a time in a list', { startTime: ['15:00'] }, TIME_ERROR],
      ['an end time before the start time', { startTime: '15:00', endTime: '14:30' }, 'endTime cannot be before startTime'],
      ['an end time one minute before the start time', { startTime: '00:01', endTime: '00:00' }, 'endTime cannot be before startTime'],
    ])('rejects %s with 400 and stores nothing', async (_, change, error) => {
      const before = eventCount();

      const res = await (await as('parent@demo.test')).post(path(), { ...libraryVisit, ...change });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error });
      expect(eventCount()).toBe(before);
    });

    test('answers a request without a body with 400 and stores nothing', async () => {
      const before = eventCount();
      const token = await logIn('parent@demo.test');

      const res = await request(app).post(path()).set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'title is required' });
      expect(eventCount()).toBe(before);
    });

    test('answers the parent a malformed body with a JSON 400 and stores nothing', async () => {
      const before = eventCount();

      const res = await (await as('parent@demo.test')).post(path(), '{"title": ').set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Bad request' });
      expect(eventCount()).toBe(before);
    });
  });

  describe('access', () => {
    test('needs a token, also when the body is malformed (FR-M1-05)', async () => {
      const before = eventCount();

      const withoutToken = await request(app).post(path()).send(libraryVisit);
      const malformed = await request(app).post(path()).set('Content-Type', 'application/json').send('{"title": ');
      const invalidToken = await request(app).post(path()).set('Authorization', 'Bearer junk').send(libraryVisit);

      for (const res of [withoutToken, malformed, invalidToken]) {
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Unauthorized' });
      }
      expect(eventCount()).toBe(before);
    });

    test('answers 401 to a token that was logged out', async () => {
      const token = await logIn('parent@demo.test');
      await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(204);

      const res = await request(app).post(path()).set('Authorization', `Bearer ${token}`).send(libraryVisit);

      expect(res.status).toBe(401);
    });

    test.each([
      ['the child, who may not add to their own schedule (FR-M3-04)', 'child@demo.test'],
      ['the unlinked coach (FR-M2-05)', 'coach@demo.test'],
    ])('answers 403 to %s and stores nothing, also for a malformed body', async (_, email) => {
      const before = eventCount();
      const user = await as(email);

      const valid = await user.post(path(), libraryVisit);
      const malformed = await user.post(path(), '{"title": ').set('Content-Type', 'application/json');

      for (const res of [valid, malformed]) {
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Forbidden' });
      }
      expect(eventCount()).toBe(before);
    });

    test('answers 403 to the parent of another family and stores nothing', async () => {
      addOtherFamily();
      const before = eventCount();

      const res = await (await as('other-parent@demo.test')).post(path(), libraryVisit);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
      expect(eventCount()).toBe(before);
    });

    test('answers 403 to a child for the schedule of another child', async () => {
      const otherChildId = addOtherFamily();

      const res = await (await as('child@demo.test')).post(`/api/children/${otherChildId}/events`, libraryVisit);

      expect(res.status).toBe(403);
      expect(db.prepare('SELECT * FROM events WHERE child_id = ?').all(otherChildId)).toEqual([]);
    });

    test.each(['abc', '0', '-1', '999999', '1.5'])('answers 403 to the parent for the childId %s', async (badId) => {
      const res = await (await as('parent@demo.test')).post(`/api/children/${badId}/events`, libraryVisit);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    test.each([
      ['%s.0', (id) => `${id}.0`],
      ['%se0', (id) => `${id}e0`],
      ['0%s', (id) => `0${id}`],
    ])('does not read %s as the real child', async (_, spell) => {
      const before = eventCount();

      const res = await (await as('parent@demo.test')).post(`/api/children/${spell(childId)}/events`, libraryVisit);

      expect(res.status).toBe(403);
      expect(eventCount()).toBe(before);
    });

    test('stops a specialist with the same token as soon as the parent unlinks them (FR-M2-05)', async () => {
      const teacher = await as('teacher@demo.test');
      expect((await teacher.post(path(), libraryVisit)).status).toBe(201);

      await (await as('parent@demo.test')).delete(`/api/children/${childId}/specialists/${idOf('teacher@demo.test')}`).expect(204);

      const res = await teacher.post(path(), libraryVisit);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });
  });
});
