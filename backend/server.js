require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const db = require('./db');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const metaRoutes = require('./routes/meta');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security ──────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*', credentials: true }));
app.use(express.json());

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: 'Muitas tentativas. Tente em 15 minutos.' } }));
app.use('/api/', rateLimit({ windowMs: 60*1000, max: 120 }));

// ── Routes ────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/admin', adminRoutes);

// ── Serve frontend ────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

// ── Health check ──────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// ── Start ─────────────────────────────────────────────
db.init();
app.listen(PORT, () => {
  console.log(`\n🚀 Pulse Ads rodando na porta ${PORT}`);
  console.log(`   http://localhost:${PORT}\n`);
});
