const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { openDatabase } = require('../src/db');
const { seed, DEMO_PASSWORD } = require('../src/db/seed');
const { createApp } = require('../src/app');

const SECRET = 'test-secret';

const accounts = [
  { email: 'parent@demo.test', name: 'Ayşe Demir', role: 'parent' },
  { email: 'teacher@demo.test', name: 'Elif Kaya', role: 'specialist' },
  { email: 'child@demo.test', name: 'Can Demir', role: 'child' },
];

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('auth endpoints', () => {
  let db;
  let app;
  let child;

  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  beforeEach(() => {
    db = openDatabase(':memory:');
    seed(db);
    app = createApp(db);
    child = db.prepare("SELECT id FROM users WHERE email = 'child@demo.test'").get();
  });

  afterEach(() => db.close());

  async function logIn(email = 'child@demo.test') {
    const res = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
    return res.body.token;
  }

  function me(token) {
    return request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  }

  function childToken(options = {}, payload = { role: 'child' }) {
    return jwt.sign(payload, SECRET, {
      subject: String(child.id),
      jwtid: 'test-jti',
      expiresIn: '1h',
      algorithm: 'HS256',
      ...options,
    });
  }

  describe('POST /api/auth/login (FR-M1-01, FR-M1-02)', () => {
    test.each(accounts)('logs in the seeded $role and returns the name and role', async ({ email, name, role }) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({ id: user.id, name, role });
      expect(typeof res.body.token).toBe('string');
    });

    test('signs a token that carries only the user id, the role and a random jti, with an expiry', async () => {
      const first = jwt.verify(await logIn(), SECRET, { algorithms: ['HS256'] });
      const second = jwt.verify(await logIn(), SECRET, { algorithms: ['HS256'] });

      expect(Object.keys(first).sort()).toEqual(['exp', 'iat', 'jti', 'role', 'sub']);
      expect(first.sub).toBe(String(child.id));
      expect(first.role).toBe('child');
      expect(first.exp).toBeGreaterThan(first.iat);
      expect(second.jti).not.toBe(first.jti);
    });

    test('gives the same answer for a wrong password and an unknown email, and no token', async () => {
      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: 'parent@demo.test', password: 'wrong-password' });
      const unknownEmail = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@demo.test', password: DEMO_PASSWORD });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
      expect(wrongPassword.body.token).toBeUndefined();
    });

    test('runs a bcrypt comparison of the same cost for an unknown email', async () => {
      const compare = jest.spyOn(bcrypt, 'compare');
      const stored = db.prepare("SELECT password_hash FROM users WHERE email = 'parent@demo.test'").get();

      await request(app).post('/api/auth/login').send({ email: 'nobody@demo.test', password: DEMO_PASSWORD });

      expect(compare).toHaveBeenCalledTimes(1);
      const [, hash] = compare.mock.calls[0];
      expect(bcrypt.getRounds(hash)).toBe(bcrypt.getRounds(stored.password_hash));
      compare.mockRestore();
    });

    test.each([
      ['no fields', {}],
      ['no password', { email: 'parent@demo.test' }],
      ['no email', { password: DEMO_PASSWORD }],
      ['a numeric password', { email: 'parent@demo.test', password: 1234 }],
      ['an array as password', { email: 'parent@demo.test', password: [DEMO_PASSWORD] }],
      ['an object as email', { email: { $ne: null }, password: DEMO_PASSWORD }],
    ])('answers the same 401 for %s', async (_, body) => {
      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: 'parent@demo.test', password: 'wrong-password' });

      const res = await request(app).post('/api/auth/login').send(body);

      expect(res.status).toBe(401);
      expect(res.body).toEqual(wrongPassword.body);
    });

    test('answers the same 401 when the request has no body', async () => {
      const res = await request(app).post('/api/auth/login');

      expect(res.status).toBe(401);
    });
  });

  describe('invalid request bodies', () => {
    test('answers malformed JSON with a JSON 400 and no stack trace', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": ');

      expect(res.status).toBe(400);
      expect(res.type).toBe('application/json');
      expect(res.body).toEqual({ error: 'Bad request' });
      expect(res.text).not.toMatch(/SyntaxError|node_modules/);
    });

    test('keeps the status of other body errors and still answers in JSON', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'a'.repeat(200 * 1024), password: 'x' });

      expect(res.status).toBe(413);
      expect(res.type).toBe('application/json');
    });

    test('answers an unexpected server error with a JSON 500 and no details', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      db.exec('DROP TABLE tasks; DROP TABLE specialist_links; DROP TABLE children; DROP TABLE users');

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('GET /api/auth/me', () => {
    test.each(accounts)('returns the $role of the token without the password hash', async ({ email, name, role }) => {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

      const res = await me(await logIn(email));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: user.id, name, role });
    });

    test('takes the role from the database, not from the token', async () => {
      const res = await me(childToken({}, { role: 'parent' }));

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('child');
    });
  });

  describe('requireAuth rejects a request without a valid token (FR-M1-05)', () => {
    test('no Authorization header', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    test('another Authorization scheme', async () => {
      const res = await request(app).get('/api/auth/me').set('Authorization', `Basic ${childToken()}`);

      expect(res.status).toBe(401);
    });

    test('a value that is not a JWT', async () => {
      const res = await me('not-a-token');

      expect(res.status).toBe(401);
    });

    test('an expired token', async () => {
      const res = await me(childToken({ expiresIn: -10 }));

      expect(res.status).toBe(401);
    });

    test('a token signed with another secret', async () => {
      const res = await me(jwt.sign({ role: 'child' }, 'other-secret', { subject: String(child.id), jwtid: 'x', expiresIn: '1h' }));

      expect(res.status).toBe(401);
    });

    test('a token with a changed payload', async () => {
      const [header, , signature] = childToken().split('.');
      const payload = base64url({ sub: '1', role: 'parent', jti: 'x', exp: Math.floor(Date.now() / 1000) + 3600 });

      const res = await me(`${header}.${payload}.${signature}`);

      expect(res.status).toBe(401);
    });

    test('an unsigned token with alg none', async () => {
      const header = base64url({ alg: 'none', typ: 'JWT' });
      const payload = base64url({ sub: String(child.id), role: 'child', jti: 'x', exp: Math.floor(Date.now() / 1000) + 3600 });

      const res = await me(`${header}.${payload}.`);

      expect(res.status).toBe(401);
    });

    test('a token signed with the right secret but another algorithm', async () => {
      const res = await me(childToken({ algorithm: 'HS512' }));

      expect(res.status).toBe(401);
    });

    test('a token without a jti, which logout could not revoke', async () => {
      const token = jwt.sign({ role: 'child' }, SECRET, { subject: String(child.id), expiresIn: '1h', algorithm: 'HS256' });

      const res = await me(token);

      expect(res.status).toBe(401);
    });

    test('a token without an expiry', async () => {
      const token = jwt.sign({ role: 'child' }, SECRET, { subject: String(child.id), jwtid: 'x', algorithm: 'HS256' });

      const res = await me(token);

      expect(res.status).toBe(401);
    });

    test('a token whose user no longer exists', async () => {
      const token = await logIn('coach@demo.test');
      db.prepare("DELETE FROM users WHERE email = 'coach@demo.test'").run();

      const res = await me(token);

      expect(res.status).toBe(401);
    });

    test.each([
      ['get', '/api/auth/me'],
      ['post', '/api/auth/logout'],
      ['get', '/api/tasks'],
    ])('%s %s needs a token', async (method, url) => {
      const res = await request(app)[method](url);

      expect(res.status).toBe(401);
    });

    test('GET /api/health and POST /api/auth/login stay public', async () => {
      expect((await request(app).get('/api/health')).status).toBe(200);
      expect((await request(app).post('/api/auth/login').send({})).status).toBe(401);
      const login = await request(app).post('/api/auth/login').send({ email: 'parent@demo.test', password: DEMO_PASSWORD });
      expect(login.status).toBe(200);
    });
  });

  describe('POST /api/auth/logout (FR-M1-03)', () => {
    function logOut(token) {
      return request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    }

    test('stores the jti of the token until the token would have expired', async () => {
      const token = await logIn();
      const claims = jwt.decode(token);

      const res = await logOut(token);

      expect(res.status).toBe(204);
      const row = db.prepare("SELECT strftime('%s', expires_at) AS exp FROM revoked_tokens WHERE jti = ?").get(claims.jti);
      expect(Number(row.exp)).toBe(claims.exp);
    });

    test('rejects the token on protected endpoints afterwards', async () => {
      const token = await logIn();
      await logOut(token);

      expect((await me(token)).status).toBe(401);
      const tasks = await request(app).get('/api/tasks').set('Authorization', `Bearer ${token}`);
      expect(tasks.status).toBe(401);
    });

    test('cannot be repeated with the same token', async () => {
      const token = await logIn();
      await logOut(token);

      expect((await logOut(token)).status).toBe(401);
    });

    test('leaves another session of the same user open', async () => {
      const first = await logIn();
      const second = await logIn();

      await logOut(first);

      expect((await me(second)).status).toBe(200);
    });

    test('a new login works after logout', async () => {
      await logOut(await logIn());

      expect((await me(await logIn())).status).toBe(200);
    });

    test('deletes expired rows and keeps the ones that are still needed', async () => {
      const insert = db.prepare('INSERT INTO revoked_tokens (jti, expires_at) VALUES (?, ?)');
      insert.run('expired', '2000-01-01 00:00:00');
      insert.run('still-valid', '2999-01-01 00:00:00');
      const token = await logIn();

      await logOut(token);

      const jtis = db.prepare('SELECT jti FROM revoked_tokens').all().map((row) => row.jti);
      expect(jtis.sort()).toEqual([jwt.decode(token).jti, 'still-valid'].sort());
    });
  });
});
