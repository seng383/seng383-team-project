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

  async function tasksAs(email) {
    const login = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
    return request(app).get('/api/tasks').set('Authorization', `Bearer ${login.body.token}`);
  }

  test('needs a token (FR-M1-05)', async () => {
    const res = await request(app).get('/api/tasks');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test.each(['parent@demo.test', 'teacher@demo.test', 'coach@demo.test'])(
    'answers 403 without task data for %s until M2 adds child scoping (FR-M1-04)',
    async (email) => {
      const res = await tasksAs(email);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    }
  );

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
    const { password_hash: hash, id: parentId } = db.prepare("SELECT id, password_hash FROM users WHERE email = 'parent@demo.test'").get();
    const otherChildId = db
      .prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Ali Demir', 'other@demo.test', ?, 'child')")
      .run(hash).lastInsertRowid;
    db.prepare('INSERT INTO children (user_id, parent_id) VALUES (?, ?)').run(otherChildId, parentId);
    db.prepare(
      "INSERT INTO tasks (child_id, assigned_by, title, development_area, due_date) VALUES (?, ?, 'Başka görev', 'cognitive', '2026-11-06')"
    ).run(otherChildId, parentId);

    const own = await tasksAs('child@demo.test');
    const other = await tasksAs('other@demo.test');

    expect(own.body.map((task) => task.title)).toEqual(['20 dakika kitap oku']);
    expect(other.body.map((task) => task.title)).toEqual(['Başka görev']);
  });
});
