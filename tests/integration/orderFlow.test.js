const { calculateShippingFee } = require('../../src/utils/shipping');
const { app, request, registerUser, resetDatabase, db } = require('../setup');

describe('Integration: order flow with shipping', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('登入→商品→加購→建單（含運費）並驗證 DB／庫存／清空購物車', async () => {
    const { token, user } = await registerUser();

    const productsRes = await request(app).get('/api/products?limit=100');
    expect(productsRes.status).toBe(200);
    expect(productsRes.body.error).toBeNull();
    expect(Array.isArray(productsRes.body.data.products)).toBe(true);

    const product = productsRes.body.data.products.find((p) => p.stock > 0 && p.price < 1500);
    expect(product).toBeTruthy();
    const stockBefore = product.stock;
    const quantity = 1;

    const cartRes = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity });
    expect(cartRes.status).toBe(200);
    expect(cartRes.body.error).toBeNull();

    const shippingMethod = 'home';
    const isRemoteArea = true;
    const isExpress = false;
    const subtotal = product.price * quantity;
    const expectedShippingFee = calculateShippingFee({
      subtotal,
      shippingMethod,
      isRemoteArea,
      isExpress,
    });
    const expectedTotal = subtotal + expectedShippingFee;

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '整合測試收件人',
        recipientEmail: 'integration@example.com',
        recipientAddress: '台北市信義區測試路 1 號',
        shippingMethod,
        isRemoteArea,
        isExpress,
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body).toMatchObject({
      error: null,
      message: '訂單建立成功',
    });
    expect(orderRes.body.data).toMatchObject({
      status: 'pending',
      shipping_method: shippingMethod,
      shipping_fee: expectedShippingFee,
      total_amount: expectedTotal,
      is_remote_area: true,
      is_express: false,
    });
    expect(orderRes.body.data.items).toHaveLength(1);
    expect(orderRes.body.data.items[0]).toMatchObject({
      product_name: product.name,
      product_price: product.price,
      quantity,
    });

    const orderId = orderRes.body.data.id;

    const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    expect(orderRow).toBeTruthy();
    expect(orderRow.user_id).toBe(user.id);
    expect(orderRow.total_amount).toBe(expectedTotal);
    expect(orderRow.shipping_fee).toBe(expectedShippingFee);
    expect(orderRow.shipping_method).toBe(shippingMethod);
    expect(orderRow.recipient_name).toBe('整合測試收件人');

    const itemRows = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    expect(itemRows).toHaveLength(1);
    expect(itemRows[0].product_id).toBe(product.id);
    expect(itemRows[0].quantity).toBe(quantity);

    const stockAfter = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock;
    expect(stockAfter).toBe(stockBefore - quantity);

    const cartCount = db
      .prepare('SELECT COUNT(*) as count FROM cart_items WHERE user_id = ?')
      .get(user.id).count;
    expect(cartCount).toBe(0);

    const cartApi = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${token}`);
    expect(cartApi.status).toBe(200);
    expect(cartApi.body.data.items).toHaveLength(0);
  });

  it('建單失敗（庫存不足）時不寫入訂單且不扣庫存', async () => {
    const { token, user } = await registerUser();
    const product = db.prepare('SELECT * FROM products WHERE stock > 0 LIMIT 1').get();
    const stockBefore = product.stock;

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });

    // 模擬庫存被其他流程耗盡
    db.prepare('UPDATE products SET stock = 0 WHERE id = ?').run(product.id);

    const ordersBefore = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    const itemsBefore = db.prepare('SELECT COUNT(*) as count FROM order_items').get().count;

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '失敗案例',
        recipientEmail: 'fail@example.com',
        recipientAddress: '台北市失敗路 1 號',
        shippingMethod: 'home',
      });

    expect(orderRes.status).toBe(400);
    expect(orderRes.body.error).toBe('STOCK_INSUFFICIENT');
    expect(orderRes.body.data).toBeNull();

    const ordersAfter = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    const itemsAfter = db.prepare('SELECT COUNT(*) as count FROM order_items').get().count;
    expect(ordersAfter).toBe(ordersBefore);
    expect(itemsAfter).toBe(itemsBefore);

    const stockAfter = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock;
    expect(stockAfter).toBe(0);

    const userOrders = db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_id = ?').get(user.id).count;
    expect(userOrders).toBe(0);

    // 購物車應仍保留（建單失敗不應清空）
    const cartCount = db
      .prepare('SELECT COUNT(*) as count FROM cart_items WHERE user_id = ?')
      .get(user.id).count;
    expect(cartCount).toBe(1);
  });

  it('建單失敗（無效配送方式）時不寫入訂單且不扣庫存', async () => {
    const { token, user } = await registerUser();
    const product = db.prepare('SELECT * FROM products WHERE stock > 0 LIMIT 1').get();
    const stockBefore = product.stock;

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '失敗案例',
        recipientEmail: 'fail2@example.com',
        recipientAddress: '台北市失敗路 2 號',
        shippingMethod: 'drone',
      });

    expect(orderRes.status).toBe(400);
    expect(orderRes.body.error).toBe('VALIDATION_ERROR');
    expect(orderRes.body.data).toBeNull();

    expect(db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_id = ?').get(user.id).count).toBe(0);
    expect(db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock).toBe(stockBefore);
  });

  it('超商取貨運費與總額正確', async () => {
    const { token } = await registerUser();
    const product = db.prepare('SELECT * FROM products WHERE stock > 0 AND price >= 1500 LIMIT 1').get();

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });

    const expectedShippingFee = calculateShippingFee({
      subtotal: product.price,
      shippingMethod: 'convenience',
    });

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '超商取貨',
        recipientEmail: 'cvs@example.com',
        recipientAddress: '全家便利商店測試店',
        shippingMethod: 'convenience',
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.data.shipping_fee).toBe(expectedShippingFee);
    expect(orderRes.body.data.shipping_fee).toBe(60);
    expect(orderRes.body.data.total_amount).toBe(product.price + 60);
  });
});
