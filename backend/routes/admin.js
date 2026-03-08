const express=require('express');
const bcrypt=require('bcryptjs');
const {getDb}=require('../db');
const {adminMiddleware}=require('../middleware/auth');
const router=express.Router();
router.get('/stats',adminMiddleware,(req,res)=>{
  const db=getDb();
  res.json({
    totalUsers:db.prepare('SELECT COUNT(*) as c FROM users WHERE active=1').get().c,
    totalAccounts:db.prepare('SELECT COUNT(*) as c FROM meta_accounts WHERE active=1').get().c,
    byPlan:db.prepare('SELECT plan,COUNT(*) as c FROM users WHERE active=1 GROUP BY plan').all(),
    recentUsers:db.prepare('SELECT name,email,plan,created_at FROM users ORDER BY created_at DESC LIMIT 5').all()
  });
});
router.get('/users',adminMiddleware,(req,res)=>{
  res.json(getDb().prepare('SELECT u.id,u.name,u.email,u.plan,u.role,u.active,u.created_at,u.last_login,COUNT(ma.id) as account_count FROM users u LEFT JOIN meta_accounts ma ON ma.user_id=u.id AND ma.active=1 GROUP BY u.id ORDER BY u.created_at DESC').all());
});
router.post('/users',adminMiddleware,(req,res)=>{
  const {name,email,password,plan,role}=req.body;
  if(!name||!email||!password)return res.status(400).json({error:'Campos obrigatórios'});
  const db=getDb();
  if(db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase().trim()))return res.status(409).json({error:'Email já cadastrado'});
  const r=db.prepare('INSERT INTO users (name,email,password,plan,role) VALUES (?,?,?,?,?)').run(name.trim(),email.toLowerCase().trim(),bcrypt.hashSync(password,10),plan||'basic',role||'user');
  res.status(201).json({id:r.lastInsertRowid});
});
router.put('/users/:id',adminMiddleware,(req,res)=>{
  const {name,plan,role,active}=req.body;
  const db=getDb();
  const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if(!u)return res.status(404).json({error:'Não encontrado'});
  db.prepare('UPDATE users SET name=?,plan=?,role=?,active=? WHERE id=?').run(name||u.name,plan||u.plan,role||u.role,active!==undefined?active:u.active,req.params.id);
  res.json({message:'Atualizado'});
});
router.get('/plans',adminMiddleware,(req,res)=>res.json(getDb().prepare('SELECT * FROM plans').all()));
router.put('/plans/:id',adminMiddleware,(req,res)=>{
  const {name,max_accounts,price_monthly}=req.body;
  getDb().prepare('UPDATE plans SET name=?,max_accounts=?,price_monthly=? WHERE id=?').run(name,max_accounts,price_monthly,req.params.id);
  res.json({message:'Atualizado'});
});
module.exports=router;
