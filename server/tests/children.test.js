const request = require('supertest');
const { openDatabase } = require('../src/db');
const { seed, DEMO_PASSWORD } = require('../src/db/seed');
const { createApp } = require('../src/app');

describe('/api/children', () => {
  let db;
  let app;
  let childId;
  let coachId;

  beforeEach(() => {
    db = openDatabase(':memory:');
    seed(db);
    app = createApp(db);
    childId = idOf('child@demo.test');
    coachId = idOf('coach@demo.test');
  });

  afterEach(() => db.close());

  function idOf(email) {
    return db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  }

  async function logIn(email, password = DEMO_PASSWORD) {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    return res.body.token;
  }

  async function as(email) {
    const token = await logIn(email);
    const send = (method, path) => request(app)[method](path).set('Authorization', `Bearer ${token}`);
    return {
      get: (path) => send('get', path),
      post: (path, body) => send('post', path).send(body),
      delete: (path) => send('delete', path),
    };
  }

  function linkRows(specialistId = coachId) {
    return db.prepare('SELECT * FROM specialist_links WHERE child_id = ? AND specialist_id = ?').all(childId, specialistId);
  }

  // A second family, so cross-parent access can be tried.
  function addOtherParent() {
    const { password_hash: hash } = db.prepare("SELECT password_hash FROM users WHERE email = 'parent@demo.test'").get();
    const insert = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    const otherParentId = insert.run('Selin Yıldız', 'other-parent@demo.test', hash, 'parent').lastInsertRowid;
    const otherChildId = insert.run('Ela Yıldız', 'other-child@demo.test', hash, 'child').lastInsertRowid;
    db.prepare('INSERT INTO children (user_id, parent_id) VALUES (?, ?)').run(otherChildId, otherParentId);
    return Number(otherChildId);
  }

  describe('GET /api/children', () => {
    test('needs a token', async () => {
      const res = await request(app).get('/api/children');

      expect(res.status).toBe(401);
    });

    test('gives a parent their own children and nothing private', async () => {
      const res = await (await as('parent@demo.test')).get('/api/children');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: childId, name: 'Can Demir' }]);
    });

    test('gives a second parent only their own child', async () => {
      const otherChildId = addOtherParent();

      const res = await (await as('other-parent@demo.test')).get('/api/children');

      expect(res.body).toEqual([{ id: otherChildId, name: 'Ela Yıldız' }]);
    });

    test('gives a linked specialist the child with the parent name and link date, and nothing private', async () => {
      const res = await (await as('teacher@demo.test')).get('/api/children');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: childId, name: 'Can Demir', parentName: 'Ayşe Demir', linkedAt: expect.any(String) }]);
    });

    test('gives a specialist without links an empty list (FR-M2-06)', async () => {
      const res = await (await as('coach@demo.test')).get('/api/children');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('follows the current links exactly: after a link, after a link to a second family, after an unlink (FR-M2-06)', async () => {
      const otherChildId = addOtherParent();
      const parent = await as('parent@demo.test');
      const otherParent = await as('other-parent@demo.test');
      const coach = await as('coach@demo.test');
      const childrenOfCoach = async () => (await coach.get('/api/children')).body.map((child) => child.name);

      await parent.post(`/api/children/${childId}/specialists`, { email: 'coach@demo.test' });
      expect(await childrenOfCoach()).toEqual(['Can Demir']);

      await otherParent.post(`/api/children/${otherChildId}/specialists`, { email: 'coach@demo.test' });
      expect(await childrenOfCoach()).toEqual(['Can Demir', 'Ela Yıldız']);

      await parent.delete(`/api/children/${childId}/specialists/${coachId}`);
      expect(await childrenOfCoach()).toEqual(['Ela Yıldız']);
    });

    test('answers 403 to a child (Flow 1)', async () => {
      const res = await (await as('child@demo.test')).get('/api/children');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });
  });

  describe('GET /api/children/:childId/specialists', () => {
    test('needs a token', async () => {
      const res = await request(app).get(`/api/children/${childId}/specialists`);

      expect(res.status).toBe(401);
    });

    test('gives the parent the linked specialists with name and type, and no email or hash', async () => {
      const res = await (await as('parent@demo.test')).get(`/api/children/${childId}/specialists`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: idOf('teacher@demo.test'), name: 'Elif Kaya', specialistType: 'teacher', linkedAt: expect.any(String) },
        { id: idOf('psychologist@demo.test'), name: 'Murat Şahin', specialistType: 'psychologist', linkedAt: expect.any(String) },
      ]);
    });

    test.each(['teacher@demo.test', 'coach@demo.test', 'child@demo.test'])('answers 403 to %s (parent only)', async (email) => {
      const res = await (await as(email)).get(`/api/children/${childId}/specialists`);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    test('answers 403 to a second parent', async () => {
      addOtherParent();

      const res = await (await as('other-parent@demo.test')).get(`/api/children/${childId}/specialists`);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    });

    test('answers the same for a child that does not exist and a child of another family', async () => {
      const otherChildId = addOtherParent();
      const parent = await as('parent@demo.test');

      const missing = await parent.get('/api/children/999999/specialists');
      const notOwn = await parent.get(`/api/children/${otherChildId}/specialists`);
      const malformed = await parent.get('/api/children/abc/specialists');

      expect(missing.status).toBe(403);
      expect(missing.body).toEqual(notOwn.body);
      expect(notOwn.status).toBe(403);
      expect(malformed.status).toBe(403);
      expect(malformed.body).toEqual(notOwn.body);
    });
  });

  describe('router-level access check', () => {
    test('covers every address about a child, so a route without its own check stays closed', async () => {
      const res = await (await as('coach@demo.test')).get(`/api/children/${childId}/anything`);

      expect(res.status).toBe(403);
    });

    test('lets a linked specialist past it', async () => {
      const res = await (await as('teacher@demo.test')).get(`/api/children/${childId}/anything`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/children/:childId/specialists', () => {
    const path = () => `/api/children/${childId}/specialists`;

    test('links a registered specialist, who then appears with name and type (FR-M2-01)', async () => {
      const parent = await as('parent@demo.test');

      const res = await parent.post(path(), { email: 'coach@demo.test' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: coachId, name: 'Zeynep Arslan', specialistType: 'coach', linkedAt: expect.any(String) });
      expect(linkRows()).toHaveLength(1);
      const list = await parent.get(path());
      expect(list.body.map((specialist) => specialist.name)).toContain('Zeynep Arslan');
    });

    test.each([
      ['an unknown email', { email: 'nobody@demo.test' }],
      ['a parent email', { email: 'parent@demo.test' }],
      ['a child email', { email: 'child@demo.test' }],
      ['an empty email', { email: '' }],
      ['an email that is not text', { email: { $ne: null } }],
      ['no email', {}],
    ])('gives an error and links no one for %s (FR-M2-02)', async (_, body) => {
      const before = db.prepare('SELECT COUNT(*) AS count FROM specialist_links').get().count;

      const res = await (await as('parent@demo.test')).post(path(), body);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Email does not belong to a registered specialist' });
      expect(db.prepare('SELECT COUNT(*) AS count FROM specialist_links').get().count).toBe(before);
    });

    test('answers a request without a body with the same error', async () => {
      const token = await logIn('parent@demo.test');

      const res = await request(app).post(path()).set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    test.each(['COACH@demo.test', ' coach@demo.test ', 'coach@demo.test '])(
      'matches %j the same way login does: exactly',
      async (email) => {
        const login = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
        expect(login.status).toBe(401);

        const res = await (await as('parent@demo.test')).post(path(), { email });

        expect(res.status).toBe(400);
        expect(linkRows()).toHaveLength(0);
      }
    );

    test('creates no second link and answers 200 with the existing one (FR-M2-03)', async () => {
      const parent = await as('parent@demo.test');
      const first = await parent.post(path(), { email: 'coach@demo.test' });

      const second = await parent.post(path(), { email: 'coach@demo.test' });

      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect(linkRows()).toHaveLength(1);
    });

    test('treats a specialist linked by the seed as already linked', async () => {
      const res = await (await as('parent@demo.test')).post(path(), { email: 'teacher@demo.test' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Elif Kaya');
      expect(linkRows(idOf('teacher@demo.test'))).toHaveLength(1);
    });

    test.each(['teacher@demo.test', 'coach@demo.test', 'child@demo.test'])('answers 403 to %s and links no one', async (email) => {
      const res = await (await as(email)).post(path(), { email: 'coach@demo.test' });

      expect(res.status).toBe(403);
      expect(linkRows()).toHaveLength(0);
    });

    test('answers 403 to a second parent and links no one', async () => {
      addOtherParent();

      const res = await (await as('other-parent@demo.test')).post(path(), { email: 'coach@demo.test' });

      expect(res.status).toBe(403);
      expect(linkRows()).toHaveLength(0);
    });

    test('answers 403 for a malformed childId and links no one', async () => {
      const res = await (await as('parent@demo.test')).post('/api/children/abc/specialists', { email: 'coach@demo.test' });

      expect(res.status).toBe(403);
      expect(linkRows()).toHaveLength(0);
    });
  });

  describe('DELETE /api/children/:childId/specialists/:specialistId', () => {
    let teacherId;
    const path = () => `/api/children/${childId}/specialists/${teacherId}`;

    function linkCount() {
      return db.prepare('SELECT COUNT(*) AS count FROM specialist_links').get().count;
    }

    beforeEach(() => {
      teacherId = idOf('teacher@demo.test');
    });

    test('needs a token', async () => {
      const res = await request(app).delete(path());

      expect(res.status).toBe(401);
      expect(linkRows(teacherId)).toHaveLength(1);
    });

    test('removes only that link and answers 204 without a body (FR-M2-04)', async () => {
      const parent = await as('parent@demo.test');

      const res = await parent.delete(path());

      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(linkRows(teacherId)).toHaveLength(0);
      const list = await parent.get(`/api/children/${childId}/specialists`);
      expect(list.body.map((specialist) => specialist.name)).toEqual(['Murat Şahin']);
    });

    test('keeps the link of the same specialist to another child', async () => {
      const otherChildId = addOtherParent();
      db.prepare('INSERT INTO specialist_links (child_id, specialist_id) VALUES (?, ?)').run(otherChildId, teacherId);

      await (await as('parent@demo.test')).delete(path());

      expect(db.prepare('SELECT * FROM specialist_links WHERE child_id = ?').all(otherChildId)).toHaveLength(1);
    });

    test.each([
      ['a specialist who is not linked', () => coachId],
      ['a specialist id that is not a number', () => 'abc'],
    ])('answers 204 and changes nothing for %s', async (_, specialistId) => {
      const before = linkCount();

      const res = await (await as('parent@demo.test')).delete(`/api/children/${childId}/specialists/${specialistId()}`);

      expect(res.status).toBe(204);
      expect(linkCount()).toBe(before);
    });

    test.each(['teacher@demo.test', 'psychologist@demo.test', 'coach@demo.test', 'child@demo.test'])(
      'answers 403 to %s and keeps the link',
      async (email) => {
        const res = await (await as(email)).delete(path());

        expect(res.status).toBe(403);
        expect(linkRows(teacherId)).toHaveLength(1);
      }
    );

    test('answers 403 to a second parent and keeps the link', async () => {
      addOtherParent();

      const res = await (await as('other-parent@demo.test')).delete(path());

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
      expect(linkRows(teacherId)).toHaveLength(1);
    });

    test('answers 403 for a malformed childId and keeps the link', async () => {
      const res = await (await as('parent@demo.test')).delete(`/api/children/abc/specialists/${teacherId}`);

      expect(res.status).toBe(403);
      expect(linkRows(teacherId)).toHaveLength(1);
    });

    test('lets the parent link the specialist again after an unlink', async () => {
      const parent = await as('parent@demo.test');
      await parent.delete(path());

      const res = await parent.post(`/api/children/${childId}/specialists`, { email: 'teacher@demo.test' });

      expect(res.status).toBe(201);
      expect(linkRows(teacherId)).toHaveLength(1);
    });
  });
});
