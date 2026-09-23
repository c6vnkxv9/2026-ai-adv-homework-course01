require('dotenv').config();

/**
 * 必須在任何 require('./app') / require('./database') 之前執行。
 * 將測試導向獨立 SQLite，絕不碰專案的 database.sqlite。
 */
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'vitest-integration-jwt-secret';

const testDbPath = path.join(__dirname, '..', 'database.test.sqlite');
process.env.DATABASE_PATH = testDbPath;

for (const suffix of ['', '-shm', '-wal']) {
  const file = testDbPath + suffix;
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
    } catch (_) {
      // ignore lock races
    }
  }
}
