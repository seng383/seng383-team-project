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

  test('creates a sample task for the child, assigned by a linked specialist and not done yet', () => {
    const tasks = db.prepare('SELECT * FROM tasks').all();

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: '20 dakika kitap oku', development_area: 'language', status: 'not_done' });
    const link = db
      .prepare('SELECT * FROM specialist_links WHERE child_id = ? AND specialist_id = ?')
      .get(tasks[0].child_id, tasks[0].assigned_by);
    expect(link).toBeDefined();
  });

  test('can be run twice without duplicating data', () => {
    seed(db);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
    expect(count).toBe(5);
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count).toBe(1);
  });
});
