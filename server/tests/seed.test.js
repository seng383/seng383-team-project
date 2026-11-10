const bcrypt = require('bcryptjs');
const { addDays, mondayOf } = require('../src/dates');
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

  test('fills the current week of the child with the sample events, counted from its Monday', () => {
    const monday = mondayOf(new Date());
    const child = db.prepare("SELECT id FROM users WHERE email = 'child@demo.test'").get();
    const events = db.prepare('SELECT * FROM events ORDER BY event_date, start_time').all();

    expect(events.map((e) => [e.event_date, e.start_time, e.end_time, e.title])).toEqual([
      [monday, '09:30', '10:15', 'Dil terapisi'],
      [addDays(monday, 2), '16:00', '17:00', 'Yüzme'],
      [addDays(monday, 3), '14:00', '14:45', 'Psikolog seansı'],
      [addDays(monday, 4), '10:00', '12:00', 'Okul gezisi'],
      [addDays(monday, 4), '15:30', '16:30', 'Resim kursu'],
      [addDays(monday, 5), '11:00', '12:00', 'Parkta oyun'],
    ]);
    expect(events.every((e) => e.child_id === child.id)).toBe(true);
  });

  test('lets only people who may add to the schedule appear as the creators of the events', () => {
    const creators = db
      .prepare('SELECT DISTINCT u.email FROM events e JOIN users u ON u.id = e.created_by ORDER BY u.email')
      .all()
      .map((row) => row.email);

    expect(creators).toEqual(['parent@demo.test', 'psychologist@demo.test', 'teacher@demo.test']);
  });

  test('can be run twice without duplicating events', () => {
    seed(db);

    expect(db.prepare('SELECT COUNT(*) AS count FROM events').get().count).toBe(6);
  });
});
