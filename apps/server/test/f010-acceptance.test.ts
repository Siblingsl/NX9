/**
 * F-010 回收站验收（项目 + 资产软删）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ASSET_TRASH_RETENTION_MS,
  createMediaTrashItem,
  daysRemainingInTrash,
  filterActiveAssets,
  filterTrashedAssets,
  isAssetActive,
  isAssetTrashed,
  purgeAssetById,
  purgeExpiredAssets,
  restoreAssetById,
  softDeleteAssetById,
} from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const webSrc = resolve(root, 'apps/web/src');
const serverSrc = resolve(root, 'apps/server/src');

function read(rel: string) {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('F-010 资产软删核心', () => {
  it('软删后活跃列表不可见、回收站可见', () => {
    const now = Date.now();
    let items = [
      { id: 'a', name: '甲' },
      { id: 'b', name: '乙' },
    ];
    items = softDeleteAssetById(items, 'a', now);
    expect(isAssetActive(items[0])).toBe(false);
    expect(isAssetTrashed(items[0], now)).toBe(true);
    expect(filterActiveAssets(items)).toHaveLength(1);
    expect(filterActiveAssets(items)[0].id).toBe('b');
    expect(filterTrashedAssets(items, now)).toHaveLength(1);
    expect(filterTrashedAssets(items, now)[0].id).toBe('a');
  });

  it('恢复清除 deletedAt', () => {
    const now = Date.now();
    let items = softDeleteAssetById([{ id: 'a' }], 'a', now);
    const restored = restoreAssetById(items, 'a');
    expect(restored.items[0].deletedAt).toBeUndefined();
    expect(isAssetActive(restored.items[0])).toBe(true);
  });

  it('彻底删除后不可恢复', () => {
    const now = Date.now();
    let items = softDeleteAssetById([{ id: 'a' }, { id: 'b' }], 'a', now);
    items = purgeAssetById(items, 'a');
    expect(items.find((x) => x.id === 'a')).toBeUndefined();
    const again = restoreAssetById(items, 'a');
    expect(again.items.find((x) => x.id === 'a')).toBeUndefined();
  });

  it('≥30 天自动 purge', () => {
    const now = Date.now();
    const expiredAt = now - ASSET_TRASH_RETENTION_MS - 1000;
    const freshAt = now - 1000;
    const { items, purgedCount } = purgeExpiredAssets(
      [
        { id: 'old', deletedAt: expiredAt },
        { id: 'new', deletedAt: freshAt },
        { id: 'active' },
      ],
      now,
    );
    expect(purgedCount).toBe(1);
    expect(items.map((x) => x.id).sort()).toEqual(['active', 'new']);
    expect(daysRemainingInTrash(freshAt, now)).toBeGreaterThan(0);
  });

  it('恢复时 id 冲突可重命名', () => {
    const now = Date.now();
    const items = [
      { id: 'a', deletedAt: now },
      { id: 'a' }, // 活跃冲突（理论边界）
    ];
    // soft-delete map keeps both with same id — restore with allocId
    const result = restoreAssetById(
      [{ id: 'a', deletedAt: now }],
      'a',
      () => 'a-renamed',
    );
    expect(result.restoredId).toBe('a');
    expect(result.conflictRenamed).toBe(false);
    expect(result.items[0].deletedAt).toBeUndefined();
  });

  it('生成媒体软删项可进回收站窗口', () => {
    const item = createMediaTrashItem({
      url: '/uploads/gen.png',
      label: '生成图 1',
      sourceBlockId: 'blk-1',
      now: Date.now(),
    });
    expect(item.mediaKind).toBe('picture');
    expect(isAssetTrashed(item)).toBe(true);
    expect(filterTrashedAssets([item])).toHaveLength(1);
  });
});

describe('F-010 接线与入口', () => {
  it('共享模块导出 asset-trash 工具', () => {
    const index = read('packages/shared/src/index.ts');
    expect(index).toContain("from './utils/asset-trash'");
    expect(index).toContain('softDeleteAssetById');
  });

  it('私有库删除走软删 + 回收站确认文案', () => {
    const store = readFileSync(resolve(webSrc, 'stores/workspace-document.ts'), 'utf8');
    expect(store).toContain('softDeleteAssetById');
    expect(store).toContain('purgeExpiredTrashedAssets');
    expect(store).toContain('restoreCharacter');
    expect(store).toContain('trashGeneratedMedia');

    const pictureWs = readFileSync(
      resolve(webSrc, 'engine/stage-deck/chrome/attached-workspace/generation/picture/PictureWorkspace.tsx'),
      'utf8',
    );
    expect(pictureWs).toContain('trashGeneratedMedia');
    expect(pictureWs).toContain('已移入资产回收站');

    const modal = readFileSync(resolve(webSrc, 'panels/AssetLibraryModal.tsx'), 'utf8');
    expect(modal).toContain('移入回收站');
    expect(modal).toContain('AssetTrashPanel');

    const trash = readFileSync(resolve(webSrc, 'panels/AssetTrashPanel.tsx'), 'utf8');
    expect(trash).toContain('资产回收站');
    expect(trash).toContain('filterTrashedAssets');
    expect(trash).toContain('mediaTrash');
  });

  it('画布顶栏 / 命令面板有资产回收站入口', () => {
    const shell = readFileSync(resolve(webSrc, 'layout/canvas-stage/CanvasStageShell.tsx'), 'utf8');
    expect(shell).toContain('onOpenTrash');
    expect(shell).toContain('资产回收站');

    const trashModal = readFileSync(resolve(webSrc, 'panels/AssetTrashModal.tsx'), 'utf8');
    expect(trashModal).toContain('AssetTrashPanel');

    const trash = readFileSync(resolve(webSrc, 'panels/AssetTrashPanel.tsx'), 'utf8');
    expect(trash).toContain('grid-cols-');
    expect(trash).toContain('aspect-square');

    const settings = readFileSync(resolve(webSrc, 'panels/SettingsModal.tsx'), 'utf8');
    expect(settings).not.toContain("'trash'");
    expect(settings).not.toContain('AssetTrashPanel');

    const palette = readFileSync(
      resolve(webSrc, 'engine/stage-deck/chrome/CommandPalette.tsx'),
      'utf8',
    );
    expect(palette).toContain('open-asset-trash');
    expect(palette).toContain('openAssetTrash(true)');
  });

  it('首页项目回收站 + Prisma 30 天 purge', () => {
    const home = readFileSync(resolve(webSrc, 'pages/HomeNavPage.tsx'), 'utf8');
    expect(home).toContain('TrashPanel');
    expect(home).toContain('移入回收站');

    const svc = readFileSync(resolve(serverSrc, 'modules/workspace/workspace.service.ts'), 'utf8');
    expect(svc).toContain('purgeExpiredTrash');
    expect(svc).toContain('listTrash');

    const prisma = readFileSync(
      resolve(serverSrc, 'modules/workspace/prisma-workspace.store.ts'),
      'utf8',
    );
    expect(prisma).toContain('purgeExpiredTrash');
    expect(prisma).toContain('deletedAt');
  });
});
