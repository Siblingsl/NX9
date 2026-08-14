import { describe, expect, it } from 'vitest';
import { Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import { emptyFaceRig, setFaceRigValue } from '@nx9/shared';
import {
  applyFaceRigToObject,
  applyMaterialDriver,
  assertSculptMeshContract,
  collectMaterialChannels,
  createBareSculptRoot,
} from '@nx9/director3d';

function materialRoot(): Group {
  const root = new Group();
  const skin = new MeshStandardMaterial({ name: 'Skin', roughness: 0.5, emissiveIntensity: 0.1 });
  const iris = new MeshStandardMaterial({ name: 'Iris', emissiveIntensity: 0.2 });
  root.add(new Mesh(new SphereGeometry(0.1, 8, 8), skin));
  root.add(new Mesh(new SphereGeometry(0.02, 8, 8), iris));
  return root;
}

describe('B3 · material 驱动不再静默跳过', () => {
  it('有材质通道时驱动属性，中性恢复原值', () => {
    const root = materialRoot();
    const skin = collectMaterialChannels(root).get('skin')![0];
    const iris = collectMaterialChannels(root).get('iris')![0];
    const skinMaterial = skin as MeshStandardMaterial;
    const irisMaterial = iris as MeshStandardMaterial;
    applyFaceRigToObject(root, setFaceRigValue(emptyFaceRig(), 'skinTexture', 100));
    expect(skinMaterial.roughness).toBe(1);
    applyFaceRigToObject(root, setFaceRigValue(emptyFaceRig(), 'irisSize', 100));
    expect(irisMaterial.emissiveIntensity).toBeCloseTo(1.2);
    applyFaceRigToObject(root, emptyFaceRig());
    expect(skinMaterial.roughness).toBeCloseTo(0.5);
    expect(irisMaterial.emissiveIntensity).toBeCloseTo(0.2);
  });

  it('兼容报告把有通道参数标 mapped，缺通道标 missing', () => {
    const report = assertSculptMeshContract(materialRoot(), 'proxy');
    expect(report.mappedParamIds).toContain('skinTexture');
    expect(report.mappedParamIds).toContain('irisSize');
    expect(report.missingParamIds).toContain('browDensity');
    expect(report.missingParamIds).toContain('freckles');
  });

  it('无材质通道时不抛，applyMaterialDriver 返回 false，报告标 missing', () => {
    const root = createBareSculptRoot();
    expect(applyMaterialDriver(root, 'freckles', 1)).toBe(false);
    expect(() => applyFaceRigToObject(root, setFaceRigValue(emptyFaceRig(), 'freckles', 80))).not.toThrow();
    const report = assertSculptMeshContract(root, 'proxy');
    expect(report.missingParamIds).toContain('freckles');
  });
});
