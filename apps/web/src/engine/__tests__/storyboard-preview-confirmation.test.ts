import { describe, expect, it } from 'vitest';
import { emptyStoryboardPreview, type StoryboardPreviewFrame } from '@nx9/shared';
import { previewNodePatch } from '../stage-deck/chrome/attached-workspace/storyboard-preview/useStoryboardPreviewState';

const frame: StoryboardPreviewFrame = {
  id: 'f1',
  order: 1,
  label: 'Shot01',
  startSec: 0,
  endSec: 2,
  sourceShotId: 'shot-1',
  promptSummary: '',
  status: 'success',
  locked: false,
  imageUrl: '/shot.png',
};

describe('SB-OL-02 嵌入预览写回剥集级确认', () => {
  it('previewNodePatch 同步 stripEpisodeConfirmation', () => {
    const patch = previewNodePatch(
      emptyStoryboardPreview(),
      [frame],
      undefined,
      undefined,
      {
        confirmedEpisodeIds: ['ep-1', 'ep-2'],
        gridConfirmed: true,
        chainStoryboard: {
          version: 2,
          shots: [],
          confirmedEpisodeIds: ['ep-1', 'ep-2'],
          gridConfirmed: true,
        },
      },
      'ep-1',
    );
    expect(patch.storyboardPreview.confirmed).toBe(false);
    expect(patch.confirmedEpisodeIds).toEqual(['ep-2']);
    expect(patch.gridConfirmed).toBe(false);
    expect(
      (patch.chainStoryboard as { confirmedEpisodeIds?: string[]; gridConfirmed?: boolean } | undefined)
        ?.confirmedEpisodeIds,
    ).toEqual(['ep-2']);
  });
});
