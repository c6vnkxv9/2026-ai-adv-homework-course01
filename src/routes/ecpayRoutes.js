const express = require('express');
const db = require('../database');
const { verifyCheckMacValue } = require('../utils/ecpay');

const router = express.Router();

/**
 * @openapi
 * /api/ecpay/notify:
 *   post:
 *     summary: 綠界 AIO 付款結果通知（ReturnURL）
 *     description: 本機開發環境無法被綠界的 Server-to-Server 回呼觸達，此端點僅為建單必填欄位所需的最小 stub；若日後部署到可對外連線的主機且剛好收到通知，驗證通過才會嘗試更新訂單，但這不是付款結果確認的主流程（主流程見 POST /api/orders/{id}/ecpay/confirm）。
 *     tags: [ECPay]
 *     responses:
 *       200:
 *         description: 純文字 1|OK（依綠界規格，必須固定回應此字串否則會重試）
 */
router.post('/notify', (req, res) => {
  try {
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIv = process.env.ECPAY_HASH_IV;
    const params = req.body || {};

    if (hashKey && hashIv && params.MerchantTradeNo && verifyCheckMacValue(params, hashKey, hashIv)) {
      const order = db.prepare('SELECT * FROM orders WHERE ecpay_merchant_trade_no = ?').get(params.MerchantTradeNo);
      if (
        order &&
        order.status === 'pending' &&
        Number(params.TradeAmt) === order.total_amount &&
        params.RtnCode === '1'
      ) {
        db.prepare('UPDATE orders SET status = ?, ecpay_trade_no = ?, payment_method = ? WHERE id = ?')
          .run('paid', params.TradeNo || null, params.PaymentType || null, order.id);
      }
    }
  } catch (err) {
    // best-effort 備援路徑；正式確認一律走 /api/orders/:id/ecpay/confirm 的主動查詢
  }

  res.type('text').send('1|OK');
});

module.exports = router;
