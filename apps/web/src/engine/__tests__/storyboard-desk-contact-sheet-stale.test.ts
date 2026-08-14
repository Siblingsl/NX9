import { describe, expect, it } from 'vitest';
import {
  buildDeskContactSheetSignature,
  deskSheetCellsFromBreakdownShots,
} from '../storyboard-sheet-compose';

type DeskShot = Parameters<typeof deskSheetCellsFromBreakdownShots>[0][number];

function shot(id: string, index: number, url: string | null): DeskShot {
  return {
    id,
    index,
    durationSec: 3,
    previewImageUrl: url,
    referenceImageUrl: url,
  };
}

describe('SB-D-03 故事板大图过期签名', () => {
  it('清线稿后该镜缺图且签名变化', () => {
    const shots = [shot('s1', 1, 'https://mock/line-1.png'), shot('s2', 2, 'https://mock/line-2.png')];
    const before = buildDeskContactSheetSignature(deskSheetCellsFromBreakdownShots(shots, {}));

    const cleared = [
      { ...shots[0], previewImageUrl: null, referenceImageUrl: null },
      shots[1],
    ];
    const cells = deskSheetCellsFromBreakdownShots(cleared, {});
    expect(cells[0].imageUrl).toBeNull();
    expect(buildDeskContactSheetSignature(cells)).not.toBe(before);
  });

  it('删镜后镜头数量与签名均变化', () => {
    const shots = [shot('s1', 1, 'https://mock/line-1.png'), shot('s2', 2, 'https://mock/line-2.png')];
    const before = buildDeskContactSheetSignature(deskSheetCellsFromBreakdownShots(shots, {}));

    const afterDelete = deskSheetCellsFromBreakdownShots([shots[1]], {});
    expect(afterDelete).toHaveLength(1);
    expect(buildDeskContactSheetSignature(afterDelete)).not.toBe(before);
  });
});
