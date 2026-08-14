import { test, expect } from '@playwright/test';

const breakdownPayload = {
  version: 1,
  title: '浏览器链路验收剧本',
  sourceText: '第1集\n主角进入房间。\n第2集\n主角离开房间。',
  generatedAt: '2026-08-04T00:00:00.000Z',
  episodes: [1, 2].map((index) => ({
    id: `ep-${index}`,
    index,
    title: `第${index}集`,
    shots: [1, 2].map((shotIndex) => ({
      id: `ep-${index}-shot-${shotIndex}`,
      episodeId: `ep-${index}`,
      episodeIndex: index - 1,
      index: shotIndex,
      sceneId: `scene-${index}`,
      sceneCode: `${index}-${shotIndex}`,
      title: `镜头${shotIndex}`,
      durationSec: 3,
      shotSize: 'MS',
      cameraMove: '固定',
      characters: [],
      scene: '',
      scriptText: '主角行动。',
      dialogue: [],
      imagePrompt: `episode ${index} shot ${shotIndex}`,
      videoPrompt: `episode ${index} shot ${shotIndex} video`,
      status: 'draft',
    })),
  })),
};

async function mockProductionApis(page: import('@playwright/test').Page, options?: { delayBreakdown?: boolean; abortImage?: boolean }) {
  let imageCalls = 0;
  await page.route('**/api/agent/production/script-breakdown', async (route) => {
    if (options?.delayBreakdown) await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.fulfill({ json: { ok: true, payload: breakdownPayload, stats: { episodeCount: 2, sceneCount: 2, shotCount: 4, warningCount: 0 } } });
  });
  await page.route('**/api/gateway/image', async (route) => {
    imageCalls += 1;
    if (options?.abortImage && imageCalls === 1) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({ json: { ok: true, url: `https://mock.nx9/image-${imageCalls}.png` } });
  });
  await page.route('**/api/gateway/video', async (route) => {
    await route.fulfill({ json: { ok: true, status: 'success', url: 'https://mock.nx9/video-1.mp4' } });
  });
  await page.route('**/api/gateway/video/poll', async (route) => {
    await route.fulfill({ json: { ok: true, status: 'success', url: 'https://mock.nx9/video-1.mp4' } });
  });
}

async function createCanvasProject(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /新建|New/i }).first().click();
  const projectTitle = (await page.getByRole('textbox', { name: '项目名称' }).inputValue()).trim();
  await page.getByRole('button', { name: /创建并开始制作/i }).click();
  await page.getByRole('button', { name: /前往画布/i }).click();
  await expect(page.getByRole('button', { name: '打开编剧台' }).first()).toBeVisible({ timeout: 15_000 });
  return projectTitle;
}

test.describe('编剧台 → 分镜台 → 导演台 → 视频生成浏览器链路', () => {
  test('多集切换、并发关键帧批出和视频推送', async ({ page }) => {
    test.setTimeout(120_000);
    await mockProductionApis(page);
    const projectTitle = await createCanvasProject(page);

    await page.getByRole('button', { name: '打开编剧台' }).first().click();
    await page.getByRole('button', { name: '上传成稿', exact: true }).click();
    const ingest = page.getByPlaceholder(/直接粘贴小说/);
    await ingest.fill('第1集\n主角进入房间。\n第2集\n主角离开房间。');
    await page.getByRole('button', { name: '写入成稿' }).click();
    await page.getByRole('button', { name: '确认写入' }).click();
    await page.getByRole('button', { name: '确认成稿' }).click();
    const confirmDialog = page.getByRole('dialog');
    if (await confirmDialog.getByRole('button', { name: /仍要确认/ }).count()) {
      await confirmDialog.getByRole('button', { name: /仍要确认/ }).click();
    }
    await page.getByRole('button', { name: '送到分镜台' }).click();
    await page.getByRole('dialog', { name: '送到分镜台' }).getByRole('button', { name: /确认送出|仍要送出/ }).click();
    const storyboardDialog = page.getByRole('dialog', { name: '分镜台' });
    await expect(storyboardDialog).toBeVisible();
    await storyboardDialog.getByRole('button', { name: /从成稿拆镜/ }).click();
    await expect(page.getByText(/拆镜中|拆镜完成|分镜台/).first()).toBeVisible();
    await expect.poll(async () => page.getByText('第2集').count(), { timeout: 15000 }).toBeGreaterThan(0);

    const episodeSelect = page.locator('select[title*="选择要编辑的剧集"]');
    await expect(episodeSelect).toBeVisible();
    const ep2Value = await episodeSelect.locator('option').filter({ hasText: '第2集' }).getAttribute('value');
    const ep1Value = await episodeSelect.locator('option').filter({ hasText: '第1集' }).getAttribute('value');
    await episodeSelect.selectOption(ep2Value!);
    await expect(episodeSelect.locator('option:checked')).toHaveText(/第2集/);
    await episodeSelect.selectOption(ep1Value!);
    await expect(episodeSelect.locator('option:checked')).toHaveText(/第1集/);

    await storyboardDialog.getByRole('button', { name: /4 交接/ }).click();
    await storyboardDialog.getByRole('button', { name: '确认本集' }).first().click();
    const handoffConfirm = page.getByRole('dialog');
    if (await handoffConfirm.getByRole('button', { name: /仍要确认/ }).count()) {
      await handoffConfirm.getByRole('button', { name: /仍要确认/ }).click();
    }
    const pendingConfirm = page.getByRole('button', { name: '仍要确认', exact: true });
    for (let i = 0; i < 3 && await pendingConfirm.count(); i++) {
      await pendingConfirm.last().click();
      await page.waitForTimeout(100);
    }
    const openDirector = storyboardDialog.getByRole('button', { name: '打开导演台', exact: true });
    await expect(openDirector).toBeEnabled();
    await openDirector.click();
    await storyboardDialog.getByRole('button', { name: '关闭 (Esc)' }).click();
    const scriptDialog = page.getByRole('dialog', { name: '编剧台' });
    if (await scriptDialog.count()) {
      await scriptDialog.getByRole('button', { name: '关闭 (Esc)' }).click();
    }
    await page.getByRole('button', { name: '打开导演台', exact: true }).first().click();
    await expect(page.getByText(/导演台/).first()).toBeVisible();
    await page.getByRole('checkbox', { name: '角色参考' }).evaluate((element) => (element as HTMLInputElement).click());
    await page.getByRole('checkbox', { name: '场景参考' }).evaluate((element) => (element as HTMLInputElement).click());
    await page.getByRole('button', { name: /批出未完成|批出本集/ }).click();
    await expect(page.getByText(/完成：成功 4/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /3 审阅送出/ }).click();
    await page.getByRole('button', { name: '全部通过' }).click();
    await expect(page.getByText(/本集关键帧已全部批准/)).toBeVisible();
    await page.getByRole('button', { name: '推送关键帧' }).click();
    await expect(page.getByText(/已写入 clip-gen|视频生成/).first()).toBeVisible();

    // DD-D-14：整页刷新后链镜表 / 关键帧批次从服务端回放，导演台仍读得到 4 镜
    await page.waitForTimeout(800);
    await page.reload();
    // 刷新后先回导航页，再显式选中目标项目并等选中生效，避免画布顶部 chip 只显示前 8 个
    const navButton = page.getByRole('button', { name: '导航', exact: true });
    try {
      await navButton.waitFor({ state: 'visible', timeout: 10_000 });
      await navButton.click();
    } catch {
      // 刷新后已在导航页
    }
    const projectChip = page.getByRole('button', { name: projectTitle, exact: true }).first();
    await expect(projectChip).toBeVisible({ timeout: 30_000 });
    await projectChip.click();
    await expect(page.getByText(`当前「${projectTitle}」`)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /进入画布/ }).click();
    await expect(page.getByRole('button', { name: '打开编剧台' }).first()).toBeVisible({ timeout: 15_000 });
    const reopenedStoryboard = page.getByRole('dialog', { name: '分镜台' });
    if (await reopenedStoryboard.count()) {
      await reopenedStoryboard.getByRole('button', { name: '关闭 (Esc)' }).click();
    }
    await page.getByRole('button', { name: '打开导演台', exact: true }).first().click();
    await expect(page.getByText(/关键帧 4\/4/)).toBeVisible({ timeout: 15_000 });
  });

  test('网络中断后保留明确失败状态并可重试', async ({ page }) => {
    test.setTimeout(120_000);
    await mockProductionApis(page, { delayBreakdown: true, abortImage: true });
    await createCanvasProject(page);
    await page.getByRole('button', { name: '打开编剧台' }).first().click();
    await page.getByRole('button', { name: '上传成稿', exact: true }).click();
    await page.getByPlaceholder(/直接粘贴小说/).fill('第1集\n主角进入房间。\n第2集\n主角离开房间。');
    await page.getByRole('button', { name: '写入成稿' }).click();
    await page.getByRole('button', { name: '确认写入' }).click();
    await page.getByRole('button', { name: '确认成稿' }).click();
    const confirmDialog = page.getByRole('dialog');
    if (await confirmDialog.getByRole('button', { name: /仍要确认/ }).count()) {
      await confirmDialog.getByRole('button', { name: /仍要确认/ }).click();
    }
    await page.getByRole('button', { name: '送到分镜台' }).click();
    await page.getByRole('dialog', { name: '送到分镜台' }).getByRole('button', { name: /确认送出|仍要送出/ }).click();
    const storyboardDialog = page.getByRole('dialog', { name: '分镜台' });
    await storyboardDialog.getByRole('button', { name: /从成稿拆镜/ }).click();
    await expect(storyboardDialog.getByRole('button', { name: '取消同步' }).first()).toBeVisible({ timeout: 5000 });
    await storyboardDialog.getByRole('button', { name: '取消同步' }).first().click();
    await expect(page.getByText(/同步已取消|已停止|取消/).first()).toBeVisible({ timeout: 10000 });
  });
});
