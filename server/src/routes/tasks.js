const express = require('express');

// FR-M4-05: every task names its assigner, so a screen can show someone the status of the tasks they assigned.
const SELECT_TASK =
  'SELECT t.id, t.child_id AS childId, t.title, t.description, t.development_area AS developmentArea, ' +
  't.due_date AS dueDate, t.status, t.completed_at AS completedAt, t.assigned_by AS assignedBy, u.name AS assignedByName ' +
  'FROM tasks t JOIN users u ON u.id = t.assigned_by';

function tasksRoutes(db, requireAuth, canAccessChild) {
  const router = express.Router();
  // Dates are 'YYYY-MM-DD' text, so text order is date order; the id keeps tasks of one day in the order they came.
  const findTasks = db.prepare(`${SELECT_TASK} WHERE t.child_id = ? ORDER BY t.due_date, t.id`);

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
