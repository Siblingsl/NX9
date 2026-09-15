import { test, expect } from '@playwright/test';
import { createCanvasProject } from './helpers';

test.describe('E2E-WF — Flow capability', () => {

  test('E2E-WF-001: 核心制作链节点可见', async ({ page }) => {
    // 1-2. 打开应用并创建工作区进入画布
    await createCanvasProject(page);

    // 3. Opens the capability panel and verifies production capabilities.
    await page.getByRole('button', { name: '能力' }).click();
    await expect(page.getByText('添加能力')).toBeVisible();
    await expect(page.getByRole('button', { name: /导演台 3D 机位/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /视频生成 单镜/ })).toBeVisible();
  });

});
