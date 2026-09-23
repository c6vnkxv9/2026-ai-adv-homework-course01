const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const {
  generateCheckMacValue,
  verifyCheckMacValue,
  formatMerchantTradeDate,
  generateMerchantTradeNo,
  getEcpayBaseUrl,
} = require('../utils/ecpay');
const {
  calculateShippingFee,
  isValidShippingMethod,
} = require('../utils/shipping');

const router = express.Router();

router.use(authMiddleware);

function generateOrderNo() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = uuidv4().slice(0, 5).toUpperCase();
  return `ORD-${dateStr}-${random}`;
}

/**
 * @openapi
 * /api/orders:
 *   post:
 *     summary: 從購物車建立訂單
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientName, recipientEmail, recipientAddress, shippingMethod]
 *             properties:
 *               recipientName:
 *                 type: string
 *               recipientEmail:
 *                 type: string
 *                 format: email
 *               recipientAddress:
 *                 type: string
 *               shippingMethod:
 *                 type: string
 *                 enum: [home, convenience]
 *                 description: 配送方式（home=宅配、convenience=超商取貨）
 *               isRemoteArea:
 *                 type: boolean
 *                 description: 是否偏遠地區（加收 200）
 *               isExpress:
 *                 type: boolean
 *                 description: 是否當日急件（加收 250）
 *     responses:
 *       201:
 *         description: 訂單建立成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     order_no:
 *                       type: string
 *                     total_amount:
 *                       type: integer
 *                     shipping_fee:
 *                       type: integer
 *                     shipping_method:
 *                       type: string
 *                     is_remote_area:
 *                       type: boolean
 *                     is_express:
 *                       type: boolean
 *                     status:
 *                       type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           product_name:
 *                             type: string
 *                           product_price:
 *                             type: integer
 *                           quantity:
 *                             type: integer
 *                     created_at:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 購物車為空或庫存不足或收件／配送資訊缺失
 */
router.post('/', (req, res) => {
  const {
    recipientName,
    recipientEmail,
    recipientAddress,
    shippingMethod,
    isRemoteArea = false,
    isExpress = false,
  } = req.body;
  const userId = req.user.userId;

  if (!recipientName || !recipientEmail || !recipientAddress) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: '收件人姓名、Email 和地址為必填欄位'
    });
  }

  if (!isValidShippingMethod(shippingMethod)) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: '配送方式須為 home（宅配）或 convenience（超商取貨）'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'Email 格式不正確'
    });
  }

  // Get cart items with product info
  const cartItems = db.prepare(
    `SELECT ci.id, ci.product_id, ci.quantity,
            p.name as product_name, p.price as product_price, p.stock as product_stock
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = ?`
  ).all(userId);

  if (cartItems.length === 0) {
    return res.status(400).json({
      data: null,
      error: 'CART_EMPTY',
      message: '購物車為空'
    });
  }

  // Check stock
  const insufficientItems = cartItems.filter(item => item.quantity > item.product_stock);
  if (insufficientItems.length > 0) {
    const names = insufficientItems.map(i => i.product_name).join(', ');
    return res.status(400).json({
      data: null,
      error: 'STOCK_INSUFFICIENT',
      message: `以下商品庫存不足：${names}`
    });
  }

  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.product_price * item.quantity, 0
  );
  const remoteFlag = Boolean(isRemoteArea);
  const expressFlag = Boolean(isExpress);
  const shippingFee = calculateShippingFee({
    subtotal,
    shippingMethod,
    isRemoteArea: remoteFlag,
    isExpress: expressFlag,
  });
  const totalAmount = subtotal + shippingFee;

  const orderId = uuidv4();
  const orderNo = generateOrderNo();

  // Transaction: create order, order items, deduct stock, clear cart
  const createOrder = db.transaction(() => {
    db.prepare(
      `INSERT INTO orders (
         id, order_no, user_id, recipient_name, recipient_email, recipient_address,
         total_amount, shipping_method, shipping_fee, is_remote_area, is_express
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      orderId,
      orderNo,
      userId,
      recipientName,
      recipientEmail,
      recipientAddress,
      totalAmount,
      shippingMethod,
      shippingFee,
      remoteFlag ? 1 : 0,
      expressFlag ? 1 : 0
    );

    const insertItem = db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const item of cartItems) {
      insertItem.run(uuidv4(), orderId, item.product_id, item.product_name, item.product_price, item.quantity);
      updateStock.run(item.quantity, item.product_id);
    }

    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
  });

  createOrder();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare(
    'SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?'
  ).all(orderId);

  res.status(201).json({
    data: {
      id: order.id,
      order_no: order.order_no,
      total_amount: order.total_amount,
      shipping_fee: order.shipping_fee,
      shipping_method: order.shipping_method,
      is_remote_area: Boolean(order.is_remote_area),
      is_express: Boolean(order.is_express),
      status: order.status,
      items: orderItems,
      created_at: order.created_at
    },
    error: null,
    message: '訂單建立成功'
  });
});

/**
 * @openapi
 * /api/orders:
 *   get:
 *     summary: 自己的訂單列表
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           order_no:
 *                             type: string
 *                           total_amount:
 *                             type: integer
 *                           status:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 */
router.get('/', (req, res) => {
  const orders = db.prepare(
    'SELECT id, order_no, total_amount, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.userId);

  res.json({
    data: { orders },
    error: null,
    message: '成功'
  });
});

/**
 * @openapi
 * /api/orders/{id}:
 *   get:
 *     summary: 訂單詳情
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     order_no:
 *                       type: string
 *                     recipient_name:
 *                       type: string
 *                     recipient_email:
 *                       type: string
 *                     recipient_address:
 *                       type: string
 *                     total_amount:
 *                       type: integer
 *                     status:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           product_id:
 *                             type: string
 *                           product_name:
 *                             type: string
 *                           product_price:
 *                             type: integer
 *                           quantity:
 *                             type: integer
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       404:
 *         description: 訂單不存在
 */
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);

  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

  res.json({
    data: { ...order, items },
    error: null,
    message: '成功'
  });
});

/**
 * @openapi
 * /api/orders/{id}/pay:
 *   patch:
 *     summary: 模擬付款（更新訂單付款狀態）
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [success, fail]
 *     responses:
 *       200:
 *         description: 付款狀態更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     order_no:
 *                       type: string
 *                     total_amount:
 *                       type: integer
 *                     status:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           product_name:
 *                             type: string
 *                           product_price:
 *                             type: integer
 *                           quantity:
 *                             type: integer
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: action 無效或訂單狀態不是 pending
 *       404:
 *         description: 訂單不存在
 */
router.patch('/:id/pay', (req, res) => {
  const { action } = req.body;
  const userId = req.user.userId;

  const actionMap = { success: 'paid', fail: 'failed' };
  if (!action || !actionMap[action]) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'action 必須為 success 或 fail'
    });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  if (order.status !== 'pending') {
    return res.status(400).json({
      data: null,
      error: 'INVALID_STATUS',
      message: '訂單狀態不是 pending，無法付款'
    });
  }

  const newStatus = actionMap[action];
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(newStatus, order.id);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

  res.json({
    data: { ...updated, items },
    error: null,
    message: action === 'success' ? '付款成功' : '付款失敗'
  });
});

/**
 * @openapi
 * /api/orders/{id}/ecpay/checkout:
 *   post:
 *     summary: 產生綠界 AIO 付款表單參數
 *     description: 回傳前端需自動送出（POST）到綠界付款頁的 action_url 與表單欄位；ChoosePayment=ALL（可選信用卡／網路 ATM 等）；只有 pending 訂單可呼叫。
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 *       400:
 *         description: 訂單狀態不是 pending
 *       404:
 *         description: 訂單不存在
 *       500:
 *         description: 綠界環境變數未設定
 */
router.post('/:id/ecpay/checkout', (req, res) => {
  const userId = req.user.userId;
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, userId);

  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  if (order.status !== 'pending') {
    return res.status(400).json({
      data: null,
      error: 'INVALID_STATUS',
      message: '訂單狀態不是 pending，無法建立付款'
    });
  }

  const merchantId = process.env.ECPAY_MERCHANT_ID;
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIv = process.env.ECPAY_HASH_IV;
  if (!merchantId || !hashKey || !hashIv) {
    return res.status(500).json({
      data: null,
      error: 'ECPAY_CONFIG_ERROR',
      message: '綠界金流設定未完成，請確認環境變數'
    });
  }

  const items = db.prepare('SELECT product_name, quantity FROM order_items WHERE order_id = ?').all(order.id);
  const itemName = items.map((item) => `${item.product_name}x${item.quantity}`).join('#').slice(0, 200);

  const merchantTradeNo = generateMerchantTradeNo(order.id);
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';

  const params = {
    MerchantID: merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: formatMerchantTradeDate(),
    PaymentType: 'aio',
    TotalAmount: order.total_amount,
    TradeDesc: '花卉商品訂單',
    ItemName: itemName,
    ReturnURL: `${baseUrl}/api/ecpay/notify`,
    ChoosePayment: 'ALL',
    EncryptType: 1,
    ClientBackURL: `${baseUrl}/orders/${order.id}`,
    OrderResultURL: `${baseUrl}/orders/${order.id}/ecpay-return`
  };
  params.CheckMacValue = generateCheckMacValue(params, hashKey, hashIv);

  db.prepare('UPDATE orders SET ecpay_merchant_trade_no = ? WHERE id = ?').run(merchantTradeNo, order.id);

  res.json({
    data: {
      action_url: `${getEcpayBaseUrl()}/Cashier/AioCheckOut/V5`,
      params
    },
    error: null,
    message: '已產生綠界付款參數，請導向付款頁面'
  });
});

/**
 * @openapi
 * /api/orders/{id}/ecpay/confirm:
 *   post:
 *     summary: 主動查詢綠界交易並確認付款結果
 *     description: 呼叫綠界 QueryTradeInfo/V5，驗證 CheckMacValue 與金額後才更新訂單狀態；本機環境不依賴 ReturnURL 回呼，此端點是付款結果確認的唯一依據。對已是最終狀態（paid/failed）的訂單直接回傳現況，不重複查詢。
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 查詢完成（可能是 paid／failed，或仍是 pending 待稍後再查）
 *       400:
 *         description: 尚未建立綠界付款交易
 *       404:
 *         description: 訂單不存在
 *       500:
 *         description: 綠界環境變數未設定
 *       502:
 *         description: 呼叫綠界失敗、CheckMacValue 驗證失敗，或回應與訂單不符
 */
router.post('/:id/ecpay/confirm', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, userId);

    if (!order) {
      return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
    }

    if (order.status !== 'pending') {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      return res.json({ data: { ...order, items }, error: null, message: '訂單已為最終狀態' });
    }

    if (!order.ecpay_merchant_trade_no) {
      return res.status(400).json({
        data: null,
        error: 'ECPAY_NOT_INITIATED',
        message: '尚未建立綠界付款交易，請先前往付款'
      });
    }

    const merchantId = process.env.ECPAY_MERCHANT_ID;
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIv = process.env.ECPAY_HASH_IV;
    if (!merchantId || !hashKey || !hashIv) {
      return res.status(500).json({
        data: null,
        error: 'ECPAY_CONFIG_ERROR',
        message: '綠界金流設定未完成，請確認環境變數'
      });
    }

    const queryParams = {
      MerchantID: merchantId,
      MerchantTradeNo: order.ecpay_merchant_trade_no,
      TimeStamp: Math.floor(Date.now() / 1000)
    };
    queryParams.CheckMacValue = generateCheckMacValue(queryParams, hashKey, hashIv);

    let responseParams;
    try {
      const ecpayRes = await fetch(`${getEcpayBaseUrl()}/Cashier/QueryTradeInfo/V5`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(queryParams).toString()
      });
      const text = await ecpayRes.text();
      responseParams = Object.fromEntries(new URLSearchParams(text));
    } catch (err) {
      return res.status(502).json({
        data: null,
        error: 'ECPAY_QUERY_FAILED',
        message: '查詢綠界交易失敗，請稍後再試'
      });
    }

    if (!responseParams.CheckMacValue || !verifyCheckMacValue(responseParams, hashKey, hashIv)) {
      return res.status(502).json({
        data: null,
        error: 'ECPAY_VERIFY_FAILED',
        message: '無法驗證綠界回應，請稍後再試'
      });
    }

    if (
      responseParams.MerchantTradeNo !== order.ecpay_merchant_trade_no ||
      Number(responseParams.TradeAmt) !== order.total_amount
    ) {
      return res.status(502).json({
        data: null,
        error: 'ECPAY_MISMATCH',
        message: '綠界交易資訊與訂單不符'
      });
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

    if (responseParams.TradeStatus === '1') {
      db.prepare('UPDATE orders SET status = ?, ecpay_trade_no = ?, payment_method = ? WHERE id = ?')
        .run('paid', responseParams.TradeNo || null, responseParams.PaymentType || null, order.id);
      const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
      return res.json({ data: { ...updated, items }, error: null, message: '付款成功' });
    }

    if (responseParams.TradeStatus === '0') {
      return res.json({
        data: { ...order, items },
        error: null,
        message: '尚未查到付款結果，請稍後再確認'
      });
    }

    db.prepare('UPDATE orders SET status = ?, ecpay_trade_no = ? WHERE id = ?')
      .run('failed', responseParams.TradeNo || null, order.id);
    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    return res.json({ data: { ...updated, items }, error: null, message: '付款失敗' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
