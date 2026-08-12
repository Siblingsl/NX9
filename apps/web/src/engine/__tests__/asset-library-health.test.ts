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
    {
      id: 'builtin-sound-warm-narration',
      builtinKey: 'warm-narration',
      name: '温暖旁白',
      audioUrl: '',
      soundKind: 'voice',
    },
  ];

  it('按 Tab 给出真指标（非假零）', () => {
    const analysis = analyzeAssetLibraryHealth({
      characters,
      workspaceItems,
      sounds,
      styles: [
        { id: 'st1', name: '电影感', promptEn: '' },
        { id: 'st2', name: '电影感', promptEn: 'cinematic' },
      ],
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
    // 用户条目缺音频计 1；内置豁免
    expect(analysis.byTab.sound.find((m) => m.key === 'missingMedia')?.count).toBe(1);
    expect(analysis.byTab.style.find((m) => m.key === 'duplicate')?.count).toBe(2);
    expect(analysis.byTab.style.find((m) => m.key === 'missingPrompt')?.count).toBe(1);
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

  it('OL-04 节点引用计入未使用；OL-06 裸@可检出', () => {
    const analysis = analyzeAssetLibraryHealth({
      characters,
      workspaceItems,
      sounds,
      relationShots: [
        {
          id: 'sh2',
          sceneName: '茶馆',
          characterNames: [],
          visual: '镜头里有 @老陈 走过',
        },
      ],
      nodeUsages: [
        {
          nodeId: 'n1',
          nodeLabel: 'picture-gen · 出图',
          nodeType: 'picture-gen',
          kind: 'character',
          assetId: 'c3',
          label: '老陈',
        },
      ],
    });
    expect(analysis.nodeRelationCount).toBe(1);
    expect(analysis.byTab.character.find((m) => m.key === 'unused')?.itemIds).not.toContain('c3');
    expect(analysis.legacyBareMentions.length).toBeGreaterThan(0);
    expect(analysis.byTab.character.find((m) => m.key === 'legacyMention')?.count).toBeGreaterThan(0);
  });

  it('OL-01 usedAssetIds 含 id@rev 仍计为已使用', () => {
    const analysis = analyzeAssetLibraryHealth({
      characters,
      workspaceItems,
      sounds,
      relationShots: [
        { id: 'sh3', sceneName: '茶馆', characterNames: [], usedAssetIds: ['c3@2'] },
      ],
    });
    expect(analysis.byTab.character.find((m) => m.key === 'unused')?.itemIds).not.toContain('c3');
  });

  it('OL-05 服装/道具失效 id 可检出', () => {
    const analysis = analyzeAssetLibraryHealth({
      characters: [
        {
          id: 'c1',
          name: '林晓',
          consistencyPrompt: 'x',
          creative: { costumeId: 'missing-cos', costumeLabel: '失踪服' },
        },
      ],
      workspaceItems: [
        { id: 'sc1', kind: 'scene', label: '茶馆', promptEn: 't', creative: { propIds: ['gone-prop'] } },
      ],
      sounds: [],
      relationShots: [
        {
          id: 'sh1',
          sceneName: '茶馆',
          characterNames: ['林晓'],
          costumeOverrides: [{ characterName: '林晓', costumeId: 'missing-cos' }],
          propIds: ['gone-prop'],
        },
      ],
    });
    expect(analysis.invalidCostumeRefs.length).toBeGreaterThan(0);
    expect(analysis.invalidPropRefs.length).toBeGreaterThan(0);
    expect(analysis.byTab.costume.find((m) => m.key === 'invalidRef')?.count).toBeGreaterThan(0);
    expect(analysis.byTab.prop.find((m) => m.key === 'invalidRef')?.count).toBeGreaterThan(0);
  });
});
