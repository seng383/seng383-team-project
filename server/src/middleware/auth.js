const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_ALGORITHM = 'HS256';

let generatedSecret;

// Tests and CI have no server/.env, so outside production a missing secret is replaced by a random one.
function loadJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set when NODE_ENV is production');
  }
  if (!generatedSecret) {
    generatedSecret = crypto.randomBytes(32).toString('hex');
    console.warn('JWT_SECRET is not set: using a random secret, so logins end when the server restarts.');
  }
  return generatedSecret;
}

function unauthorized(res) {
  return res.status(401).json({ error: 'Unauthorized' });
}

function createRequireAuth(db, secret) {
  const findRevoked = db.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?');
  const findUser = db.prepare('SELECT id, name, role FROM users WHERE id = ?');

  return function requireAuth(req, res, next) {
    const match = /^Bearer (.+)$/i.exec(req.get('Authorization') || '');
    if (!match) {
      return unauthorized(res);
    }

    let claims;
    try {
      claims = jwt.verify(match[1], secret, { algorithms: [JWT_ALGORITHM] });
    } catch {
      return unauthorized(res);
    }

    // Logout needs jti and exp, so a token without them could never be revoked.
    if (!claims.jti || !claims.exp || findRevoked.get(claims.jti)) {
      return unauthorized(res);
    }

    // The role comes from this row, not the token, so a token cannot outlive its user or role.
    const user = findUser.get(Number(claims.sub));
    if (!user) {
      return unauthorized(res);
    }

    req.user = user;
    req.token = claims;
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { JWT_ALGORITHM, loadJwtSecret, createRequireAuth, requireRole };
