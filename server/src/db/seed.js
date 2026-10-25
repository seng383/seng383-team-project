// Fills the database with synthetic demo data. No real personal data is used anywhere.
// Run with: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { openDatabase } = require('./index');

const DEMO_PASSWORD = 'Demo1234';

const users = [
  { name: 'Ayşe Demir', email: 'parent@demo.test', role: 'parent' },
  { name: 'Can Demir', email: 'child@demo.test', role: 'child' },
  { name: 'Elif Kaya', email: 'teacher@demo.test', role: 'specialist', type: 'teacher' },
  { name: 'Murat Şahin', email: 'psychologist@demo.test', role: 'specialist', type: 'psychologist' },
  { name: 'Zeynep Arslan', email: 'coach@demo.test', role: 'specialist', type: 'coach' },
];

function seed(db) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);

  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, specialist_type) VALUES (?, ?, ?, ?, ?)'
  );

  const run = db.transaction(() => {
    db.exec('DELETE FROM specialist_links; DELETE FROM children; DELETE FROM users;');

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
