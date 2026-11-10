const express = require('express');
const { requireRole } = require('../middleware/auth');
const { parseDate } = require('../dates');

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 2000;
const DEVELOPMENT_AREAS = ['language', 'motor_skills', 'social_emotional', 'cognitive', 'self_care'];
// The digits-only rule of canAccessChild, so no second spelling such as "07" or "7.0" reads as task 7.
const ID = /^[1-9]\d*$/;

// FR-M4-05: every task names its assigner, so a screen can show someone the status of the tasks they assigned.
const SELECT_TASK =
  'SELECT t.id, t.child_id AS childId, t.title, t.description, t.development_area AS developmentArea, ' +
  't.due_date AS dueDate, t.status, t.completed_at AS completedAt, t.assigned_by AS assignedBy, u.name AS assignedByName ' +
  'FROM tasks t JOIN users u ON u.id = t.assigned_by';

// The first rule the task breaks, or null (FR-M4-02).
function findError({ title, description, developmentArea, dueDate }) {
  if (typeof title !== 'string' || title.trim() === '') {
    return 'title is required';
  }
  if (title.trim().length > TITLE_MAX_LENGTH) {
    return `title must be at most ${TITLE_MAX_LENGTH} characters`;
  }
  // The description may be left out, so only one that is there has to be text.
  const text = description ?? '';
  if (typeof text !== 'string' || text.trim().length > DESCRIPTION_MAX_LENGTH) {
    return `description must be text of at most ${DESCRIPTION_MAX_LENGTH} characters`;
  }
  if (!DEVELOPMENT_AREAS.includes(developmentArea)) {
    return `developmentArea must be one of ${DEVELOPMENT_AREAS.join(', ')}`;
  }
  if (!parseDate(dueDate)) {
    return 'dueDate must be a real date as YYYY-MM-DD';
  }
  return null;
}

// The child may change the status and nothing else, and only to done (FR-M4-03).
function isMarkDone(body) {
  return typeof body === 'object' && body !== null && Object.keys(body).length === 1 && body.status === 'done';
}

function tasksRoutes(db, requireAuth, canAccessChild) {
  const router = express.Router();
  const findTask = db.prepare(`${SELECT_TASK} WHERE t.id = ?`);
  // Dates are 'YYYY-MM-DD' text, so text order is date order; the id keeps tasks of one day in the order they came.
  const findTasks = db.prepare(`${SELECT_TASK} WHERE t.child_id = ? ORDER BY t.due_date, t.id`);
  // The status and completed_at keep their defaults, so a new task is always not done (FR-M4-01).
  const insertTask = db.prepare(
    'INSERT INTO tasks (child_id, assigned_by, title, description, development_area, due_date) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const findTaskChild = db.prepare('SELECT child_id AS childId FROM tasks WHERE id = ?');
  // Only a task that is not done yet changes, so marking it again keeps the first completion time.
  const markDone = db.prepare(
    "UPDATE tasks SET status = 'done', completed_at = datetime('now') WHERE id = ? AND status = 'not_done'"
  );

  // FR-M4-04: the task is loaded first, and a task of another child gets the same 403 as one that does not exist,
  // so knowing an id gives no access and reveals nothing.
  function requireOwnTask(req, res, next) {
    const task = ID.test(req.params.id) ? findTaskChild.get(Number(req.params.id)) : undefined;
    if (task?.childId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  }

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

  // FR-M4-01: the role check stops a child before the body is read. The child to check is named in the body,
  // so the access check follows the parsing, but it still comes before any check of the fields.
  router.post('/', requireRole('parent', 'specialist'), express.json(), (req, res) => {
    const task = req.body ?? {};
    if (task.childId === undefined || task.childId === null || task.childId === '') {
      return res.status(400).json({ error: 'childId is required' });
    }
    // A number is checked as its text, so 2.5 or -1 fails the same digits-only rule as "2.0" in an address;
    // anything else that is not text is refused, because a list such as [2] would read as "2".
    const childId = typeof task.childId === 'number' ? String(task.childId) : task.childId;
    if (typeof childId !== 'string' || !canAccessChild(req.user, childId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const error = findError(task);
    if (error) {
      return res.status(400).json({ error });
    }

    // The assigner comes from the token, never from the body.
    const { lastInsertRowid } = insertTask.run(
      Number(childId),
      req.user.id,
      task.title.trim(),
      task.description?.trim() || null,
      task.developmentArea,
      task.dueDate
    );
    res.status(201).json(findTask.get(lastInsertRowid));
  });

  // FR-M4-03: only the child marks a task done; the SDD gives parents and specialists no way to change one.
  // The body is read after both checks, so a bad body cannot replace their 403.
  router.patch('/:id', requireRole('child'), requireOwnTask, express.json(), (req, res) => {
    if (!isMarkDone(req.body)) {
      return res.status(400).json({ error: 'body must be exactly {"status": "done"}' });
    }
    const id = Number(req.params.id);
    markDone.run(id);
    res.json(findTask.get(id));
  });

  return router;
}

module.exports = { tasksRoutes };
