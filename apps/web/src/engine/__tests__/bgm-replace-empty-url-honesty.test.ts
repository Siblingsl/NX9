/**
 * BGM / 智能替换：done 无 URL 不得空转到超时。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const engine = resolve(__dirname, '..');
const webSrc = resolve(__dirname, '../..');

describe('BGM / 智能替换空 URL 诚实门禁', () => {
  it('sound-gen-runner pollBgmUntilDone 立即拒绝', () => {
    const src = readFileSync(resolve(engine, 'sound-gen-runner.ts'), 'utf8');
    expect(src).toContain("task.status === 'done' && !task.url");
    expect(src).toContain('BGM 生成完成但无音频地址，禁止空成功');
  });

  it('SoundGenBlock BGM 轮询立即拒绝', () => {
    const src = readFileSync(resolve(webSrc, 'blocks/core/SoundGenBlock.tsx'), 'utf8');
    expect(src).toContain("t.status === 'done' && !t.url");
    expect(src).toContain('BGM 生成完成但无音频地址，禁止空成功');
    expect(src).toContain('请输入要配音的文本，禁止空成功');
    expect(src).toContain('LuxTTS 需要参考音频（上传或选角色），禁止空成功');
    expect(src).toContain('TTS 未返回音频 URL，禁止空成功');
    expect(src).toContain('请先填写 BGM 描述，禁止空成功');
    expect(src).toContain('BGM 生成失败，禁止空成功');
  });

  it('SmartReplacePanel done 无 URL 立即失败', () => {
    const src = readFileSync(
      resolve(webSrc, 'blocks/core/clip-editor/SmartReplacePanel.tsx'),
      'utf8',
    );
    expect(src).toContain('视频替换完成但无输出地址，禁止空成功');
    expect(src).toContain('跨帧追踪完成但无输出地址，禁止空成功');
    expect(src).toContain('上次替换任务完成但无输出地址，禁止空成功');
    expect(src).toContain('视频生成失败，禁止空成功');
    expect(src).toContain('追踪任务提交失败，禁止空成功');
    expect(src).toContain('任务提交失败，禁止空成功');
    expect(src).toContain('跨帧追踪超时（10 分钟），禁止空成功');
    expect(src).toContain('视频替换超时，禁止空成功');
  });

  it('use-task-stream done 无 URL 拒绝', () => {
    const src = readFileSync(resolve(webSrc, 'hooks/use-task-stream.ts'), 'utf8');
    expect(src).toContain('任务完成但无输出地址，禁止空成功');
    expect(src).toContain('taskOutputUrl');
    expect(src).toContain("t.status === 'done' || t.status === 'failed' || t.status === 'cancelled'");
    expect(src).not.toMatch(/onerror[\s\S]{0,200}resolve\(t as TaskSnapshot\)/);
  });
});
