/**
 * Pack MPFB sculpt-raw GLB (HeadMesh/BodyMesh + eyes) into a contract-compliant
 * nx9-character-base CharacterRoot: Armature, identity morphs, material channels,
 * Handles. Morphs are generated in TS (Blender 5.2 glTF exporter zeros shape keys).
 */
import {
  BufferGeometry,
  CapsuleGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type BufferAttribute,
  type Object3D,
} from 'three';
import { FACE_RIG_PARAMS } from '@nx9/shared';
import { CLAY_COLOR, MESH_NAMES } from './sculpt-contract';
import { SCULPT_HANDLES } from './sculpt-handles';

type V3 = readonly [number, number, number];

/** MPFB eye / brow landmarks in GLTF Y-up (from import-report v29). */
const HEAD_ORIGIN = { x: 0, y: 1.6186, z: 0.12 };
/** Map MPFB head span (~0.23m) into procedural morph band space (~±0.22). */
const HEAD_LOCAL_SCALE = 1.55;

function smoothstep(v: number): number {
  const t = Math.min(1, Math.max(0, v));
  return t * t * (3 - 2 * t);
}

function band(v: number, lo: number, hi: number, soft: number): number {
  if (soft <= 0) return v >= lo && v <= hi ? 1 : 0;
  const loW = smoothstep((v - (lo - soft)) / soft);
  const hiW = 1 - smoothstep((v - hi) / soft);
  return Math.min(loW, hiW);
}

function signOf(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function sideWeight(side: 'L' | 'R', x: number): number {
  return smoothstep((side === 'L' ? -x : x) / 0.04);
}

function toHeadLocal(x: number, y: number, z: number): V3 {
  return [
    (x - HEAD_ORIGIN.x) * HEAD_LOCAL_SCALE,
    (y - HEAD_ORIGIN.y) * HEAD_LOCAL_SCALE,
    (z - HEAD_ORIGIN.z) * HEAD_LOCAL_SCALE,
  ];
}

/** Compact face morph deltas in head-local space (same bands as procedural-base-model). */
function faceDisplacement(id: string, x: number, y: number, z: number): V3 {
  const ax = Math.abs(x);
  switch (id) {
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
    case 'browArch':
      return [0, 0.036 * band(ax, 0.03, 0.135, 0.03) * band(y, 0.08, 0.15, 0.03) * band(z, 0.02, 0.15, 0.04), 0];
    case 'browAngle':
      return [0, 0.04 * ((ax - 0.03) / 0.11) * band(ax, 0.03, 0.14, 0.03) * band(y, 0.09, 0.15, 0.03) * band(z, 0.02, 0.15, 0.04), 0];
    case 'browLength':
      return [signOf(x) * 0.036 * band(ax, 0.09, 0.155, 0.03) * band(y, 0.09, 0.15, 0.03) * band(z, 0.02, 0.15, 0.04), 0, 0];
    case 'noseBridgeHeight':
      return [0, 0, 0.042 * band(ax, 0.0, 0.055, 0.03) * band(y, 0.0, 0.075, 0.03) * band(z, 0.1, 0.2, 0.04)];
    case 'noseBridgeWidth':
      return [signOf(x) * 0.026 * band(ax, 0.0, 0.055, 0.03) * band(y, 0.0, 0.075, 0.03) * band(z, 0.1, 0.2, 0.04), 0, 0];
    case 'noseTipSize':
      return [
        signOf(x) * 0.02 * band(ax, 0.0, 0.05, 0.02) * band(y, -0.03, 0.04, 0.02) * band(z, 0.16, 0.26, 0.04),
        0.02 * band(ax, 0.0, 0.05, 0.02) * band(y, -0.03, 0.04, 0.02) * band(z, 0.16, 0.26, 0.04),
        0.032 * band(ax, 0.0, 0.05, 0.02) * band(y, -0.03, 0.04, 0.02) * band(z, 0.16, 0.26, 0.04),
      ];
    case 'nostrilWidth':
      return [signOf(x) * 0.03 * band(ax, 0.015, 0.055, 0.02) * band(y, -0.06, -0.01, 0.02) * band(z, 0.12, 0.19, 0.04), 0, 0];
    case 'noseTipAngle':
      return [0, 0.042 * band(ax, 0.0, 0.05, 0.02) * band(y, -0.03, 0.04, 0.02) * band(z, 0.17, 0.26, 0.04), 0];
    case 'noseLength':
      return [0, 0, 0.045 * band(ax, 0.0, 0.05, 0.03) * band(y, -0.04, 0.04, 0.03) * band(z, 0.18, 0.26, 0.04)];
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

function bodyDisplacement(id: string, x: number, y: number, z: number): V3 {
  const ax = Math.abs(x);
  switch (id) {
    case 'bodyFat':
      return [x * 0.06, 0, z * 0.06];
    case 'muscleMass':
      return [signOf(x) * 0.02 * band(ax, 0.08, 0.28, 0.05) * band(y, 0.7, 1.45, 0.08), 0, -z * 0.015];
    default:
      return [0, 0, 0];
  }
}

function claySkin(): MeshStandardMaterial {
  return new MeshStandardMaterial({ name: 'Skin', color: CLAY_COLOR, roughness: 0.62, metalness: 0 });
}
function scleraMat(): MeshStandardMaterial {
  return new MeshStandardMaterial({ name: 'Sclera', color: '#e9e6df', roughness: 0.35, metalness: 0 });
}
function irisMat(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name: 'Iris',
    color: '#4a4038',
    emissive: '#3a3633',
    emissiveIntensity: 0.35,
    roughness: 0.4,
    metalness: 0,
  });
}
function browMat(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name: 'Brow',
    color: '#2a2420',
    transparent: true,
    opacity: 0.85,
    roughness: 0.8,
    metalness: 0,
  });
}
function freckleMat(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name: 'Freckle',
    color: '#8a6a55',
    transparent: true,
    opacity: 0.35,
    roughness: 0.9,
    metalness: 0,
  });
}

function setMorphs(mesh: Mesh, names: string[], targets: Float32BufferAttribute[]): void {
  mesh.geometry.morphAttributes.position = targets;
  mesh.morphTargetDictionary = Object.fromEntries(names.map((n, i) => [n, i]));
  mesh.morphTargetInfluences = names.map(() => 0);
}

function makeMorphAttr(
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

function bakeWorldGeometry(mesh: Mesh): BufferGeometry {
  mesh.updateMatrixWorld(true);
  const src = mesh.geometry as BufferGeometry;
  const geo = src.clone();
  const pos = geo.getAttribute('position') as BufferAttribute;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function findMesh(root: Object3D, name: string): Mesh | undefined {
  // GLTFLoader strips `. : / []` from node names (EyeIris.L → EyeIrisL).
  const want = name.replace(/\s+/g, '_').replace(/[\[\].:\/]/g, '');
  let found: Mesh | undefined;
  root.traverse((o) => {
    if (found) return;
    const m = o as Mesh;
    if (!m.isMesh || !m.name) return;
    const got = m.name.replace(/\s+/g, '_').replace(/[\[\].:\/]/g, '');
    if (got === want || m.name === name) found = m;
  });
  return found;
}

function buildArmature(): { armature: Group; root: Group } {
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
  mk('Head', [0, 0.06, 0], neck);
  const clavicleL = mk('Clavicle.L', [-0.24, 1.42, 0], root);
  const clavicleR = mk('Clavicle.R', [0.24, 1.42, 0], root);
  const upperArmL = mk('UpperArm.L', [-0.1, -0.03, 0], clavicleL);
  const upperArmR = mk('UpperArm.R', [0.1, -0.03, 0], clavicleR);
  const lowerArmL = mk('LowerArm.L', [0, -0.3, 0], upperArmL);
  const lowerArmR = mk('LowerArm.R', [0, -0.3, 0], upperArmR);
  mk('Hand.L', [0, -0.3, 0], lowerArmL);
  mk('Hand.R', [0, -0.3, 0], lowerArmR);
  const upperLegL = mk('UpperLeg.L', [-0.11, 0.84, 0], root);
  const upperLegR = mk('UpperLeg.R', [0.11, 0.84, 0], root);
  const lowerLegL = mk('LowerLeg.L', [0, -0.4, 0], upperLegL);
  const lowerLegR = mk('LowerLeg.R', [0, -0.4, 0], upperLegR);
  mk('Foot.L', [0, -0.38, 0], lowerLegL);
  mk('Foot.R', [0, -0.38, 0], lowerLegR);
  return { armature, root };
}

function attachHeadMorphs(mesh: Mesh): void {
  const basePos = mesh.geometry.getAttribute('position') as BufferAttribute;
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
      makeMorphAttr(basePos, (wx, wy, wz) => {
        const [lx, ly, lz] = toHeadLocal(wx, wy, wz);
        const [dx, dy, dz] = faceDisplacement(paramId, lx, ly, lz);
        const w = side ? sideWeight(side, lx) : 1;
        const inv = 1 / HEAD_LOCAL_SCALE;
        return [wx + s * dx * w * inv, wy + s * dy * w * inv, wz + s * dz * w * inv];
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
  setMorphs(mesh, names, targets);
}

function attachBodyMorphs(mesh: Mesh): void {
  const basePos = mesh.geometry.getAttribute('position') as BufferAttribute;
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
        makeMorphAttr(basePos, (x, y, z) => {
          const [dx, dy, dz] = bodyDisplacement(p.id, x, y, z);
          return [x + s * dx, y + s * dy, z + s * dz];
        }),
      );
    }
  }
  setMorphs(mesh, names, targets);
}

/**
 * Build CharacterRoot from an imported MPFB sculpt-raw scene.
 * Expects meshes named HeadMesh, BodyMesh, optional EyeSclera / EyeIris sides.
 */
export function packMpfbIntoCharacterBase(rawRoot: Object3D): Group {
  const character = new Group();
  character.name = MESH_NAMES.root;

  const { armature, root } = buildArmature();
  character.add(armature);

  const skin = claySkin();
  const rawHead = findMesh(rawRoot, 'HeadMesh');
  const rawBody = findMesh(rawRoot, 'BodyMesh');
  if (!rawHead || !rawBody) {
    throw new Error('mpfb sculpt-raw 缺少 HeadMesh 或 BodyMesh');
  }

  const head = new Mesh(bakeWorldGeometry(rawHead), skin);
  head.name = MESH_NAMES.head;
  head.castShadow = false;
  head.receiveShadow = false;
  attachHeadMorphs(head);
  root.add(head);

  const body = new Mesh(bakeWorldGeometry(rawBody), skin);
  body.name = MESH_NAMES.body;
  body.castShadow = false;
  body.receiveShadow = false;
  attachBodyMorphs(body);
  root.add(body);

  const sclera = scleraMat();
  const iris = irisMat();
  for (const side of ['L', 'R'] as const) {
    const eyeName = `EyeSclera.${side}`;
    const irisName = `EyeIris.${side}`;
    const rawEye = findMesh(rawRoot, eyeName);
    const rawIris = findMesh(rawRoot, irisName);
    if (rawEye) {
      const eye = new Mesh(bakeWorldGeometry(rawEye), sclera);
      eye.name = eyeName;
      root.add(eye);
    }
    if (rawIris) {
      const ir = new Mesh(bakeWorldGeometry(rawIris), iris);
      ir.name = irisName;
      root.add(ir);
    } else {
      // Ensure Iris material channel exists even if raw disks missing
      const ir = new Mesh(new SphereGeometry(0.005, 12, 10), iris);
      ir.name = irisName;
      ir.position.set(side === 'L' ? -0.03 : 0.03, 1.618, 0.13);
      root.add(ir);
    }
  }

  // Material-channel placeholders (brow / freckle) — tiny, near brow line
  const brow = browMat();
  const browGeo = new CapsuleGeometry(0.006, 0.05, 4, 8);
  for (const side of ['L', 'R'] as const) {
    const m = new Mesh(browGeo, brow);
    m.name = `BrowMesh.${side}`;
    m.position.set(side === 'L' ? -0.045 : 0.045, 1.645, 0.145);
    m.rotation.z = side === 'L' ? -0.12 : 0.12;
    root.add(m);
  }
  const freckle = freckleMat();
  const freckleGeo = new SphereGeometry(0.004, 8, 6);
  for (let i = 0; i < 4; i++) {
    const s = new Mesh(freckleGeo, freckle);
    s.name = `FreckleMesh.${i}`;
    s.position.set((i % 2 === 0 ? -1 : 1) * (0.04 + (i >> 1) * 0.015), 1.59, 0.13);
    root.add(s);
  }

  for (const def of SCULPT_HANDLES) {
    const handle = new Group();
    handle.name = def.name;
    handle.position.set(...def.position);
    character.add(handle);
  }

  return character;
}
