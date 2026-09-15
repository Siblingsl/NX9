/**
 * 编剧 / 分镜 / API 流式：空正文禁止空成功。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const engine = resolve(__dirname, '..');
const webSrc = resolve(__dirname, '../..');

describe('编剧分镜空正文诚实门禁', () => {
  it('api 流式剧本 / 技能拒空正文', () => {
    const src = readFileSync(resolve(webSrc, 'api/client.ts'), 'utf8');
    expect(src).toContain('剧本生成未返回正文，禁止空成功');
    expect(src).toContain('技能生成未返回内容，禁止空成功');
  });

  it('script-desk-runner 续写/重写拒空', () => {
    const src = readFileSync(resolve(engine, 'script-desk-runner.ts'), 'utf8');
    expect(src).toContain('剧本生成未返回正文，禁止空成功');
    expect(src).toContain('续写未返回有效集内容，禁止空成功');
    expect(src).toContain('重写未返回正文，禁止空成功');
    expect(src).toContain('重写未返回有效集内容，禁止空成功');
    expect(src).toContain('成稿为空，无法抽取 Bible，禁止空成功');
    expect(src).toContain('缺少可用于抽取人物/场景的文本，禁止空成功');
  });

  it('storyboard-desk-runner 拆镜拒空镜表', () => {
    const src = readFileSync(resolve(engine, 'storyboard-desk-runner.ts'), 'utf8');
    expect(src).toContain('成稿正文为空，禁止空成功');
    expect(src).toContain('请先在编剧台确认成稿，禁止空成功');
    expect(src).toContain('拆镜未返回有效镜表，禁止空成功');
    expect(src).toContain('镜表为空，请从成稿拆镜或导入旧表，禁止空成功');
    expect(src).toContain('文案/动作/画面皆空，禁止空成功');
  });

  it('拆镜队列 API 空 payload 禁止空成功', () => {
    const src = readFileSync(
      resolve(webSrc, 'blocks/craft/storyboard-desk/breakdown-queue-ops.ts'),
      'utf8',
    );
    expect(src).toContain('拆镜 API 未返回有效镜表，禁止空成功');
    expect(src).toContain('分镜台：上游无编剧台成稿包，禁止空成功');
    expect(src).toContain('分镜台：请输入待补拆的文本，禁止空成功');
    expect(src).toContain('toastError');
    expect(src).toContain('增量补拆：未检出可比对的新镜，镜表不变，禁止空成功');
    expect(src).toContain('没有新增集可拆');
    expect(src).toContain('所有集均已确认，无需重拆，禁止空成功');
    expect(src).toContain('该集正文为空，禁止空成功');
    expect(src).toContain('集拆镜失败：${firstError}，禁止空成功');
  });

  it('线稿 / 故事板 / 交接空前置禁止空成功', () => {
    const lineArt = readFileSync(
      resolve(webSrc, 'blocks/craft/storyboard-desk/line-art-ops.ts'),
      'utf8',
    );
    expect(lineArt).toContain('请先用顶部能力口连接「图像生成」节点后再生成线稿，禁止空成功');
    expect(lineArt).toContain('toastError');
    expect(lineArt).toContain('批量线稿前请先连接「图像生成」节点，禁止空成功');
    expect(lineArt).toContain('宫格线稿前请先连接「图像生成」节点，禁止空成功');
    expect(lineArt).toContain('当前没有可生成线稿的镜头，禁止空成功');
    expect(lineArt).toContain('当前没有需要补线稿的镜头，禁止空成功');
    const sheet = readFileSync(
      resolve(webSrc, 'blocks/craft/storyboard-desk/sheet-export-ops.ts'),
      'utf8',
    );
    expect(sheet).toContain('分镜台：没有可合成的镜头，禁止空成功');
    expect(sheet).toContain('请先生成线稿或上传分镜图，再合成故事板大图，禁止空成功');
    expect(sheet).toContain('toastError');
    expect(sheet).toMatch(/分镜故事板大图失败[\s\S]*禁止空成功/);
    expect(
      readFileSync(resolve(webSrc, 'blocks/craft/storyboard-desk/handoff-ops.ts'), 'utf8'),
    ).toContain('分镜台：未找到连线上游编剧台，禁止空成功');
    expect(
      readFileSync(resolve(webSrc, 'blocks/craft/storyboard-desk/handoff-ops.ts'), 'utf8'),
    ).toContain('硬阈值：构图覆盖');
    expect(
      readFileSync(resolve(webSrc, 'blocks/craft/storyboard-desk/handoff-ops.ts'), 'utf8'),
    ).toMatch(/硬阈值：构图覆盖[\s\S]*禁止空成功/);
  });

  it('拆镜增量失败 / 线稿失败 / 编剧失败 toastError', () => {
    const breakdown = readFileSync(
      resolve(webSrc, 'blocks/craft/storyboard-desk/breakdown-queue-ops.ts'),
      'utf8',
    );
    expect(breakdown).toMatch(/增量补拆失败[\s\S]*toastError/);

    const lineArt = readFileSync(
      resolve(webSrc, 'blocks/craft/storyboard-desk/line-art-ops.ts'),
      'utf8',
    );
    expect(lineArt).toMatch(/分镜线稿生成失败[\s\S]*toastError/);
    expect(lineArt).toContain('批量线稿失败');
    expect(lineArt).toContain('宫格线稿失败');

    const agent = readFileSync(resolve(webSrc, 'blocks/nx9/script-desk/use-script-desk-agent.ts'), 'utf8');
    expect(agent).toContain('toastError');
    expect(agent).toMatch(/编剧台 Agent 失败[\s\S]*toastError/);
    expect(agent).toContain('首次生成失败，未成功生成任何集');

    const actions = readFileSync(
      resolve(webSrc, 'blocks/nx9/script-desk/use-script-desk-actions.ts'),
      'utf8',
    );
    expect(actions).toMatch(/编剧台抽取失败[\s\S]*toastError/);
  });

  it('深度转换拒空视频', () => {
    const src = readFileSync(
      resolve(engine, 'stage-deck/chrome/attached-workspace/generation/video/VideoPlaybookTools.tsx'),
      'utf8',
    );
    expect(src).toContain('深度转换未返回视频，禁止空成功');
    expect(src).toContain('参考素材上传失败或未返回 URL，禁止空成功');
    expect(readFileSync(resolve(engine, 'FlowSurface.tsx'), 'utf8')).toContain(
      '未找到关联镜头；请用画布「分镜台」管理镜表，禁止空成功',
    );
  });
});
