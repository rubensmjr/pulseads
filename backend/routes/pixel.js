const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// Recebe eventos do pixel
router.post('/track', (req, res) => {
  // Permite requisições de qualquer origem (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  try {
    const db = getDb();
    const {
      session_id, event, page,
      utm_source, utm_campaign, utm_adset, utm_ad, utm_content,
      ref, device, extra
    } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const user_agent = req.headers['user-agent'] || '';
    db.prepare(`
      INSERT INTO pixel_events
        (session_id, event, page, utm_source, utm_campaign, utm_adset, utm_ad, utm_content, ip, user_agent, ref, device, extra)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      session_id||null, event||'pageview', page||null,
      utm_source||null, utm_campaign||null, utm_adset||null, utm_ad||null, utm_content||null,
      ip, user_agent, ref||null, device||null,
      extra ? JSON.stringify(extra) : null
    );
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Retorna pixel transparente 1x1 (para tracking via img tag também)
router.get('/p.gif', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const db = getDb();
    const { sid, ev, p, src, camp, as, ad } = req.query;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    db.prepare(`
      INSERT INTO pixel_events (session_id, event, page, utm_source, utm_campaign, utm_adset, utm_ad, ip, user_agent)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(sid||null, ev||'pageview', p||null, src||null, camp||null, as||null, ad||null, ip, ua);
  } catch(e) {}
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(gif);
});

// Stats do pixel para o dashboard
router.get('/stats', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const db = getDb();
    const { dateFrom, dateTo, utm_campaign } = req.query;
    let where = '1=1';
    const params = [];
    if (dateFrom) { where += ' AND date(created_at) >= ?'; params.push(dateFrom); }
    if (dateTo) { where += ' AND date(created_at) <= ?'; params.push(dateTo); }
    if (utm_campaign) { where += ' AND utm_campaign = ?'; params.push(utm_campaign); }
    const pageviews = db.prepare(`SELECT COUNT(*) as n FROM pixel_events WHERE event='pageview' AND ${where}`).get(...params);
    const leads = db.prepare(`SELECT COUNT(*) as n FROM pixel_events WHERE event='lead' AND ${where}`).get(...params);
    const clicks = db.prepare(`SELECT COUNT(*) as n FROM pixel_events WHERE event='click_cta' AND ${where}`).get(...params);
    const campaigns = db.prepare(`SELECT utm_campaign, COUNT(*) as views FROM pixel_events WHERE event='pageview' AND utm_campaign IS NOT NULL AND ${where} GROUP BY utm_campaign ORDER BY views DESC LIMIT 10`).all(...params);
    res.json({ pageviews: pageviews.n, leads: leads.n, clicks: clicks.n, campaigns });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
module.exports = router;
