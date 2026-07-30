/**
 * constraint-assembler.ts — 参考板/构图模板约束注入生成（F-017 / F-032）。
 *
 * 在 picture-gen/clip-gen 生成请求中强制注入参考板约束。
 * board.enforce=true 时无约束拒发。
 */
import type { StoryboardShot } from '../types/storyboard';

export interface ReferenceConstraint {
  style?: string;
  palette?: string;
  mustInclude?: string[];
  mustAvoid?: string[];
  assetUrls?: string[];
  /** 强约束：无约束时拒发 */
  enforce?: boolean;
}

export interface CompositionTemplate {
  id: string;
  name: string;
  /** 构图提示词后缀 */
  promptSuffix: string;
  /** 宽高比 */
  aspectRatio?: string;
}

/**
 * 从 reference-board 节点 data 提取约束。
 */
export function extractReferenceConstraints(
  nodeData: Record<string, unknown>,
): ReferenceConstraint | null {
  const constraints = nodeData.constraints as Record<string, unknown> | undefined;
  if (!constraints) return null;
  return {
    style: constraints.style as string | undefined,
    palette: constraints.palette as string | undefined,
    mustInclude: Array.isArray(constraints.mustInclude)
      ? (constraints.mustInclude as string[])
      : undefined,
    mustAvoid: Array.isArray(constraints.mustAvoid)
      ? (constraints.mustAvoid as string[])
      : undefined,
    assetUrls: Array.isArray(constraints.assetUrls)
      ? (constraints.assetUrls as string[])
      : undefined,
    enforce: (nodeData.enforce as boolean) ?? false,
  };
}

/**
 * 将约束转为 prompt 后缀。
 */
export function constraintsToPromptSuffix(constraint: ReferenceConstraint): string {
  const parts: string[] = [];
  if (constraint.style) parts.push(`Style: ${constraint.style}`);
  if (constraint.palette) parts.push(`Color palette: ${constraint.palette}`);
  if (constraint.mustInclude?.length) parts.push(`Must include: ${constraint.mustInclude.join(', ')}`);
  if (constraint.mustAvoid?.length) parts.push(`Avoid: ${constraint.mustAvoid.join(', ')}`);
  if (parts.length === 0) return '';
  return `\n\n[Constraints]\n${parts.join('\n')}`;
}

/**
 * 内置构图模板预设。
 */
export const BUILTIN_COMPOSITION_TEMPLATES: CompositionTemplate[] = [
  { id: 'comp-portrait', name: '人像居中', promptSuffix: 'centered portrait composition, subject in middle, headroom above, rule of thirds', aspectRatio: '3:4' },
  { id: 'comp-wide', name: '广角全景', promptSuffix: 'wide angle shot, grand landscape, expansive view, deep depth of field', aspectRatio: '16:9' },
  { id: 'comp-closeup', name: '特写', promptSuffix: 'extreme close-up, macro detail, shallow depth of field, blurred background', aspectRatio: '1:1' },
  { id: 'comp-over-shoulder', name: '过肩镜头', promptSuffix: 'over the shoulder shot, foreground shoulder blur, focus on subject face', aspectRatio: '16:9' },
  { id: 'comp-low-angle', name: '低角度', promptSuffix: 'low angle shot, looking up at subject, dramatic perspective, sky background', aspectRatio: '3:4' },
  { id: 'comp-dutch', name: '荷兰角', promptSuffix: 'dutch angle tilted shot, dynamic unbalanced composition, tension', aspectRatio: '16:9' },
  { id: 'comp-symmetry', name: '对称构图', promptSuffix: 'symmetrical composition, centered framing, balanced elements, mirror-like', aspectRatio: '1:1' },
  { id: 'comp-action', name: '动态', promptSuffix: 'dynamic action shot, motion blur, dramatic angle, fast-paced composition', aspectRatio: '16:9' },
  { id: 'comp-group', name: '群像', promptSuffix: 'group shot, multiple subjects arranged, ensemble cast, everyone visible', aspectRatio: '16:9' },
];

/**
 * 从 shot 中读取构图模板。
 */
export function resolveCompositionTemplate(
  shot: StoryboardShot | undefined,
  templates: CompositionTemplate[],
): CompositionTemplate | undefined {
  if (!shot?.compositionTemplateId) return undefined;
  return templates.find((t) => t.id === shot.compositionTemplateId);
}

/**
 * 构建完整的约束注入 prompt。
 */
export function buildConstrainedPrompt(
  basePrompt: string,
  constraints: ReferenceConstraint | null,
  template: CompositionTemplate | undefined,
): { prompt: string; blocked: boolean; reason?: string } {
  if (constraints?.enforce && !constraints.style && !constraints.palette && !(constraints.assetUrls?.length)) {
    return { prompt: basePrompt, blocked: true, reason: '参考板为强约束模式，但未设置任何约束条件' };
  }
  let prompt = basePrompt;
  if (constraints) {
    prompt += constraintsToPromptSuffix(constraints);
  }
  if (template) {
    prompt += `\n\n[Composition: ${template.name}]\n${template.promptSuffix}`;
  }
  return { prompt, blocked: false };
}
