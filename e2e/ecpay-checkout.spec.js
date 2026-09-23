const { test, expect } = require('@playwright/test');
const { getAdminCredentials } = require('./helpers/credentials');

/**
 * E2E：登入 → 加購 → 結帳 → 綠界 AIO 測試信用卡 → 訂單已付款
 * 測試卡來源：ECPay skill AGENTS.md（4311-9522-2222-2222 / 3DS 1234）
 * 前置：本機 server 已在 baseURL（預設 http://localhost:3001）運行，且 .env 已設 ECPAY_* staging。
 * 帳密：.env ADMIN_EMAIL／ADMIN_PASSWORD
 */
test.describe('ECPay AIO checkout', () => {
  test('加購後用測試卡完成刷卡並結帳成功', async ({ page }) => {
    test.setTimeout(240_000);

    const { email, password } = getAdminCredentials();

    await page.goto('/login');
    await page.locator('input[placeholder="請輸入 Email"]').fill(email);
    await page.locator('input[placeholder="請輸入密碼"]').fill(password);
    await page.locator('form').getByRole('button', { name: '登入' }).click();
    await page.waitForURL((url) => !url.pathname.includes('/login'));

    const product = await page.evaluate(async () => {
      const res = await fetch('/api/products?limit=20');
      const json = await res.json();
      return json.data.products.find((p) => p.stock > 0);
    });
    expect(product, '應至少有一個有庫存商品').toBeTruthy();

    await page.goto(`/products/${product.id}`);
    await page.getByRole('button', { name: '加入購物車' }).click();
    await expect(page.locator('#cart-badge')).toBeVisible();

    await page.goto('/cart');
    await page.getByRole('button', { name: '前往結帳' }).click();
    await page.waitForURL('**/checkout');

    await page.locator('input[placeholder="請輸入收件人姓名"]').fill('王小明');
    await page.locator('input[placeholder="請輸入 Email"]').fill(email);
    await page.locator('input[placeholder="請輸入收件地址"]').fill('台北市信義區信義路五段7號');
    await page.getByRole('button', { name: '確認送出訂單' }).click();
    await page.waitForURL(/\/orders\/[^/]+$/);

    await page.getByRole('button', { name: '前往付款' }).click();
    await page.waitForURL(/payment-stage\.ecpay\.com\.tw/, { timeout: 60_000 });
    await page.locator('#CCpart1').waitFor({ state: 'visible', timeout: 30_000 });

    await dismissEcpayDialogs(page);

    async function typeInto(sel, value) {
      const el = page.locator(sel);
      await el.click();
      await el.fill('');
      await el.pressSequentially(value, { delay: 15 });
      await el.blur();
    }

    await typeInto('#CCpart1', '4311');
    await typeInto('#CCpart2', '9522');
    await typeInto('#CCpart3', '2222');
    await typeInto('#CCpart4', '2222');
    await typeInto('#creditMM', '12');
    await typeInto('#creditYY', '30');
    await typeInto('#CreditBackThree', '222');
    await page.locator('#CCHolderTemp').fill('WANG XIAO MING');
    await page.locator('#CCHolderTemp').blur();
    await page.locator('#CellPhoneCheck').fill('0912345678');
    await page.locator('#CellPhoneCheck').blur();
    await page.locator('#EmailTemp').fill(email);
    await page.locator('#EmailTemp').blur();
    await page.locator('input[placeholder="南港區成功路一段58號5樓"]').fill('南港區成功路一段58號5樓');
    await page.locator('input[placeholder="南港區成功路一段58號5樓"]').blur();
    await page.evaluate(() => {
      const visible = document.querySelector('input[placeholder="南港區成功路一段58號5樓"]');
      const hidden = document.querySelector('input[name="Address"][type="hidden"]');
      if (visible && hidden) hidden.value = visible.value;
    });

    // 送出：可能先跳 staging 警告（關閉），再跳金額確認（確定）
    await page.getByRole('link', { name: '立即付款' }).click();
    await handlePayConfirmFlow(page);

    await complete3dsIfPresent(page);

    await page.waitForURL(/localhost:\d+\/orders\//, { timeout: 120_000 });

    // 綠界 staging 對信用卡交易的入帳可能落後導回頁面數秒，
    // 落地頁自動查詢時可能還查到 TradeStatus=0（尚未入帳）。
    // 此時需比照真實使用者重試「確認付款結果」，直到查到已入帳。
    await expect(async () => {
      const retryBtn = page.getByRole('button', { name: '確認付款結果' });
      if (await retryBtn.isVisible().catch(() => false)) {
        await retryBtn.click();
      }
      await expect(page.getByText('付款成功！感謝您的購買。')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000, intervals: [3_000] });

    await expect(page.getByText('已付款', { exact: true })).toBeVisible();
  });
});

async function dismissEcpayDialogs(page) {
  for (let i = 0; i < 5; i++) {
    const closeBtn = page.getByRole('button', { name: '關閉' });
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(400);
      continue;
    }
    break;
  }
}

async function handlePayConfirmFlow(page) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (/localhost/.test(page.url())) return;
    if (!/AioCheckOut|payment-stage/.test(page.url()) && !/ecpay\.com\.tw/.test(page.url())) return;

    const closeBtn = page.getByRole('button', { name: '關閉' });
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(400);
      // 關掉 staging 警告後再點一次立即付款
      const pay = page.getByRole('link', { name: '立即付款' });
      if (await pay.isVisible().catch(() => false)) {
        await pay.click();
        await page.waitForTimeout(500);
      }
      continue;
    }

    const confirmBtn = page.getByRole('button', { name: '確定' });
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(1000);
      return;
    }

    await page.waitForTimeout(400);
  }
}

async function complete3dsIfPresent(page) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (/localhost/.test(page.url())) return;

    await dismissEcpayDialogs(page);

    const confirmBtn = page.getByRole('button', { name: '確定' });
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(800);
    }

    // 綠界模擬 3DS 第一步：取得 OTP（不要點「重新取得…」）
    const getOtp = page.getByRole('button', { name: /^取得OTP服務密碼/ })
      .or(page.getByRole('link', { name: /^取得OTP服務密碼/ }));
    if (await getOtp.first().isVisible().catch(() => false)) {
      await getOtp.first().click();
      await page.waitForTimeout(1000);
    }

    // OTP 輸入後送出（綠界用 <a> 不是 button）
    const otpInput = page.getByRole('textbox', { name: /OTP|password|驗證碼/i })
      .or(page.locator('input[name="OTP"], #OTP, input[placeholder*="OTP" i]'));
    if (await otpInput.first().isVisible().catch(() => false)) {
      await otpInput.first().fill('1234');
      const submit = page.getByRole('link', { name: /^送出/ })
        .or(page.getByRole('button', { name: /^送出/ }));
      if (await submit.first().isVisible().catch(() => false)) {
        await Promise.all([
          page.waitForURL(/localhost|OrderResult|ecpay-return|PaymentResult|CreditDetail/i, { timeout: 60_000 }).catch(() => null),
          submit.first().click(),
        ]);
        await page.waitForTimeout(1500);
        if (/localhost/.test(page.url())) return;
      }
    }

    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      const getOtpInFrame = frame.getByRole('button', { name: /^取得OTP服務密碼/ });
      if (await getOtpInFrame.first().isVisible().catch(() => false)) {
        await getOtpInFrame.first().click();
        await page.waitForTimeout(800);
      }
      const otp = frame.getByRole('textbox', { name: /OTP|password|驗證碼/i })
        .or(frame.locator('input[name="OTP"], #OTP, input[type="password"], input[type="tel"]'))
        .first();
      if (await otp.isVisible().catch(() => false)) {
        await otp.fill('1234');
        const btn = frame.getByRole('link', { name: /^送出/ })
          .or(frame.getByRole('button', { name: /^送出/ }));
        if (await btn.first().isVisible().catch(() => false)) {
          await btn.first().click();
          await page.waitForTimeout(1500);
        }
      }
    }

    await page.waitForTimeout(1000);
  }
}
