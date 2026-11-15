const request = require('supertest');
const { openDatabase } = require('../src/db');
const { seed, DEMO_PASSWORD } = require('../src/db/seed');
const { createApp } = require('../src/app');

const BODY_ERROR = 'body must be exactly {"status": "done"}';
const DONE = { status: 'done' };

describe('PATCH /api/tasks/:id', () => {
  let db;
  let app;
  let childId;
  // The seeded task of the child: assigned by the teacher and not done yet.
  let taskId;

  beforeEach(() => {
    db = openDatabase(':memory:');
    seed(db);
    app = createApp(db);
    childId = idOf('child@demo.test');
    taskId = db.prepare('SELECT id FROM tasks WHERE child_id = ?').get(childId).id;
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
      assign: (body) => send('post', '/api/tasks').send(body),
      mark: (id, body) => send('patch', `/api/tasks/${id}`).send(body),
    };
  }

  function storedTask(id) {
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  }

  // SQLite's own clock, in the format of completed_at.
  function sqliteNow() {
    return db.prepare("SELECT datetime('now') AS now").get().now;
  }

  // A second family whose child has a task, so the task of another child can be tried.
  function addOtherFamily() {
    const { password_hash: hash } = db.prepare("SELECT password_hash FROM users WHERE email = 'parent@demo.test'").get();
    const insert = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    const otherParentId = insert.run('Selin Yıldız', 'other-parent@demo.test', hash, 'parent').lastInsertRowid;
    const otherChildId = insert.run('Ela Yıldız', 'other-child@demo.test', hash, 'child').lastInsertRowid;
    db.prepare('INSERT INTO children (user_id, parent_id) VALUES (?, ?)').run(otherChildId, otherParentId);
    const { lastInsertRowid } = db
      .prepare("INSERT INTO tasks (child_id, assigned_by, title, development_area, due_date) VALUES (?, ?, 'Ela görevi', 'cognitive', '2026-11-06')")
      .run(otherChildId, otherParentId);
    return Number(lastInsertRowid);
  }

  describe('marking done (FR-M4-03)', () => {
    test('lets the child mark their own task as done and answers 200 with it', async () => {
      const before = sqliteNow();

      const res = await (await as('child@demo.test')).mark(taskId, DONE);

      const after = sqliteNow();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: taskId,
        childId,
        title: '20 dakika kitap oku',
        description: 'Bir kitabın bir bölümünü oku.',
        developmentArea: 'language',
        dueDate: '2026-11-06',
        status: 'done',
        completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
        assignedBy: idOf('teacher@demo.test'),
        assignedByName: 'Elif Kaya',
      });
      // The text has a fixed width, so text order is time order.
      expect(res.body.completedAt >= before && res.body.completedAt <= after).toBe(true);
      expect(storedTask(taskId)).toMatchObject({ status: 'done', completed_at: res.body.completedAt });
    });

    test('shows the task as done in the list of the child, as it was answered', async () => {
      const child = await as('child@demo.test');

      const res = await child.mark(taskId, DONE);

      expect((await child.get('/api/tasks')).body).toEqual([res.body]);
    });

    test('changes only the status and the completion time of that one task', async () => {
      const otherId = db
        .prepare("INSERT INTO tasks (child_id, assigned_by, title, development_area, due_date) VALUES (?, ?, 'Ayakkabı bağla', 'self_care', '2026-10-29')")
        .run(childId, idOf('parent@demo.test')).lastInsertRowid;
      const before = storedTask(taskId);
      const otherBefore = storedTask(otherId);

      await (await as('child@demo.test')).mark(taskId, DONE).expect(200);

      expect(storedTask(taskId)).toEqual({ ...before, status: 'done', completed_at: expect.any(String) });
      expect(storedTask(otherId)).toEqual(otherBefore);
    });

    test('answers 200 again for a task that is already done and keeps the first completion time', async () => {
      db.prepare("UPDATE tasks SET status = 'done', completed_at = '2026-11-05 17:30:00' WHERE id = ?").run(taskId);

      const res = await (await as('child@demo.test')).mark(taskId, DONE);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'done', completedAt: '2026-11-05 17:30:00' });
      expect(storedTask(taskId)).toMatchObject({ status: 'done', completed_at: '2026-11-05 17:30:00' });
    });

    test('answers a second request with the same task', async () => {
      const child = await as('child@demo.test');

      const first = await child.mark(taskId, DONE);
      const second = await child.mark(taskId, DONE);

      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
    });
  });

  // SDD Flow 2: a linked specialist assigns a task, the child marks it done and the specialist sees it as done.
  test('shows the assigner, and the parent, that the child marked the task as done (FR-M4-05)', async () => {
    const teacherId = idOf('teacher@demo.test');
    const teacher = await as('teacher@demo.test');
    const child = await as('child@demo.test');

    const assigned = await teacher.assign({ childId, title: 'Ayakkabı bağcıklarını bağla', developmentArea: 'self_care', dueDate: '2026-10-29' });
    expect(assigned.status).toBe(201);
    expect((await child.get('/api/tasks')).body).toContainEqual(assigned.body);
    const done = await child.mark(assigned.body.id, DONE);
    expect(done.status).toBe(200);

    const list = await teacher.get(`/api/tasks?childId=${childId}`);
    const parentList = await (await as('parent@demo.test')).get(`/api/tasks?childId=${childId}`);

    const doneTask = { ...assigned.body, status: 'done', completedAt: done.body.completedAt };
    expect(list.body.filter((task) => task.assignedBy === teacherId)).toEqual([
      doneTask,
      expect.objectContaining({ id: taskId, status: 'not_done', completedAt: null }),
    ]);
    expect(parentList.body).toContainEqual(doneTask);
  });

  describe('who may mark a task done', () => {
    test('answers 403 to a child for the task of another child and leaves it as it was (FR-M4-04)', async () => {
      const otherTaskId = addOtherFamily();
      const before = storedTask(otherTaskId);

      const res = await (await as('child@demo.test')).mark(otherTaskId, DONE);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
      expect(storedTask(otherTaskId)).toEqual(before);
    });

    test('gives the same answer for the task of another child as for a task that does not exist (FR-M4-04)', async () => {
      const otherTaskId = addOtherFamily();
      const child = await as('child@demo.test');

      const other = await child.mark(otherTaskId, DONE);
      const missing = await child.mark(999999, DONE);

      expect(missing.status).toBe(other.status);
      expect(missing.body).toEqual(other.body);
    });

    test('answers 403 to another child before it reads the body (FR-M4-04)', async () => {
      addOtherFamily();
      const before = storedTask(taskId);

      const res = await (await as('other-child@demo.test')).mark(taskId, '{"status": ').set('Content-Type', 'application/json');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
      expect(storedTask(taskId)).toEqual(before);
    });

    test('lets the other child mark their own task, so each child reaches exactly their own tasks', async () => {
      const otherTaskId = addOtherFamily();

      const res = await (await as('other-child@demo.test')).mark(otherTaskId, DONE);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: otherTaskId, status: 'done' });
      expect(storedTask(taskId)).toMatchObject({ status: 'not_done', completed_at: null });
    });

    test.each([
      ['the parent of the child', 'parent@demo.test'],
      ['the linked specialist who assigned the task', 'teacher@demo.test'],
      ['another linked specialist', 'psychologist@demo.test'],
      ['the unlinked coach (FR-M2-05)', 'coach@demo.test'],
      ['the parent of another family', 'other-parent@demo.test'],
    ])('answers 403 to %s, whose token is valid, also for a malformed body', async (_, email) => {
      addOtherFamily();
      const before = storedTask(taskId);
      const user = await as(email);
      expect((await user.get('/api/auth/me')).status).toBe(200);

      const valid = await user.mark(taskId, DONE);
      const malformed = await user.mark(taskId, '{"status": ').set('Content-Type', 'application/json');

      for (const res of [valid, malformed]) {
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Forbidden' });
      }
      expect(storedTask(taskId)).toEqual(before);
    });

    test('needs a valid token that was not logged out, also when the body is malformed (FR-M1-05)', async () => {
      const before = storedTask(taskId);
      const token = await logIn('child@demo.test');
      await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(204);
      const url = `/api/tasks/${taskId}`;

      const responses = [
        await request(app).patch(url).send(DONE),
        await request(app).patch(url).set('Content-Type', 'application/json').send('{"status": '),
        await request(app).patch(url).set('Authorization', 'Bearer junk').send(DONE),
        await request(app).patch(url).set('Authorization', `Bearer ${token}`).send(DONE),
      ];

      for (const res of responses) {
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Unauthorized' });
      }
      expect(storedTask(taskId)).toEqual(before);
    });

    test.each([
      ['a word', () => 'abc'],
      ['0', () => '0'],
      ['-1', () => '-1'],
      ['a fraction', () => '1.5'],
      ['an id that belongs to no task', () => '999999'],
      ['the id with .0', (id) => `${id}.0`],
      ['the id in e notation', (id) => `${id}e0`],
      ['the id with a leading zero', (id) => `0${id}`],
      ['the id with a plus sign', (id) => `+${id}`],
      ['the id with a space before it', (id) => ` ${id}`],
      ['the id in hexadecimal', (id) => `0x${id.toString(16)}`],
    ])('answers the child 403 for %s like a task of another child and changes nothing', async (_, spell) => {
      const before = storedTask(taskId);

      const res = await (await as('child@demo.test')).mark(encodeURIComponent(spell(taskId)), DONE);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
      expect(storedTask(taskId)).toEqual(before);
    });
  });

  describe('the body (FR-M4-03)', () => {
    test.each([
      ['no body', undefined],
      ['an empty object', {}],
      ['the status not done', { status: 'not_done' }],
      ['the status in capitals', { status: 'DONE' }],
      ['the Turkish label', { status: 'Yapıldı' }],
      ['a status that is true', { status: true }],
      ['a null status', { status: null }],
      ['the status in a list', { status: ['done'] }],
      ['a list instead of an object', ['done']],
      ['a completion time next to the status', { status: 'done', completedAt: '2026-11-01 10:00:00' }],
      ['a title next to the status', { status: 'done', title: 'Başka başlık' }],
      ['a childId next to the status', { status: 'done', childId: 999 }],
      ['an assigner next to the status', { status: 'done', assignedBy: 1 }],
      ['a completion time without the status', { completedAt: '2026-11-01 10:00:00' }],
    ])('rejects %s with 400 and leaves the task as it was', async (_, body) => {
      const before = storedTask(taskId);

      const res = await (await as('child@demo.test')).mark(taskId, body);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: BODY_ERROR });
      expect(storedTask(taskId)).toEqual(before);
    });

    test('answers a malformed body with a JSON 400 and leaves the task as it was', async () => {
      const before = storedTask(taskId);

      const res = await (await as('child@demo.test')).mark(taskId, '{"status": ').set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Bad request' });
      expect(storedTask(taskId)).toEqual(before);
    });

    test('does not set a done task back to not done', async () => {
      db.prepare("UPDATE tasks SET status = 'done', completed_at = '2026-11-05 17:30:00' WHERE id = ?").run(taskId);
      const before = storedTask(taskId);

      const res = await (await as('child@demo.test')).mark(taskId, { status: 'not_done' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: BODY_ERROR });
      expect(storedTask(taskId)).toEqual(before);
    });
  });
});
