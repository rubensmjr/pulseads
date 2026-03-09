const { sendPushToAll } = require('./push');
const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

function initTables() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT DEFAULT 'received',
    payload TEXT,
    user_id TEXT,
    product_id TEXT,
    product_name TEXT,
    buyer_email TEXT,
    buyer_name TEXT,
    value REAL DEFAULT 0,
    currency TEXT DEFAULT 'BRL',
    commission REAL DEFAULT 0,
    transaction_id TEXT,
    country TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS webhook_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    platform TEXT NOT NULL,
    secret_token TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, platform)
  )`);
}
initTables();

function saveEvent(platform, eventType, status, payload, meta = {}) {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO webhook_events
    (platform, event_type, status, payload, user_id, product_id, product_name, buyer_email, buyer_name, value, currency, commission, transaction_id, country)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  return stmt.run(
    platform, eventType, status, JSON.stringify(payload),
    meta.user_id||null, meta.product_id||null, meta.product_name||null,
    meta.buyer_email||null, meta.buyer_name||null,
    meta.value||0, meta.currency||'USD', meta.commission||0, meta.transaction_id||null,
    meta.country||null
  );
}

router.post('/hotmart', (req, res) => {
  try {
    const hottok = process.env.HOTMART_HOTTOK;
    if (hottok) {
      const received = req.headers['x-hotmart-hottok'];
      if (!received || received !== hottok) {
        console.warn('Hotmart webhook: hottok invalido');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }
    const payload = req.body;
    const eventMap = {
      'PURCHASE_COMPLETE': 'purchase', 'PURCHASE_APPROVED': 'purchase',
      'PURCHASE_CANCELED': 'canceled', 'PURCHASE_REFUNDED': 'refunded',
      'PURCHASE_CHARGEBACK': 'chargeback', 'PURCHASE_PROTEST': 'purchase_protest',
      'PURCHASE_DELAYED': 'purchase', 'PURCHASE_OUT_OF_SHOPPING_CART': 'abandoned_cart',
      'PURCHASE_BILLET_PRINTED': 'purchase_billet_printed',
      'SUBSCRIPTION_CANCELLATION': 'subscription_canceled',
    };
    const event = payload.event || '';
    const eventType = eventMap[event] || event.toLowerCase();
    const purchase = payload.data?.purchase || {};
    const buyer = payload.data?.buyer || {};
    const product = payload.data?.product || {};
    const producer = payload.data?.producer || {};
    const commissions = payload.data?.commissions || [];

    // Valor sempre em USD: original_offer_price > price USD > soma comissoes
    let priceVal = 0;
    if (purchase.original_offer_price?.currency_value === 'USD') {
      priceVal = purchase.original_offer_price.value || 0;
    } else if (purchase.price?.currency_value === 'USD') {
      priceVal = purchase.price.value || 0;
    } else if (purchase.full_price?.currency_value === 'USD') {
      priceVal = purchase.full_price.value || 0;
    } else {
      priceVal = commissions
        .filter(c => c.currency_value === 'USD')
        .reduce((s, c) => s + (c.value || 0), 0);
    }

    saveEvent('hotmart', eventType, 'processed', payload, {
      user_id: producer.ucode || null,
      product_id: product.id?.toString() || null,
      product_name: product.name || null,
      buyer_email: buyer.email || null,
      buyer_name: buyer.name || null,
      value: priceVal,
      currency: 'USD',
      commission: purchase.commission_as?.value || 0,
      transaction_id: purchase.transaction || null,
      country: purchase.checkout_country?.name || buyer?.address?.country || null
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Hotmart webhook error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/kiwify', (req, res) => {
  try {
    const payload = req.body;
    const statusMap = { 'paid':'purchase','refunded':'refunded','chargedback':'chargeback','abandoned':'abandoned_cart','refused':'refused' };
    const eventType = statusMap[payload.order_status] || payload.order_status || 'unknown';
    saveEvent('kiwify', eventType, 'processed', payload, {
      product_id: payload.product_id || null,
      product_name: payload.product?.name || null,
      buyer_email: payload.Customer?.email || null,
      buyer_name: payload.Customer?.full_name || null,
      value: parseFloat(payload.order_value || 0),
      currency: 'BRL',
      transaction_id: payload.order_id || null
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/ticto', (req, res) => {
  try {
    const payload = req.body;
    const statusMap = { '3':'purchase','6':'refunded','1':'pending','7':'chargeback' };
    const eventType = statusMap[payload.status] || 'unknown';
    saveEvent('ticto', eventType, 'processed', payload, {
      product_id: payload.product_id?.toString() || null,
      product_name: payload.product_name || null,
      buyer_email: payload.email || null,
      buyer_name: payload.name || null,
      value: parseFloat(payload.price || 0),
      currency: 'BRL',
      transaction_id: payload.transaction_id || null
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/eduzz', (req, res) => {
  try {
    const payload = req.body;
    const statusMap = { 'approved':'purchase','refunded':'refunded','chargeback':'chargeback','pending':'pending','canceled':'canceled' };
    const eventType = statusMap[payload.trans_status] || 'unknown';
    saveEvent('eduzz', eventType, 'processed', payload, {
      product_id: payload.content_id?.toString() || null,
      product_name: payload.content_title || null,
      buyer_email: payload.client_email || null,
      buyer_name: payload.client_name || null,
      value: parseFloat(payload.trans_value || 0),
      currency: 'BRL',
      transaction_id: payload.trans_cod || null
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/perfectpay', (req, res) => {
  try {
    const payload = req.body;
    const statusMap = { 'CONFIRMED':'purchase','REFUNDED':'refunded','CHARGEBACK':'chargeback','WAITING':'pending' };
    const eventType = statusMap[payload.sale_status_enum] || 'unknown';
    saveEvent('perfectpay', eventType, 'processed', payload, {
      product_id: payload.product_code || null,
      product_name: payload.product_name || null,
      buyer_email: payload.customer?.email || null,
      buyer_name: payload.customer?.full_name || null,
      value: parseFloat(payload.sale_amount || 0),
      currency: 'BRL',
      transaction_id: payload.sale_code || null
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/events', (req, res) => {
  try {
    const db = getDb();
    const { platform, event_type, limit = 500, offset = 0 } = req.query;
    let query = 'SELECT * FROM webhook_events WHERE 1=1';
    const params = [];
    if (platform) { query += ' AND platform=?'; params.push(platform); }
    if (event_type) { query += ' AND event_type=?'; params.push(event_type); }
    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const rows = db.prepare(query).all(...params);
    res.json({ events: rows, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const { platform } = req.query;
    let where = "WHERE event_type IN ('purchase','refunded','chargeback')";
    const params = [];
    if (platform) { where += ' AND platform=?'; params.push(platform); }
    const rows = db.prepare(`SELECT platform, event_type, COUNT(*) as count,
      SUM(value) as total_value FROM webhook_events ${where}
      GROUP BY platform, event_type ORDER BY platform, event_type`).all(...params);
    res.json({ stats: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
