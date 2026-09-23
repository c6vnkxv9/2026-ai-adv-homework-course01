const request = require('supertest');
const app = require('../app');
const db = require('../src/database');

/**
 * Login with the seed admin account and return the JWT token.
 */
async function getAdminToken() {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@hexschool.com', password: '12345678' });
  return res.body.data.token;
}

/**
 * Register a new user and return { token, user }.
 */
async function registerUser(overrides = {}) {
  const email = overrides.email || `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email,
      password: overrides.password || 'password123',
      name: overrides.name || '測試使用者',
    });
  if (res.status !== 201 || !res.body?.data?.token) {
    throw new Error(`註冊失敗：${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.data.token, user: res.body.data.user };
}

/** 清空測試 DB 並重新 seed（僅 NODE_ENV=test）。 */
function resetDatabase() {
  db.resetDatabaseForTests();
}

module.exports = { app, request, getAdminToken, registerUser, resetDatabase, db };
