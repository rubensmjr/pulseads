const express=require('express');
const fetch=require('node-fetch');
const {getDb}=require('../db');
const {authMiddleware}=require('../middleware/auth');
const {encrypt,decrypt}=require('../utils/crypto');
const router=express.Router();
const LIMITS={basic:1,pro:5,agency:-1};
router.get('/',authMiddleware,(req,res)=>{
  const accs=getDb().prepare('SELECT id,name,manager,account_id,color,currency,created_at FROM meta_accounts WHERE user_id=? AND active=1 ORDER BY created_at').all(req.user.id);
  res.json(accs);
});
router.post('/',authMiddleware,async(req,res)=>{
  const {name,manager,account_id,token,color}=req.body;
  if(!name||!account_id||!token)return res.status(400).json({error:'Nome, ID e token obrigatórios'});
  const db=getDb();
  const lim=LIMITS[req.user.plan]||1;
  if(lim!==-1){const c=db.prepare('SELECT COUNT(*) as c FROM meta_accounts WHERE user_id=? AND active=1').get(req.user.id);if(c.c>=lim)return res.status(403).json({error:`Plano ${req.user.plan} permite até ${lim} conta(s). Faça upgrade.`});}
  try{
    const accId=account_id.startsWith('act_')?account_id:'act_'+account_id;
    const r=await fetch(`https://graph.facebook.com/v19.0/${accId}?fields=name,account_status,currency&access_token=${token}`);
    const d=await r.json();
    if(d.error)return res.status(400).json({error:'Token inválido: '+d.error.message});
    const result=db.prepare('INSERT INTO meta_accounts (user_id,name,manager,account_id,token_encrypted,color,currency) VALUES (?,?,?,?,?,?,?)').run(req.user.id,name.trim(),manager||'',accId,encrypt(token),color||'#4f8ef7',d.currency||'USD');
    res.status(201).json({id:result.lastInsertRowid,name,manager,account_id:accId,color:color||'#4f8ef7',currency:d.currency||'USD'});
  }catch(e){res.status(500).json({error:'Erro ao verificar: '+e.message});}
});
router.delete('/:id',authMiddleware,(req,res)=>{
  const db=getDb();
  const acc=db.prepare('SELECT * FROM meta_accounts WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
  if(!acc)return res.status(404).json({error:'Conta não encontrada'});
  db.prepare('UPDATE meta_accounts SET active=0 WHERE id=?').run(req.params.id);
  res.json({message:'Removida'});
});
router.put('/:id',authMiddleware,(req,res)=>{
  const {name,manager,color}=req.body;
  const db=getDb();
  const acc=db.prepare('SELECT * FROM meta_accounts WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
  if(!acc)return res.status(404).json({error:'Conta não encontrada'});
  db.prepare('UPDATE meta_accounts SET name=?,manager=?,color=? WHERE id=?').run(name||acc.name,manager||acc.manager,color||acc.color,req.params.id);
  res.json({message:'Atualizada'});
});
module.exports=router;
