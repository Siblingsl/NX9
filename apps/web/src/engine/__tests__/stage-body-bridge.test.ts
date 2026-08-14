import { describe, expect, it } from 'vitest';
import { emptyFaceRig, setFaceRigValue } from '@nx9/shared';
import { computeStageBodyScales } from '@nx9/director3d';

describe('B4 · 舞台身段桥', () => {
  it('无 faceRig 时全部比例 = 1', () => {
    expect(computeStageBodyScales(undefined)).toEqual({
      height: 1,
      shoulder: 1,
      torso: 1,
      leg: 1,
      neck: 1,
      hand: 1,
    });
  });

  it('满值按 sculpt BONE_DRIVERS 同 k 缩放', () => {
    let rig = emptyFaceRig();
    rig = setFaceRigValue(rig, 'heightFeel', 100);
    rig = setFaceRigValue(rig, 'shoulderWidth', 100);
    rig = setFaceRigValue(rig, 'torsoLength', 100);
    rig = setFaceRigValue(rig, 'legRatio', 100);
    rig = setFaceRigValue(rig, 'neckLength', 100);
    rig = setFaceRigValue(rig, 'handSize', 100);
    const s = computeStageBodyScales(rig);
    expect(s.height).toBeCloseTo(1.12);
    expect(s.shoulder).toBeCloseTo(1.18);
    expect(s.torso).toBeCloseTo(1.16);
    expect(s.leg).toBeCloseTo(1.14);
    expect(s.neck).toBeCloseTo(1.22);
    expect(s.hand).toBeCloseTo(1.2);
  });
});
