/**
 * FACE-P3：捏模健康条三项指标与素材库台账挂接。
 */
import { describe, expect, it } from 'vitest';
import type { CharacterProfile } from '@nx9/shared';
import { NX9_SCULPT_MESH_CONTRACT_VERSION, emptyFaceRig, faceRigHash } from '@nx9/shared';
import { analyzeAssetLibraryHealth, assessCharacterFaceRigHealth, healthFilterItemIds } from '../asset-library-health';

function charWithCreative(creative: CharacterProfile['creative']): CharacterProfile {
  return {
    id: 'c1',
    name: '林默',
    creative,
  } as CharacterProfile;
}

describe('FACE-P3 · assessCharacterFaceRigHealth', () => {
  it('无 faceLockUrl → 未定妆', () => {
    const issues = assessCharacterFaceRigHealth(charWithCreative({}));
    expect(issues.map((i) => i.key)).toEqual(['faceRigNotRendered']);
  });

  it('有图但指纹不一致 → 定妆过期', () => {
    const rig = { ...emptyFaceRig(), renderedAt: 1, meshContractVersion: NX9_SCULPT_MESH_CONTRACT_VERSION };
    const issues = assessCharacterFaceRigHealth(
      charWithCreative({ faceLockUrl: 'https://cdn/face.png', faceRig: rig }),
    );
    expect(issues.map((i) => i.key)).toEqual(['faceRigMetricConflict']);
  });

  it('指纹一致但契约版本缺失 → 契约过期', () => {
    const rig = { ...emptyFaceRig(), renderedAt: 1, faceLockHash: faceRigHash(emptyFaceRig()) };
    const issues = assessCharacterFaceRigHealth(
      charWithCreative({ faceLockUrl: 'https://cdn/face.png', faceRig: rig }),
    );
    expect(issues.map((i) => i.key)).toEqual(['faceRigMeshStale']);
  });

  it('图、指纹、契约都一致 → 健康', () => {
    const rig = {
      ...emptyFaceRig(),
      renderedAt: 1,
      faceLockHash: faceRigHash(emptyFaceRig()),
      meshContractVersion: NX9_SCULPT_MESH_CONTRACT_VERSION,
    };
    const issues = assessCharacterFaceRigHealth(
      charWithCreative({ faceLockUrl: 'https://cdn/face.png', faceRig: rig }),
    );
    expect(issues).toEqual([]);
  });

  it('参数改动后健康条从绿变过期', () => {
    const rig = {
      ...emptyFaceRig(),
      renderedAt: 1,
      faceLockHash: faceRigHash(emptyFaceRig()),
      meshContractVersion: NX9_SCULPT_MESH_CONTRACT_VERSION,
    };
    const stale = { ...rig, values: { shape: { jawWidth: 40 } } };
    const issues = assessCharacterFaceRigHealth(
      charWithCreative({ faceLockUrl: 'https://cdn/face.png', faceRig: stale }),
    );
    expect(issues.map((i) => i.key)).toContain('faceRigMetricConflict');
  });
});

describe('FACE-P3 · 素材库台账挂接', () => {
  const characters: CharacterProfile[] = [
    charWithCreative({}),
    charWithCreative({
      faceLockUrl: 'u2',
      faceRig: { ...emptyFaceRig(), renderedAt: 1, meshContractVersion: NX9_SCULPT_MESH_CONTRACT_VERSION },
    }),
    charWithCreative({
      faceLockUrl: 'u3',
      faceRig: { ...emptyFaceRig(), renderedAt: 1, faceLockHash: faceRigHash(emptyFaceRig()) },
    }),
    charWithCreative({
      faceLockUrl: 'u4',
      faceRig: {
        ...emptyFaceRig(),
        renderedAt: 1,
        faceLockHash: faceRigHash(emptyFaceRig()),
        meshContractVersion: NX9_SCULPT_MESH_CONTRACT_VERSION,
      },
    }),
  ];

  it('character Tab 出现三项捏模指标且计数真实', () => {
    const analysis = analyzeAssetLibraryHealth({
      characters,
      workspaceItems: [],
      sounds: [],
      relationShots: [],
    });
    const tab = analysis.byTab.character;
    expect(tab.find((m) => m.key === 'faceRigNotRendered')?.count).toBe(1);
    expect(tab.find((m) => m.key === 'faceRigMetricConflict')?.count).toBe(1);
    expect(tab.find((m) => m.key === 'faceRigMeshStale')?.count).toBe(1);
  });

  it('healthFilterItemIds 可按捏模指标过滤角色', () => {
    const analysis = analyzeAssetLibraryHealth({
      characters,
      workspaceItems: [],
      sounds: [],
      relationShots: [],
    });
    const ids = healthFilterItemIds(analysis, 'character', 'faceRigNotRendered');
    expect(ids?.has('c1')).toBe(true);
  });
});
