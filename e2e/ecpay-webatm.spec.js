const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { getAdminCredentials } = require('./helpers/credentials');

/**
 * E2E：admin 登入 → 加購 → 結帳（含配送）→ 綠界網路 ATM（土地銀行）→ 已付款
 * 前置：本機 server 已在 baseURL（預設 http://localhost:3001）運行；勿由此檔啟動 server。
 * 帳密：.env ADMIN_EMAIL／ADMIN_PASSWORD
 */
test.describe('ECPay WebATM checkout', () => {
  test('網路 ATM 土地銀行付款成功並返回商店', async ({ page }) => {
    test.setTimeout(300_000);

    const { email, password } = getAdminCredentials();
    const artifactsDir = path.join(__dirname, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });

    // 1. 登入
    await page.goto('/login');
    await page.locator('input[placeholder="請輸入 Email"]').fill(email);
    await page.locator('input[placeholder="請輸入密碼"]').fill(password);
    await page.locator('form').getByRole('button', { name: '登入' }).click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });

    // 2. 選擇有庫存商品並加入購物車
    const product = await page.evaluate(async () => {
      const res = await fetch('/api/products?limit=100');
      const json = await res.json();
      return json.data.products.find((p) => p.stock > 0);
    });
    expect(product, '應至少有一個有庫存商品').toBeTruthy();

    await page.goto(`/products/${product.id}`);
    await page.getByRole('button', { name: '加入購物車' }).click();
    await expect(page.locator('#cart-badge')).toBeVisible({ timeout: 10_000 });

    // 3–5. 結帳並建立訂單（含配送）
    await page.goto('/cart');
    await page.getByRole('button', { name: '前往結帳' }).click();
    await page.waitForURL('**/checkout');

    await page.locator('input[placeholder="請輸入收件人姓名"]').fill('王小明');
    await page.locator('input[placeholder="請輸入 Email"]').fill(email);
    await page.locator('input[placeholder="請輸入收件地址"]').fill('台北市信義區信義路五段7號');
    await page.locator('input[type="radio"][value="home"]').check();
    await page.getByRole('button', { name: '確認送出訂單' }).click();
    await page.waitForURL(/\/orders\/[^/]+$/, { timeout: 30_000 });
    const orderUrl = page.url();
    const orderId = orderUrl.split('/orders/')[1].split(/[?#]/)[0];

    // 6. 前往綠界
    await page.getByRole('button', { name: '前往付款' }).click();
    await page.waitForURL(/payment-stage\.ecpay\.com\.tw/, { timeout: 60_000 });
    await dismissDialogs(page);

    // 7. 選擇「網路 ATM」
    await selectPaymentMethod(page, /網路\s*ATM|WebATM/i);

    // 8. 選擇「台灣土地銀行」
    await selectBank(page, /土地銀行|Land\s*Bank/i);

    // 9. 點擊「前往付款」
    await clickGoPay(page);
    await dismissDialogs(page);

    // 10. 關閉提示視窗（若有）
    await dismissDialogs(page);

    // 11. 土地銀行測試頁點 Save
    await clickLandBankSave(page);

    // 12. 等待綠界付款成功畫面
    await waitForEcpaySuccess(page);

    // 13. 返回商店
    await clickReturnToStore(page);
    await page.waitForURL(/localhost:\d+\/orders\//, { timeout: 60_000 });

    // 若仍待付款，點確認付款結果（ClientBackURL 不一定帶 payment=return）
    const confirmBtn = page.getByRole('button', { name: '確認付款結果' });
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(2000);
    }

    // 14–15. 驗證已付款 / paid
    await expect(page.getByText('已付款', { exact: true })).toBeVisible({ timeout: 60_000 });

    const status = await page.evaluate(async (id) => {
      const token = (typeof Auth !== 'undefined' && Auth.getToken)
        ? Auth.getToken()
        : localStorage.getItem('flower_token');
      const res = await fetch('/api/orders/' + id, {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      });
      const json = await res.json();
      return json?.data?.status;
    }, orderId);

    expect(status).toBe('paid');

    // 付款成功截圖
    const shotPath = path.join(artifactsDir, `webatm-paid-${Date.now()}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    expect(fs.existsSync(shotPath)).toBe(true);
  });
});

async function dismissDialogs(page) {
  for (let i = 0; i < 6; i++) {
    const closeBtn = page.getByRole('button', { name: /關閉|Close/i });
    if (await closeBtn.first().isVisible().catch(() => false)) {
      await closeBtn.first().click().catch(() => {});
      await page.waitForTimeout(400);
      continue;
    }
    break;
  }
}

async function selectPaymentMethod(page, nameRe) {
  await dismissDialogs(page);
  const candidates = [
    page.getByRole('link', { name: nameRe }),
    page.getByRole('button', { name: nameRe }),
    page.getByText(nameRe),
    page.locator('a, button, label, li, div').filter({ hasText: nameRe }),
  ];
  for (const loc of candidates) {
    const el = loc.first();
    if (await el.isVisible().catch(() => false)) {
      await el.click();
      await page.waitForTimeout(800);
      return;
    }
  }
  throw new Error('找不到「網路 ATM」付款方式');
}

async function selectBank(page, nameRe) {
  await dismissDialogs(page);
  const candidates = [
    page.getByRole('link', { name: nameRe }),
    page.getByRole('button', { name: nameRe }),
    page.getByText(nameRe),
    page.locator('a, button, label, li, div, img[alt]').filter({ hasText: nameRe }),
  ];
  for (const loc of candidates) {
    const el = loc.first();
    if (await el.isVisible().catch(() => false)) {
      await el.click();
      await page.waitForTimeout(800);
      return;
    }
  }
  // 土地銀行有時是圖片區塊
  const landImg = page.locator('img[alt*="土地"], img[src*="LAND"], img[src*="land"]').first();
  if (await landImg.isVisible().catch(() => false)) {
    await landImg.click();
    await page.waitForTimeout(800);
    return;
  }
  throw new Error('找不到「台灣土地銀行」');
}

async function clickGoPay(page) {
  const labels = [/前往付款/, /立即付款/, /確認付款/, /Submit/i];
  for (const re of labels) {
    const btn = page.getByRole('link', { name: re }).or(page.getByRole('button', { name: re }));
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      await page.waitForTimeout(1000);
      return;
    }
  }
  throw new Error('找不到「前往付款」按鈕');
}

async function clickLandBankSave(page) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await dismissDialogs(page);

    // 土地銀行測試頁常見 Save / 儲存 / 送出
    const save = page.getByRole('button', { name: /^Save$/i })
      .or(page.getByRole('link', { name: /^Save$/i })
        .or(page.locator('input[type="submit"][value="Save"], input[value="Save"], #Save, button:has-text("Save")')));

    if (await save.first().isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForNavigation({ timeout: 60_000 }).catch(() => null),
        save.first().click(),
      ]);
      await page.waitForTimeout(1500);
      return;
    }

    // iframe 內
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      const fSave = frame.getByRole('button', { name: /^Save$/i })
        .or(frame.locator('input[value="Save"], button:has-text("Save")'));
      if (await fSave.first().isVisible().catch(() => false)) {
        await fSave.first().click();
        await page.waitForTimeout(1500);
        return;
      }
    }

    await page.waitForTimeout(500);
  }
  throw new Error('土地銀行測試頁找不到 Save');
}

async function waitForEcpaySuccess(page) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (/localhost/.test(page.url())) return;
    const success = page.getByText(/付款成功|交易成功|成功|Success/i);
    if (await success.first().isVisible().catch(() => false)) return;
    const back = page.getByRole('link', { name: /返回商店|回商店|Back/i })
      .or(page.getByRole('button', { name: /返回商店|回商店/i }));
    if (await back.first().isVisible().catch(() => false)) return;
    await page.waitForTimeout(800);
  }
}

async function clickReturnToStore(page) {
  if (/localhost/.test(page.url())) return;
  const back = page.getByRole('link', { name: /返回商店|回商店|返回|Back to/i })
    .or(page.getByRole('button', { name: /返回商店|回商店|返回/i }));
  if (await back.first().isVisible().catch(() => false)) {
    await Promise.all([
      page.waitForURL(/localhost/, { timeout: 60_000 }).catch(() => null),
      back.first().click(),
    ]);
    return;
  }
  // 後援：ClientBackURL 可能自動導回
  await page.waitForURL(/localhost/, { timeout: 30_000 }).catch(() => {});
}
