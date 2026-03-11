require('dotenv').config();
const {auditLog,auditLoginAttempt}=require('./middleware/audit');
const {sanitizeInputs}=require('./middleware/validate');
const {checkAllTokens}=require('./utils/tokenHealth');
const express=require('express');
const cors=require('cors');
const helmet=require('helmet');
const {apiLimiter,authLimiter,webhookLimiter,metaLimiter}=require('./middleware/rateLimiter');
const {metaTokenMiddleware,tokenStatusRoute}=require('./middleware/metaTokenCheck');
const path=require('path');
const db=require('./db');
const app=express();
app.set('trust proxy', 1);
const PORT=process.env.PORT||3000;
app.use(helmet({contentSecurityPolicy:false}));
app.use(cors({origin:process.env.ALLOWED_ORIGIN||'*',credentials:true}));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth',authLimiter);
app.use('/api/',apiLimiter);
app.use('/api/auth',require('./routes/auth'));
app.use('/api/accounts',require('./routes/accounts'));
app.use('/api/meta',metaLimiter);
app.use('/api/meta',metaTokenMiddleware);
app.get('/api/meta/token-status',tokenStatusRoute);
app.use('/api/meta',require('./routes/meta'));
app.use('/api/admin',require('./routes/admin'));
app.use('/api/webhook',webhookLimiter);
app.use('/api/webhook',require('./routes/webhooks'));
app.use('/api/push',require('./routes/push').router);
app.get('/api/health',(req,res)=>res.json({status:'ok'}));

// Rota única /dashboard — detecta mobile server-side
app.get('/dashboard', (req, res) => {
  const ua = req.headers['user-agent'] || '';
  const isMobile = /Mobile|Android|iPhone|iPad|Tablet|iPod/i.test(ua);
  res.sendFile(path.join(__dirname, '../frontend', isMobile ? 'dashboard-mobile.html' : 'dashboard.html'));
});

app.use(express.static(path.join(__dirname,'../frontend')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../frontend/index.html')));
db.init();
app.listen(PORT,()=>console.log(`\n⚡ Pulse Ads rodando na porta ${PORT}\n`));
