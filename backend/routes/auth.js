const express=require('express');
const bcrypt=require('bcryptjs');
const {getDb}=require('../db');
const {authMiddleware,signToken}=require('../middleware/auth');
const router=express.Router();
router.post('/login',(req,res)=>{
  const {email,password}=req.body;
  if(!email||!password)return res.status(400).json({error:'Email e senha obrigatórios'});
  const db=getDb();
  const u=db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email.toLowerCase().trim());
  if(!u||!bcrypt.compareSync(password,u.password))return res.status(401).json({error:'Email ou senha incorretos'});
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(u.id);
  res.json({token:signToken(u.id),user:{id:u.id,name:u.name,email:u.email,plan:u.plan,role:u.role}});
});
router.post('/register',(req,res)=>{
  const {name,email,password}=req.body;
  if(!name||!email||!password)return res.status(400).json({error:'Todos os campos são obrigatórios'});
  if(password.length<6)return res.status(400).json({error:'Senha deve ter pelo menos 6 caracteres'});
  const db=getDb();
  if(db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase().trim()))return res.status(409).json({error:'Email já cadastrado'});
  const hash=bcrypt.hashSync(password,10);
  const r=db.prepare("INSERT INTO users (name,email,password,plan,role) VALUES (?,?,?,'basic','user')").run(name.trim(),email.toLowerCase().trim(),hash);
  const u=db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
  res.status(201).json({token:signToken(u.id),user:{id:u.id,name:u.name,email:u.email,plan:u.plan,role:u.role}});
});
router.get('/me',authMiddleware,(req,res)=>{
  const db=getDb();
  const plan=db.prepare('SELECT * FROM plans WHERE id=?').get(req.user.plan);
  const c=db.prepare('SELECT COUNT(*) as c FROM meta_accounts WHERE user_id=? AND active=1').get(req.user.id);
  res.json({user:{id:req.user.id,name:req.user.name,email:req.user.email,plan:req.user.plan,role:req.user.role},plan,accountsUsed:c.c});
});
router.put('/password',authMiddleware,(req,res)=>{
  const {current,newPassword}=req.body;
  if(!current||!newPassword)return res.status(400).json({error:'Campos obrigatórios'});
  const db=getDb();
  const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if(!bcrypt.compareSync(current,u.password))return res.status(401).json({error:'Senha atual incorreta'});
  db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(newPassword,10),req.user.id);
  res.json({message:'Senha alterada'});
});
module.exports=router;
