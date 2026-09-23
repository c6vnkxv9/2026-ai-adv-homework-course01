const { app, request, getAdminToken, registerUser, resetDatabase } = require('./setup');

describe('Admin Orders API', () => {
  let adminToken;
  let orderId;

  beforeAll(async () => {
    resetDatabase();
    adminToken = await getAdminToken();

    // Create an order: register user -> add to cart -> place order
    const { token } = await registerUser();
    const prodRes = await request(app).get('/api/products?limit=100');
    const product = prodRes.body.data.products.find((p) => p.stock > 0);
    if (!product) {
      throw new Error('沒有可用庫存的商品，無法執行後台訂單測試');
    }

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '管理員測試收件人',
        recipientEmail: 'admin-test@example.com',
        recipientAddress: '台北市管理員測試路 456 號',
        shippingMethod: 'home',
      });

    if (orderRes.status !== 201) {
      throw new Error(`建單失敗：${orderRes.status} ${JSON.stringify(orderRes.body)}`);
    }

    orderId = orderRes.body.data.id;
  });

  it('should get admin order list', async () => {
    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('orders');
    expect(res.body.data).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data.orders)).toBe(true);
    expect(res.body.data.orders.length).toBeGreaterThan(0);
  });

  it('should filter orders by status', async () => {
    const res = await request(app)
      .get('/api/admin/orders?status=pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('orders');
    for (const order of res.body.data.orders) {
      expect(order.status).toBe('pending');
    }
  });

  it('should get admin order detail', async () => {
    const res = await request(app)
      .get(`/api/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id', orderId);
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('user');
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('should deny access to regular user', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });
});
