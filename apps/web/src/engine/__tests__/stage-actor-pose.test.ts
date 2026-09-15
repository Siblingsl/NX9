import { describe, expect, it } from 'vitest';
import { MathUtils, type Object3D } from 'three';
import {
  applyFaceRigToObject,
  applyPoseToArmature,
  computeStageBodyScales,
  createCharacterBaseModel,
  lookupPose,
  readBoneScale,
} from '@nx9/director3d';
import { emptyFaceRig, setFaceRigValue } from '@nx9/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function findNamed(root: Object3D, name: string): Object3D | undefined {
  let hit: Object3D | undefined;
  root.traverse((o) => {
    if (o.name === name) hit = o;
  });
  return hit;
}

describe('P4 StageActor 摆姿骨写入', () => {
  it('applyPoseToArmature 写入 UpperArm / Head 欧拉角', () => {
    const root = createCharacterBaseModel();
    const pose = lookupPose('point');
    applyPoseToArmature(root, pose);

    const armR = findNamed(root, 'UpperArm.R');
    const head = findNamed(root, 'Head');
    expect(armR).toBeDefined();
    expect(head).toBeDefined();
    expect(armR!.rotation.x).toBeCloseTo(MathUtils.degToRad(pose.armR[0]), 5);
    expect(head!.rotation.y).toBeCloseTo(MathUtils.degToRad(pose.head[1]), 5);
  });

  it('正式人偶路径：faceRig 体型只走骨驱动，外层不再叠 computeStageBodyScales', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../../../packages/director3d/src/runtime/StageActor.tsx'),
      'utf8',
    );
    const builtin = src.slice(src.indexOf('function BuiltinStageActor'));
    expect(builtin).toContain('applyFaceRigToObject');
    expect(builtin).toContain('禁止再叠 computeStageBodyScales');
    expect(builtin).toContain('fallback: createCharacterBaseModel');
    expect(builtin).not.toMatch(/scale=\{\[body\.scale\[0\], body\.scale\[1\] \* s\.height/);

    // 骨路径与桥接 k 值一致，避免「胶囊用桥、正式模用骨」漂移
    let rig = emptyFaceRig();
    rig = setFaceRigValue(rig, 'heightFeel', 100);
    const root = createCharacterBaseModel();
    applyFaceRigToObject(root, rig);
    const boneScale = readBoneScale(root, 'Root');
    expect(boneScale).toBeDefined();
    expect(boneScale!.x).toBeCloseTo(computeStageBodyScales(rig).height);
  });
});
