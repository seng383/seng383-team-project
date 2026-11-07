const express = require('express');
const { requireRole } = require('../middleware/auth');

const SELECT_LINK =
  'SELECT u.id, u.name, u.specialist_type AS specialistType, l.linked_at AS linkedAt ' +
  'FROM specialist_links l JOIN users u ON u.id = l.specialist_id';

function childrenRoutes(db, requireAuth, requireChildAccess) {
  const router = express.Router();
  const findOwnChildren = db.prepare(
    'SELECT u.id, u.name FROM children c JOIN users u ON u.id = c.user_id WHERE c.parent_id = ? ORDER BY u.id'
  );
  const findLinkedChildren = db.prepare(
    'SELECT u.id, u.name, p.name AS parentName, l.linked_at AS linkedAt FROM specialist_links l ' +
      'JOIN users u ON u.id = l.child_id JOIN children c ON c.user_id = l.child_id JOIN users p ON p.id = c.parent_id ' +
      'WHERE l.specialist_id = ? ORDER BY u.id'
  );
  const findLinks = db.prepare(`${SELECT_LINK} WHERE l.child_id = ? ORDER BY l.linked_at, u.id`);
  const findLink = db.prepare(`${SELECT_LINK} WHERE l.child_id = ? AND l.specialist_id = ?`);
  const findSpecialist = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'specialist'");
  const insertLink = db.prepare('INSERT OR IGNORE INTO specialist_links (child_id, specialist_id) VALUES (?, ?)');
  const deleteLink = db.prepare('DELETE FROM specialist_links WHERE child_id = ? AND specialist_id = ?');

  router.use(requireAuth, requireRole('parent', 'specialist'));

  router.get('/', (req, res) => {
    const findChildren = req.user.role === 'parent' ? findOwnChildren : findLinkedChildren;
    res.json(findChildren.all(req.user.id));
  });

  // Everything below is about one child, so the routes later modules add here get this check too.
  router.use('/:childId', requireChildAccess);

  router.get('/:childId/specialists', requireRole('parent'), (req, res) => {
    res.json(findLinks.all(Number(req.params.childId)));
  });

  // Linking someone who is already linked leaves the wanted state in place, so it is not an error.
  router.post('/:childId/specialists', requireRole('parent'), express.json(), (req, res) => {
    const { email } = req.body ?? {};
    const specialist = typeof email === 'string' ? findSpecialist.get(email) : undefined;
    if (!specialist) {
      return res.status(400).json({ error: 'Email does not belong to a registered specialist' });
    }

    const childId = Number(req.params.childId);
    const { changes } = insertLink.run(childId, specialist.id);
    res.status(changes ? 201 : 200).json(findLink.get(childId, specialist.id));
  });

  // Same reasoning as a repeated link: unlinking someone who is not linked leaves the wanted state in place.
  router.delete('/:childId/specialists/:specialistId', requireRole('parent'), (req, res) => {
    deleteLink.run(Number(req.params.childId), req.params.specialistId);
    res.status(204).end();
  });

  return router;
}

module.exports = { childrenRoutes };
