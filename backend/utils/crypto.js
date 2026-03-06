const CryptoJS = require('crypto-js');

const KEY = process.env.ENCRYPTION_KEY || 'pulseads-enc-key-change-in-prod-32chars!!';

function encrypt(text) {
  return CryptoJS.AES.encrypt(text, KEY).toString();
}

function decrypt(ciphertext) {
  const bytes = CryptoJS.AES.decrypt(ciphertext, KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

module.exports = { encrypt, decrypt };
