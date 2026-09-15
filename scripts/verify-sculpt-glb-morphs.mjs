/**
 * 验证 NX9 sculpt GLB 的 morph 数据在 three.js 中可正确加载。
 * 检查 geometry.morphAttributes.position（CPU 端 morph 数据）与 morphTargetDictionary。
 * 纯 Node 运行（无 WebGL）。
 *
 * 用法：node scripts/verify-sculpt-glb-morphs.mjs [path-to.glb]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const GLB_PATH = process.argv[2] || path.join(REPO, 'apps', 'web', 'public', 'director3d', 'models', 'nx9-character-sculpt.glb');

// Node 环境 polyfill（three GLTFLoader 需要 Blob / FileReader）
import { Blob as NodeBlob } from 'node:buffer';
class NodeFileReader {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => { this.result = buf; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(buf).toString('base64')}`;
      this.onloadend?.();
    });
  }
}
globalThis.Blob = NodeBlob;
globalThis.FileReader = NodeFileReader;

const { GLTFLoader } = await import('file:///F:/code/project/NX9/apps/web/node_modules/three/examples/jsm/loaders/GLTFLoader.js');

const bytes = fs.readFileSync(GLB_PATH);
const buffer = new ArrayBuffer(bytes.byteLength);
new Uint8Array(buffer).set(bytes);

const loader = new GLTFLoader();
const gltf = await new Promise((resolve, reject) => {
  loader.parse(buffer, '', (g) => resolve(g), (e) => reject(e));
});

const scene = gltf.scene;
let failures = 0;
const pass = (m) => console.log(`  ✅ ${m}`);
const fail = (m) => { console.log(`  ❌ ${m}`); failures++; };

let headMesh = null;
scene.traverse((o) => {
  if (o.isMesh && o.name === 'HeadMesh') headMesh = o;
});
if (!headMesh) { fail('HeadMesh 未找到'); process.exit(1); }
pass('HeadMesh 找到');

const dict = headMesh.morphTargetDictionary;
const inf = headMesh.morphTargetInfluences;
const morphCount = Object.keys(dict ?? {}).length;
const morphAttrs = headMesh.geometry.morphAttributes?.position;
console.log(`\n  morphTargetDictionary: ${morphCount} 项`);
console.log(`  morphTargetInfluences: ${inf?.length ?? 0} 项`);
console.log(`  geometry.morphAttributes.position: ${morphAttrs?.length ?? 0} 项`);

if (morphCount !== 72) fail(`morph 数量 ${morphCount} ≠ 72`);
else pass(`morph 数量 72`);
if (morphAttrs?.length !== 72) fail(`morphAttributes 数量 ${morphAttrs?.length} ≠ 72`);
else pass(`morphAttributes 72 项`);

// 检查关键 morph 数据（CPU 端 morphAttributes 就是每顶点位移）
const KEY_TESTS = [
  ['faceLength.pos', 27], ['jawWidth.pos', 1053], ['noseBridgeHeight.pos', 1191],
  ['eyeSize.pos', 1725], ['eyeSpacing.pos', 2735], ['chinProject.pos', 184],
];
console.log(`\n-- morphAttributes 数据验证 --`);
for (const [name, expectNonzero] of KEY_TESTS) {
  const idx = dict[name];
  if (idx === undefined) { fail(`${name} 不在字典`); continue; }
  const attr = morphAttrs[idx];
  if (!attr) { fail(`${name} morphAttribute 缺失`); continue; }
  let nonzero = 0;
  let maxMag = 0;
  for (let i = 0; i < attr.count; i++) {
    const x = attr.getX(i), y = attr.getY(i), z = attr.getZ(i);
    const mag = Math.sqrt(x * x + y * y + z * z);
    if (mag > 1e-7) { nonzero++; if (mag > maxMag) maxMag = mag; }
  }
  const ok = nonzero > 0;
  const closeEnough = Math.abs(nonzero - expectNonzero) / Math.max(expectNonzero, 1) < 0.15;
  if (ok && closeEnough) {
    pass(`${name}: ${nonzero} 非零顶点 (期望≈${expectNonzero}), 最大位移 ${(maxMag * 1000).toFixed(2)}mm`);
  } else {
    fail(`${name}: ${nonzero} 非零顶点 (期望≈${expectNonzero}), 最大位移 ${(maxMag * 1000).toFixed(2)}mm`);
  }
}

// 单侧 morph 验证（jawWidth.pos.L 只影响左侧）
console.log(`\n-- 单侧 morph 验证 --`);
const sideIdx = dict['jawWidth.pos.L'];
if (sideIdx !== undefined) {
  const attr = morphAttrs[sideIdx];
  let movedL = 0, movedR = 0;
  const basePos = headMesh.geometry.attributes.position;
  for (let i = 0; i < attr.count; i++) {
    const x = attr.getX(i), y = attr.getY(i), z = attr.getZ(i);
    if (Math.sqrt(x * x + y * y + z * z) > 1e-7) {
      if (basePos.getX(i) < 0) movedL++; else movedR++;
    }
  }
  if (movedL > 0 && movedR === 0) pass(`jawWidth.pos.L: ${movedL} 顶点全部在左侧 (R:${movedR})`);
  else fail(`jawWidth.pos.L 单侧验证失败 (L:${movedL}, R:${movedR})`);
} else {
  fail('jawWidth.pos.L 不在字典');
}

// 全部 72 个 morph 数据检查（非零数）
console.log(`\n-- 全部 72 个 morph 非零统计 --`);
let allNonZero = 0, zeros = [];
for (const [name, idx] of Object.entries(dict)) {
  const attr = morphAttrs[idx];
  let nonzero = 0;
  for (let i = 0; i < attr.count; i++) {
    const x = attr.getX(i), y = attr.getY(i), z = attr.getZ(i);
    if (Math.sqrt(x * x + y * y + z * z) > 1e-7) { nonzero++; break; }
  }
  if (nonzero > 0) allNonZero++; else zeros.push(name);
}
if (zeros.length === 0) pass(`全部 72 个 morph 均有非零位移数据`);
else fail(`${zeros.length} 个 morph 全零: ${zeros.join(', ')}`);

console.log(`\n${failures === 0 ? '🎉 全部 morph 数据验证通过' : `❌ ${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);