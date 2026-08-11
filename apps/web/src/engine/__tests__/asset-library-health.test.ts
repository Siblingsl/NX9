/**
 * 素材库健康检查 H-01
 */
import { describe, expect, it } from 'vitest';
import type { BacklotWorkspaceItem, CharacterProfile, SoundAssetProfile } from '@nx9/shared';
import { analyzeAssetLibraryHealth, healthFilterItemIds } from '../asset-library-health';

describe('analyzeAssetLibraryHealth', () => {
  const characters: CharacterProfile[] = [
    { id: 'c1', name: '林晓', consistencyPrompt: 'face lock' },
    { id: 'c2', name: '林晓', consistencyPrompt: '' },
    { id: 'c3', name: '老陈', consistencyPrompt: 'ok', creative: { consistency: { locked: true }, costumeId: 'cos-1' } },
  ];
  const workspaceItems: BacklotWorkspaceItem[] = [
    { id: 'sc1', kind: 'scene', label: '茶馆', promptEn: 'teahouse' },
    { id: 'cos-1', kind: 'costume', label: '青衫', promptEn: '' },
    { id: 'prop-1', kind: 'prop', label: '茶杯', promptEn: 'cup' },
  ];
  const sounds: SoundAssetProfile[] = [
    { id: 's1', name: '旁白', audioUrl: '', soundKind: 'voice' },
  ];

  it('按 Tab 给出真指标（非假零）', () => {
    const analysis = analyzeAssetLibraryHealth({
      characters,
      workspaceItems,
      sounds,
      relationShots: [
        { id: 'sh1', sceneName: '茶馆', characterNames: ['林晓', '不存在'] },
      ],
    });
    expect(analysis.byTab.character.find((m) => m.key === 'duplicate')?.count).toBeGreaterThan(0);
    expect(analysis.byTab.character.find((m) => m.key === 'missingPrompt')?.count).toBeGreaterThan(0);
    expect(analysis.byTab.character.find((m) => m.key === 'invalidRef')?.count).toBe(1);
    expect(analysis.byTab.costume.find((m) => m.key === 'unbound')?.count).toBe(0);
    expect(analysis.byTab.costume.find((m) => m.key === 'missingMedia')?.count).toBe(1);
    expect(analysis.byTab.prop.find((m) => m.key === 'unused')?.count).toBe(1);
    expect(analysis.byTab.sound.find((m) => m.key === 'missingMedia')?.count).toBe(1);
  });

  it('healthFilterItemIds 可过滤条目', () => {
    const analysis = analyzeAssetLibraryHealth({
      characters,
      workspaceItems,
      sounds,
      relationShots: [],
    });
    const ids = healthFilterItemIds(analysis, 'sound', 'missingMedia');
    expect(ids?.has('s1')).toBe(true);
  });
});
