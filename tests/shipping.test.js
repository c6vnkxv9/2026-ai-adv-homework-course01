const {
  calculateShippingFee,
  HOME_BASE_FEE,
  CONVENIENCE_FEE,
  REMOTE_AREA_SURCHARGE,
  EXPRESS_SURCHARGE,
  SHIPPING_METHODS,
} = require('../src/utils/shipping');

describe('Shipping module', () => {
  it('should charge home delivery base fee', () => {
    expect(
      calculateShippingFee({
        subtotal: 1000,
        shippingMethod: SHIPPING_METHODS.HOME,
      })
    ).toBe(HOME_BASE_FEE);
  });

  it('should charge convenience store pickup fee', () => {
    expect(
      calculateShippingFee({
        subtotal: 1000,
        shippingMethod: SHIPPING_METHODS.CONVENIENCE,
      })
    ).toBe(CONVENIENCE_FEE);
  });

  it('should still charge home base fee when subtotal is 1499', () => {
    expect(
      calculateShippingFee({
        subtotal: 1499,
        shippingMethod: SHIPPING_METHODS.HOME,
      })
    ).toBe(HOME_BASE_FEE);
  });

  it('should waive home base fee when subtotal is 1500', () => {
    expect(
      calculateShippingFee({
        subtotal: 1500,
        shippingMethod: SHIPPING_METHODS.HOME,
      })
    ).toBe(0);
  });

  it('should add remote area surcharge', () => {
    expect(
      calculateShippingFee({
        subtotal: 1000,
        shippingMethod: SHIPPING_METHODS.HOME,
        isRemoteArea: true,
      })
    ).toBe(HOME_BASE_FEE + REMOTE_AREA_SURCHARGE);
  });

  it('should add same-day express surcharge', () => {
    expect(
      calculateShippingFee({
        subtotal: 1000,
        shippingMethod: SHIPPING_METHODS.HOME,
        isExpress: true,
      })
    ).toBe(HOME_BASE_FEE + EXPRESS_SURCHARGE);
  });

  it('should stack remote and express surcharges', () => {
    expect(
      calculateShippingFee({
        subtotal: 1000,
        shippingMethod: SHIPPING_METHODS.HOME,
        isRemoteArea: true,
        isExpress: true,
      })
    ).toBe(HOME_BASE_FEE + REMOTE_AREA_SURCHARGE + EXPRESS_SURCHARGE);
  });

  it('should keep surcharges when free shipping threshold is met', () => {
    expect(
      calculateShippingFee({
        subtotal: 1500,
        shippingMethod: SHIPPING_METHODS.HOME,
        isRemoteArea: true,
        isExpress: true,
      })
    ).toBe(REMOTE_AREA_SURCHARGE + EXPRESS_SURCHARGE);
  });

  it('should not waive convenience fee when subtotal meets free-shipping threshold', () => {
    expect(
      calculateShippingFee({
        subtotal: 1500,
        shippingMethod: SHIPPING_METHODS.CONVENIENCE,
      })
    ).toBe(CONVENIENCE_FEE);
  });
});
