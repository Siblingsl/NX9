import { test, expect, type ConsoleMessage } from '@playwright/test';

async function createCanvasProject(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /新建|New/i }).first().click();
  await page.getByRole('button', { name: /创建并开始制作/i }).click();
  await page.getByRole('button', { name: /前往画布/i }).click();
  await expect(page.getByRole('button', { name: '打开编剧台' }).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '打开编剧台' }).first().click();
  await expect(page.getByLabel('共创指令')).toBeVisible({ timeout: 15_000 });
}

async function mockChatStream(page: import('@playwright/test').Page) {
  let call = 0;
  await page.route('**/api/agent/script-desk/chat-stream', async (route) => {
    call += 1;
    if (call === 2) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({ error: '429 rate limit' })}\n\n`,
      });
      return;
    }
    const longText = '浏览器自检选题建议：都市成长。'.repeat(40);
    const payload = JSON.stringify({ patch: { brief: { title: '都市成长' } }, explanation: longText });
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ text: payload })}\n\ndata: ${JSON.stringify({ done: true })}\n\n`,
    });
  });
}

test.describe('A12 编剧对话区 UI 自检', () => {
  for (const viewport of [
    { width: 1920, height: 1080, label: '1920x1080' },
    { width: 1280, height: 720, label: '1280x720' },
  ]) {
    test(`${viewport.label} 搜索/折叠/定位待应用/错误提示`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(String(err)));
      page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) {
          pageErrors.push(`console: ${msg.text()}`);
        }
      });
      page.on('requestfailed', (req) => {
        const url = req.url();
        if (url.includes('localhost') || url.startsWith('/')) {
          pageErrors.push(`requestfailed: ${url} ${req.failure()?.errorText ?? ''}`);
        }
      });

      await mockChatStream(page);
      await createCanvasProject(page);

      await page.getByRole('tab', { name: '选题' }).click();
      await page.getByLabel('共创指令').fill('测试选题：都市成长');
      await page.getByRole('button', { name: '发送请求' }).click();

      await expect(page.getByRole('button', { name: '定位待应用' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/都市成长/).first()).toBeVisible();

      await page.getByRole('button', { name: '定位待应用' }).click();

      await page.getByRole('button', { name: '丢弃' }).click();
      await page.getByLabel('共创指令').fill('另一条：星空');
      await page.getByRole('button', { name: '发送请求' }).click();
      await expect(page.getByText(/429 rate limit/).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('稍后再试，或到设置换模型/通道')).toBeVisible();

      await page.getByLabel('搜索对话').fill('星空');
      await expect(page.getByText('另一条：星空')).toBeVisible();
      await expect(page.getByText(/都市成长/)).toHaveCount(0);

      await page.getByLabel('搜索对话').fill('');
      await expect(page.locator('.sd2-msg__collapse').first()).toBeVisible();
      await page.locator('.sd2-msg__collapse').first().click();
      await expect(page.locator('.sd2-msg.is-collapsed').first()).toBeVisible();

      await page.screenshot({ path: `C:\\Users\\User\\AppData\\Local\\Temp\\nx9-a12-chat-${viewport.width}.png`, fullPage: false });
      expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toEqual([]);
    });
  }
});
