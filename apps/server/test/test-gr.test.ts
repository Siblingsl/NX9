import { describe, it, expect } from 'vitest';

describe('TEST-GR — Grid Service (pure function tests)', () => {

  it('TEST-GR-001: POST /api/grid/generate — line-art prompt construction', () => {
    const LINE_ART_SUFFIX = 'black and white storyboard sketch, clean pencil line art, no color, no shading, composition guide only, film storyboard panel, white background';

    const buildLineArtGridPrompt = (scenePrompt: string, rows: number, cols: number): string => {
      return [scenePrompt.trim(), `${rows}x${cols} panel grid layout, numbered panels left-to-right top-to-bottom,`, 'consistent character silhouettes across panels,', LINE_ART_SUFFIX].filter(Boolean).join(' ');
    };

    const prompt = buildLineArtGridPrompt('FIXTURE coffee shop interior', 3, 3);
    expect(prompt).toContain('3x3 panel grid layout');
    expect(prompt).toContain('black and white storyboard sketch');
    expect(prompt).toContain('FIXTURE coffee shop interior');
    expect(prompt).toContain('consistent character silhouettes');
  });

  it('TEST-GR-004: POST /api/grid/shot-sketch — shot prompt construction', () => {
    const LINE_ART_SUFFIX = 'black and white storyboard sketch, clean pencil line art, no color, no shading, composition guide only, film storyboard panel, white background';

    const buildLineArtShotPrompt = (shotDescription: string, shotType?: string): string => {
      return [shotDescription.trim(), shotType ? `${shotType} shot,` : '', LINE_ART_SUFFIX].filter(Boolean).join(' ');
    };

    const prompt = buildLineArtShotPrompt('FIXTURE 咖啡馆特写', 'CU');
    expect(prompt).toContain('CU shot');
    expect(prompt).toContain('black and white storyboard sketch');

    const promptNoType = buildLineArtShotPrompt('FIXTURE 咖啡馆场景');
    expect(promptNoType).not.toContain('shot');
  });

  it('TEST-GR-002: POST /api/grid/split — cell dimension calculation', () => {
    const calcCellDims = (imageW: number, imageH: number, rows: number, cols: number) => {
      return { cellW: Math.floor(imageW / cols), cellH: Math.floor(imageH / rows) };
    };
    const dims = calcCellDims(1024, 768, 3, 3);
    expect(dims.cellW).toBe(341);
    expect(dims.cellH).toBe(256);
    const dims2 = calcCellDims(800, 600, 2, 2);
    expect(dims2.cellW).toBe(400);
    expect(dims2.cellH).toBe(300);
  });

  it('TEST-GR-003: POST /api/grid/compose — composite layout calculation', () => {
    const calcComposites = (metas: { w: number; h: number }[], rows: number, cols: number) => {
      const count = Math.min(metas.length, rows * cols);
      const cellW = Math.max(...metas.slice(0, count).map((m) => m.w));
      const cellH = Math.max(...metas.slice(0, count).map((m) => m.h));
      const positions: { left: number; top: number }[] = [];
      for (let i = 0; i < count; i++) {
        positions.push({ left: (i % cols) * cellW, top: Math.floor(i / cols) * cellH });
      }
      return { canvasW: cellW * cols, canvasH: cellH * rows, positions };
    };
    const result = calcComposites([{ w: 300, h: 200 }, { w: 320, h: 180 }, { w: 310, h: 220 }], 2, 2);
    expect(result.canvasW).toBe(640);
    expect(result.canvasH).toBe(440);
    expect(result.positions).toHaveLength(3);
    expect(result.positions[0]).toEqual({ left: 0, top: 0 });
    expect(result.positions[1]).toEqual({ left: 320, top: 0 });
    expect(result.positions[2]).toEqual({ left: 0, top: 220 });
  });

  it('TEST-GR-005: POST /api/grid/shot-sketch — art style override', () => {
    const buildShotPrompt = (desc: string, shotType?: string, artStyle?: string): string => {
      const LINE_ART_SUFFIX = 'black and white storyboard sketch, clean pencil line art, no color, no shading, composition guide only, film storyboard panel, white background';
      const base = [desc.trim(), shotType ? `${shotType} shot,` : '', LINE_ART_SUFFIX].filter(Boolean).join(' ');
      return artStyle ? `${base}, ${artStyle}` : base;
    };
    const withStyle = buildShotPrompt('FIXTURE 咖啡馆场景', 'MS', 'watercolor style, soft lighting');
    expect(withStyle).toContain('MS shot');
    expect(withStyle).toContain('watercolor style');
    const withoutStyle = buildShotPrompt('FIXTURE 咖啡馆场景', 'CU');
    expect(withoutStyle).toContain('CU shot');
    expect(withoutStyle).not.toContain('watercolor');
  });
});
