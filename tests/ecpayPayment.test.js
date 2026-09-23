const { app, request, registerUser, resetDatabase } = require('./setup');
const { generateCheckMacValue } = require('../src/utils/ecpay');

const HASH_KEY = process.env.ECPAY_HASH_KEY;
const HASH_IV = process.env.ECPAY_HASH_IV;

async function createPendingOrder(token) {
  const prodRes = await request(app).get('/api/products?limit=100');
  const product = prodRes.body.data.products.find((p) => p.stock > 0);
  if (!product) {
    throw new Error('沒有可用庫存的商品，無法建立測試訂單');
  }

  await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId: product.id, quantity: 1 });

  const orderRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      recipientName: '測試收件人',
      recipientEmail: 'recipient@example.com',
      recipientAddress: '台北市測試路 123 號',
      shippingMethod: 'home',
    });

  if (orderRes.status !== 201) {
    throw new Error(`建單失敗：${orderRes.status} ${JSON.stringify(orderRes.body)}`);
  }

  return orderRes.body.data;
}

function mockEcpayQueryResponse(overrides = {}) {
  const original = global.fetch;
  global.fetch = async () => {
    const params = {
      MerchantID: process.env.ECPAY_MERCHANT_ID,
      MerchantTradeNo: overrides.MerchantTradeNo,
      TradeNo: overrides.TradeNo || '2026092200000001',
      TradeAmt: overrides.TradeAmt,
      PaymentType: overrides.PaymentType || 'Credit_CreditCard',
      TradeStatus: overrides.TradeStatus,
      ...overrides.extra,
    };
    if (overrides.badCheckMacValue) {
      params.CheckMacValue = 'INVALID0000000000000000000000000000000000000000000000000000';
    } else {
      params.CheckMacValue = generateCheckMacValue(params, HASH_KEY, HASH_IV);
    }
    return { text: async () => new URLSearchParams(params).toString() };
  };
  return () => {
    global.fetch = original;
  };
}

describe('ECPay Payment API', () => {
  let userToken;

  beforeAll(async () => {
    resetDatabase();
    const { token } = await registerUser();
    userToken = token;
  });

  it('should create AIO checkout params for a pending order', async () => {
    const order = await createPendingOrder(userToken);

    const res = await request(app)
      .post(`/api/orders/${order.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('action_url');
    expect(res.body.data.action_url).toContain('/Cashier/AioCheckOut/V5');
    expect(res.body.data.params).toHaveProperty('MerchantTradeNo');
    expect(res.body.data.params).toHaveProperty('CheckMacValue');
    expect(res.body.data.params.TotalAmount).toBe(order.total_amount);
    expect(res.body.data.params.ChoosePayment).toBe('ALL');
  });

  it('should fail to checkout without auth', async () => {
    const order = await createPendingOrder(userToken);

    const res = await request(app).post(`/api/orders/${order.id}/ecpay/checkout`);

    expect(res.status).toBe(401);
  });

  it('should fail to confirm before checkout is initiated', async () => {
    const order = await createPendingOrder(userToken);

    const res = await request(app)
      .post(`/api/orders/${order.id}/ecpay/confirm`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body.error).toBe('ECPAY_NOT_INITIATED');
  });

  it('should mark order as paid when TradeStatus=1 and CheckMacValue is valid', async () => {
    const order = await createPendingOrder(userToken);
    const checkoutRes = await request(app)
      .post(`/api/orders/${order.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${userToken}`);
    const merchantTradeNo = checkoutRes.body.data.params.MerchantTradeNo;

    const restoreFetch = mockEcpayQueryResponse({
      MerchantTradeNo: merchantTradeNo,
      TradeAmt: order.total_amount,
      TradeStatus: '1',
    });

    try {
      const res = await request(app)
        .post(`/api/orders/${order.id}/ecpay/confirm`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('error', null);
      expect(res.body.data.status).toBe('paid');
      expect(res.body.data.payment_method).toBe('Credit_CreditCard');
    } finally {
      restoreFetch();
    }

    // Idempotent: confirming again should not need to call ECPay and should keep the same status
    const secondRes = await request(app)
      .post(`/api/orders/${order.id}/ecpay/confirm`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.status).toBe('paid');
  });

  it('should stay pending when TradeStatus=0 (not yet paid)', async () => {
    const order = await createPendingOrder(userToken);
    const checkoutRes = await request(app)
      .post(`/api/orders/${order.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${userToken}`);
    const merchantTradeNo = checkoutRes.body.data.params.MerchantTradeNo;

    const restoreFetch = mockEcpayQueryResponse({
      MerchantTradeNo: merchantTradeNo,
      TradeAmt: order.total_amount,
      TradeStatus: '0',
    });

    try {
      const res = await request(app)
        .post(`/api/orders/${order.id}/ecpay/confirm`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending');
    } finally {
      restoreFetch();
    }
  });

  it('should mark order as failed for other TradeStatus values', async () => {
    const order = await createPendingOrder(userToken);
    const checkoutRes = await request(app)
      .post(`/api/orders/${order.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${userToken}`);
    const merchantTradeNo = checkoutRes.body.data.params.MerchantTradeNo;

    const restoreFetch = mockEcpayQueryResponse({
      MerchantTradeNo: merchantTradeNo,
      TradeAmt: order.total_amount,
      TradeStatus: '10200095',
    });

    try {
      const res = await request(app)
        .post(`/api/orders/${order.id}/ecpay/confirm`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('failed');
    } finally {
      restoreFetch();
    }
  });

  it('should reject confirm when CheckMacValue verification fails', async () => {
    const order = await createPendingOrder(userToken);
    const checkoutRes = await request(app)
      .post(`/api/orders/${order.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${userToken}`);
    const merchantTradeNo = checkoutRes.body.data.params.MerchantTradeNo;

    const restoreFetch = mockEcpayQueryResponse({
      MerchantTradeNo: merchantTradeNo,
      TradeAmt: order.total_amount,
      TradeStatus: '1',
      badCheckMacValue: true,
    });

    try {
      const res = await request(app)
        .post(`/api/orders/${order.id}/ecpay/confirm`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('ECPAY_VERIFY_FAILED');
    } finally {
      restoreFetch();
    }

    const orderCheck = await request(app)
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(orderCheck.body.data.status).toBe('pending');
  });

  it('should reject confirm when TradeAmt does not match order total', async () => {
    const order = await createPendingOrder(userToken);
    const checkoutRes = await request(app)
      .post(`/api/orders/${order.id}/ecpay/checkout`)
      .set('Authorization', `Bearer ${userToken}`);
    const merchantTradeNo = checkoutRes.body.data.params.MerchantTradeNo;

    const restoreFetch = mockEcpayQueryResponse({
      MerchantTradeNo: merchantTradeNo,
      TradeAmt: order.total_amount + 1,
      TradeStatus: '1',
    });

    try {
      const res = await request(app)
        .post(`/api/orders/${order.id}/ecpay/confirm`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('ECPAY_MISMATCH');
    } finally {
      restoreFetch();
    }
  });

  it('should return 404 confirming another user order', async () => {
    const order = await createPendingOrder(userToken);
    const { token: otherToken } = await registerUser();

    const res = await request(app)
      .post(`/api/orders/${order.id}/ecpay/confirm`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });

  it('should always respond 1|OK on the notify stub', async () => {
    const res = await request(app)
      .post('/api/ecpay/notify')
      .type('form')
      .send({ MerchantTradeNo: 'nonexistent', RtnCode: '1', CheckMacValue: 'whatever' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('1|OK');
  });
});
