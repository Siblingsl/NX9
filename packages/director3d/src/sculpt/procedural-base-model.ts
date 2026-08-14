import {
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector2,
  type BufferAttribute,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FACE_RIG_PARAMS } from '@nx9/shared';
import { CLAY_COLOR, MESH_NAMES } from './sculpt-contract';
import { SCULPT_HANDLES } from './sculpt-handles';

/**
 * NX9 正式身份基模（程序化 clay 人形）构建器。
 *
 * 契约依据：docs/8.12/NX9-CHARACTER-FACE-SCULPT-2026-08-12.md §5 与
 * `sculpt-contract.ts` 的 `assertSculptMeshContract`。
 *
 * 结构（逐字对齐 §5.1）：
 *   CharacterRoot
 *     Armature
 *       Root → Hips → Spine → Chest → Neck → Head
 *            → Clavicle.L/R → UpperArm.L/R → LowerArm.L/R → Hand.L/R
 *            → UpperLeg.L/R → LowerLeg.L/R → Foot.L/R
 *     HeadMesh        // 身份 morph（32 面项 + jawWidth/eyeSpacing 的 L/R 扩展）
 *     BodyMesh        // bodyFat / muscleMass morph（躯干）
 *     五官强调件       // 眼(巩膜+虹膜)/眉/雀斑 → 材质通道
 *     肢体分段         // 随所属骨缩放
 *     Handle.*        // 空物体控制点（P2）
 *
 * 头型：Lathe 侧面轮廓（下颌→颧→额→颅顶）+ 前后压扁 + 特征位移
 * （脸平面/眉弓/眼窝/鼻/唇/下巴/颧骨/耳廓），单张连续网格，形态像人。
 * morph 用「单形状 + 正负镜像」：`{id}.pos` = base + D，`{id}.neg` = base - D。
 * 扁平骨架（Clavicle/UpperLeg 直属 Root）保证骨驱动互不污染。
 */

type V3 = readonly [number, number, number];

/** 头部整体缩放：让头高约占身高的 18%（真人约 13%，clay 风格略放大）。 */
const HEAD_SCALE = 0.66;

function smoothstep(v: number): number {
  const t = Math.min(1, Math.max(0, v));
  return t * t * (3 - 2 * t);
}

/** 值在 [lo, hi] 内取 1，向外在 soft 范围内平滑衰减到 0。 */
function band(v: number, lo: number, hi: number, soft: number): number {
  if (soft <= 0) return v >= lo && v <= hi ? 1 : 0;
  const loW = smoothstep((v - (lo - soft)) / soft);
  const hiW = 1 - smoothstep((v - hi) / soft);
  return Math.min(loW, hiW);
}

function signOf(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** 单侧权重：side='L' 在 x<0 侧取 1，x=0 附近平滑。 */
function sideWeight(side: 'L' | 'R', x: number): number {
  return smoothstep((side === 'L' ? -x : x) / 0.04);
}

function makeMorphAttribute(
  basePos: BufferAttribute,
  displace: (x: number, y: number, z: number) => V3,
): Float32BufferAttribute {
  const arr = new Float32Array(basePos.count * 3);
  for (let i = 0; i < basePos.count; i++) {
    const [nx, ny, nz] = displace(basePos.getX(i), basePos.getY(i), basePos.getZ(i));
    arr[i * 3] = nx;
    arr[i * 3 + 1] = ny;
    arr[i * 3 + 2] = nz;
  }
  return new Float32BufferAttribute(arr, 3);
}

/**
 * 面项 morph 的正向位移（head-local：+y 上、+z 脸朝前、+x 右）。
 * pos 目标 = base + D；neg 目标 = base - D（对称镜像）。
 * 坐标基准为新头型：脸平面 z≈0.125~0.14，鼻尖 z≈0.21，眼 (±0.062,-0.005)，
 * 眉 y≈0.10，嘴 y≈-0.07，下巴 y≈-0.15~-0.20。
 */
function faceDisplacement(id: string, x: number, y: number, z: number): V3 {
  const ax = Math.abs(x);
  switch (id) {
    // ── 脸型轮廓 ──
    case 'faceLength':
      return [0, 0.13 * y * band(z, -0.06, 0.2, 0.05), 0];
    case 'cheekboneWidth':
      return [signOf(x) * 0.045 * band(ax, 0.07, 0.155, 0.03) * band(y, -0.05, 0.07, 0.03) * band(z, 0.0, 0.16, 0.04), 0, 0];
    case 'jawWidth':
      return [signOf(x) * 0.05 * band(ax, 0.05, 0.16, 0.03) * band(y, -0.17, -0.02, 0.03) * band(z, 0.02, 0.16, 0.05), 0, 0];
    case 'jawAngle':
      return [signOf(x) * 0.04 * band(ax, 0.09, 0.16, 0.03) * band(y, -0.16, -0.08, 0.03) * band(z, 0.0, 0.15, 0.05), 0, 0];
    case 'chinLength':
      return [0, -0.05 * band(y, -0.22, -0.12, 0.03) * band(ax, 0.0, 0.09, 0.03) * band(z, 0.0, 0.17, 0.05), 0];
    case 'chinProject':
      return [0, 0, 0.05 * band(y, -0.22, -0.12, 0.03) * band(ax, 0.0, 0.09, 0.03) * band(z, 0.0, 0.17, 0.05)];
    case 'templeWidth':
      return [signOf(x) * 0.038 * band(ax, 0.08, 0.155, 0.03) * band(y, 0.1, 0.18, 0.03) * band(z, -0.03, 0.12, 0.05), 0, 0];
    case 'cheekFullness':
      return [0, 0, 0.045 * band(ax, 0.05, 0.14, 0.03) * band(y, -0.08, 0.05, 0.03) * band(z, 0.02, 0.16, 0.04)];

    // ── 眼 ──
    case 'eyeSize':
      return [0, 0, 0.032 * band(ax, 0.04, 0.125, 0.03) * band(y, -0.03, 0.09, 0.03) * band(z, 0.03, 0.16, 0.04)];
    case 'eyeSpacing':
      return [signOf(x) * 0.045 * band(ax, 0.045, 0.135, 0.03) * band(y, -0.03, 0.09, 0.03) * band(z, 0.03, 0.16, 0.04), 0, 0];
    case 'eyeTilt':
      return [0, 0.04 * ((ax - 0.04) / 0.09) * band(ax, 0.04, 0.13, 0.03) * band(y, -0.03, 0.09, 0.03) * band(z, 0.03, 0.16, 0.04), 0];
    case 'eyelidFold':
      return [0, 0, -0.022 * band(ax, 0.04, 0.125, 0.02) * band(y, 0.06, 0.11, 0.02) * band(z, 0.04, 0.15, 0.03)];
    case 'orbitDepth':
      return [0, 0, -0.042 * band(ax, 0.03, 0.145, 0.03) * band(y, -0.04, 0.1, 0.03) * band(z, 0.03, 0.16, 0.03)];
    case 'underEyeFold':
      return [0, 0, 0.026 * band(ax, 0.04, 0.125, 0.02) * band(y, -0.06, 0.0, 0.02) * band(z, 0.03, 0.15, 0.03)];
    case 'browEyeGap':
      return [0, 0.032 * band(ax, 0.03, 0.135, 0.03) * band(y, 0.08, 0.15, 0.03) * band(z, 0.02, 0.15, 0.04), 0];

    // ── 眉 ──
    case 'browArch':
      return [0, 0.036 * band(ax, 0.03, 0.135, 0.03) * band(y, 0.08, 0.15, 0.03) * band(z, 0.02, 0.15, 0.04), 0];
    case 'browAngle':
      return [0, 0.04 * ((ax - 0.03) / 0.11) * band(ax, 0.03, 0.14, 0.03) * band(y, 0.09, 0.15, 0.03) * band(z, 0.02, 0.15, 0.04), 0];
    case 'browLength':
      return [signOf(x) * 0.036 * band(ax, 0.09, 0.155, 0.03) * band(y, 0.09, 0.15, 0.03) * band(z, 0.02, 0.15, 0.04), 0, 0];

    // ── 鼻 ──
    case 'noseBridgeHeight':
      return [0, 0, 0.042 * band(ax, 0.0, 0.055, 0.03) * band(y, 0.0, 0.075, 0.03) * band(z, 0.1, 0.2, 0.04)];
    case 'noseBridgeWidth':
      return [signOf(x) * 0.026 * band(ax, 0.0, 0.055, 0.03) * band(y, 0.0, 0.075, 0.03) * band(z, 0.1, 0.2, 0.04), 0, 0];
    case 'noseTipSize':
      return [signOf(x) * 0.02 * band(ax, 0.0, 0.05, 0.02) * band(y, -0.03, 0.04, 0.02) * band(z, 0.16, 0.26, 0.04), 0.02 * band(ax, 0.0, 0.05, 0.02) * band(y, -0.03, 0.04, 0.02) * band(z, 0.16, 0.26, 0.04), 0.032 * band(ax, 0.0, 0.05, 0.02) * band(y, -0.03, 0.04, 0.02) * band(z, 0.16, 0.26, 0.04)];
    case 'nostrilWidth':
      return [signOf(x) * 0.03 * band(ax, 0.015, 0.055, 0.02) * band(y, -0.06, -0.01, 0.02) * band(z, 0.12, 0.19, 0.04), 0, 0];
    case 'noseTipAngle':
      return [0, 0.042 * band(ax, 0.0, 0.05, 0.02) * band(y, -0.03, 0.04, 0.02) * band(z, 0.17, 0.26, 0.04), 0];
    case 'noseLength':
      return [0, 0, 0.045 * band(ax, 0.0, 0.05, 0.03) * band(y, -0.04, 0.04, 0.03) * band(z, 0.18, 0.26, 0.04)];

    // ── 嘴 ──
    case 'upperLipThickness':
      return [0, 0, 0.03 * band(ax, 0.0, 0.085, 0.03) * band(y, -0.085, -0.045, 0.02) * band(z, 0.06, 0.15, 0.04)];
    case 'lowerLipThickness':
      return [0, 0, 0.03 * band(ax, 0.0, 0.085, 0.03) * band(y, -0.115, -0.075, 0.02) * band(z, 0.06, 0.15, 0.04)];
    case 'mouthWidth':
      return [signOf(x) * 0.042 * band(ax, 0.045, 0.1, 0.03) * band(y, -0.1, -0.05, 0.02) * band(z, 0.05, 0.15, 0.04), 0, 0];
    case 'lipPeak':
      return [0, 0, 0.03 * band(ax, 0.0, 0.04, 0.02) * band(y, -0.06, -0.04, 0.01) * band(z, 0.06, 0.14, 0.04)];
    case 'mouthCorner':
      return [0, 0.042 * ((ax - 0.04) / 0.06) * band(ax, 0.04, 0.1, 0.03) * band(y, -0.1, -0.05, 0.02) * band(z, 0.05, 0.15, 0.04), 0];
    case 'philtrumLength':
      return [0, -0.032 * band(ax, 0.0, 0.03, 0.02) * band(y, -0.06, -0.01, 0.02) * band(z, 0.1, 0.17, 0.04), 0];

    // ── 皮肤与年龄结构 ──
    case 'facialFat':
      return [
        signOf(x) * 0.032 * band(ax, 0.05, 0.15, 0.03) * band(y, -0.16, 0.05, 0.03) * band(z, 0.0, 0.16, 0.05),
        0,
        0.05 * band(ax, 0.0, 0.15, 0.03) * band(y, -0.16, 0.05, 0.03) * band(z, 0.0, 0.16, 0.05),
      ];
    case 'nasolabial':
      return [0, 0, -0.026 * band(ax, 0.035, 0.065, 0.02) * band(y, -0.085, -0.01, 0.02) * band(z, 0.05, 0.14, 0.03)];

    default:
      return [0, 0, 0];
  }
}

/** 身项 morph（bodyFat / muscleMass）正向位移，torso-local（竖直、+y 上）。 */
function bodyDisplacement(id: string, x: number, y: number, z: number): V3 {
  const ax = Math.abs(x);
  switch (id) {
    case 'bodyFat':
      return [x * 0.09, 0, z * 0.09];
    case 'muscleMass':
      return [signOf(x) * 0.026 * band(ax, 0.12, 0.24, 0.05), 0, -z * 0.02];
    default:
      return [0, 0, 0];
  }
}

function claySkinMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name: 'Skin',
    color: CLAY_COLOR,
    roughness: 0.62,
    metalness: 0,
  });
}

function scleraMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ name: 'Sclera', color: '#e9e6df', roughness: 0.35, metalness: 0 });
}

function irisMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name: 'Iris',
    color: '#4a4038',
    emissive: '#3a3633',
    emissiveIntensity: 0.35,
    roughness: 0.4,
    metalness: 0,
  });
}

function browMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name: 'Brow',
    color: '#5d4e3d',
    roughness: 0.7,
    metalness: 0,
    transparent: true,
    opacity: 0.85,
  });
}

function freckleMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name: 'Freckle',
    color: '#8a6a4a',
    roughness: 0.7,
    metalness: 0,
    transparent: true,
    opacity: 0.5,
  });
}

// ── 头型 ────────────────────────────────────────────────────────────────────

/** 头侧面轮廓 [radius, height]：下巴 → 颧 → 额 → 颅顶（含两极闭合点）。 */
const HEAD_PROFILE: [number, number][] = [
  [0.0, -0.21],
  [0.075, -0.195],
  [0.105, -0.165],
  [0.13, -0.125],
  [0.148, -0.085],
  [0.157, -0.045],
  [0.16, -0.005],
  [0.157, 0.035],
  [0.152, 0.08],
  [0.146, 0.13],
  [0.14, 0.17],
  [0.125, 0.205],
  [0.1, 0.23],
  [0.065, 0.248],
  [0.028, 0.258],
  [0.0, 0.262],
];

/**
 * 特征位移：脸平面 + 眉弓/眼窝/鼻/唇/下巴/颧骨 + 耳廓。
 * head-local：+y 上、+z 脸朝前。
 */
function shapeHeadFeature(x: number, y: number, z: number): V3 {
  let nx = x;
  let ny = y;
  let nz = z;
  if (z > 0) {
    const faceW =
      band(Math.abs(x), 0, 0.11, 0.045) *
      band(y, -0.185, 0.17, 0.05) *
      band(z, 0.02, 0.16, 0.04);
    if (faceW > 0.001) {
      let target = 0.138;
      const noseW = band(Math.abs(x), 0, 0.05, 0.03) * band(y, -0.05, 0.075, 0.025);
      if (noseW > 0.001) {
        const lift = 0.02 + 0.055 * band(y, -0.03, 0.02, 0.025) + 0.02 * band(y, 0.02, 0.07, 0.02);
        target = Math.max(target, 0.138 + lift * noseW);
      }
      const browW = band(Math.abs(x), 0, 0.135, 0.03) * band(y, 0.085, 0.15, 0.025);
      if (browW > 0.001) target = Math.max(target, 0.138 + 0.02 * browW);
      const lipW = band(Math.abs(x), 0, 0.055, 0.025) * band(y, -0.095, -0.045, 0.02);
      if (lipW > 0.001) target = Math.max(target, 0.138 + 0.016 * lipW);
      const chinW = band(Math.abs(x), 0, 0.07, 0.03) * band(y, -0.2, -0.09, 0.03);
      if (chinW > 0.001) target = Math.max(target, 0.138 + 0.014 * chinW);
      const cheekW = band(Math.abs(x), 0.06, 0.145, 0.04) * band(y, -0.05, 0.055, 0.03);
      if (cheekW > 0.001) target = Math.max(target, 0.138 + 0.014 * cheekW);
      const socketW = band(Math.abs(x), 0.04, 0.125, 0.035) * band(y, 0.0, 0.09, 0.03);
      if (socketW > 0.001) target = Math.min(target, 0.138 - 0.012 * socketW);
      nz = nz + (target - nz) * faceW;
    }
  }
  const earW =
    band(Math.abs(x), 0.115, 0.165, 0.04) * band(y, -0.06, 0.08, 0.03) * band(z, -0.08, 0.0, 0.04);
  if (earW > 0.001) nx += signOf(x) * 0.024 * earW;
  return [nx, ny, nz];
}

function buildHeadGeometry(): BufferGeometry {
  const lathe = new LatheGeometry(
    HEAD_PROFILE.map(([r, y]) => new Vector2(r, y)),
    56,
  );
  lathe.applyMatrix4(new Matrix4().makeScale(1.0, 1.0, 0.86));
  const pos = lathe.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const [nx, ny, nz] = shapeHeadFeature(pos.getX(i), pos.getY(i), pos.getZ(i));
    pos.setXYZ(i, nx, ny, nz);
  }
  lathe.computeVertexNormals();
  return lathe;
}

function setMorphs(mesh: Mesh, names: string[], targets: Float32BufferAttribute[]): void {
  mesh.geometry.morphAttributes.position = targets;
  mesh.morphTargetDictionary = Object.fromEntries(names.map((n, i) => [n, i]));
  mesh.morphTargetInfluences = names.map(() => 0);
}

function createHeadMesh(): Mesh {
  const geo = buildHeadGeometry();
  const basePos = geo.getAttribute('position') as BufferAttribute;

  const faceParams = FACE_RIG_PARAMS.filter(
    (p) => (p.driver ?? 'morph') === 'morph' && p.group !== 'body',
  );
  const names: string[] = [];
  const targets: Float32BufferAttribute[] = [];

  const pushPole = (paramId: string, pole: 'pos' | 'neg', side?: 'L' | 'R') => {
    const s = pole === 'pos' ? 1 : -1;
    const suffix = side ? `.${side}` : '';
    names.push(`${paramId}.${pole}${suffix}`);
    targets.push(
      makeMorphAttribute(basePos, (x, y, z) => {
        const [dx, dy, dz] = faceDisplacement(paramId, x, y, z);
        const w = side ? sideWeight(side, x) : 1;
        return [x + s * dx * w, y + s * dy * w, z + s * dz * w];
      }),
    );
  };

  for (const p of faceParams) {
    pushPole(p.id, 'pos');
    pushPole(p.id, 'neg');
    if (p.id === 'jawWidth' || p.id === 'eyeSpacing') {
      pushPole(p.id, 'pos', 'L');
      pushPole(p.id, 'neg', 'L');
      pushPole(p.id, 'pos', 'R');
      pushPole(p.id, 'neg', 'R');
    }
  }

  const mesh = new Mesh(geo, claySkinMaterial());
  mesh.name = MESH_NAMES.head;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  setMorphs(mesh, names, targets);

  // 头部整体按人形比例缩放（基模 + morph 目标同步，morph 位移函数仍按满比例坐标编写）
  const s = HEAD_SCALE;
  mesh.geometry.applyMatrix4(new Matrix4().makeScale(s, s, s));
  for (const attr of mesh.geometry.morphAttributes.position ?? []) {
    for (let i = 0; i < attr.count; i++) {
      attr.setXYZ(i, attr.getX(i) * s, attr.getY(i) * s, attr.getZ(i) * s);
    }
  }
  return mesh;
}

function createBodyMesh(material: MeshStandardMaterial): Mesh {
  const profile: [number, number][] = [
    [0.175, 0.0],
    [0.168, 0.14],
    [0.185, 0.3],
    [0.205, 0.46],
    [0.225, 0.58],
    [0.195, 0.7],
  ];
  const geo = new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    24,
  );
  // 前后压扁（胸厚 < 肩宽，更接近人）
  geo.applyMatrix4(new Matrix4().makeScale(1.0, 1.0, 0.8));
  const basePos = geo.getAttribute('position') as BufferAttribute;
  const bodyParams = FACE_RIG_PARAMS.filter(
    (p) => (p.driver ?? 'morph') === 'morph' && p.group === 'body',
  );
  const names: string[] = [];
  const targets: Float32BufferAttribute[] = [];
  for (const p of bodyParams) {
    for (const pole of ['pos', 'neg'] as const) {
      const s = pole === 'pos' ? 1 : -1;
      names.push(`${p.id}.${pole}`);
      targets.push(
        makeMorphAttribute(basePos, (x, y, z) => {
          const [dx, dy, dz] = bodyDisplacement(p.id, x, y, z);
          return [x + s * dx, y + s * dy, z + s * dz];
        }),
      );
    }
  }
  const mesh = new Mesh(geo, material);
  mesh.name = MESH_NAMES.body;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  setMorphs(mesh, names, targets);
  return mesh;
}

function addCapsuleSegment(
  parent: Group,
  name: string,
  material: MeshStandardMaterial,
  radius: number,
  length: number,
  local: V3,
): Mesh {
  const mesh = new Mesh(new CapsuleGeometry(radius, length, 6, 12), material);
  mesh.name = name;
  mesh.position.set(...local);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function addSphereSegment(
  parent: Group,
  name: string,
  material: MeshStandardMaterial,
  radius: number,
  local: V3,
  scale?: V3,
): Mesh {
  const geo = new SphereGeometry(radius, 20, 14);
  if (scale) geo.applyMatrix4(new Matrix4().makeScale(scale[0], scale[1], scale[2]));
  const mesh = new Mesh(geo, material);
  mesh.name = name;
  mesh.position.set(...local);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

/** 按 §5.1 扁平骨架组装骨骼；返回各骨节点便于挂网格。 */
interface ArmatureHandles {
  root: Group;
  hips: Group;
  chest: Group;
  neck: Group;
  headBone: Group;
  clavicleL: Group;
  clavicleR: Group;
  upperArmL: Group;
  upperArmR: Group;
  lowerArmL: Group;
  lowerArmR: Group;
  handL: Group;
  handR: Group;
  upperLegL: Group;
  upperLegR: Group;
  lowerLegL: Group;
  lowerLegR: Group;
  footL: Group;
  footR: Group;
}

function buildArmature(): { armature: Group; h: ArmatureHandles } {
  const armature = new Group();
  armature.name = MESH_NAMES.armature;

  const mk = (name: string, local: V3, parent: Group): Group => {
    const g = new Group();
    g.name = name;
    g.position.set(...local);
    parent.add(g);
    return g;
  };

  const root = mk('Root', [0, 0, 0], armature);
  const hips = mk('Hips', [0, 0.9, 0], root);
  const spine = mk('Spine', [0, 0.25, 0], hips);
  const chest = mk('Chest', [0, 0.23, 0], spine);
  const neck = mk('Neck', [0, 0.14, 0], chest);
  // Head 骨上移（世界 y≈1.58），与缩小后的头（下巴≈1.44、颅顶≈1.76）衔接
  const headBone = mk('Head', [0, 0.06, 0], neck);

  const clavicleL = mk('Clavicle.L', [-0.24, 1.42, 0], root);
  const clavicleR = mk('Clavicle.R', [0.24, 1.42, 0], root);
  const upperArmL = mk('UpperArm.L', [-0.1, -0.03, 0], clavicleL);
  const upperArmR = mk('UpperArm.R', [0.1, -0.03, 0], clavicleR);
  const lowerArmL = mk('LowerArm.L', [0, -0.3, 0], upperArmL);
  const lowerArmR = mk('LowerArm.R', [0, -0.3, 0], upperArmR);
  const handL = mk('Hand.L', [0, -0.3, 0], lowerArmL);
  const handR = mk('Hand.R', [0, -0.3, 0], lowerArmR);

  const upperLegL = mk('UpperLeg.L', [-0.11, 0.84, 0], root);
  const upperLegR = mk('UpperLeg.R', [0.11, 0.84, 0], root);
  const lowerLegL = mk('LowerLeg.L', [0, -0.4, 0], upperLegL);
  const lowerLegR = mk('LowerLeg.R', [0, -0.4, 0], upperLegR);
  const footL = mk('Foot.L', [0, -0.38, 0], lowerLegL);
  const footR = mk('Foot.R', [0, -0.38, 0], lowerLegR);

  return {
    armature,
    h: {
      root,
      hips,
      chest,
      neck,
      headBone,
      clavicleL,
      clavicleR,
      upperArmL,
      upperArmR,
      lowerArmL,
      lowerArmR,
      handL,
      handR,
      upperLegL,
      upperLegR,
      lowerLegL,
      lowerLegR,
      footL,
      footR,
    },
  };
}

/**
 * 组装正式身份基模（程序化 clay 人形）。
 * 满足契约：20 骨、34 身份 morph、切片 6 项、5 材质参数通道、≥9 个 Handle。
 */
export function createCharacterBaseModel(): Group {
  const character = new Group();
  character.name = MESH_NAMES.root;

  const skin = claySkinMaterial();
  const { armature, h } = buildArmature();
  character.add(armature);

  // ── 头（身份 morph）──
  const head = createHeadMesh();
  h.headBone.add(head);

  // 眼：巩膜 + 虹膜（iris 材质通道）
  const sclera = scleraMaterial();
  const iris = irisMaterial();
  const eyeSclera = new SphereGeometry(0.026 * HEAD_SCALE, 24, 16);
  const eyeIris = new SphereGeometry(0.012 * HEAD_SCALE, 16, 12);
  for (const side of ['L', 'R'] as const) {
    const ex = (side === 'L' ? -0.062 : 0.062) * HEAD_SCALE;
    const s = new Mesh(eyeSclera, sclera);
    s.name = `EyeSclera.${side}`;
    s.position.set(ex, -0.005 * HEAD_SCALE, 0.126 * HEAD_SCALE);
    s.castShadow = false;
    s.receiveShadow = false;
    const ir = new Mesh(eyeIris, iris);
    ir.name = `EyeIris.${side}`;
    ir.position.set(ex, -0.005 * HEAD_SCALE, 0.147 * HEAD_SCALE);
    ir.castShadow = false;
    ir.receiveShadow = false;
    h.headBone.add(s, ir);
  }

  // 眉（brow 材质通道）
  const brow = browMaterial();
  const browGeo = new CapsuleGeometry(0.009 * HEAD_SCALE, 0.075 * HEAD_SCALE, 4, 8);
  const browL = new Mesh(browGeo, brow);
  browL.name = 'BrowMesh.L';
  browL.position.set(-0.06 * HEAD_SCALE, 0.098 * HEAD_SCALE, 0.15 * HEAD_SCALE);
  browL.rotation.z = -0.15;
  const browR = new Mesh(browGeo.clone(), brow);
  browR.name = 'BrowMesh.R';
  browR.position.set(0.06 * HEAD_SCALE, 0.098 * HEAD_SCALE, 0.15 * HEAD_SCALE);
  browR.rotation.z = 0.15;
  h.headBone.add(browL, browR);

  // 雀斑（freckle 材质通道）
  const freckle = freckleMaterial();
  const freckleGeo = new SphereGeometry(0.005 * HEAD_SCALE, 8, 6);
  const spots: V3[] = [
    [-0.075, -0.028, 0.142],
    [-0.056, -0.018, 0.15],
    [0.07, -0.025, 0.143],
    [0.053, -0.017, 0.15],
    [-0.063, 0.005, 0.148],
    [0.063, 0.003, 0.149],
  ].map(([a, b, c]) => [a * HEAD_SCALE, b * HEAD_SCALE, c * HEAD_SCALE] as V3);
  for (let i = 0; i < spots.length; i++) {
    const s = new Mesh(freckleGeo, freckle);
    s.name = `FreckleMesh.${i}`;
    s.position.set(...spots[i]);
    h.headBone.add(s);
  }

  // ── 身 ──
  const body = createBodyMesh(skin);
  // 躯干本地 y=0 是腰、y=0.7 是肩；腰对齐世界 0.74（Chest 骨世界 y=1.38）
  body.position.set(0, -0.64, 0);
  h.chest.add(body);

  // 骨盆
  const pelvisGeo = new LatheGeometry(
    [
      [0.21, 0.0],
      [0.195, 0.1],
      [0.17, 0.22],
      [0.145, 0.3],
    ].map(([r, y]) => new Vector2(r, y)),
    24,
  );
  pelvisGeo.applyMatrix4(new Matrix4().makeScale(1.0, 1.0, 0.82));
  const pelvis = new Mesh(pelvisGeo, skin);
  pelvis.name = 'PelvisMesh';
  // 骨盆宽部（髂嵴）在本地 y=0，随 Hips 骨（世界 0.9）向下收窄到 0.6
  pelvis.position.set(0, 0, 0);
  h.hips.add(pelvis);

  // 颈
  const neckGeo = new CylinderGeometry(0.05, 0.065, 0.2, 16);
  const neckMesh = new Mesh(neckGeo, skin);
  neckMesh.name = 'NeckMesh';
  neckMesh.position.set(0, -0.02, 0);
  h.neck.add(neckMesh);

  // 肩（随 Clavicle 移动）
  addSphereSegment(h.clavicleL, 'ShoulderMesh.L', skin, 0.1, [-0.055, -0.02, 0]);
  addSphereSegment(h.clavicleR, 'ShoulderMesh.R', skin, 0.1, [0.055, -0.02, 0]);

  // 臂
  addCapsuleSegment(h.upperArmL, 'UpperArmMesh.L', skin, 0.075, 0.28, [0, -0.13, 0]);
  addCapsuleSegment(h.upperArmR, 'UpperArmMesh.R', skin, 0.075, 0.28, [0, -0.13, 0]);
  addCapsuleSegment(h.lowerArmL, 'LowerArmMesh.L', skin, 0.058, 0.26, [0, -0.12, 0]);
  addCapsuleSegment(h.lowerArmR, 'LowerArmMesh.R', skin, 0.058, 0.26, [0, -0.12, 0]);
  addSphereSegment(h.handL, 'HandMesh.L', skin, 0.06, [0, -0.05, 0], [1, 0.62, 0.48]);
  addSphereSegment(h.handR, 'HandMesh.R', skin, 0.06, [0, -0.05, 0], [1, 0.62, 0.48]);

  // 腿
  addCapsuleSegment(h.upperLegL, 'UpperLegMesh.L', skin, 0.095, 0.34, [0, -0.18, 0]);
  addCapsuleSegment(h.upperLegR, 'UpperLegMesh.R', skin, 0.095, 0.34, [0, -0.18, 0]);
  addCapsuleSegment(h.lowerLegL, 'LowerLegMesh.L', skin, 0.072, 0.32, [0, -0.17, 0]);
  addCapsuleSegment(h.lowerLegR, 'LowerLegMesh.R', skin, 0.072, 0.32, [0, -0.17, 0]);
  const footGeo = new SphereGeometry(0.065, 16, 12);
  footGeo.applyMatrix4(new Matrix4().makeScale(1, 0.55, 1.55));
  const footL = new Mesh(footGeo, skin);
  footL.name = 'FootMesh.L';
  footL.position.set(0, -0.03, 0.06);
  const footR = new Mesh(footGeo.clone(), skin);
  footR.name = 'FootMesh.R';
  footR.position.set(0, -0.03, 0.06);
  h.footL.add(footL);
  h.footR.add(footR);

  // ── 控制点（空物体，P2）──
  for (const def of SCULPT_HANDLES) {
    const handle = new Group();
    handle.name = def.name;
    handle.position.set(...def.position);
    character.add(handle);
  }

  return character;
}
