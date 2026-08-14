import { describe, expect, it } from 'vitest';
import { emptyFaceRig, setFaceRigSideValue } from '@nx9/shared';
import {
  SCULPT_HANDLES,
  applyFaceRigToObject,
  applyHandleDrag,
  clampFaceRigValue,
  createProxyCharacter,
  handleDefById,
  handleDefByName,
  readMorphInfluence,
} from '@nx9/director3d';

describe('捏模 P2 · 控制点定义', () => {
  it('覆盖切片 6 项与左右手柄命名契约', () => {
    const ids = SCULPT_HANDLES.map((h) => h.id);
    expect(ids).toContain('jaw.L');
    expect(ids).toContain('jaw.R');
    expect(ids).toContain('eyeSpacing.L');
    expect(ids).toContain('eyeSpacing.R');
    expect(ids).toContain('noseBridge');
    expect(ids).toContain('hairline');
    expect(ids).toContain('shoulder.L');
    expect(ids).toContain('shoulder.R');
    expect(ids).toContain('heightFeel');

    const jawL = handleDefByName('Handle.Jaw.L');
    expect(jawL?.paramId).toBe('jawWidth');
    expect(jawL?.side).toBe('L');
    expect(handleDefById('not-exist')).toBeUndefined();
  });

  it('y 轴向上为正：上移增加纵向参数', () => {
    const nose = handleDefById('noseBridge');
    const hairline = handleDefById('hairline');
    expect(nose?.axis).toBe('y');
    expect(hairline?.axis).toBe('y');
    expect(applyHandleDrag(emptyFaceRig(), 'noseBridge', 0, 10).values?.nose?.noseBridgeHeight).toBe(5);
    expect(applyHandleDrag(emptyFaceRig(), 'hairline', 0, 10).values?.shape?.faceLength).toBe(4);
  });
});

describe('捏模 P2 · 对称 / 非对称拖拽', () => {
  it('对称模式拖单侧手柄写基础值并清 per-side', () => {
    let rig = setFaceRigSideValue(emptyFaceRig(), 'jawWidth', 'L', 80);
    const next = applyHandleDrag(rig, 'jaw.L', 10, 0);
    expect(next.sideValues).toBeUndefined();
    expect(next.values?.shape?.jawWidth).toBe(5);
  });

  it('解锁后拖单侧写 sideValues 并登记 asymmetric', () => {
    const next = applyHandleDrag(emptyFaceRig(), 'jaw.L', 10, 0, { symmetric: false });
    expect(next.asymmetric).toContain('jawWidth');
    expect(next.sideValues?.jawWidth?.L).toBe(5);
    expect(next.sideValues?.jawWidth?.R).toBeUndefined();
    expect(next.values?.shape?.jawWidth).toBeUndefined();
  });

  it('多次拖拽叠加，边界夹到 ±100', () => {
    let rig = emptyFaceRig();
    for (let i = 0; i < 30; i += 1) rig = applyHandleDrag(rig, 'jaw.L', 100, 0);
    expect(rig.values?.shape?.jawWidth).toBe(100);
    expect(clampFaceRigValue(999)).toBe(100);
    expect(clampFaceRigValue(-999)).toBe(-100);
  });

  it('未知手柄不改动 rig', () => {
    const rig = emptyFaceRig();
    expect(applyHandleDrag(rig, 'nope', 10, 0)).toEqual(rig);
  });
});

describe('捏模 P2 · sideValues 驱动代理 L/R morph', () => {
  it('对称拖拽同时驱动左右下颌', () => {
    const root = createProxyCharacter();
    const rig = applyHandleDrag(emptyFaceRig(), 'jaw.L', 100, 0);
    applyFaceRigToObject(root, rig);
    expect(readMorphInfluence(root, 'jawWidth', 'pos')).toBeCloseTo(0.45);
    expect(readMorphInfluence(root, 'jawWidth', 'pos', 'L')).toBeCloseTo(0.45);
    expect(readMorphInfluence(root, 'jawWidth', 'pos', 'R')).toBeCloseTo(0.45);
  });

  it('解锁单侧只改该侧，另一侧回退基础值', () => {
    const root = createProxyCharacter();
    const rig = applyHandleDrag(emptyFaceRig(), 'jaw.L', 100, 0, { symmetric: false });
    applyFaceRigToObject(root, rig);
    expect(readMorphInfluence(root, 'jawWidth', 'pos', 'L')).toBeCloseTo(0.45);
    expect(readMorphInfluence(root, 'jawWidth', 'pos', 'R')).toBe(0);
  });

  it('两侧不同值时分别写对应 morph', () => {
    const root = createProxyCharacter();
    let rig = setFaceRigSideValue(emptyFaceRig(), 'jawWidth', 'L', 100);
    rig = setFaceRigSideValue(rig, 'jawWidth', 'R', -60);
    applyFaceRigToObject(root, rig);
    expect(readMorphInfluence(root, 'jawWidth', 'pos', 'L')).toBe(1);
    expect(readMorphInfluence(root, 'jawWidth', 'pos', 'R')).toBe(0);
    expect(readMorphInfluence(root, 'jawWidth', 'neg', 'R')).toBeCloseTo(0.6);
  });
});
