import { describe, expect, it } from 'vitest';
import {
  buildMediaPinNodeData,
  resolveMediaPinItems,
  syncMediaPinNodeFields,
} from '@nx9/shared';

describe('media pin multi-item compatibility', () => {
  it('reads legacy single-pin data as one item', () => {
    const data = buildMediaPinNodeData({
      url: '/media/images/legacy.png',
      source: 'generated',
      label: '生成 1',
      pinKind: 'picture',
    });

    const items = resolveMediaPinItems(data as unknown as Record<string, unknown>);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: '/media/images/legacy.png',
      pinKind: 'picture',
      label: '生成 1',
    });
  });

  it('syncs the first item into legacy downstream fields', () => {
    const next = syncMediaPinNodeFields(
      [
        { id: 'a', url: '/media/images/a.png', pinKind: 'picture' },
        { id: 'b', url: '/media/audio/b.mp3', pinKind: 'sound' },
      ],
      { pinSource: 'local' },
    );

    expect(next.pinItems).toHaveLength(2);
    expect(next).toMatchObject({
      pinUrl: '/media/images/a.png',
      assetUrl: '/media/images/a.png',
      previewUrl: '/media/images/a.png',
      pinKind: 'picture',
      status: 'done',
      expanded: true,
    });
    expect(resolveMediaPinItems(next)).toHaveLength(2);
  });

  it('keeps text inline while hiding it from picture preview fields', () => {
    const next = syncMediaPinNodeFields([
      { id: 'text', url: '/media/uploads/note.md', pinKind: 'text', textContent: '# brief' },
    ]);

    expect(next.previewUrl).toBe('');
    expect(next.textContent).toBe('# brief');
    expect(resolveMediaPinItems(next)[0]?.textContent).toBe('# brief');
  });
});
