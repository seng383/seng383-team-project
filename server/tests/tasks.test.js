const request = require('supertest');
const { openDatabase } = require('../src/db');
const { seed, DEMO_PASSWORD } = require('../src/db/seed');
const { createApp } = require('../src/app');

describe('GET /api/tasks', () => {
  let db;
  let app;

  beforeEach(() => {
    db = openDatabase(':memory:');
    seed(db);
    app = createApp(db);
  });

  afterEach(() => db.close());

  async function logIn(email) {
    const login = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
    return login.body.token;
  }

  function tasksWith(token, query = '') {
    return request(app).get(`/api/tasks${query}`).set('Authorization', `Bearer ${token}`);
  }

  async function tasksAs(email, query) {
    return tasksWith(await logIn(email), query);
  }

  function idOf(email) {
    return db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  }

  // A child of a second parent, with a task of their own.
  function addOtherFamily() {
    const { password_hash: hash } = db.prepare("SELECT password_hash FROM users WHERE email = 'parent@demo.test'").get();
    const insert = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    const otherParentId = insert.run('Selin Yıldız', 'other-parent@demo.test', hash, 'parent').lastInsertRowid;
    const otherChildId = insert.run('Ela Yıldız', 'other@demo.test', hash, 'child').lastInsertRowid;
    db.prepare('INSERT INTO children (user_id, parent_id) VALUES (?, ?)').run(otherChildId, otherParentId);
    db.prepare(
      "INSERT INTO tasks (child_id, assigned_by, title, development_area, due_date) VALUES (?, ?, 'Başka görev', 'cognitive', '2026-11-06')"
    ).run(otherChildId, otherParentId);
    return Number(otherChildId);
  }

  test('needs a token (FR-M1-05)', async () => {
    const res = await request(app).get('/api/tasks');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test.each(['parent@demo.test', 'teacher@demo.test', 'coach@demo.test'])('answers 400 to %s without a childId', async (email) => {
    const res = await tasksAs(email);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'childId is required' });
  });

  test('treats an empty childId as missing', async () => {
    const res = await tasksAs('parent@demo.test', '?childId=');

    expect(res.status).toBe(400);
  });

  test.each(['parent@demo.test', 'teacher@demo.test', 'psychologist@demo.test'])(
    'gives %s the tasks of the child they may reach',
    async (email) => {
      const res = await tasksAs(email, `?childId=${idOf('child@demo.test')}`);

      expect(res.status).toBe(200);
      expect(res.body.map((task) => task.title)).toEqual(['20 dakika kitap oku']);
    }
  );

  test('answers 403 without data to a specialist who is not linked (FR-M2-05)', async () => {
    const res = await tasksAs('coach@demo.test', `?childId=${idOf('child@demo.test')}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('answers 403 to a specialist who is not linked even when the body is malformed (FR-M2-05)', async () => {
    const res = await tasksWith(await logIn('coach@demo.test'), `?childId=${idOf('child@demo.test')}`)
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('answers 403 without data to a parent asking for the child of another parent', async () => {
    const otherChildId = addOtherFamily();

    const res = await tasksAs('parent@demo.test', `?childId=${otherChildId}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test.each(['abc', '999999', '1.5', '-1', '0'])('answers a childId of %s like a child without access', async (childId) => {
    const res = await tasksAs('parent@demo.test', `?childId=${childId}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('does not read another spelling of the id as the real child', async () => {
    const res = await tasksAs('parent@demo.test', `?childId=${idOf('child@demo.test')}.0`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('does not accept a childId sent twice', async () => {
    const childId = idOf('child@demo.test');

    const res = await tasksAs('parent@demo.test', `?childId=${childId}&childId=${childId}`);

    expect(res.status).toBe(403);
  });

  test('ignores a childId sent by a child and gives only their own tasks', async () => {
    const otherChildId = addOtherFamily();

    const res = await tasksAs('child@demo.test', `?childId=${otherChildId}`);

    expect(res.status).toBe(200);
    expect(res.body.map((task) => task.title)).toEqual(['20 dakika kitap oku']);
  });

  // SDD Flow 3: the link is read on every request, so the same unexpired token stops working for the child.
  test('stops a specialist with the same token as soon as the parent unlinks them, until linked again', async () => {
    const childId = idOf('child@demo.test');
    const specialistToken = await logIn('teacher@demo.test');
    const parentToken = await logIn('parent@demo.test');
    expect((await tasksWith(specialistToken, `?childId=${childId}`)).status).toBe(200);

    await request(app)
      .delete(`/api/children/${childId}/specialists/${idOf('teacher@demo.test')}`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(204);

    const blocked = await tasksWith(specialistToken, `?childId=${childId}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({ error: 'Forbidden' });
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${specialistToken}`);
    expect(me.status).toBe(200);

    await request(app)
      .post(`/api/children/${childId}/specialists`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ email: 'teacher@demo.test' })
      .expect(201);

    expect((await tasksWith(specialistToken, `?childId=${childId}`)).status).toBe(200);
  });

  test('returns an empty list when the child has no tasks', async () => {
    db.prepare('DELETE FROM tasks').run();

    const res = await tasksAs('child@demo.test');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns the sample task created by the seed script', async () => {
    const task = db.prepare('SELECT id, child_id FROM tasks').get();

    const res = await tasksAs('child@demo.test');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: task.id,
        childId: task.child_id,
        title: '20 dakika kitap oku',
        description: 'Bir kitabın bir bölümünü oku.',
        developmentArea: 'language',
        dueDate: '2026-11-06',
        status: 'not_done',
      },
    ]);
  });

  test('gives a child only their own tasks', async () => {
    addOtherFamily();

    const own = await tasksAs('child@demo.test');
    const other = await tasksAs('other@demo.test');

    expect(own.body.map((task) => task.title)).toEqual(['20 dakika kitap oku']);
    expect(other.body.map((task) => task.title)).toEqual(['Başka görev']);
  });
});
