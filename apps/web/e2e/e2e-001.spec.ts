import { test, expect } from '@playwright/test';

test.describe('E2E-001: 短剧最小闭环', () => {
  test('创建 workspace → 添加 block → 验证渲染', async ({ page }) => {
    await page.goto('/');

    // 1. 创建新工作区
    await page.getByRole('button', { name: /新建|New/i }).first().click();
    await page.waitForTimeout(1000);

    // 2. 添加一个 prompt block
    await page.getByRole('button', { name: /模块|Block|Dock/i }).first().click();
    await page.getByText('prompt').first().click();
    await page.waitForTimeout(500);

    // 3. 验证画布上有 block
    const blocks = page.locator('.react-flow__node');
    await expect(blocks.first()).toBeVisible();
  });
});
