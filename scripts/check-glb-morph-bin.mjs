/**
 * 直接解析 GLB BIN 数据，验证 morph target accessor 中的数据是否非零。
 * 用法：node scripts/check-glb-morph-bin.mjs [path-to.glb]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const GLB_PATH = process.argv[2] || path.join(REPO, 'apps', 'web', 'public', 'director3d', 'models', 'nx9-character-sculpt.glb');

const buf = new Uint8Array(fs.readFileSync(GLB_PATH));
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

let offset = 12;
let jsonStr = '';
let bin = null;
let binFileOffset = 0;
while (offset + 8 <= buf.length) {
  const len = dv.getUint32(offset, true);
  const type = dv.getUint32(offset + 4, true);
  if (type === 0x4e4f534a) jsonStr = new TextDecoder().decode(buf.slice(offset + 8, offset + 8 + len));
  else if (type === 0x004e4942) { bin = buf.slice(offset + 8, offset + 8 + len); binFileOffset = offset + 8; }
  offset += 8 + len;
}
const json = JSON.parse(jsonStr);
const accessors = json.accessors;
const bufferViews = json.bufferViews;

// 找到 HeadMesh
const meshes = json.meshes;
let headMesh = null;
for (const node of json.nodes ?? []) {
  if (node.name === 'HeadMesh' && node.mesh !== undefined) { headMesh = meshes[node.mesh]; break; }
}
if (!headMesh) { console.error('HeadMesh not found'); process.exit(1); }
const prim = headMesh.primitives[0];
const targets = prim.targets ?? [];
const targetNames = prim.extras?.targetNames ?? [];

console.log(`HeadMesh morph targets: ${targets.length}`);

// 读取指定 accessor 的数据（FLOAT VEC3），byteOffset 相对 BIN chunk 开头，需加 binFileOffset
function readVec3(accIdx) {
  const acc = accessors[accIdx];
  const bv = bufferViews[acc.bufferView];
  const start = binFileOffset + (bv.byteOffset ?? 0);
  const stride = bv.byteStride ?? 12;
  const out = [];
  for (let i = 0; i < Math.min(acc.count, 10); i++) {
    const p = start + i * stride;
    out.push([dv.getFloat32(p, true), dv.getFloat32(p + 4, true), dv.getFloat32(p + 8, true)]);
  }
  return { acc, bv, sample: out };
}

// 检查关键 morph 数据
for (const name of ['jawWidth.pos', 'faceLength.pos', 'noseBridgeHeight.pos', 'eyeSize.pos', 'eyeSpacing.pos']) {
  const idx = targetNames.indexOf(name);
  if (idx < 0) { console.log(`${name}: 未找到`); continue; }
  const t = targets[idx];
  const { acc, bv, sample } = readVec3(t.POSITION);
  // 统计非零顶点数
  let nonzero = 0;
  const start = binFileOffset + (bv.byteOffset ?? 0);
  const stride = bv.byteStride ?? 12;
  for (let i = 0; i < acc.count; i++) {
    const p = start + i * stride;
    const x = dv.getFloat32(p, true), y = dv.getFloat32(p + 4, true), z = dv.getFloat32(p + 8, true);
    if (Math.abs(x) > 1e-7 || Math.abs(y) > 1e-7 || Math.abs(z) > 1e-7) nonzero++;
  }
  console.log(`${name}: target#${idx} acc#${t.POSITION} count=${acc.count} nonzero=${nonzero}/${acc.count} sample=${JSON.stringify(sample.map(s => s.map(v => +v.toFixed(5))))}`);
}

// 也检查第一个 target 的完整信息
if (targets.length > 0) {
  const t0 = targets[0];
  console.log(`\n首个 target 结构: ${JSON.stringify(t0)}`);
  console.log(`targetNames[0:5]: ${targetNames.slice(0, 5).join(', ')}`);
}