const { app, request, registerUser, resetDatabase } = require('./setup');

describe('Orders API', () => {
  let userToken;
  let productId;
  let orderId;

  beforeAll(async () => {
    resetDatabase();
    // Register a user for order tests
    const { token } = await registerUser();
    userToken = token;

    // Get a product with remaining stock
    const prodRes = await request(app).get('/api/products?limit=100');
    const product = prodRes.body.data.products.find((p) => p.stock > 0);
    if (!product) {
      throw new Error('沒有可用庫存的商品，無法執行訂單測試');
    }
    productId = product.id;

    // Add product to cart
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity: 1 });
  });

  it('should create an order from cart', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('total_amount');
    expect(res.body.data).toHaveProperty('shipping_fee');
    expect(res.body.data).toHaveProperty('shipping_method', 'home');
    expect(res.body.data).toHaveProperty('is_remote_area', false);
    expect(res.body.data).toHaveProperty('is_express', false);
    expect(res.body.data).toHaveProperty('status', 'pending');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.total_amount).toBe(
      res.body.data.items.reduce((sum, item) => sum + item.product_price * item.quantity, 0) +
        res.body.data.shipping_fee
    );

    orderId = res.body.data.id;
  });

  it('should fail to create order with empty cart', async () => {
    // The cart was already cleared by the previous order
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });

  it('should fail to create order without auth', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should get order list', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('orders');
    expect(Array.isArray(res.body.data.orders)).toBe(true);
    expect(res.body.data.orders.length).toBeGreaterThan(0);
  });

  it('should get order detail', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id', orderId);
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('should return 404 for non-existent order', async () => {
    const res = await request(app)
      .get('/api/orders/non-existent-order-id')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });
});
