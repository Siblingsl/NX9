import {
  BufferGeometry,
  ConeGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferAttribute,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CLAY_COLOR, MESH_NAMES } from './sculpt-contract';

function clayMaterial(): MeshStandardMaterial {
  // three r152+：morph 由 geometry.morphAttributes 自动启用，材料参数不再接受 morphTargets
  return new MeshStandardMaterial({
    color: CLAY_COLOR,
    roughness: 0.62,
    metalness: 0,
  });
}

function morphAbsolute(
  geo: BufferGeometry,
  displace: (x: number, y: number, z: number) => [number, number, number],
): Float32BufferAttribute {
  const pos = geo.getAttribute('position') as BufferAttribute;
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const [nx, ny, nz] = displace(x, y, z);
    arr[i * 3] = nx;
    arr[i * 3 + 1] = ny;
    arr[i * 3 + 2] = nz;
  }
  return new Float32BufferAttribute(arr, 3);
}

function buildHeadGeometry(): BufferGeometry {
  const skull = new SphereGeometry(0.17, 32, 24);
  const nose = new ConeGeometry(0.032, 0.09, 8);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 0.015, 0.175);
  const merged = mergeGeometries([skull, nose], false);
  skull.dispose();
  nose.dispose();
  if (!merged) throw new Error('proxy head: mergeGeometries failed');
  merged.computeVertexNormals();
  return merged;
}

const MORPH_ORDER = [
  'faceLength.pos',
  'faceLength.neg',
  'jawWidth.pos',
  'jawWidth.neg',
  'jawWidth.pos.L',
  'jawWidth.neg.L',
  'jawWidth.pos.R',
  'jawWidth.neg.R',
  'eyeSpacing.pos',
  'eyeSpacing.neg',
  'noseBridgeHeight.pos',
  'noseBridgeHeight.neg',
] as const;

/**
 * P1 代理头：只实现视口切片 4 个身份 morph（jawWidth 含 .L/.R 扩展）。禁止为空 morph 占位。
 */
export function createProxyHeadMesh(material?: MeshStandardMaterial): Mesh {
  const geo = buildHeadGeometry();
  geo.morphAttributes.position = [
    morphAbsolute(geo, (x, y, z) => [x, y * 1.38, z]),
    morphAbsolute(geo, (x, y, z) => [x, y * 0.72, z]),
    morphAbsolute(geo, (x, y, z) => (y < -0.02 ? [x * 1.7, y, z] : [x, y, z])),
    morphAbsolute(geo, (x, y, z) => (y < -0.02 ? [x * 0.45, y, z] : [x, y, z])),
    morphAbsolute(geo, (x, y, z) => (y < -0.02 && x < 0 ? [x * 1.7, y, z] : [x, y, z])),
    morphAbsolute(geo, (x, y, z) => (y < -0.02 && x < 0 ? [x * 0.45, y, z] : [x, y, z])),
    morphAbsolute(geo, (x, y, z) => (y < -0.02 && x > 0 ? [x * 1.7, y, z] : [x, y, z])),
    morphAbsolute(geo, (x, y, z) => (y < -0.02 && x > 0 ? [x * 0.45, y, z] : [x, y, z])),
    morphAbsolute(geo, (x, y, z) => {
      const inEye = Math.abs(x) > 0.03 && Math.abs(x) < 0.14 && y > -0.03 && y < 0.08 && z > 0.04;
      if (!inEye || x === 0) return [x, y, z];
      return [x + Math.sign(x) * 0.05, y, z];
    }),
    morphAbsolute(geo, (x, y, z) => {
      const inEye = Math.abs(x) > 0.03 && Math.abs(x) < 0.14 && y > -0.03 && y < 0.08 && z > 0.04;
      if (!inEye || x === 0) return [x, y, z];
      return [x - Math.sign(x) * 0.035, y, z];
    }),
    morphAbsolute(geo, (x, y, z) => {
      const onNose = z > 0.12 && Math.abs(x) < 0.06 && y > -0.04 && y < 0.09;
      return onNose ? [x, y + 0.02, z + 0.07] : [x, y, z];
    }),
    morphAbsolute(geo, (x, y, z) => {
      const onNose = z > 0.12 && Math.abs(x) < 0.06 && y > -0.04 && y < 0.09;
      return onNose ? [x, y - 0.01, z - 0.045] : [x, y, z];
    }),
  ];

  const mat = material ?? clayMaterial();
  const mesh = new Mesh(geo, mat);
  mesh.name = MESH_NAMES.head;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.morphTargetDictionary = Object.fromEntries(MORPH_ORDER.map((n, i) => [n, i]));
  mesh.morphTargetInfluences = MORPH_ORDER.map(() => 0);
  return mesh;
}
