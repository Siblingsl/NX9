/**
 * 分镜「机位建议」幂等注入回归（R2 新增接线）。
 *
 * 覆盖对象：`apps/web/src/engine/shot-blocking-hint.ts` —— 把此前全仓零调用方的
 * `director-desk-runner.suggestCameraPosition` 接成可注入既有 `videoPrompt` 的
 * 幂等片段。
 *
 * 注意：本文件 import **相对路径直取源码**，不经过 '@nx9/shared' barrel。
 * `shot-blocking-hint` 有意采用依赖注入（不 import `director-desk-runner`），
 * 因此即便 barrel 存在缺失模块的既有缺陷，本测试也能独立运行。
 * 测试内的 stub 建议函数镜像真实 `suggestCameraPosition` 的输出形状与语义。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SHOT_BLOCKING_PREFIX,
  buildShotBlockingHint,
  clearShotBlockingHint,
  hasShotBlockingSignal,
  readShotBlockingHint,
  toShotBlockingSuggestionInput,
  withShotBlockingHint,
  type ShotBlockingSuggester,
} from '../shot-blocking-hint';

/** 镜像 `director-desk-runner.suggestCameraPosition` 的输出语义（同 map/兜底规则）。 */
const suggest: ShotBlockingSuggester = (shot) => {
  const size = shot.shotLexiconSize || shot.shotSize || 'MS';
  const move = shot.shotLexiconMove || shot.cameraMove || '固定';
  const angle = shot.cameraAngle || '平拍';
  const distMap: Record<string, string> = { ECU: '0.3m', CU: '1m', MS: '2m', FS: '3m', WS: '6m' };
  const angleMap: Record<string, string> = { 平拍: 'eye-level', 俯拍: 'overhead', 仰拍: 'low-angle' };
  const scene = shot.scene || '场景';
  return {
    suggestedCamera: `${scene} · ${move}机位，焦段 ${distMap[size] || '2m'}`,
    suggestedAngle: angleMap[angle] || 'eye-level',
    suggestedDistance: distMap[size] || '2m',
  };
};

const SHOT = {
  scene: '客厅',
  shotSize: 'CU',
  cameraMove: '推',
  cameraAngle: '俯拍',
  descriptionZh: '主角推门而入',
};

describe('R2 · 机位建议幂等注入', () => {
  it('空文本注入后前缀 + 正文格式稳定，且可再次读取', () => {
    const once = withShotBlockingHint('', SHOT, suggest);
    expect(once).toBe(`${SHOT_BLOCKING_PREFIX} 客厅 · 推机位，焦段 1m · overhead · 1m`);
    expect(readShotBlockingHint(once)).toBe('客厅 · 推机位，焦段 1m · overhead · 1m');
    expect(once.startsWith(SHOT_BLOCKING_PREFIX)).toBe(true);
  });

  it('幂等：连续注入 N 次结果完全相同（只有一行）', () => {
    let text = '主角推门而入';
    const first = withShotBlockingHint(text, SHOT, suggest);
    let current = first;
    for (let i = 0; i < 5; i += 1) current = withShotBlockingHint(current, SHOT, suggest);
    expect(current).toBe(first);
    expect(current.split('\n').filter((l) => l.startsWith(SHOT_BLOCKING_PREFIX))).toHaveLength(1);
  });

  it('可清除：清除后正文与原样文本逐字一致', () => {
    const base = '保持手持轻微晃动\n景别：中近景';
    const injected = withShotBlockingHint(base, SHOT, suggest);
    expect(injected).not.toBe(base);
    expect(clearShotBlockingHint(injected, suggest)).toBe(base);
    // 二次清除稳定
    expect(clearShotBlockingHint(base, suggest)).toBe(base);
  });

  it('镜头切换只替换本行，不堆叠', () => {
    const a = withShotBlockingHint('正文', SHOT, suggest);
    const b = withShotBlockingHint(a, { ...SHOT, cameraMove: '拉', shotSize: 'WS' }, suggest);
    expect(b.split('\n').filter((l) => l.startsWith(SHOT_BLOCKING_PREFIX))).toHaveLength(1);
    expect(b).toContain('拉机位');
    expect(b).not.toContain('推机位');
    expect(b.split('\n')[0]).toBe('正文');
  });

  it('不影响既有注入行：camera movement: / 运镜： / 预设段落行原样保留（两种顺序）', () => {
    const foreign = [
      '主角走进雨幕',
      'camera movement: dolly in, slow',
      '运镜：推 · 跟 · 2.4s',
      'cinematic style: golden hour, teal and orange',
      'lighting: three point soft',
    ].join('\n');

    const hintThenForeign = foreign;
    const a = withShotBlockingHint(hintThenForeign, SHOT, suggest);
    for (const line of foreign.split('\n')) expect(a).toContain(line);

    // 先注入机位建议再追加外部行：外部行不被本模块识别为自有行
    const b = withShotBlockingHint('', SHOT, suggest);
    const combined = `${b}\ncamera movement: dolly in, slow\n运镜：推 · 跟 · 2.4s`;
    const c = withShotBlockingHint(combined, SHOT, suggest);
    expect(c).toContain('camera movement: dolly in, slow');
    expect(c).toContain('运镜：推 · 跟 · 2.4s');
    expect(c.split('\n').filter((l) => l.startsWith(SHOT_BLOCKING_PREFIX))).toHaveLength(1);
  });

  it('无信号不注入：不把 suggestCameraPosition 的兜底默认值当建议写入', () => {
    const empty = {
      scene: '',
      shotSize: '',
      cameraMove: '',
      cameraAngle: '',
      descriptionZh: '   ',
    };
    expect(hasShotBlockingSignal(empty)).toBe(false);
    expect(buildShotBlockingHint(empty, suggest)).toBe('');
    expect(withShotBlockingHint('原样正文', empty, suggest)).toBe('原样正文');
    expect(withShotBlockingHint('原样正文\n', null, suggest)).toBe('原样正文\n');
  });

  it('既有注入行存在但镜头已无信号：仍按「可清除」移除该行', () => {
    const injected = withShotBlockingHint('正文', SHOT, suggest);
    expect(withShotBlockingHint(injected, null, suggest)).toBe('正文');
  });

  it('不产生尾部空行堆积，且空白字段归一为 undefined', () => {
    const withTrailing = withShotBlockingHint('正文\n\n\n', SHOT, suggest);
    expect(withTrailing.endsWith('\n')).toBe(false);
    const roundTrip = withShotBlockingHint(withTrailing, SHOT, suggest);
    expect(roundTrip).toBe(withTrailing);
    const input = toShotBlockingSuggestionInput({ scene: ' 客厅 ', shotSize: '', cameraMove: '   ' });
    expect(input.scene).toBe('客厅');
    expect(input.shotSize).toBeUndefined();
    expect(input.cameraMove).toBeUndefined();
  });

  it('接线守卫：分镜弹窗注入真实 suggestCameraPosition（防退回零入口）', () => {
    const modal = readFileSync(
      resolve(__dirname, '..', '..', 'blocks/craft/storyboard-desk/shot-edit-modal.tsx'),
      'utf8',
    );
    expect(modal).toContain("from '../../../engine/director-desk-runner'");
    expect(modal).toContain('suggestCameraPosition');
    expect(modal).toContain('withShotBlockingHint');
    expect(modal).toContain('readShotBlockingHint');
    // 只写既有 videoPrompt 字段，不新增分镜字段
    expect(modal).toContain('videoPrompt: withShotBlockingHint(');
  });
});
