const https = require('https');

let tokenStatus = { valid: null, checkedAt: null, errorMsg: null };
const CACHE_TTL_MS = 10 * 60 * 1000;

function checkMetaToken(accessToken) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'graph.facebook.com',
      path: '/v18.0/me?access_token=' + accessToken + '&fields=id,name',
      method: 'GET', timeout: 8000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            const isExpired = json.error.code === 190 || (json.error.message && json.error.message.toLowerCase().includes('expired'));
            resolve({ valid: false, errorMsg: isExpired ? 'Token Meta Ads expirado. Reconecte sua conta.' : 'Erro Meta: ' + json.error.message });
          } else {
            resolve({ valid: true, errorMsg: null });
          }
        } catch(e) { resolve({ valid: false, errorMsg: 'Erro ao verificar token Meta Ads.' }); }
      });
    });
    req.on('error', () => resolve({ valid: true, errorMsg: null }));
    req.on('timeout', () => { req.destroy(); resolve({ valid: true, errorMsg: null }); });
    req.end();
  });
}

async function metaTokenMiddleware(req, res, next) {
  const now = Date.now();
  if (tokenStatus.checkedAt === null || now - tokenStatus.checkedAt > CACHE_TTL_MS) {
    try {
      const Database = require('better-sqlite3');
      const db = new Database('/var/www/pulseads/backend/data/pulseads.db');
      const account = db.prepare('SELECT access_token FROM meta_accounts WHERE id = 6').get();
      db.close();
      if (account && account.access_token) {
        const result = await checkMetaToken(account.access_token);
        tokenStatus = { valid: result.valid, checkedAt: now, errorMsg: result.errorMsg };
      }
    } catch(e) { tokenStatus = { valid: true, checkedAt: now, errorMsg: null }; }
  }
  if (tokenStatus.valid === false) {
    res.setHeader('X-Meta-Token-Status', 'expired');
    res.setHeader('X-Meta-Token-Message', tokenStatus.errorMsg || 'Token invalido');
  } else {
    res.setHeader('X-Meta-Token-Status', 'ok');
  }
  next();
}

function tokenStatusRoute(req, res) {
  res.json({ valid: tokenStatus.valid, message: tokenStatus.errorMsg, checkedAt: tokenStatus.checkedAt });
}

module.exports = { metaTokenMiddleware, tokenStatusRoute };
