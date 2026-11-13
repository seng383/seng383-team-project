// The link is read from the database on every call, so an unlink stops an unexpired token at once.
function createChildAccess(db) {
  const linkQueries = {
    parent: db.prepare('SELECT 1 FROM children WHERE user_id = ? AND parent_id = ?'),
    specialist: db.prepare('SELECT 1 FROM specialist_links WHERE child_id = ? AND specialist_id = ?'),
  };

  // A malformed id gets the same answer as a child without access, so nobody learns which children exist.
  // Digits only, because Number() would read "2.0" or "2e0" as the real child 2.
  function canAccessChild(user, childId) {
    const linkQuery = linkQueries[user.role];
    return /^[1-9]\d*$/.test(childId) && linkQuery !== undefined && linkQuery.get(Number(childId), user.id) !== undefined;
  }

  function requireChildAccess(req, res, next) {
    if (!canAccessChild(req.user, req.params.childId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  }

  return { canAccessChild, requireChildAccess };
}

module.exports = { createChildAccess };
