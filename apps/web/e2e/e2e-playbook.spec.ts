import { test, expect } from '@playwright/test';

test.describe('E2E-WF — Flow capability', () => {

  test('E2E-WF-001: 核心制作链节点可见', async ({ page }) => {
    // 1. Opens the app
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 2. Creates a workspace
    await page.getByRole('button', { name: /新建|New/i }).first().click();
    await page.getByRole('button', { name: /创建并开始制作/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /前往画布/i }).click();
    await page.waitForTimeout(1000);

    // 3. Opens the capability panel and verifies production capabilities.
    await page.getByRole('button', { name: '能力' }).click();
    await expect(page.getByText('添加能力')).toBeVisible();
    await expect(page.getByRole('button', { name: /导演台 3D 机位/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /视频生成 单镜/ })).toBeVisible();
  });

});
