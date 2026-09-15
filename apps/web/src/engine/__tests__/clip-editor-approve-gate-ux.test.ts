/**
 * 剪辑台：视频未批准时禁用 AI 编排主按钮（主链体验，避免点进去才报错）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('剪辑台视频批准门禁 UX', () => {
  it('ClipEditorBlock 在全未批准时给出 orchestrateBlockedReason', () => {
    const src = readFileSync(
      resolve(__dirname, '../../blocks/core/ClipEditorBlock.tsx'),
      'utf8',
    );
    expect(src).toContain('orchestrateBlockedReason');
    expect(src).toContain('均未批准');
    expect(src).toContain('orchestrateBlockedReason={orchestrateBlockedReason}');
  });

  it('EditDesk 在有阻断原因时禁用 AI 编排按钮', () => {
    const src = readFileSync(
      resolve(__dirname, '../../blocks/core/clip-editor/EditDesk.tsx'),
      'utf8',
    );
    expect(src).toContain('orchestrateBlockedReason');
    expect(src).toContain('disabled={orchestrating || Boolean(orchestrateBlockedReason)}');
  });
});
