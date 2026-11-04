const request = require('supertest');
const { openDatabase } = require('../src/db');
const { seed } = require('../src/db/seed');
const { createApp } = require('../src/app');

describe('GET /api/health', () => {
  let db;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => db.close());

  test('reports that the API and the database are up', async () => {
    const res = await request(createApp(db)).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok', users: 0 });
  });

  test('counts the users created by the seed script', async () => {
    seed(db);
    const res = await request(createApp(db)).get('/api/health');

    expect(res.body.users).toBe(5);
  });

  test('returns 404 for unknown API routes', async () => {
    const res = await request(createApp(db)).get('/api/does-not-exist');

    expect(res.status).toBe(404);
  });
});
