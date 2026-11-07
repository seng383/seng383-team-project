const express = require('express');
const request = require('supertest');
const { openDatabase } = require('../src/db');
const { seed } = require('../src/db/seed');
const { createChildAccess } = require('../src/middleware/childAccess');

function idOf(db, email) {
  return db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
}

describe('requireChildAccess', () => {
  let db;
  let childId;

  beforeEach(() => {
    db = openDatabase(':memory:');
    seed(db);
    childId = idOf(db, 'child@demo.test');
  });

  afterEach(() => db.close());

  // Stands in for requireAuth, so each test picks the user directly.
  function appFor(user) {
    const { requireChildAccess } = createChildAccess(db);
    const app = express();
    app.get('/child/:childId', (req, res, next) => {
      req.user = user;
      next();
    }, requireChildAccess, (req, res) => res.json({ secret: 'data' }));
    return app;
  }

  function get(email, id = childId) {
    const { role } = db.prepare('SELECT role FROM users WHERE email = ?').get(email);
    return request(appFor({ id: idOf(db, email), role })).get(`/child/${id}`);
  }

  test('lets the parent who owns the child through', async () => {
    const res = await get('parent@demo.test');

    expect(res.status).toBe(200);
  });

  test('lets a linked specialist through', async () => {
    const res = await get('teacher@demo.test');

    expect(res.status).toBe(200);
  });

  test('stops a specialist who has no row in specialist_links', async () => {
    const res = await get('coach@demo.test');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('reads the link on every request, not once', async () => {
    const specialist = idOf(db, 'teacher@demo.test');
    const app = appFor({ id: specialist, role: 'specialist' });

    expect((await request(app).get(`/child/${childId}`)).status).toBe(200);
    db.prepare('DELETE FROM specialist_links WHERE specialist_id = ?').run(specialist);

    expect((await request(app).get(`/child/${childId}`)).status).toBe(403);
  });

  test('stops a parent who does not own the child', async () => {
    const otherParent = db
      .prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Başka Ebeveyn', 'other@demo.test', 'x', 'parent')")
      .run().lastInsertRowid;

    const res = await request(appFor({ id: otherParent, role: 'parent' })).get(`/child/${childId}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('stops a child, whose only way to data in M2 is GET /api/tasks', async () => {
    const res = await get('child@demo.test');

    expect(res.status).toBe(403);
  });

  test.each(['abc', '1.5', '0', '-1', '1e0', '2abc', '007', '999999', '99999999999999999999'])(
    'answers a childId of %s like a child without access',
    async (badId) => {
      const res = await get('parent@demo.test', badId);
      const noAccess = await get('coach@demo.test');

      expect(res.status).toBe(noAccess.status);
      expect(res.body).toEqual(noAccess.body);
    }
  );

  test('does not treat a user who is not a child as a child', async () => {
    const res = await get('parent@demo.test', idOf(db, 'parent@demo.test'));

    expect(res.status).toBe(403);
  });
});
