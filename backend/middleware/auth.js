const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const SECRET = process.env.JWT_SECRET || 'pulseads-secret-change-in-production';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, SECRET);
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(payload.userId);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    next();
  });
}

function signToken(userId) {
  return jwt.sign({ userId }, SECRET, { expiresIn: '7d' });
}

module.exports = { authMiddleware, adminMiddleware, signToken };
