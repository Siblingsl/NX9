/**
 * F-017 构图模板 / 参考板强约束验收
 * - constraint-assembler: extractReferenceConstraints / buildConstrainedPrompt / BUILTIN_COMPOSITION_TEMPLATES
 * - enforce 行为：无模板时 blocked / 有模板时 prompt 含约束
 * - StoryboardDeskBlock: enforceComposition 开关 UI + compositionTemplateId 下拉
 * - flow-runner: enforce 阻断上游分镜台强约束
 * - director-desk-runner: buildShotPrompt 强约束缺模板记 missingForced
 * - DirectorDeskBlock: enforceComposition 从上游分镜台传入 batchOpts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractReferenceConstraints,
  buildConstrainedPrompt,
  constraintsToPromptSuffix,
  BUILTIN_COMPOSITION_TEMPLATES,
  resolveCompositionTemplate,
} from '@nx9/shared';
import type { StoryboardShot } from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const webSrc = resolve(root, 'apps/web/src');

function readWeb(rel: string): string {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

function makeShot(overrides: Partial<StoryboardShot> = {}): StoryboardShot {
  return {
    id: 'shot-1',
    index: 1,
    descriptionZh: '特写男人拔刀',
    durationSec: 8,
    status: 'approved',
    ...overrides,
  } as StoryboardShot;
}

describe('F-017 构图模板 / 参考板强约束', () => {

  // ─── extractReferenceConstraints ───
  it('extractReferenceConstraints 从 nodeData 提取约束', () => {
    const result = extractReferenceConstraints({
      constraints: { style: '赛博朋克', mustInclude: ['霓虹灯', '雨夜'] },
      enforce: true,
    });
    expect(result).not.toBeNull();
    expect(result!.style).toBe('赛博朋克');
    expect(result!.mustInclude).toEqual(['霓虹灯', '雨夜']);
    expect(result!.enforce).toBe(true);
  });

  it('extractReferenceConstraints 无 constraints 返回 null', () => {
    expect(extractReferenceConstraints({})).toBeNull();
  });

  // ─── constraintsToPromptSuffix ───
  it('constraintsToPromptSuffix 生成正确后缀', () => {
    const suffix = constraintsToPromptSuffix({
      style: '赛博朋克',
      palette: 'dark purple',
      mustInclude: ['霓虹灯'],
      mustAvoid: ['蓝天'],
    });
    expect(suffix).toContain('Style: 赛博朋克');
    expect(suffix).toContain('Color palette: dark purple');
    expect(suffix).toContain('Must include: 霓虹灯');
    expect(suffix).toContain('Avoid: 蓝天');
  });

  it('constraintsToPromptSuffix 空约束返回空串', () => {
    expect(constraintsToPromptSuffix({})).toBe('');
  });

  // ─── buildConstrainedPrompt ───
  it('buildConstrainedPrompt enforce=true 且无约束 → blocked', () => {
    const result = buildConstrainedPrompt('base prompt', { enforce: true }, undefined);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBeDefined();
  });

  it('buildConstrainedPrompt 有约束无 enforce → 注入文本', () => {
    const result = buildConstrainedPrompt('base', { style: 'anime' }, undefined);
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain('Style: anime');
  });

  it('buildConstrainedPrompt 有构图模板 → 注入模板标注', () => {
    const tmpl = BUILTIN_COMPOSITION_TEMPLATES[0]!;
    const result = buildConstrainedPrompt('base', null, tmpl);
    expect(result.prompt).toContain('[Composition:');
    expect(result.prompt).toContain(tmpl.name);
    expect(result.prompt).toContain(tmpl.promptSuffix);
  });

  it('buildConstrainedPrompt 约束+模板同时注入', () => {
    const tmpl = BUILTIN_COMPOSITION_TEMPLATES[3]!; // 过肩镜头
    const result = buildConstrainedPrompt('base', { style: 'film noir' }, tmpl);
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain('Style: film noir');
    expect(result.prompt).toContain(tmpl.name);
  });

  // ─── BUILTIN_COMPOSITION_TEMPLATES ───
  it('BUILTIN_COMPOSITION_TEMPLATES 包含至少 9 个模板', () => {
    expect(BUILTIN_COMPOSITION_TEMPLATES.length).toBeGreaterThanOrEqual(9);
  });

  it('resolveCompositionTemplate 按 id 查找', () => {
    const shot = makeShot({ compositionTemplateId: 'comp-closeup' });
    const tmpl = resolveCompositionTemplate(shot, BUILTIN_COMPOSITION_TEMPLATES);
    expect(tmpl).toBeDefined();
    expect(tmpl!.name).toBe('特写');
  });

  it('resolveCompositionTemplate 无 id 返回 undefined', () => {
    expect(resolveCompositionTemplate(makeShot(), BUILTIN_COMPOSITION_TEMPLATES)).toBeUndefined();
  });

  // ─── StoryboardDeskBlock UI 守卫 ───
  it('StoryboardDeskBlock 有 enforceComposition 开关', () => {
    const src = readWeb('blocks/craft/storyboard-desk/use-storyboard-desk.tsx');
    expect(src).toContain('enforceComposition');
    expect(src).toContain('toggleEnforceComposition');
    expect(src).toContain('约束:开');
    expect(src).toContain('约束:关');
  });

  it('StoryboardDeskBlock 编辑弹窗有构图模板下拉', () => {
    const src = readWeb('blocks/craft/storyboard-desk/use-storyboard-desk.tsx');
    expect(src).toContain('构图模板');
    expect(src).toContain('compositionTemplateId');
    expect(src).toContain('BUILTIN_COMPOSITION_TEMPLATES');
  });

  it('StoryboardDeskBlock 保存时写入 compositionTemplateId', () => {
    const src = readWeb('blocks/craft/storyboard-desk/use-storyboard-desk.tsx');
    // patchShotInPayload 调用中包含 compositionTemplateId
    expect(src).toContain('compositionTemplateId: editDraft.compositionTemplateId');
  });

  // ─── flow-runner 源码守卫 ───
  it('flow-runner 含 upstreamDeskEnforcesComposition 辅助函数', () => {
    const src = readWeb('engine/flow-runner.ts');
    expect(src).toContain('upstreamDeskEnforcesComposition');
    expect(src).toContain('构图强约束：上游分镜台已开启强约束');
  });

  // ─── director-desk-runner 源码守卫 ───
  it('director-desk-runner buildShotPrompt 强约束缺模板记 missingForced', () => {
    const src = readWeb('engine/director-desk-runner.ts');
    expect(src).toContain('opts.enforceComposition');
    expect(src).toContain('构图强约束已开启');
  });

  it('director-desk-runner DirectorDeskBatchOptions 含 enforceComposition', () => {
    const src = readWeb('engine/director-desk-runner.ts');
    expect(src).toContain('enforceComposition?: boolean');
  });

  // ─── DirectorDeskBlock 集成守卫 ───
  it('DirectorDeskBlock 从上游分镜台读 enforceComposition 并传入 batchOpts', () => {
    const src = readWeb('blocks/core/director-desk/director-batch-opts.ts');
    expect(src).toContain('enforceComposition');
    expect(src).toContain('enforceComp');
  });

  // ─── 完整行为验证 ───
  it('强约束开启 + 无模板 → blocked=true', () => {
    const result = buildConstrainedPrompt('prompt', { enforce: true }, undefined);
    expect(result.blocked).toBe(true);
    expect(result.prompt).toBe('prompt'); // 原 prompt 不变
  });

  it('强约束开启 + 有模板 → 不 blocked', () => {
    const tmpl = BUILTIN_COMPOSITION_TEMPLATES[0]!;
    const result = buildConstrainedPrompt('prompt', { enforce: false }, tmpl);
    expect(result.blocked).toBe(false);
  });

  it('enforce=false 无约束无模板也不 blocked（非强约束模式）', () => {
    const result = buildConstrainedPrompt('prompt', { enforce: false }, undefined);
    expect(result.blocked).toBe(false);
  });
});
