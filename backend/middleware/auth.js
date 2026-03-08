require('dotenv').config();
const jwt=require('jsonwebtoken');
const {getDb}=require('../db');
const SECRET=process.env.JWT_SECRET||'change-me';
function authMiddleware(req,res,next){
  const h=req.headers.authorization;
  if(!h||!h.startsWith('Bearer '))return res.status(401).json({error:'Token não fornecido'});
  try{
    const p=jwt.verify(h.slice(7),SECRET);
    const u=getDb().prepare('SELECT * FROM users WHERE id=? AND active=1').get(p.userId);
    if(!u)return res.status(401).json({error:'Usuário não encontrado'});
    req.user=u; next();
  }catch(e){return res.status(401).json({error:'Token inválido ou expirado'});}
}
function adminMiddleware(req,res,next){authMiddleware(req,res,()=>{if(req.user.role!=='admin')return res.status(403).json({error:'Acesso negado'});next();})}
function signToken(id){return jwt.sign({userId:id},SECRET,{expiresIn:'7d'})}
module.exports={authMiddleware,adminMiddleware,signToken};
