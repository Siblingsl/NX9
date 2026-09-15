/**
 * 定妆 / 宫格合成 / 配音空输入 / 批出无 URL 诚实门禁。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const engine = resolve(__dirname, '..');
const webSrc = resolve(__dirname, '../..');

describe('定妆与空输入诚实门禁', () => {
  it('FaceSculpt 定妆截图/上传拒空', () => {
    const src = readFileSync(
      resolve(webSrc, 'panels/asset-library/face-sculpt/FaceSculptModal.tsx'),
      'utf8',
    );
    expect(src).toContain('定妆截图生成失败，禁止空成功');
    expect(src).toContain('定妆截图内容为空，禁止空成功');
    expect(src).toContain('定妆图上传失败，禁止空成功');
  });

  it('关键帧宫格合成拒空 URL', () => {
    const src = readFileSync(
      resolve(
        engine,
        'stage-deck/chrome/attached-workspace/storyboard-preview/useStoryboardPreviewState.ts',
      ),
      'utf8',
    );
    expect(src).toContain('合成失败，禁止空成功');
  });

  it('批出视频无 URL / 空时间线编排拒成功', () => {
    expect(readFileSync(resolve(engine, 'core-pipeline-runner.ts'), 'utf8')).toContain(
      '视频生成失败，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'smart-edit-orchestrator.ts'), 'utf8')).toContain(
      '无法编排空时间线，禁止空成功',
    );
  });

  it('media-ops 配音/口播/字幕空输入拒成功', () => {
    const src = readFileSync(resolve(engine, 'flow-runner-ops/media-ops.ts'), 'utf8');
    expect(src).toContain('多角色配音全部失败，禁止空成功');
    expect(src).toContain('配音文本为空，禁止空成功');
    expect(src).toContain('口播文本为空，禁止空成功');
    expect(src).toContain('字幕烧录：字幕为空，禁止空成功');
    expect(src).toContain('音效模式：请先从声音库导入音频（画布 run 不会自动生成音效），禁止空成功');
    expect(src).toContain('无可解析的对白（请连接编剧台或已拆镜的分镜台），禁止空成功');
  });
});
