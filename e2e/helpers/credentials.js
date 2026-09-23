/**
 * E2E 登入帳密：與 server seed 相同來源（`.env` ADMIN_*）。
 * 請在 playwright config 頂部 `require('dotenv').config()`。
 */
function getAdminCredentials() {
  const email = process.env.ADMIN_EMAIL || 'admin@hexschool.com';
  const password = process.env.ADMIN_PASSWORD || '12345678';
  if (!email || !password) {
    throw new Error('缺少 ADMIN_EMAIL 或 ADMIN_PASSWORD（請設於 .env）');
  }
  return { email, password };
}

module.exports = { getAdminCredentials };
