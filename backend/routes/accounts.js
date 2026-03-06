const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/crypto');

const router = express.Router();

const PLAN_LIMITS = { basic: 1, pro: 5, agency: -1 };

// ── GET /api/accounts ─────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const accounts = db.prepare('SELECT id, name, manager, account_id, color, currency, created_at FROM meta_accounts WHERE user_id = ? AND active = 1 ORDER BY created_at').all(req.user.id);
  res.json(accounts);
});

// ── POST /api/accounts ────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  const { name, manager, account_id, token, color, currency } = req.body;
  if (!name || !account_id || !token) return res.status(400).json({ error: 'Nome, ID da conta e token são obrigatórios' });

  const db = getDb();

  // Check plan limit
  const limit = PLAN_LIMITS[req.user.plan] || 1;
  if (limit !== -1) {
    const count = db.prepare('SELECT COUNT(*) as c FROM meta_accounts WHERE user_id = ? AND active = 1').get(req.user.id);
    if (count.c >= limit) return res.status(403).json({ error: `Seu plano ${req.user.plan} permite até ${limit} conta(s). Faça upgrade para adicionar mais.` });
  }

  // Validate token with Meta API
  try {
    const fetch = require('node-fetch');
    const accId = account_id.startsWith('act_') ? account_id : 'act_' + account_id;
    const r = await fetch(`https://graph.facebook.com/v19.0/${accId}?fields=name,account_status,currency&access_token=${token}`);
    const data = await r.json();
    if (data.error) return res.status(400).json({ error: 'Token inválido: ' + data.error.message });

    const tokenEncrypted = encrypt(token);
    const result = db.prepare('INSERT INTO meta_accounts (user_id, name, manager, account_id, token_encrypted, color, currency) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, name.trim(), manager||'', accId, tokenEncrypted, color||'#4f8ef7', data.currency||currency||'USD');

    res.status(201).json({ id: result.lastInsertRowid, name, manager, account_id: accId, color, currency: data.currency||currency||'USD' });
  } catch(e) {
    res.status(500).json({ error: 'Erro ao verificar token: ' + e.message });
  }
});

// ── DELETE /api/accounts/:id ──────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const acc = db.prepare('SELECT * FROM meta_accounts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!acc) return res.status(404).json({ error: 'Conta não encontrada' });
  db.prepare('UPDATE meta_accounts SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Conta removida' });
});

// ── PUT /api/accounts/:id ─────────────────────────────
router.put('/:id', authMiddleware, (req, res) => {
  const { name, manager, color } = req.body;
  const db = getDb();
  const acc = db.prepare('SELECT * FROM meta_accounts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!acc) return res.status(404).json({ error: 'Conta não encontrada' });
  db.prepare('UPDATE meta_accounts SET name = ?, manager = ?, color = ? WHERE id = ?')
    .run(name||acc.name, manager||acc.manager, color||acc.color, req.params.id);
  res.json({ message: 'Conta atualizada' });
});

module.exports = router;
