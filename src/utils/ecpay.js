const crypto = require('crypto');

// UrlService::ecpayUrlEncode() .NET 字元還原表
const NET_REPLACEMENTS = [
  ['%2d', '-'], ['%5f', '_'], ['%2e', '.'],
  ['%21', '!'], ['%2a', '*'], ['%28', '('], ['%29', ')'],
];

function ecpayUrlEncode(source) {
  let encoded = encodeURIComponent(source)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27')
    .toLowerCase();
  for (const [from, to] of NET_REPLACEMENTS) {
    encoded = encoded.split(from).join(to);
  }
  return encoded;
}

function generateCheckMacValue(params, hashKey, hashIv) {
  const sorted = Object.entries(params)
    .filter(([key]) => key !== 'CheckMacValue')
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const paramStr = sorted.map(([key, value]) => `${key}=${value}`).join('&');
  const raw = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIv}`;
  const encoded = ecpayUrlEncode(raw);
  return crypto.createHash('sha256').update(encoded, 'utf8').digest('hex').toUpperCase();
}

// timing-safe 比較，避免 timing attack
function verifyCheckMacValue(params, hashKey, hashIv) {
  const received = String(params.CheckMacValue || '').toUpperCase();
  const calculated = generateCheckMacValue(params, hashKey, hashIv);
  const a = Buffer.from(received);
  const b = Buffer.from(calculated);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// MerchantTradeDate 必須是 UTC+8（台灣時區），格式 yyyy/MM/dd HH:mm:ss
function formatMerchantTradeDate(date = new Date()) {
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${taipei.getUTCFullYear()}/${pad(taipei.getUTCMonth() + 1)}/${pad(taipei.getUTCDate())} ${pad(taipei.getUTCHours())}:${pad(taipei.getUTCMinutes())}:${pad(taipei.getUTCSeconds())}`;
}

// MerchantTradeNo：僅允許英數字、最長 20 字元、永久唯一
function generateMerchantTradeNo(orderId) {
  const clean = String(orderId).replace(/[^a-zA-Z0-9]/g, '');
  const prefix = 'FL' + clean.slice(0, 10);
  const suffix = Date.now().toString(36);
  return (prefix + suffix).slice(0, 20);
}

function getEcpayBaseUrl() {
  return process.env.ECPAY_ENV === 'production'
    ? 'https://payment.ecpay.com.tw'
    : 'https://payment-stage.ecpay.com.tw';
}

module.exports = {
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  formatMerchantTradeDate,
  generateMerchantTradeNo,
  getEcpayBaseUrl,
};
