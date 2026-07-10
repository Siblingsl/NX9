import { test, expect } from '@playwright/test';

test.describe('E2E-WF — Playbook', () => {

  test('E2E-WF-001: PB-LINE-ART-EPISODE 最短路径', async ({ page }) => {
    // 1. Opens the app
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 2. Creates a workspace
    await page.getByRole('button', { name: /新建|New/i }).first().click();
    await page.waitForTimeout(1000);

    // 3. Selects PB-LINE-ART-EPISODE from PlaybookLauncher
    await page.getByText('线稿分镜单集').first().click();
    await page.waitForTimeout(1000);

    // 4. Verifies the step bar appears
    const stepBar = page.locator('text=剧本:');
    await expect(stepBar).toBeVisible();

    // 5. Verifies the banner shows step 1
    const banner = page.locator('text=步骤 1/7');
    await expect(banner).toBeVisible();
  });

});
