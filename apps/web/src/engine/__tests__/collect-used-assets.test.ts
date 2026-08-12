import { describe, expect, it } from 'vitest';
import {
  collectUsedAssetIds,
  formatAssetPin,
  parseAssetPin,
  stripAssetPinRevision,
  expandUsedAssetIdSet,
  characterRevisionPinsFromUsed,
} from '@nx9/shared';

describe('collectUsedAssetIds / OL-01 pins', () => {
  it('合并绑定 id 与 @Mention 解析', () => {
    const ids = collectUsedAssetIds({
      prompt: 'a @角色:林晓 in @场景:茶馆',
      characterIds: ['c1'],
      sceneAssetId: 'sc-other',
      libraryItems: [
        { id: 'c1', kind: 'character', scope: 'private', label: '林晓', prompt: '' },
        { id: 'sc1', kind: 'scene', scope: 'private', label: '茶馆', prompt: '' },
      ],
    });
    expect(ids).toContain('c1');
    expect(ids).toContain('sc1');
    expect(ids).toContain('sc-other');
  });

  it('pinCharacterRevisions 写入 id@rev', () => {
    const ids = collectUsedAssetIds({
      characterIds: ['c1'],
      characterRevisions: { c1: 3 },
      pinCharacterRevisions: true,
    });
    expect(ids).toEqual(['c1@3']);
    expect(stripAssetPinRevision(ids[0])).toBe('c1');
    expect(parseAssetPin(ids[0])).toEqual({ id: 'c1', revision: 3 });
    expect(formatAssetPin('c1', 1)).toBe('c1@1');
    expect(expandUsedAssetIdSet(ids).has('c1')).toBe(true);
    expect(characterRevisionPinsFromUsed(ids)).toEqual({ c1: 3 });
  });
});
