// Fills the database with synthetic demo data. No real personal data is used anywhere.
// Run with: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { addDays, mondayOf } = require('../dates');
const { openDatabase } = require('./index');

const DEMO_PASSWORD = 'Demo1234';

const users = [
  { name: 'Ayşe Demir', email: 'parent@demo.test', role: 'parent' },
  { name: 'Can Demir', email: 'child@demo.test', role: 'child' },
  { name: 'Elif Kaya', email: 'teacher@demo.test', role: 'specialist', type: 'teacher' },
  { name: 'Murat Şahin', email: 'psychologist@demo.test', role: 'specialist', type: 'psychologist' },
  { name: 'Zeynep Arslan', email: 'coach@demo.test', role: 'specialist', type: 'coach' },
];

// The week of the schedule mockup. `day` counts from the Monday of the week the seed runs in,
// so the current week of the demo is never empty.
const events = [
  { day: 0, start: '09:30', end: '10:15', title: 'Dil terapisi', by: 'parent@demo.test' },
  { day: 2, start: '16:00', end: '17:00', title: 'Yüzme', by: 'parent@demo.test' },
  { day: 3, start: '14:00', end: '14:45', title: 'Psikolog seansı', by: 'psychologist@demo.test' },
  { day: 4, start: '10:00', end: '12:00', title: 'Okul gezisi', by: 'teacher@demo.test' },
  { day: 4, start: '15:30', end: '16:30', title: 'Resim kursu', by: 'parent@demo.test' },
  { day: 5, start: '11:00', end: '12:00', title: 'Parkta oyun', by: 'parent@demo.test' },
];

function seed(db) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);

  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, specialist_type) VALUES (?, ?, ?, ?, ?)'
  );

  const run = db.transaction(() => {
    db.exec('DELETE FROM events; DELETE FROM tasks; DELETE FROM specialist_links; DELETE FROM children; DELETE FROM users;');

    const ids = {};
    for (const u of users) {
      ids[u.email] = insertUser.run(u.name, u.email, hash, u.role, u.type || null).lastInsertRowid;
    }

    const childId = ids['child@demo.test'];
    db.prepare('INSERT INTO children (user_id, parent_id) VALUES (?, ?)').run(childId, ids['parent@demo.test']);

    // The teacher and the psychologist are linked; the coach is registered but not linked.
    const link = db.prepare('INSERT INTO specialist_links (child_id, specialist_id) VALUES (?, ?)');
    link.run(childId, ids['teacher@demo.test']);
    link.run(childId, ids['psychologist@demo.test']);

    // Sample task for the walking skeleton: the teacher assigned it, its status is 'not_done' by default.
    db.prepare(
      'INSERT INTO tasks (child_id, assigned_by, title, description, development_area, due_date) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(childId, ids['teacher@demo.test'], '20 dakika kitap oku', 'Bir kitabın bir bölümünü oku.', 'language', '2026-11-06');

    const monday = mondayOf(new Date());
    const insertEvent = db.prepare(
      'INSERT INTO events (child_id, created_by, title, event_date, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const e of events) {
      insertEvent.run(childId, ids[e.by], e.title, addDays(monday, e.day), e.start, e.end);
    }
  });

  run();
  return { users: users.length };
}

if (require.main === module) {
  const db = openDatabase();
  const result = seed(db);
  console.log(`Seeded ${result.users} demo users. Password for all of them: ${DEMO_PASSWORD}`);
  db.close();
}

module.exports = { seed, DEMO_PASSWORD };
