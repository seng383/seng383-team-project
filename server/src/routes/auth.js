const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_ALGORITHM } = require('../middleware/auth');

const TOKEN_LIFETIME = '8h';

// An unknown email is compared against this, so it takes as long as a wrong password.
// Same cost as the seeded hashes.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

function authRoutes(db, secret, requireAuth) {
  const router = express.Router();
  const findUser = db.prepare('SELECT id, name, role, password_hash FROM users WHERE email = ?');
  const revokeToken = db.prepare("INSERT INTO revoked_tokens (jti, expires_at) VALUES (?, datetime(?, 'unixepoch'))");
  const deleteExpired = db.prepare("DELETE FROM revoked_tokens WHERE expires_at <= datetime('now')");

  router.post('/login', express.json(), async (req, res) => {
    const { email, password } = req.body ?? {};
    const user = typeof email === 'string' ? findUser.get(email) : undefined;
    const passwordMatches =
      typeof password === 'string' && (await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH));

    if (!user || !passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ role: user.role }, secret, {
      subject: String(user.id),
      jwtid: crypto.randomUUID(),
      expiresIn: TOKEN_LIFETIME,
      algorithm: JWT_ALGORITHM,
    });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json(req.user);
  });

  router.post('/logout', requireAuth, (req, res) => {
    revokeToken.run(req.token.jti, req.token.exp);
    deleteExpired.run();
    res.status(204).end();
  });

  return router;
}

module.exports = { authRoutes };
