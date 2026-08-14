import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webSrc = resolve(__dirname, '..');

describe('SND-01/02/03 sound-gen 画布与卡参数对齐', () => {
  it('flow-runner 按 soundMode 分发，不再一律 TTS', () => {
    const src = readFileSync(resolve(webSrc, 'flow-runner-ops/media-ops.ts'), 'utf8');
    const branch = src.slice(src.indexOf("if (kind === 'sound-gen')"), src.indexOf("if (kind === 'grid-split')"));
    expect(branch).toContain("soundMode === 'music'");
    expect(branch).toContain('runSoundGenBgm');
    expect(branch).toContain("soundMode === 'cast'");
    expect(branch).toContain('runSoundGenCast');
    expect(branch).toContain('synthesizeTts');
    expect(branch).toContain('instructions');
    expect(branch).toContain('audioFormat');
    expect(branch).toContain('speechRate');
  });

  it('卡内 TTS 把 instructions / format / speed 送进 synthesizeTts', () => {
    const src = readFileSync(resolve(webSrc, '../blocks/core/SoundGenBlock.tsx'), 'utf8');
    expect(src).toContain('synthesizeTts');
    expect(src).toContain('instructions:');
    expect(src).toContain('audioFormat');
    expect(src).toContain('speechRate');
  });
});
