import { test, expect } from '@playwright/test';

const mockSettings = {
  connections: [
    {
      id: 'mock-image-gemini',
      label: 'Mock Gemini 图片',
      kind: 'image',
      provider: 'gemini',
      model: 'gemini-2.5-flash-image',
      isActive: true,
    },
  ],
  preferences: {
    snapToGrid: false,
    gridSize: 16,
    autoSaveIntervalMs: 3000,
    showBlockIndex: false,
    reduceMotion: true,
    workflowEnabled: true,
  },
};

test.describe('A7 PG-04 图像工作台停止', () => {
  test('运行中点击停止 → 节点收回 idle，不落假成功', async ({ page }) => {
    test.setTimeout(120_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.route('**/api/settings**', async (route) => {
      await route.fulfill({ json: mockSettings });
    });

    await page.route('**/api/gateway/image**', async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((resolve) => setTimeout(resolve, 30_000));
        await route.fulfill({ json: { ok: true, url: 'https://mock.nx9/image-stop.png' } });
        return;
      }
      await route.fulfill({ json: { ok: true, url: 'https://mock.nx9/image-stop.png' } });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /新建|New/i }).first().click();
    await page.getByRole('button', { name: /创建并开始制作/i }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /前往画布/i }).click();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: '能力' }).click();
    await page.getByRole('button', { name: /图像生成 文生图/ }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Fit View' }).click();
    await page.waitForTimeout(500);

    // 默认画布里已连分镜台的首个图像节点会委托给分镜预览，未连线的新节点才挂独立工作区
    const pictureNode = page.locator('.react-flow__node').filter({ hasText: /图像生成|文生图/ }).last();
    await pictureNode.click();
    await pictureNode.getByRole('button', { name: '暂无图像' }).click();
    await expect(page.locator('.nx9-composer-panel textarea').first()).toBeVisible({ timeout: 10_000 });
    await page.locator('.nx9-composer-panel textarea').first().fill('A7 PG-04 停止测试提示词');

    const runButton = page.locator('.nx9-composer-panel').getByRole('button', { name: '生成', exact: true });
    await runButton.click();

    const stopButton = page.locator('.nx9-composer-panel').getByRole('button', { name: '停止', exact: true });
    await expect(stopButton).toBeVisible({ timeout: 10_000 });
    await stopButton.click();

    // 停止后立即回到可运行态：停止钮消失、生成钮回来、节点不再挂 running 态
    await expect(stopButton).toBeHidden({ timeout: 10_000 });
    await expect(
      page.locator('.nx9-composer-panel').getByRole('button', { name: '生成', exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(pictureNode.locator('.nx9-stage-card.is-running')).toHaveCount(0);

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
