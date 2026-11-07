const express = require('express');
const request = require('supertest');
const { requireRole } = require('../src/middleware/auth');

// Stands in for requireAuth, so each test picks the role directly.
function appFor(role, ...allowed) {
  const app = express();
  app.get('/page', (req, res, next) => {
    req.user = { id: 1, role };
    next();
  }, requireRole(...allowed), (req, res) => res.json({ secret: 'data' }));
  return app;
}

describe('requireRole (FR-M1-04)', () => {
  test('lets the listed role through', async () => {
    const res = await request(appFor('parent', 'parent')).get('/page');

    expect(res.status).toBe(200);
  });

  test('accepts any of several listed roles', async () => {
    const res = await request(appFor('specialist', 'parent', 'specialist')).get('/page');

    expect(res.status).toBe(200);
  });

  test.each(['child', 'specialist'])('answers 403 without data for the role %s', async (role) => {
    const res = await request(appFor(role, 'parent')).get('/page');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });
});
