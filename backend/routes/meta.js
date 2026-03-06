const express = require('express');
const fetch = require('node-fetch');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { decrypt } = require('../utils/crypto');

const router = express.Router();
const META_API = 'https://graph.facebook.com/v19.0';

// Helper: GET from Meta API
async function metaFetch(token, path, params = {}) {
  const url = new URL(`${META_API}/${path}`);
  url.searchParams.set('access_token', token);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString());
  const data = await r.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

// Helper: POST/update to Meta API
async function metaPost(token, path, body = {}) {
  const url = new URL(`${META_API}/${path}`);
  url.searchParams.set('access_token', token);
  const r = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

// Helper: get account and decrypt token, verify ownership
function getAccountToken(accountId, userId) {
  const db = getDb();
  const acc = db.prepare('SELECT * FROM meta_accounts WHERE id = ? AND user_id = ? AND active = 1').get(accountId, userId);
  if (!acc) throw new Error('Conta não encontrada');
  return { acc, token: decrypt(acc.token_encrypted) };
}

// ── GET /api/meta/:accountId/insights ─────────────────
router.get('/:accountId/insights', authMiddleware, async (req, res) => {
  try {
    const { acc, token } = getAccountToken(req.params.accountId, req.user.id);
    const { since, until, time_increment } = req.query;
    const params = {
      fields: 'impressions,clicks,spend,reach,cpm,cpc,ctr,actions,cost_per_action_type',
      time_range: JSON.stringify({ since, until }),
      level: 'account',
    };
    if (time_increment) params.time_increment = time_increment;
    const data = await metaFetch(token, acc.account_id + '/insights', params);
    res.json(data);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── GET /api/meta/:accountId/campaigns ────────────────
router.get('/:accountId/campaigns', authMiddleware, async (req, res) => {
  try {
    const { acc, token } = getAccountToken(req.params.accountId, req.user.id);
    const { since, until } = req.query;
    const tr = JSON.stringify({ since, until });
    const data = await metaFetch(token, acc.account_id + '/campaigns', {
      fields: `name,status,objective,insights.time_range(${tr}){spend,impressions,clicks,ctr,cpc,cpm,actions,reach,frequency}`,
      limit: 50,
    });
    res.json(data);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── GET /api/meta/:accountId/adsets ───────────────────
router.get('/:accountId/adsets', authMiddleware, async (req, res) => {
  try {
    const { acc, token } = getAccountToken(req.params.accountId, req.user.id);
    const { since, until } = req.query;
    const tr = JSON.stringify({ since, until });
    const data = await metaFetch(token, acc.account_id + '/adsets', {
      fields: `name,status,daily_budget,insights.time_range(${tr}){spend,impressions,clicks,ctr,cpc,frequency,reach}`,
      limit: 50,
    });
    res.json(data);
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── GET /api/meta/:accountId/all ──────────────────────
// Single endpoint that returns everything at once
router.get('/:accountId/all', authMiddleware, async (req, res) => {
  try {
    const { acc, token } = getAccountToken(req.params.accountId, req.user.id);
    const { since, until } = req.query;
    const tr = JSON.stringify({ since, until });

    const [insRes, campRes, adsetRes, dailyRes, prevRes] = await Promise.allSettled([
      metaFetch(token, acc.account_id + '/insights', {
        fields: 'impressions,clicks,spend,reach,cpm,cpc,ctr,actions',
        time_range: tr, level: 'account',
      }),
      metaFetch(token, acc.account_id + '/campaigns', {
        fields: `name,status,objective,insights.time_range(${tr}){spend,impressions,clicks,ctr,cpc,cpm,actions,reach,frequency}`,
        limit: 50,
      }),
      metaFetch(token, acc.account_id + '/adsets', {
        fields: `name,status,daily_budget,insights.time_range(${tr}){spend,impressions,clicks,ctr,cpc,frequency,reach}`,
        limit: 50,
      }),
      metaFetch(token, acc.account_id + '/insights', {
        fields: 'spend,impressions,clicks,ctr,cpc',
        time_range: tr, time_increment: 1, level: 'account',
      }),
      // Previous period
      (async () => {
        const s = new Date(since), u = new Date(until);
        const days = Math.round((u-s)/(1000*60*60*24))+1;
        const ps = new Date(s); ps.setDate(ps.getDate()-days);
        const pu = new Date(s); pu.setDate(pu.getDate()-1);
        const fmt = d => d.toISOString().split('T')[0];
        return metaFetch(token, acc.account_id + '/insights', {
          fields: 'impressions,clicks,spend,cpm,cpc,ctr,actions',
          time_range: JSON.stringify({ since: fmt(ps), until: fmt(pu) }),
          level: 'account',
        });
      })(),
    ]);

    res.json({
      accountId: req.params.accountId,
      currency: acc.currency,
      insights: insRes.status==='fulfilled' ? insRes.value.data?.[0]||null : null,
      campaigns: campRes.status==='fulfilled' ? campRes.value.data||[] : [],
      adsets: adsetRes.status==='fulfilled' ? adsetRes.value.data||[] : [],
      dailyData: dailyRes.status==='fulfilled' ? dailyRes.value.data||[] : [],
      prevInsights: prevRes.status==='fulfilled' ? prevRes.value.data?.[0]||null : null,
    });
  } catch(e) { res.status(400).json({ error: e.message }); }
});


// Helper (moved here to avoid hoisting issues)
function getAccountToken(accountId, userId) {
  const db = getDb();
  const acc = db.prepare('SELECT * FROM meta_accounts WHERE id = ? AND user_id = ? AND active = 1').get(accountId, userId);
  if (!acc) throw new Error('Conta não encontrada');
  return { acc, token: decrypt(acc.token_encrypted) };
}

// ── POST /api/meta/:accountId/campaigns/:campId/status
router.post('/:accountId/campaigns/:campId/status', authMiddleware, async (req, res) => {
  try {
    const { token } = getAccountToken(req.params.accountId, req.user.id);
    const { status } = req.body;
    if (!['ACTIVE','PAUSED'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const data = await metaPost(token, req.params.campId, { status });
    res.json({ success: true, data });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── POST /api/meta/:accountId/adsets/:adsetId/status
router.post('/:accountId/adsets/:adsetId/status', authMiddleware, async (req, res) => {
  try {
    const { token } = getAccountToken(req.params.accountId, req.user.id);
    const { status } = req.body;
    if (!['ACTIVE','PAUSED'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const data = await metaPost(token, req.params.adsetId, { status });
    res.json({ success: true, data });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── POST /api/meta/:accountId/adsets/:adsetId/budget
router.post('/:accountId/adsets/:adsetId/budget', authMiddleware, async (req, res) => {
  try {
    const { token } = getAccountToken(req.params.accountId, req.user.id);
    const { daily_budget } = req.body;
    if (!daily_budget) return res.status(400).json({ error: 'Informe daily_budget.' });
    const data = await metaPost(token, req.params.adsetId, { daily_budget: Math.round(parseFloat(daily_budget) * 100) });
    res.json({ success: true, data });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── POST /api/meta/:accountId/campaigns/:campId/budget
router.post('/:accountId/campaigns/:campId/budget', authMiddleware, async (req, res) => {
  try {
    const { token } = getAccountToken(req.params.accountId, req.user.id);
    const { daily_budget } = req.body;
    if (!daily_budget) return res.status(400).json({ error: 'Informe daily_budget.' });
    const data = await metaPost(token, req.params.campId, { daily_budget: Math.round(parseFloat(daily_budget) * 100) });
    res.json({ success: true, data });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
module.exports = router;
