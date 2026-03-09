const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const { getDb } = require('../db');
require('dotenv').config();

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC,
  process.env.VAPID_PRIVATE
);

// Salva subscription
router.post('/subscribe', (req, res) => {
  try {
    const { subscription, user_id } = req.body;
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
    `).run(user_id || 1, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Remove subscription
router.post('/unsubscribe', (req, res) => {
  try {
    const { endpoint } = req.body;
    const db = getDb();
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Envia push para todos (chamado internamente pelo webhook)
function sendPushToAll(payload) {
  try {
    const db = getDb();
    const subs = db.prepare('SELECT * FROM push_subscriptions').all();
    subs.forEach(sub => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      webpush.sendNotification(subscription, JSON.stringify(payload))
        .catch(err => {
          // Remove subscription inválida
          if (err.statusCode === 410) {
            db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
          }
        });
    });
  } catch(e) {
    console.error('Push error:', e.message);
  }
}

module.exports = { router, sendPushToAll };
