const HOME_BASE_FEE = 120;
const CONVENIENCE_FEE = 60;
const FREE_SHIPPING_THRESHOLD = 1500;
const REMOTE_AREA_SURCHARGE = 200;
const EXPRESS_SURCHARGE = 250;

const SHIPPING_METHODS = Object.freeze({
  HOME: 'home',
  CONVENIENCE: 'convenience',
});

function isValidShippingMethod(method) {
  return method === SHIPPING_METHODS.HOME || method === SHIPPING_METHODS.CONVENIENCE;
}

/**
 * 計算運費。
 * 宅配 120 為基本運費（滿額可免）；超商取貨 60 非基本運費（滿額仍收）。
 * 偏遠／急件為附加費，與免運獨立累加。
 *
 * @param {object} options
 * @param {number} options.subtotal 商品小計
 * @param {string} options.shippingMethod 'home' | 'convenience'
 * @param {boolean} [options.isRemoteArea=false]
 * @param {boolean} [options.isExpress=false]
 * @returns {number}
 */
function calculateShippingFee({
  subtotal,
  shippingMethod,
  isRemoteArea = false,
  isExpress = false,
}) {
  if (typeof subtotal !== 'number' || !Number.isFinite(subtotal) || subtotal < 0) {
    throw new Error('INVALID_SUBTOTAL');
  }
  if (!isValidShippingMethod(shippingMethod)) {
    throw new Error('INVALID_SHIPPING_METHOD');
  }

  let fee = 0;

  if (shippingMethod === SHIPPING_METHODS.HOME) {
    if (subtotal < FREE_SHIPPING_THRESHOLD) {
      fee += HOME_BASE_FEE;
    }
  } else {
    fee += CONVENIENCE_FEE;
  }

  if (isRemoteArea) {
    fee += REMOTE_AREA_SURCHARGE;
  }
  if (isExpress) {
    fee += EXPRESS_SURCHARGE;
  }

  return fee;
}

module.exports = {
  HOME_BASE_FEE,
  CONVENIENCE_FEE,
  FREE_SHIPPING_THRESHOLD,
  REMOTE_AREA_SURCHARGE,
  EXPRESS_SURCHARGE,
  SHIPPING_METHODS,
  isValidShippingMethod,
  calculateShippingFee,
};
