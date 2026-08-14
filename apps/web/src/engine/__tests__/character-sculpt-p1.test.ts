import { describe, expect, it } from 'vitest';
import { emptyFaceRig, setFaceRigSideValue, setFaceRigValue } from '@nx9/shared';
import {
  P1_VIEWPORT_PARAM_IDS,
  applyFaceRigToObject,
  assertSculptMeshContract,
  createBareSculptRoot,
  createProxyCharacter,
  readBoneScale,
  readMorphInfluence,
} from '@nx9/director3d';

describe('捏模 P1 · 代理网格契约', () => {
  it('覆盖视口切片 6 项，且不把未实现参数标成已映射', () => {
    const root = createProxyCharacter();
    const report = assertSculptMeshContract(root, 'proxy');
    expect(report.viewportSliceMapped).toBe(true);
    for (const id of P1_VIEWPORT_PARAM_IDS) {
      expect(report.mappedParamIds).toContain(id);
    }
    expect(report.mappedParamIds).not.toContain('upperLipThickness');
    expect(report.missingParamIds).toContain('upperLipThickness');
  });

  it('proxy 豁免身份 morph ≥ 12 的表情头判定', () => {
    const root = createProxyCharacter();
    const report = assertSculptMeshContract(root, 'proxy');
    expect(report.warnings.some((w) => w.includes('表情头'))).toBe(false);
  });

  it('代理头含左右下颌 morph，契约计数 12', () => {
    const root = createProxyCharacter();
    const report = assertSculptMeshContract(root, 'proxy');
    expect(report.morphTargetCount).toBe(12);
    applyFaceRigToObject(root, setFaceRigSideValue(emptyFaceRig(), 'jawWidth', 'L', 100));
    expect(readMorphInfluence(root, 'jawWidth', 'pos', 'L')).toBe(1);
    expect(readMorphInfluence(root, 'jawWidth', 'pos', 'R')).toBe(0);
  });
});

describe('捏模 P1 · applyFaceRigToObject', () => {
  it('下颌宽正值写入 .pos，负值写入 .neg', () => {
    const root = createProxyCharacter();
    applyFaceRigToObject(root, setFaceRigValue(emptyFaceRig(), 'jawWidth', 100));
    expect(readMorphInfluence(root, 'jawWidth', 'pos')).toBe(1);
    expect(readMorphInfluence(root, 'jawWidth', 'neg')).toBe(0);

    applyFaceRigToObject(root, setFaceRigValue(emptyFaceRig(), 'jawWidth', -60));
    expect(readMorphInfluence(root, 'jawWidth', 'pos')).toBe(0);
    expect(readMorphInfluence(root, 'jawWidth', 'neg')).toBeCloseTo(0.6);
  });

  it('切片 4 个 morph 都能写 influence', () => {
    const root = createProxyCharacter();
    let rig = emptyFaceRig();
    rig = setFaceRigValue(rig, 'faceLength', 50);
    rig = setFaceRigValue(rig, 'eyeSpacing', -40);
    rig = setFaceRigValue(rig, 'noseBridgeHeight', 80);
    applyFaceRigToObject(root, rig);
    expect(readMorphInfluence(root, 'faceLength', 'pos')).toBeCloseTo(0.5);
    expect(readMorphInfluence(root, 'eyeSpacing', 'neg')).toBeCloseTo(0.4);
    expect(readMorphInfluence(root, 'noseBridgeHeight', 'pos')).toBeCloseTo(0.8);
  });

  it('身高感均匀缩放 Root，肩宽只改 Clavicle X', () => {
    const root = createProxyCharacter();
    let rig = emptyFaceRig();
    rig = setFaceRigValue(rig, 'heightFeel', 100);
    rig = setFaceRigValue(rig, 'shoulderWidth', -100);
    applyFaceRigToObject(root, rig);

    const rootScale = readBoneScale(root, 'Root');
    expect(rootScale?.x).toBeCloseTo(1.12);
    expect(rootScale?.y).toBeCloseTo(1.12);
    expect(rootScale?.z).toBeCloseTo(1.12);

    const clav = readBoneScale(root, 'Clavicle.L');
    expect(clav?.x).toBeCloseTo(0.82);
    expect(clav?.y).toBe(1);
  });

  it('未接入项不抛，也不误写 morph', () => {
    const root = createProxyCharacter();
    expect(() => {
      applyFaceRigToObject(root, setFaceRigValue(emptyFaceRig(), 'upperLipThickness', 80));
    }).not.toThrow();
    expect(readMorphInfluence(root, 'upperLipThickness', 'pos')).toBeUndefined();
  });

  it('缺失 morph 的网格不抛', () => {
    const root = createBareSculptRoot();
    expect(() => {
      applyFaceRigToObject(root, setFaceRigValue(emptyFaceRig(), 'jawWidth', 80));
    }).not.toThrow();
  });

  it('全 0 时 morph 与骨都回到基模', () => {
    const root = createProxyCharacter();
    applyFaceRigToObject(root, setFaceRigValue(emptyFaceRig(), 'jawWidth', 80));
    applyFaceRigToObject(root, emptyFaceRig());
    expect(readMorphInfluence(root, 'jawWidth', 'pos')).toBe(0);
    expect(readMorphInfluence(root, 'jawWidth', 'neg')).toBe(0);
    const rootScale = readBoneScale(root, 'Root');
    expect(rootScale?.x).toBe(1);
    expect(rootScale?.y).toBe(1);
  });
});
