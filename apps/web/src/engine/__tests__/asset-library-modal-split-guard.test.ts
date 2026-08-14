/**
 * A11（DEEP-11 素材库）：AssetLibraryModal 巨石拆分守卫（2026-08-13）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AssetLibraryModal } from '../../panels/AssetLibraryModal';

const webSrc = resolve(__dirname, '..', '..');
const modalDir = resolve(webSrc, 'panels/asset-library/modal');

function readSource(rel: string) {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

describe('A11 AssetLibraryModal 拆分守卫', () => {
  it('主文件显著缩小且子模块齐备', () => {
    const mainLines = readSource('panels/AssetLibraryModal.tsx').split('\n').length;
    expect(mainLines).toBeLessThan(1200);
    const modalFiles = readdirSync(modalDir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(modalFiles).toEqual(
      expect.arrayContaining([
        'AssetLibraryModalContext.tsx',
        'AssetLibraryModalShell.tsx',
        'AssetLibraryModalContent.tsx',
        'AssetLibraryStatusRail.tsx',
        'AssetLibraryMainView.tsx',
        'AssetCharacterListView.tsx',
        'AssetEntityListView.tsx',
        'AssetShotListView.tsx',
        'AssetStyleListView.tsx',
        'AssetSoundListView.tsx',
        'AssetDetailCharacterView.tsx',
        'AssetDetailEntityView.tsx',
        'AssetDetailShotView.tsx',
        'AssetDetailStyleView.tsx',
        'AssetDetailSoundView.tsx',
        'AssetLibraryLegacyView.tsx',
        'meta.ts',
        'use-asset-library-catalog.ts',
        'use-asset-library-actions-core.ts',
        'use-asset-library-generation.ts',
        'use-asset-library-navigation.ts',
        'use-asset-library-effects.ts',
        'use-asset-library-modal-controller.ts',
      ]),
    );
  });

  it('分支实现已迁出主文件', () => {
    const main = readSource('panels/AssetLibraryModal.tsx');
    expect(main).not.toContain('const saveCharacter = useCallback');
    expect(main).not.toContain("const filtered = useMemo");
    expect(main).not.toContain('return createPortal(');
    expect(main).not.toContain('<CharacterDetailFields');
    expect(main).not.toContain("{tab === 'character' ? (");
    expect(main).not.toContain('const [query, setQuery] = useState');
  });

  it('各域锚点落在对应子模块', () => {
    const catalog = readSource('panels/asset-library/modal/use-asset-library-catalog.ts');
    const actions = readSource('panels/asset-library/modal/use-asset-library-actions-core.ts');
    const generation = readSource('panels/asset-library/modal/use-asset-library-generation.ts');
    const navigation = readSource('panels/asset-library/modal/use-asset-library-navigation.ts');
    const effects = readSource('panels/asset-library/modal/use-asset-library-effects.ts');
    const shell = readSource('panels/asset-library/modal/AssetLibraryModalShell.tsx');
    const statusRail = readSource('panels/asset-library/modal/AssetLibraryStatusRail.tsx');
    const mainView = readSource('panels/asset-library/modal/AssetLibraryMainView.tsx');
    const characterDetail = readSource('panels/asset-library/modal/AssetDetailCharacterView.tsx');
    const entityDetail = readSource('panels/asset-library/modal/AssetDetailEntityView.tsx');

    expect(catalog).toContain('const filtered = useMemo');
    expect(catalog).toContain('healthFilterItemIds');
    expect(actions).toContain('const saveCharacter = useCallback');
    expect(actions).toContain('const handleDelete = useCallback');
    expect(actions).toContain('const handleBatchSetLock = useCallback');
    expect(generation).toContain('const generateCostumeSheets = useCallback');
    expect(generation).toContain('const generateCharacterMasterSheet = useCallback');
    expect(navigation).toContain('const jumpToAsset = useCallback');
    expect(navigation).toContain('const handleScopeChange = useCallback');
    expect(effects).toContain('useEffect(() => {');
    expect(shell).toContain('return createPortal(');
    expect(shell).toContain('nx9-asset-library-modal');
    expect(statusRail).toContain('SHOT_LEXICON_SYSTEMS');
    expect(statusRail).toContain('仅收藏');
    expect(mainView).toContain('AssetDetailCharacterView');
    expect(characterDetail).toContain('<CharacterDetailFields');
    expect(entityDetail).toContain('<CostumeDetailFields');
  });

  it('AppShell 依赖的模块入口契约保留', () => {
    expect(typeof AssetLibraryModal).toBe('function');
  });
});
