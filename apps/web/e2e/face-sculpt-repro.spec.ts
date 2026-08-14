import { test, expect, type ConsoleMessage } from '@playwright/test';

test.describe('FACE 定妆出图复现', () => {
  test('新建角色 → 打开捏模台 → 定妆出图', async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let uploadStatus = 'not-called';

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('response', (res) => {
      if (res.url().includes('/api/assets/upload')) {
        uploadStatus = `${res.status()} ${res.url()}`;
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /新建|New/i }).first().click();
    await page.getByRole('button', { name: /创建并开始制作/i }).click();
    await page.waitForTimeout(1200);
    const canvasBtn = page.getByRole('button', { name: /前往画布/i });
    if (await canvasBtn.isVisible().catch(() => false)) {
      await canvasBtn.click();
    }
    await page.waitForTimeout(1500);

    const assetBtn = page.getByRole('button', { name: /素材|素材库/i }).first();
    await assetBtn.click();
    await expect(page.getByRole('dialog', { name: '素材库' })).toBeVisible();

    await page.getByRole('button', { name: /新建角色/i }).click();
    await expect(page.getByRole('button', { name: /打开捏模台/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /打开捏模台/i }).click();
    await expect(page.getByRole('dialog', { name: '捏模台' })).toBeVisible({ timeout: 10_000 });

    // 不再等待固定时长：立即点定妆，验证视口就绪闸门（按钮须先等 Scene 报告兼容性）。
    const uploadPromise = page.waitForResponse(
      (res) => res.url().includes('/api/assets/upload') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /定妆出图/i }).click();

    const uploadRes = await uploadPromise;
    expect(uploadRes.status()).toBeGreaterThanOrEqual(200);
    expect(uploadRes.status()).toBeLessThan(300);

    await expect(page.getByText('定妆已锁')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('img', { name: '角色定妆' })).toBeVisible();
    const imgSrc = await page.getByRole('img', { name: '角色定妆' }).getAttribute('src');
    expect(imgSrc).toMatch(/\/uploads\//);

    const exportBtn = page.getByRole('button', { name: /导出中…|定妆出图/i });
    await expect(exportBtn).toBeEnabled({ timeout: 20_000 });
    await expect(page.locator('text=/定妆截图生成失败|上传失败/')).toHaveCount(0);

    await page.screenshot({ path: 'C:\\Users\\User\\AppData\\Local\\Temp\\nx9-face-sculpt-result.png', fullPage: false });

    console.log('UPLOAD_STATUS:', uploadStatus);
    console.log('IMG_SRC:', imgSrc);
    console.log('CONSOLE_ERRORS:', JSON.stringify(consoleErrors));
    console.log('PAGE_ERRORS:', JSON.stringify(pageErrors));

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
