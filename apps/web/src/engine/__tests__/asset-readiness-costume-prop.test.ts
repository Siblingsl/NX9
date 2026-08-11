/**
 * Cos-01 / Prop-04：服装与道具预检对照本库 label
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BacklotWorkspaceItem, CharacterProfile, ScreenplayPackage } from '@nx9/shared';
import { emptyScreenplayPackage } from '@nx9/shared';

const libraryState = vi.hoisted(() => ({
  characters: [] as CharacterProfile[],
  backlotItems: [] as BacklotWorkspaceItem[],
}));

vi.mock('../../stores/workspace-document', () => ({
  useWorkspaceDocument: Object.assign(
    (selector?: (s: unknown) => unknown) => {
      const state = {
        characters: { characters: libraryState.characters },
        environments: { environments: [] },
        backlotWorkspace: { items: libraryState.backlotItems },
        upsertCharacter: vi.fn(),
        upsertBacklotWorkspace: vi.fn(),
      };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({
        characters: { characters: libraryState.characters },
        environments: { environments: [] },
        backlotWorkspace: { items: libraryState.backlotItems },
        upsertCharacter: vi.fn(),
        upsertBacklotWorkspace: vi.fn(),
      }),
    },
  ),
}));

import { extractCostumeNames, extractPropNames, inspectBibleAssets } from '../asset-readiness';

function pkgFixture(): ScreenplayPackage {
  const base = emptyScreenplayPackage();
  return {
    ...base,
    status: 'confirmed',
    bible: {
      ...base.bible,
      characters: [
        {
          id: 'c-1',
          name: '林晓',
          appearance: '身穿青衫长袍，发髻束带',
        },
      ],
      scenes: [
        {
          id: 's-1',
          name: '茶馆',
          summary: '道具：青花瓷杯；桌上有茶壶',
        },
      ],
    },
  };
}

describe('asset-readiness costume/prop library match', () => {
  beforeEach(() => {
    libraryState.characters = [];
    libraryState.backlotItems = [];
  });

  it('extractCostumeNames / extractPropNames 抽到片段', () => {
    const pkg = pkgFixture();
    expect(extractCostumeNames(pkg).some((n) => n.includes('青衫'))).toBe(true);
    expect(extractPropNames(pkg)).toContain('青花瓷杯');
  });

  it('服装缺口对照服装库，不再因角色名误过滤', () => {
    libraryState.characters = [
      {
        id: 'char-1',
        name: '林晓',
        consistencyPrompt: '',
      },
    ];
    const missing = inspectBibleAssets(pkgFixture()).missingCostumes ?? [];
    expect(missing.length).toBeGreaterThan(0);

    libraryState.backlotItems = [
      {
        id: 'cos-1',
        kind: 'costume',
        label: '青衫长袍',
        promptEn: 'qingshan robe',
      },
    ];
    const after = inspectBibleAssets(pkgFixture()).missingCostumes ?? [];
    expect(after).toHaveLength(0);
  });

  it('道具缺口对照道具库；建档后关闭', () => {
    const before = inspectBibleAssets(pkgFixture()).missingProps ?? [];
    expect(before).toContain('青花瓷杯');

    libraryState.backlotItems = [
      {
        id: 'prop-1',
        kind: 'prop',
        label: '青花瓷杯',
        promptEn: 'blue porcelain cup',
      },
    ];
    const after = inspectBibleAssets(pkgFixture()).missingProps ?? [];
    expect(after).not.toContain('青花瓷杯');
  });
});
