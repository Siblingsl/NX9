// @vitest-environment node
/**
 * 线上成品基模端到端回归：加载 public/ 下真实 nx9-character-base.glb，
 * 用运行时真实 applyFaceRigToObject 走「滑杆值 → faceRig → morph influence →
 * HeadMesh/BodyMesh 顶点位移」整条链路（含 pos/neg 极向、单侧 L/R、体型 morph）。
 *
 * three.js 的 morph 在渲染器里由着色器应用，CPU 侧几何属性不更新；
 * 这里按渲染器同款公式 base + Σ influence×delta 在 CPU 复算有效顶点位置。
 * jsdom 环境会让 GLTFLoader 的 GLB 二进制分支失效，故强制 node 环境。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BufferAttribute, Mesh, Object3D } from 'three';
import { applyFaceRigToObject, readMorphInfluence } from '@nx9/director3d';
import type { CharacterFaceRig } from '@nx9/shared';
import { setFaceRigValue, emptyFaceRig } from '@nx9/shared';

const LIVE_GLB = resolve(
  __dirname,
  '../../../public/director3d/models/nx9-character-base.glb',
);

async function loadLiveRoot(): Promise<Object3D> {
  const buf = readFileSync(LIVE_GLB);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise<Object3D>((res, rej) => {
    new GLTFLoader().parse(arrayBuffer, '', (g) => res(g.scene), (e) => rej(e));
  });
}

function findMesh(root: Object3D, meshName: string): Mesh {
  let found: Mesh | null = null;
  root.traverse((o) => {
    if (o.name === meshName && (o as Mesh).isMesh) found = o as Mesh;
  });
  if (!found) throw new Error(`${meshName} not found`);
  return found;
}

/** 渲染器同款公式：base + Σ influence × morphDelta（CPU 复算）。 */
function effectivePositions(mesh: Mesh): Float32Array {
  const geo = mesh.geometry;
  const base = geo.getAttribute('position') as BufferAttribute;
  const out = Float32Array.from(base.array as Float32Array);
  const dict = mesh.morphTargetDictionary;
  const inf = mesh.morphTargetInfluences;
  const morphs = geo.morphAttributes?.position;
  if (!dict || !inf || !morphs) return out;
  for (const deltas of Object.values(dict)) {
    const w = inf[deltas];
    if (!w) continue;
    const md = morphs[deltas];
    if (!md) continue;
    for (let i = 0; i < out.length; i++) out[i] += w * md.array[i];
  }
  return out;
}

function displacementStats(before: Float32Array, after: Float32Array): { moved: number; maxDelta: number } {
  let moved = 0;
  let maxDelta = 0;
  for (let i = 0; i < before.length; i++) {
    const d = Math.abs(after[i] - before[i]);
    if (d > 1e-6) moved++;
    if (d > maxDelta) maxDelta = d;
  }
  return { moved, maxDelta };
}

describe('线上成品基模端到端冒烟', () => {
  it('滑杆值经 applyFaceRigToObject 真实驱动 HeadMesh 顶点位移', async () => {
    const root = await loadLiveRoot();
    const head = findMesh(root, 'HeadMesh');
    const neutral = effectivePositions(head);
    expect(neutral.length).toBeGreaterThan(0);

    // 中性 rig：全部 morph 清零 → 有效位置回到中性
    applyFaceRigToObject(root, emptyFaceRig());
    expect(displacementStats(neutral, effectivePositions(head)).moved).toBe(0);

    // jawWidth +80 → jawWidth.pos influence 0.8，下颌顶点外扩
    const jawRig: CharacterFaceRig = setFaceRigValue(emptyFaceRig(), 'jawWidth', 80);
    applyFaceRigToObject(root, jawRig);
    expect(readMorphInfluence(root, 'jawWidth', 'pos')).toBeCloseTo(0.8, 5);
    const jawStats = displacementStats(neutral, effectivePositions(head));
    expect(jawStats.moved).toBeGreaterThan(500);
    expect(jawStats.maxDelta).toBeGreaterThan(0.005);

    // 反向 -60 → 走 jawWidth.neg
    applyFaceRigToObject(root, setFaceRigValue(emptyFaceRig(), 'jawWidth', -60));
    expect(readMorphInfluence(root, 'jawWidth', 'neg')).toBeCloseTo(0.6, 5);
    expect(displacementStats(neutral, effectivePositions(head)).moved).toBeGreaterThan(500);

    // 鼻梁 +100（另一区域，证明覆盖面不止下颌）
    applyFaceRigToObject(root, setFaceRigValue(emptyFaceRig(), 'noseBridgeHeight', 100));
    expect(readMorphInfluence(root, 'noseBridgeHeight', 'pos')).toBeCloseTo(1, 5);
    expect(displacementStats(neutral, effectivePositions(head)).moved).toBeGreaterThan(300);

    // 单侧扩展：jawWidth L/R 独立通道
    const sideRig = emptyFaceRig();
    sideRig.asymmetric = ['jawWidth'];
    sideRig.sideValues = { jawWidth: { L: 100, R: 0 } };
    applyFaceRigToObject(root, sideRig);
    expect(readMorphInfluence(root, 'jawWidth', 'pos', 'L')).toBeCloseTo(1, 5);
    expect(readMorphInfluence(root, 'jawWidth', 'pos', 'R')).toBeCloseTo(0, 5);

    // BodyMesh 体型 morph（bodyFat +50）
    const bodyNeutral = effectivePositions(findMesh(root, 'BodyMesh'));
    applyFaceRigToObject(root, setFaceRigValue(emptyFaceRig(), 'bodyFat', 50));
    expect(readMorphInfluence(root, 'bodyFat', 'pos')).toBeCloseTo(0.5, 5);
    expect(displacementStats(bodyNeutral, effectivePositions(findMesh(root, 'BodyMesh'))).moved).toBeGreaterThan(0);
  });
});
