import { describe, expect, it } from 'vitest';
import type { BacklotWorkspaceItem, CharacterProfile } from '@nx9/shared';
import {
  analyzeAssetLibraryHealth,
  buildAssetUsageIndex,
} from '../asset-library-health';

describe('OL-05 shot/style invalid + OL-14 usage index', () => {
  it('检出失效 shotAssetId / styleAssetId', () => {
    const workspaceItems: BacklotWorkspaceItem[] = [
      { id: 'shot-live', kind: 'shot', label: '推镜', promptEn: 'dolly in' },
    ];
    const analysis = analyzeAssetLibraryHealth({
      characters: [],
      workspaceItems,
      sounds: [],
      styles: [{ id: 'st-live', name: '线稿', promptEn: 'line' }],
      relationShots: [
        { id: 'sh1', shotAssetId: 'shot-missing', sceneName: '茶馆', characterNames: [] },
        { id: 'sh2', shotAssetId: 'shot-live', sceneName: '茶馆', characterNames: [] },
      ],
      previewStyleRefs: [
        { frameId: 'f1', shotId: 'sh1', styleAssetId: 'st-missing', label: '旧风格' },
        { frameId: 'f2', shotId: 'sh2', styleAssetId: 'st-live' },
      ],
    });
    expect(analysis.invalidShotRefs.some((r) => r.oldId === 'shot-missing')).toBe(true);
    expect(analysis.invalidShotRefs.some((r) => r.oldId === 'shot-live')).toBe(false);
    expect(analysis.invalidStyleRefs.some((r) => r.oldId === 'st-missing')).toBe(true);
    expect(analysis.byTab.shot.find((m) => m.key === 'invalidRef')?.count).toBe(1);
    expect(analysis.byTab.style.find((m) => m.key === 'invalidRef')?.count).toBe(1);
  });

  it('OL-19 角色 soundAssetId 失效可检出', () => {
    const characters: CharacterProfile[] = [
      { id: 'c1', name: '林晓', consistencyPrompt: 'x', soundAssetId: 'snd-gone' },
    ];
    const analysis = analyzeAssetLibraryHealth({
      characters,
      workspaceItems: [],
      sounds: [{ id: 'snd-ok', name: '旁白', audioUrl: 'a.mp3', soundKind: 'voice' }],
      relationShots: [],
    });
    expect(analysis.invalidSoundRefs).toHaveLength(1);
    expect(analysis.byTab.sound.find((m) => m.key === 'invalidRef')?.count).toBe(1);
  });

  it('镜头/风格 unused 按绑定口径', () => {
    const analysis = analyzeAssetLibraryHealth({
      characters: [],
      workspaceItems: [
        { id: 'shot-used', kind: 'shot', label: '推', promptEn: 'a' },
        { id: 'shot-idle', kind: 'shot', label: '拉', promptEn: 'b' },
      ],
      sounds: [],
      styles: [
        { id: 'st-used', name: '用过', promptEn: 'x' },
        { id: 'st-idle', name: '闲置', promptEn: 'y' },
      ],
      relationShots: [{ id: 'sh1', shotAssetId: 'shot-used', characterNames: [] }],
      previewStyleRefs: [{ frameId: 'f1', styleAssetId: 'st-used' }],
    });
    expect(analysis.byTab.shot.find((m) => m.key === 'unused')?.itemIds).toContain('shot-idle');
    expect(analysis.byTab.shot.find((m) => m.key === 'unused')?.itemIds).not.toContain('shot-used');
    expect(analysis.byTab.style.find((m) => m.key === 'unused')?.itemIds).toContain('st-idle');
    expect(analysis.byTab.style.find((m) => m.key === 'unused')?.itemIds).not.toContain('st-used');
  });

  it('OL-19 成片轨 soundAssetId 计入声音 unused', () => {
    const analysis = analyzeAssetLibraryHealth({
      characters: [],
      workspaceItems: [],
      sounds: [
        { id: 'snd-used', name: '对白', audioUrl: 'a.mp3', soundKind: 'voice' },
        { id: 'snd-idle', name: '闲置', audioUrl: 'b.mp3', soundKind: 'voice' },
      ],
      relationShots: [],
      timelineSoundIds: ['snd-used'],
    });
    expect(analysis.byTab.sound.find((m) => m.key === 'unused')?.itemIds).toContain('snd-idle');
    expect(analysis.byTab.sound.find((m) => m.key === 'unused')?.itemIds).not.toContain('snd-used');
  });
});
