import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    setupFiles: ['./tests/vitest.env.js'],
    include: [
      'tests/integration/**/*.test.js',
      'tests/auth.test.js',
      'tests/products.test.js',
      'tests/cart.test.js',
      'tests/orders.test.js',
      'tests/ecpayPayment.test.js',
      'tests/adminProducts.test.js',
      'tests/adminOrders.test.js',
    ],
    sequence: {
      files: [
        'tests/integration/orderFlow.test.js',
        'tests/auth.test.js',
        'tests/products.test.js',
        'tests/cart.test.js',
        'tests/orders.test.js',
        'tests/ecpayPayment.test.js',
        'tests/adminProducts.test.js',
        'tests/adminOrders.test.js',
      ],
    },
    hookTimeout: 10000,
  },
});
