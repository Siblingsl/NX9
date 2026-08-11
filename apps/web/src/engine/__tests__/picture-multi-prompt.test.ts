import { describe, expect, it } from 'vitest';
import {
  filledMultiPrompts,
  isPictureMultiPromptAction,
  normalizeMultiPrompts,
  seedMultiPrompts,
} from '../stage-deck/chrome/attached-workspace/generation/picture/picture-pro-actions';
import { isSpecializedPictureMode } from '../stage-deck/chrome/attached-workspace/generation/picture/picture-gen-modes';

describe('picture multi-prompt', () => {
  it('识别 multi-prompt 动作', () => {
    expect(isPictureMultiPromptAction('multi-prompt')).toBe(true);
    expect(isPictureMultiPromptAction('upscale-hd')).toBe(false);
    expect(isPictureMultiPromptAction(undefined)).toBe(false);
  });

  it('multi-prompt 不锁定文生/图生自动推断', () => {
    expect(isSpecializedPictureMode('text-to-image', 'multi-prompt')).toBe(false);
  });

  it('normalizeMultiPrompts 至少保留一条', () => {
    expect(normalizeMultiPrompts(undefined)).toEqual(['']);
    expect(normalizeMultiPrompts(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('seedMultiPrompts 用当前正文作第 1 条并补空槽', () => {
    expect(seedMultiPrompts(undefined, '雪原天门')).toEqual(['雪原天门', '', '']);
    expect(seedMultiPrompts(['已有1', '已有2'], '忽略')).toEqual(['已有1', '已有2']);
  });

  it('filledMultiPrompts 只保留非空', () => {
    expect(filledMultiPrompts(['  a  ', '', 'b', '  '])).toEqual(['a', 'b']);
  });
});
