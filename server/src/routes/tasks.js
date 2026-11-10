const express = require('express');

function tasksRoutes(db, requireAuth, canAccessChild) {
  const router = express.Router();
  const findTasks = db.prepare(
    'SELECT id, child_id AS childId, title, description, development_area AS developmentArea, ' +
      'due_date AS dueDate, status FROM tasks WHERE child_id = ? ORDER BY id'
  );

  router.use(requireAuth);

  // A child always gets their own tasks, whatever childId they send.
  router.get('/', (req, res) => {
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

  return router;
}

module.exports = { tasksRoutes };
