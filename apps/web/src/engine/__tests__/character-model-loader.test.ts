import { describe, expect, it, vi } from 'vitest';
import { createBareSculptRoot, createProxyCharacter, loadCharacterModel, validateCharacterAssetManifest } from '@nx9/director3d';
import type { Mesh } from 'three';

describe('B2 · 正式基模加载契约', () => {
  it('manifest 缺字段 / 版本不符时校验失败', () => {
    expect(validateCharacterAssetManifest({ version: 1 })).toMatchObject({ ok: false });
    expect(
      validateCharacterAssetManifest({ version: 2, meshContractVersion: 1, modelPath: 'x.glb' }),
    ).toMatchObject({ ok: false });
    expect(
      validateCharacterAssetManifest({ version: 1, meshContractVersion: 1, modelPath: 'x.glb' }),
    ).toMatchObject({ ok: true });
  });

  it('manifest 404 时回退代理并带警告', async () => {
    const loadGltf = vi.fn();
    const result = await loadCharacterModel({
      fetchManifest: async () => {
        throw new Error('manifest HTTP 404');
      },
      loadGltf,
    });
    expect(result.source).toBe('proxy');
    expect(loadGltf).not.toHaveBeenCalled();
    expect(result.warnings.join('')).toContain('回退代理');
    expect(result.root.name).toBe('CharacterRoot');
  });

  it('manifest 有效 + 契约合格时返回 builtin', async () => {
    const root = createProxyCharacter();
    const head = root.getObjectByName('HeadMesh') as Mesh;
    const extra = [
      'cheekboneWidth',
      'cheekFullness',
      'chinLength',
      'chinProject',
      'templeWidth',
      'eyeSize',
      'eyeTilt',
      'eyelidFold',
      'browArch',
      'browAngle',
      'browLength',
      'orbitDepth',
    ];
    extra.forEach((id, i) => {
      head.morphTargetDictionary![`${id}.pos`] = 100 + i;
    });
    const result = await loadCharacterModel({
      fetchManifest: async () => ({ version: 1, meshContractVersion: 1, modelPath: 'nx9-character-base.glb' }),
      loadGltf: async () => root,
    });
    expect(result.source).toBe('builtin');
    expect(result.warnings).toHaveLength(0);
  });

  it('契约不合格（表情头）强制回退代理', async () => {
    const result = await loadCharacterModel({
      fetchManifest: async () => ({ version: 1, meshContractVersion: 1, modelPath: 'nx9-character-base.glb' }),
      loadGltf: async () => createBareSculptRoot(),
    });
    expect(result.source).toBe('proxy');
    expect(result.warnings.some((w) => w.includes('未通过捏模契约'))).toBe(true);
  });
});
