import {
  FACE_RIG_PARAMS,
  FACE_RIG_PARAMS_BY_ID,
  faceRigSideValue,
  faceRigValue,
  getFaceRig,
  type CharacterFaceRig,
} from '@nx9/shared';
import { Vector3, type Mesh, type Object3D } from 'three';
import {
  BONE_DRIVERS,
  collectMorphMeshes,
  collectNamed,
  lookupMorphIndex,
  type BoneAxis,
} from './sculpt-contract';
import { applyMaterialDriver } from './material-drivers';

function unit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(-1, v / 100));
}

function clearContractMorphs(mesh: Mesh): void {
  const dict = mesh.morphTargetDictionary;
  const inf = mesh.morphTargetInfluences;
  if (!dict || !inf) return;
  for (const def of FACE_RIG_PARAMS) {
    if ((def.driver ?? 'morph') !== 'morph') continue;
    for (const pole of ['pos', 'neg'] as const) {
      for (const side of [undefined, 'L', 'R'] as const) {
        const idx = lookupMorphIndex(dict, def.id, pole, side);
        if (idx != null && idx < inf.length) inf[idx] = 0;
      }
    }
  }
}

function writeMorph(mesh: Mesh, paramId: string, u: number, side?: 'L' | 'R'): void {
  const dict = mesh.morphTargetDictionary;
  const inf = mesh.morphTargetInfluences;
  if (!dict || !inf) return;
  const pos = Math.max(0, u);
  const neg = Math.max(0, -u);

  const write = (pole: 'pos' | 'neg', value: number, targetSide?: 'L' | 'R') => {
    const idx = lookupMorphIndex(dict, paramId, pole, targetSide);
    if (idx == null || idx >= inf.length) return;
    inf[idx] = value;
  };

  if (side) {
    write('pos', pos, side);
    write('neg', neg, side);
    return;
  }

  const hasL = lookupMorphIndex(dict, paramId, 'pos', 'L') != null;
  const hasR = lookupMorphIndex(dict, paramId, 'pos', 'R') != null;
  if (hasL || hasR) {
    write('pos', pos);
    write('neg', neg);
    write('pos', pos, 'L');
    write('pos', pos, 'R');
    write('neg', neg, 'L');
    write('neg', neg, 'R');
    return;
  }
  write('pos', pos);
  write('neg', neg);
}

function applyBoneScale(obj: Object3D, axis: BoneAxis, s: number): void {
  if (axis === 'uniform') {
    obj.scale.setScalar(s);
    return;
  }
  obj.scale.set(1, 1, 1);
  if (axis === 'x') obj.scale.x = s;
  else obj.scale.y = s;
}

/**
 * 把 faceRig 打到网格上。缺 morph / 骨 / 材质通道不抛；材质缺失由兼容报告标 missing。
 * 只改 influence 与 scale，禁止 clone 几何。
 */
export function applyFaceRigToObject(root: Object3D, rig: CharacterFaceRig | undefined): void {
  const normalized = getFaceRig(rig);
  const meshes = collectMorphMeshes(root);
  for (const mesh of meshes) clearContractMorphs(mesh);

  const named = collectNamed(root);
  for (const def of Object.values(BONE_DRIVERS)) {
    for (const boneName of def.bones) {
      const bone = named.get(boneName);
      if (bone) bone.scale.set(1, 1, 1);
    }
  }

  for (const def of FACE_RIG_PARAMS) {
    const driver = def.driver ?? 'morph';
    if (driver === 'prompt') continue;
    if (driver === 'material') {
      applyMaterialDriver(root, def.id, unit(faceRigValue(normalized, def.id)));
      continue;
    }
    const v = faceRigValue(normalized, def.id);
    const u = unit(v);

    if (driver === 'bone') {
      const boneDef = BONE_DRIVERS[def.id];
      if (!boneDef) continue;
      for (const boneName of boneDef.bones) {
        const bone = named.get(boneName);
        if (!bone) continue;
        const side = boneName.endsWith('.L') ? 'L' : boneName.endsWith('.R') ? 'R' : undefined;
        const sideValue = side ? faceRigSideValue(normalized, def.id, side) : v;
        const s = 1 + unit(sideValue) * boneDef.k;
        applyBoneScale(bone, boneDef.axis, s);
      }
      continue;
    }

    const sideL = faceRigSideValue(normalized, def.id, 'L');
    const sideR = faceRigSideValue(normalized, def.id, 'R');
    if (u === 0 && unit(sideL) === 0 && unit(sideR) === 0) continue;
    if (unit(sideL) !== u || unit(sideR) !== u) {
      for (const mesh of meshes) writeMorph(mesh, def.id, unit(sideL), 'L');
      for (const mesh of meshes) writeMorph(mesh, def.id, unit(sideR), 'R');
      continue;
    }
    for (const mesh of meshes) writeMorph(mesh, def.id, u);
  }
}

/** 测试辅助：读取某 morph influence，找不到返回 undefined。 */
export function readMorphInfluence(
  root: Object3D,
  paramId: string,
  pole: 'pos' | 'neg',
  side?: 'L' | 'R',
): number | undefined {
  for (const mesh of collectMorphMeshes(root)) {
    const idx = lookupMorphIndex(mesh.morphTargetDictionary, paramId, pole, side);
    if (idx != null && mesh.morphTargetInfluences) return mesh.morphTargetInfluences[idx];
  }
  return undefined;
}

export function readBoneScale(root: Object3D, name: string): Vector3 | undefined {
  const obj = collectNamed(root).get(name);
  return obj ? obj.scale.clone() : undefined;
}

export function isKnownFaceRigParam(id: string): boolean {
  return FACE_RIG_PARAMS_BY_ID.has(id);
}
