const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

// Opens the database and creates the tables if they do not exist yet.
// Pass ':memory:' in tests so every test file gets a clean database.
function openDatabase(file = process.env.DB_FILE || path.join(__dirname, '..', '..', 'data', 'app.db')) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDatabase };
