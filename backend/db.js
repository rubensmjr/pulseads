const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'pulseads.db');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

let db;

function getDb() {
  if (!db) db = new Database(DB_PATH);
  return db;
}

function init() {
  const db = getDb();

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'basic',
      role TEXT NOT NULL DEFAULT 'user',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT
    )
  `);

  // Meta accounts table (tokens encrypted)
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      manager TEXT,
      account_id TEXT NOT NULL,
      token_encrypted TEXT NOT NULL,
      color TEXT DEFAULT '#4f8ef7',
      currency TEXT DEFAULT 'USD',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Plans config
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      max_accounts INTEGER NOT NULL,
      price_monthly REAL NOT NULL,
      active INTEGER DEFAULT 1
    )
  `);

  // Seed plans if empty
  const plans = db.prepare('SELECT COUNT(*) as c FROM plans').get();
  if (plans.c === 0) {
    db.prepare("INSERT INTO plans VALUES ('basic','Basic',1,49.90,1)").run();
    db.prepare("INSERT INTO plans VALUES ('pro','Pro',5,99.90,1)").run();
    db.prepare("INSERT INTO plans VALUES ('agency','Agency',-1,199.90,1)").run();
  }

  // Create admin user if no users exist
  const users = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (users.c === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
    db.prepare("INSERT INTO users (name, email, password, plan, role) VALUES (?, ?, ?, 'agency', 'admin')")
      .run('Admin', process.env.ADMIN_EMAIL || 'admin@pulseads.com', hash);
    console.log('✅ Admin criado: admin@pulseads.com / admin123');
    console.log('   ⚠️  Troque a senha no primeiro login!\n');
  }

  console.log('✅ Banco de dados inicializado');
}

module.exports = { getDb, init };
