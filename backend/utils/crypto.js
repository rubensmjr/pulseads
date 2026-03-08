require('dotenv').config();
const CryptoJS=require('crypto-js');
const KEY=process.env.ENCRYPTION_KEY||'pulseads-key-change-in-prod-32ch';
function encrypt(t){return CryptoJS.AES.encrypt(t,KEY).toString()}
function decrypt(c){return CryptoJS.AES.decrypt(c,KEY).toString(CryptoJS.enc.Utf8)}
module.exports={encrypt,decrypt};
