const express = require('express');
const { loadJwtSecret, createRequireAuth } = require('./middleware/auth');
const { createChildAccess } = require('./middleware/childAccess');
const { authRoutes } = require('./routes/auth');
const { childrenRoutes } = require('./routes/children');

// Builds the Express app around a database connection, so tests can pass an in-memory database.
function createApp(db) {
  const jwtSecret = loadJwtSecret();
  const requireAuth = createRequireAuth(db, jwtSecret);
  const { canAccessChild, requireChildAccess } = createChildAccess(db);
  const findTasks = db.prepare(
    'SELECT id, child_id AS childId, title, description, development_area AS developmentArea, ' +
      'due_date AS dueDate, status FROM tasks WHERE child_id = ? ORDER BY id'
  );

  // Each route that reads a body parses it after its checks, so a bad body cannot replace their 401 or 403.
  const app = express();

  // Walking skeleton check: proves the request reaches the API and the API can read the database.
  app.get('/api/health', (req, res) => {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
    res.json({ status: 'ok', database: 'ok', users: count });
  });

  app.use('/api/auth', authRoutes(db, jwtSecret, requireAuth));
  app.use('/api/children', childrenRoutes(db, requireAuth, requireChildAccess));

  // A child always gets their own tasks, whatever childId they send.
  app.get('/api/tasks', requireAuth, (req, res) => {
    if (req.user.role === 'child') {
      return res.json(findTasks.all(req.user.id));
    }
    if (!req.query.childId) {
      return res.status(400).json({ error: 'childId is required' });
    }
    if (!canAccessChild(req.user, req.query.childId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(findTasks.all(Number(req.query.childId)));
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
