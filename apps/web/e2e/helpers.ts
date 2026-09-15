import { expect, type Page } from '@playwright/test';

/**
 * 2026-08 账户登录门：进入主页前若出现登录页，注册一次性账号登录。
 * 注册成功后 AppShell 切到主界面；本机已有会话时跳过。
 */
export async function ensureLoggedIn(page: Page): Promise<void> {
  const loginTabs = page.getByRole('tablist', { name: '登录或注册' });
  if (!(await loginTabs.isVisible().catch(() => false))) return;
  await page.getByRole('tab', { name: '注册' }).click();
  await page
    .getByRole('textbox', { name: '昵称' })
    .fill(`e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  await page.getByRole('textbox', { name: '密码', exact: true }).fill('e2e-pass-123');
  await page.getByRole('textbox', { name: '确认密码' }).fill('e2e-pass-123');
  await page.getByRole('button', { name: '创建并进入' }).click();
  await expect(page.getByRole('button', { name: /新建|New/i }).first()).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * 从主页新建项目并进入画布，等待画布就绪（「打开编剧台」入口可见）。
 * 返回自动生成的项目名称。
 */
export async function createCanvasProject(page: Page): Promise<string> {
  await page.goto('/');
  await ensureLoggedIn(page);
  await page.getByRole('button', { name: /新建|New/i }).first().click();
  const projectTitle = (await page.getByRole('textbox', { name: '项目名称' }).inputValue()).trim();
  await page.getByRole('button', { name: /创建并开始制作/i }).click();
  const canvasBtn = page.getByRole('button', { name: /前往画布/i });
  await canvasBtn.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  if (await canvasBtn.isVisible().catch(() => false)) {
    await canvasBtn.click();
  }
  await expect(page.getByRole('button', { name: '打开编剧台' }).first()).toBeVisible({
    timeout: 15_000,
  });
  return projectTitle;
}
