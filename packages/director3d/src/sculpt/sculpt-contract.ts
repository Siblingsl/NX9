import { FACE_RIG_PARAMS } from '@nx9/shared';
import type { Object3D, Mesh } from 'three';
import { BufferGeometry } from 'three';
import { normalizeMorphName } from './morph-alias';
import { MATERIAL_DRIVERS, hasMaterialChannel } from './material-drivers';

export const NX9_SCULPT_MESH_CONTRACT = 1;

/** P1 视口必须真变形。material 驱动器缺通道会在兼容报告标 missing，不再静默跳过。 */
export const P1_VIEWPORT_PARAM_IDS = [
  'faceLength',
  'jawWidth',
  'eyeSpacing',
  'noseBridgeHeight',
  'shoulderWidth',
  'heightFeel',
] as const;

export type P1ViewportParamId = (typeof P1_VIEWPORT_PARAM_IDS)[number];

export const CLAY_COLOR = '#C8C4BE';
export const SCULPT_TRI_WARN = 100_000;

export const MESH_NAMES = {
  root: 'CharacterRoot',
  armature: 'Armature',
  head: 'HeadMesh',
  body: 'BodyMesh',
} as const;

export type BoneAxis = 'x' | 'y' | 'uniform';

export interface BoneDriverDef {
  bones: readonly string[];
  axis: BoneAxis;
  /** scale = 1 + u * k，u ∈ [-1, 1] */
  k: number;
}

/** 骨骼驱动表。P1 代理只实现 heightFeel / shoulderWidth。 */
export const BONE_DRIVERS: Record<string, BoneDriverDef> = {
  heightFeel: { bones: ['Root'], axis: 'uniform', k: 0.12 },
  shoulderWidth: { bones: ['Clavicle.L', 'Clavicle.R'], axis: 'x', k: 0.18 },
  torsoLength: { bones: ['Spine', 'Chest'], axis: 'y', k: 0.16 },
  legRatio: { bones: ['UpperLeg.L', 'UpperLeg.R', 'LowerLeg.L', 'LowerLeg.R'], axis: 'y', k: 0.14 },
  neckLength: { bones: ['Neck'], axis: 'y', k: 0.22 },
  handSize: { bones: ['Hand.L', 'Hand.R'], axis: 'uniform', k: 0.2 },
};

export const FULL_ARMATURE_BONES = [
  'Root',
  'Hips',
  'Spine',
  'Chest',
  'Neck',
  'Head',
  'Clavicle.L',
  'Clavicle.R',
  'UpperArm.L',
  'UpperArm.R',
  'LowerArm.L',
  'LowerArm.R',
  'Hand.L',
  'Hand.R',
  'UpperLeg.L',
  'UpperLeg.R',
  'LowerLeg.L',
  'LowerLeg.R',
  'Foot.L',
  'Foot.R',
] as const;

export type SculptModelSource = 'builtin' | 'proxy' | 'custom';

export interface SculptCompatibilityReport {
  source: SculptModelSource;
  morphTargetCount: number;
  mappedParamIds: string[];
  missingParamIds: string[];
  hasArmature: boolean;
  missingBones: string[];
  handleCount: number;
  warnings: string[];
  /** P1 切片 6 项是否全部可驱动 */
  viewportSliceMapped: boolean;
}

export function isP1ViewportParam(id: string): boolean {
  return (P1_VIEWPORT_PARAM_IDS as readonly string[]).includes(id);
}

export function morphNamesForParam(paramId: string): string[] {
  return [
    `${paramId}.pos`,
    `${paramId}.neg`,
    `${paramId}.pos.L`,
    `${paramId}.pos.R`,
    `${paramId}.neg.L`,
    `${paramId}.neg.R`,
  ];
}

/**
 * 节点名归一化：与 three.js `PropertyBinding.sanitizeNodeName` 一致（删 `. : / [ ]`，
 * 空格换下划线）。GLTFLoader 加载 GLB 时会按此规则清洗节点名（如 `Clavicle.L` → `ClavicleL`），
 * 契约里带点的骨名/Handle 名在比对前必须走同一归一化，否则真实 GLB 永远匹配不上。
 */
export function normalizeNodeName(name: string): string {
  return name.replace(/\s+/g, '_').replace(/[\[\].:\/]/g, '');
}

export function findObjectByName(root: Object3D, name: string): Object3D | undefined {
  let found: Object3D | undefined;
  const want = normalizeNodeName(name);
  root.traverse((obj) => {
    if (!found && obj.name && normalizeNodeName(obj.name) === want) found = obj;
  });
  return found;
}

export function collectNamed(root: Object3D): Map<string, Object3D> {
  const map = new Map<string, Object3D>();
  root.traverse((obj) => {
    if (!obj.name) return;
    const key = normalizeNodeName(obj.name);
    if (!map.has(key)) map.set(key, obj);
  });
  return map;
}

function isMesh(obj: Object3D): obj is Mesh {
  return (obj as Mesh).isMesh === true;
}

export function collectMorphMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((obj) => {
    if (isMesh(obj) && obj.morphTargetDictionary) meshes.push(obj);
  });
  return meshes;
}

export function lookupMorphIndex(
  dictionary: Record<string, number> | undefined,
  paramId: string,
  pole: 'pos' | 'neg',
  side?: 'L' | 'R',
): number | undefined {
  if (!dictionary) return undefined;
  const candidates = side ? [`${paramId}.${pole}.${side}`] : [`${paramId}.${pole}`];
  for (const name of candidates) {
    if (name in dictionary) return dictionary[name];
    const want = normalizeMorphName(name);
    for (const [key, idx] of Object.entries(dictionary)) {
      if (normalizeMorphName(key) === want) return idx;
    }
  }
  return undefined;
}

function paramHasMorph(meshes: Mesh[], paramId: string): boolean {
  for (const mesh of meshes) {
    const dict = mesh.morphTargetDictionary;
    if (lookupMorphIndex(dict, paramId, 'pos') != null) return true;
    if (lookupMorphIndex(dict, paramId, 'neg') != null) return true;
    if (lookupMorphIndex(dict, paramId, 'pos', 'L') != null) return true;
    if (lookupMorphIndex(dict, paramId, 'pos', 'R') != null) return true;
  }
  return false;
}

function countTriangles(root: Object3D): number {
  let total = 0;
  root.traverse((child) => {
    if (!isMesh(child)) return;
    const geo = child.geometry;
    if (!(geo instanceof BufferGeometry)) return;
    const idx = geo.index;
    if (idx) total += idx.count / 3;
    else if (geo.attributes.position) total += geo.attributes.position.count / 3;
  });
  return Math.round(total);
}

export function assertSculptMeshContract(
  root: Object3D,
  source: SculptModelSource,
): SculptCompatibilityReport {
  const named = collectNamed(root);
  const meshes = collectMorphMeshes(root);
  const morphTargetCount = meshes.reduce(
    (n, m) => n + Object.keys(m.morphTargetDictionary ?? {}).length,
    0,
  );

  const mappedParamIds: string[] = [];
  const missingParamIds: string[] = [];
  const warnings: string[] = [];

  for (const def of FACE_RIG_PARAMS) {
    const driver = def.driver ?? 'morph';
    if (driver === 'prompt') continue;
    if (driver === 'material') {
      if (hasMaterialChannel(root, MATERIAL_DRIVERS[def.id]?.channel)) mappedParamIds.push(def.id);
      else missingParamIds.push(def.id);
      continue;
    }
    if (driver === 'bone') {
      const boneDef = BONE_DRIVERS[def.id];
      if (!boneDef) {
        missingParamIds.push(def.id);
        continue;
      }
      const missing = boneDef.bones.filter((b) => !named.has(normalizeNodeName(b)));
      if (missing.length === 0) mappedParamIds.push(def.id);
      else missingParamIds.push(def.id);
      continue;
    }
    if (paramHasMorph(meshes, def.id)) mappedParamIds.push(def.id);
    else missingParamIds.push(def.id);
  }

  const missingBones = FULL_ARMATURE_BONES.filter((b) => !named.has(normalizeNodeName(b)));
  const hasArmature = named.has(normalizeNodeName(MESH_NAMES.armature)) || named.has(normalizeNodeName('Root'));

  if (!named.has(normalizeNodeName(MESH_NAMES.head))) warnings.push('缺少 HeadMesh');
  if (!named.has(normalizeNodeName(MESH_NAMES.body))) warnings.push('缺少 BodyMesh');

  const tri = countTriangles(root);
  if (tri > SCULPT_TRI_WARN) warnings.push(`三角面 ${tri} 超过警告阈值 ${SCULPT_TRI_WARN}`);

  const identityMorphMapped = mappedParamIds.filter((id) => {
    const def = FACE_RIG_PARAMS.find((p) => p.id === id);
    return (def?.driver ?? 'morph') === 'morph';
  });

  if (source !== 'proxy' && identityMorphMapped.length < 12) {
    warnings.push('身份 morph 少于 12 个，判定为表情头而非捏模头');
  }

  let handleCount = 0;
  named.forEach((_, name) => {
    if (name.startsWith('Handle')) handleCount += 1;
  });

  const viewportSliceMapped = P1_VIEWPORT_PARAM_IDS.every((id) => mappedParamIds.includes(id));
  if (source === 'proxy' && !viewportSliceMapped) {
    warnings.push('代理网格未覆盖 P1 视口切片 6 项');
  }

  return {
    source,
    morphTargetCount,
    mappedParamIds,
    missingParamIds,
    hasArmature,
    missingBones: [...missingBones],
    handleCount,
    warnings,
    viewportSliceMapped,
  };
}
