const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/admin/users ──────────────────────────────
router.get('/users', adminMiddleware, (req, res) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.plan, u.role, u.active, u.created_at, u.last_login,
           COUNT(ma.id) as account_count
    FROM users u
    LEFT JOIN meta_accounts ma ON ma.user_id = u.id AND ma.active = 1
    GROUP BY u.id ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

// ── POST /api/admin/users ─────────────────────────────
router.post('/users', adminMiddleware, (req, res) => {
  const { name, email, password, plan, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Campos obrigatórios' });
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (exists) return res.status(409).json({ error: 'Email já cadastrado' });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO users (name, email, password, plan, role) VALUES (?, ?, ?, ?, ?)')
    .run(name.trim(), email.toLowerCase().trim(), hash, plan||'basic', role||'user');
  res.status(201).json({ id: r.lastInsertRowid, name, email, plan: plan||'basic', role: role||'user' });
});

// ── PUT /api/admin/users/:id ──────────────────────────
router.put('/users/:id', adminMiddleware, (req, res) => {
  const { name, plan, role, active } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  db.prepare('UPDATE users SET name = ?, plan = ?, role = ?, active = ? WHERE id = ?')
    .run(name||user.name, plan||user.plan, role||user.role, active!==undefined?active:user.active, req.params.id);
  res.json({ message: 'Usuário atualizado' });
});

// ── DELETE /api/admin/users/:id ───────────────────────
router.delete('/users/:id', adminMiddleware, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Não pode deletar a si mesmo' });
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Usuário desativado' });
});

// ── GET /api/admin/stats ──────────────────────────────
router.get('/stats', adminMiddleware, (req, res) => {
  const db = getDb();
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE active = 1').get().c;
  const totalAccounts = db.prepare('SELECT COUNT(*) as c FROM meta_accounts WHERE active = 1').get().c;
  const byPlan = db.prepare('SELECT plan, COUNT(*) as c FROM users WHERE active = 1 GROUP BY plan').all();
  const recentUsers = db.prepare('SELECT name, email, plan, created_at FROM users ORDER BY created_at DESC LIMIT 5').all();
  res.json({ totalUsers, totalAccounts, byPlan, recentUsers });
});

// ── GET /api/admin/plans ──────────────────────────────
router.get('/plans', adminMiddleware, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM plans').all());
});

// ── PUT /api/admin/plans/:id ──────────────────────────
router.put('/plans/:id', adminMiddleware, (req, res) => {
  const { name, max_accounts, price_monthly } = req.body;
  const db = getDb();
  db.prepare('UPDATE plans SET name = ?, max_accounts = ?, price_monthly = ? WHERE id = ?')
    .run(name, max_accounts, price_monthly, req.params.id);
  res.json({ message: 'Plano atualizado' });
});

module.exports = router;
