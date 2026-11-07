const express = require('express');
const { loadJwtSecret, createRequireAuth } = require('./middleware/auth');
const { authRoutes } = require('./routes/auth');

// Builds the Express app around a database connection, so tests can pass an in-memory database.
function createApp(db) {
  const jwtSecret = loadJwtSecret();
  const requireAuth = createRequireAuth(db, jwtSecret);

  const app = express();
  app.use(express.json());

  // Walking skeleton check: proves the request reaches the API and the API can read the database.
  app.get('/api/health', (req, res) => {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
    res.json({ status: 'ok', database: 'ok', users: count });
  });

  app.use('/api/auth', authRoutes(db, jwtSecret, requireAuth));

  // No login yet: M1 adds the JWT check and M4 returns only the tasks the user may see.
  app.get('/api/tasks', (req, res) => {
    const tasks = db.prepare(
      'SELECT id, child_id AS childId, title, description, development_area AS developmentArea, ' +
        'due_date AS dueDate, status FROM tasks ORDER BY id'
    ).all();
    res.json(tasks);
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Express would otherwise answer errors such as malformed JSON with an HTML stack trace.
  app.use((err, req, res, next) => {
    if (err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: 'Bad request' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
