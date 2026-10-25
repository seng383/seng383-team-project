const bcrypt = require('bcryptjs');
const { openDatabase } = require('../src/db');
const { seed, DEMO_PASSWORD } = require('../src/db/seed');

describe('seed script', () => {
  let db;

  beforeEach(() => {
    db = openDatabase(':memory:');
    seed(db);
  });

  afterEach(() => db.close());

  test('creates one user per role and stores passwords only as hashes', () => {
    const users = db.prepare('SELECT role, password_hash FROM users').all();
    const roles = new Set(users.map((u) => u.role));

    expect(roles).toEqual(new Set(['parent', 'child', 'specialist']));
    for (const u of users) {
      expect(u.password_hash).not.toBe(DEMO_PASSWORD);
      expect(bcrypt.compareSync(DEMO_PASSWORD, u.password_hash)).toBe(true);
    }
  });

  test('links two specialists to the child and leaves one unlinked', () => {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM specialist_links').get();
    expect(count).toBe(2);
  });

  test('can be run twice without duplicating data', () => {
    seed(db);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
    expect(count).toBe(5);
  });
});
