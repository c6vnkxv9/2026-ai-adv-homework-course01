import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    include: ['tests/shipping.test.js'],
    hookTimeout: 10000,
  },
});
