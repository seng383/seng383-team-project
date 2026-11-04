const request = require('supertest');
const { openDatabase } = require('../src/db');
const { seed } = require('../src/db/seed');
const { createApp } = require('../src/app');

describe('GET /api/tasks', () => {
  let db;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => db.close());

  test('returns an empty list when the database has no tasks', async () => {
    const res = await request(createApp(db)).get('/api/tasks');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns the sample task created by the seed script', async () => {
    seed(db);
    const task = db.prepare('SELECT id, child_id FROM tasks').get();

    const res = await request(createApp(db)).get('/api/tasks');

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
});
