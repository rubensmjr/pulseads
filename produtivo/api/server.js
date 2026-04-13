require('dotenv').config({ path: '/var/www/pulseads/backend/.env' });
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const app = express();
const PORT = 3001;
const SECRET = process.env.JWT_SECRET || 'change-me';
const DB_PATH = '/var/www/pulseads/backend/data/pulseads.db';
app.use(cors());
app.use(express.json());
function getDb() { return new Database(DB_PATH); }
function init() {
  const db = getDb();
  db.exec("CREATE TABLE IF NOT EXISTS prod_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, text TEXT NOT NULL, done INTEGER DEFAULT 0, priority TEXT DEFAULT 'media', created_at TEXT DEFAULT (datetime('now')))");
  db.exec("CREATE TABLE IF NOT EXISTS prod_bills (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, amount REAL DEFAULT 0, due_date TEXT NOT NULL, recurring INTEGER DEFAULT 0, paid INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))");
  db.exec("CREATE TABLE IF NOT EXISTS prod_pomodoros (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, count INTEGER DEFAULT 0)");
  db.close();
}
init();
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Token necessario' });
  try {
    const p = jwt.verify(h.slice(7), SECRET);
    const db = getDb();
    const u = db.prepare('SELECT id,name,email FROM users WHERE id=? AND active=1').get(p.userId);
    db.close();
    if (!u) return res.status(401).json({ error: 'Nao encontrado' });
    req.user = u;
    next();
  } catch (e) { return res.status(401).json({ error: 'Token invalido' }); }
}
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Campos obrigatorios' });
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email.toLowerCase().trim());
  db.close();
  if (!u || !bcrypt.compareSync(password, u.password)) return res.status(401).json({ error: 'Email ou senha incorretos' });
  const token = jwt.sign({ userId: u.id }, SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: u.id, name: u.name, email: u.email } });
});
app.get('/api/me', auth, (req, res) => { res.json(req.user); });
app.get('/api/tasks', auth, (req, res) => { const db = getDb(); const t = db.prepare('SELECT * FROM prod_tasks WHERE user_id=? ORDER BY created_at').all(req.user.id); db.close(); res.json(t.map(x => ({ ...x, done: !!x.done }))); });
app.post('/api/tasks', auth, (req, res) => { const { text, priority } = req.body; if (!text) return res.status(400).json({ error: 'Texto obrigatorio' }); const db = getDb(); const r = db.prepare('INSERT INTO prod_tasks (user_id,text,priority) VALUES (?,?,?)').run(req.user.id, text, priority || 'media'); const t = db.prepare('SELECT * FROM prod_tasks WHERE id=?').get(r.lastInsertRowid); db.close(); res.status(201).json({ ...t, done: !!t.done }); });
app.put('/api/tasks/:id', auth, (req, res) => { const { done, text, priority } = req.body; const db = getDb(); const t = db.prepare('SELECT * FROM prod_tasks WHERE id=? AND user_id=?').get(req.params.id, req.user.id); if (!t) { db.close(); return res.status(404).json({ error: 'Nao encontrado' }); } db.prepare('UPDATE prod_tasks SET done=?,text=?,priority=? WHERE id=?').run(done !== undefined ? (done ? 1 : 0) : t.done, text || t.text, priority || t.priority, req.params.id); db.close(); res.json({ ok: true }); });
app.delete('/api/tasks/:id', auth, (req, res) => { const db = getDb(); db.prepare('DELETE FROM prod_tasks WHERE id=? AND user_id=?').run(req.params.id, req.user.id); db.close(); res.json({ ok: true }); });
app.get('/api/bills', auth, (req, res) => { const db = getDb(); const b = db.prepare('SELECT * FROM prod_bills WHERE user_id=? ORDER BY due_date').all(req.user.id); db.close(); res.json(b.map(x => ({ ...x, recurring: !!x.recurring, paid: !!x.paid, dueDate: x.due_date }))); });
app.post('/api/bills', auth, (req, res) => { const { name, amount, dueDate, recurring } = req.body; if (!name || !dueDate) return res.status(400).json({ error: 'Nome e data obrigatorios' }); const db = getDb(); const r = db.prepare('INSERT INTO prod_bills (user_id,name,amount,due_date,recurring) VALUES (?,?,?,?,?)').run(req.user.id, name, amount || 0, dueDate, recurring ? 1 : 0); const b = db.prepare('SELECT * FROM prod_bills WHERE id=?').get(r.lastInsertRowid); db.close(); res.status(201).json({ ...b, recurring: !!b.recurring, paid: !!b.paid, dueDate: b.due_date }); });
app.put('/api/bills/:id', auth, (req, res) => { const { paid, name, amount, dueDate, recurring } = req.body; const db = getDb(); const b = db.prepare('SELECT * FROM prod_bills WHERE id=? AND user_id=?').get(req.params.id, req.user.id); if (!b) { db.close(); return res.status(404).json({ error: 'Nao encontrado' }); } db.prepare('UPDATE prod_bills SET paid=?,name=?,amount=?,due_date=?,recurring=? WHERE id=?').run(paid !== undefined ? (paid ? 1 : 0) : b.paid, name || b.name, amount !== undefined ? amount : b.amount, dueDate || b.due_date, recurring !== undefined ? (recurring ? 1 : 0) : b.recurring, req.params.id); db.close(); res.json({ ok: true }); });
app.delete('/api/bills/:id', auth, (req, res) => { const db = getDb(); db.prepare('DELETE FROM prod_bills WHERE id=? AND user_id=?').run(req.params.id, req.user.id); db.close(); res.json({ ok: true }); });
app.get('/api/pomodoros', auth, (req, res) => { const db = getDb(); let p = db.prepare('SELECT * FROM prod_pomodoros WHERE user_id=?').get(req.user.id); if (!p) { db.prepare('INSERT INTO prod_pomodoros (user_id,count) VALUES (?,0)').run(req.user.id); p = { count: 0 }; } db.close(); res.json({ count: p.count }); });
app.put('/api/pomodoros', auth, (req, res) => { const { count } = req.body; const db = getDb(); const e = db.prepare('SELECT id FROM prod_pomodoros WHERE user_id=?').get(req.user.id); if (e) { db.prepare('UPDATE prod_pomodoros SET count=? WHERE user_id=?').run(count, req.user.id); } else { db.prepare('INSERT INTO prod_pomodoros (user_id,count) VALUES (?,?)').run(req.user.id, count); } db.close(); res.json({ ok: true }); });
app.listen(PORT, () => console.log('Produtivo API porta ' + PORT));
