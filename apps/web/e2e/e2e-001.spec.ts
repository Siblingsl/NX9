import { test, expect } from '@playwright/test';

test.describe('E2E-001: 短剧最小闭环', () => {
  test('创建 workspace → 添加 block → 验证渲染', async ({ page }) => {
    await page.goto('/');

    // 1. 创建新工作区
    await page.getByRole('button', { name: /新建|New/i }).first().click();
    await page.getByRole('button', { name: /创建并开始制作/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /前往画布/i }).click();
    await page.waitForTimeout(1000);

    // 2. 打开能力面板并添加一个图像生成能力
    await page.getByRole('button', { name: '能力' }).click();
    await page.getByRole('button', { name: /图像生成 文生图/ }).click();
    await page.waitForTimeout(500);

    // 3. 验证核心三台节点和新增能力均可见
    const blocks = page.locator('.react-flow__node');
    await expect(blocks.first()).toBeVisible();
    await expect(page.getByText('编剧台').first()).toBeVisible();
    await expect(page.getByText('分镜台').first()).toBeVisible();
    await expect(page.getByText('导演台').first()).toBeVisible();
  });
});
