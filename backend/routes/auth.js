const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { authMiddleware, signToken } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/auth/login ──────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Email ou senha incorretos' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Email ou senha incorretos' });

  // Update last login
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  const token = signToken(user.id);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan, role: user.role }
  });
});

// ── POST /api/auth/register ───────────────────────────
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });

  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (exists) return res.status(409).json({ error: 'Email já cadastrado' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO users (name, email, password, plan, role) VALUES (?, ?, ?, 'basic', 'user')")
    .run(name.trim(), email.toLowerCase().trim(), hash);

  const token = signToken(result.lastInsertRowid);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan, role: user.role }
  });
});

// ── GET /api/auth/me ──────────────────────────────────
router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.user.plan);
  const accCount = db.prepare('SELECT COUNT(*) as c FROM meta_accounts WHERE user_id = ? AND active = 1').get(req.user.id);
  res.json({
    user: { id: req.user.id, name: req.user.name, email: req.user.email, plan: req.user.plan, role: req.user.role },
    plan,
    accountsUsed: accCount.c
  });
});

// ── PUT /api/auth/password ────────────────────────────
router.put('/password', authMiddleware, (req, res) => {
  const { current, newPassword } = req.body;
  if (!current || !newPassword) return res.status(400).json({ error: 'Campos obrigatórios' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current, user.password)) return res.status(401).json({ error: 'Senha atual incorreta' });

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Senha alterada com sucesso' });
});

module.exports = router;
