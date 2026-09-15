/**
 * NX9 Sculpt GLB 契约验证脚本（纯 Node，无三方依赖）。
 *
 * 解析 GLB JSON chunk，检查 HeadMesh 的 morph target 名称是否覆盖
 * 全部 32 个 morph 驱动参数（含 jawWidth/eyeSpacing 的 .L/.R 扩展），
 * 以及骨骼、Handle、材质通道是否齐全。
 *
 * 用法：
 *   node scripts/validate-sculpt-glb.mjs [path-to.glb]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

const GLB_PATH = process.argv[2]
  || process.env.NX9_OUT_GLB
  || path.join(REPO, 'apps', 'web', 'public', 'director3d', 'models', 'nx9-character-sculpt.glb');

// ---- 与 @nx9/shared FACE_RIG_PARAMS 同步的 morph 驱动参数 ----
const MORPH_PARAMS = [
  // shape (8)
  'faceLength', 'cheekboneWidth', 'jawWidth', 'jawAngle', 'chinLength',
  'chinProject', 'templeWidth', 'cheekFullness',
  // eyes (7, irisSize 是 material)
  'eyeSize', 'eyeSpacing', 'eyeTilt', 'eyelidFold', 'orbitDepth', 'underEyeFold', 'browEyeGap',
  // brows (3, browDensity 是 material)
  'browArch', 'browAngle', 'browLength',
  // nose (6)
  'noseBridgeHeight', 'noseBridgeWidth', 'noseTipSize', 'nostrilWidth', 'noseTipAngle', 'noseLength',
  // mouth (6)
  'upperLipThickness', 'lowerLipThickness', 'mouthWidth', 'lipPeak', 'mouthCorner', 'philtrumLength',
  // surface (2, skinTexture/underEyeShadow/freckles 是 material)
  'facialFat', 'nasolabial',
];

const BILATERAL = new Set(['jawWidth', 'eyeSpacing']);

const BONE_NAMES = [
  'Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head',
  'Clavicle.L', 'Clavicle.R', 'UpperArm.L', 'UpperArm.R',
  'LowerArm.L', 'LowerArm.R', 'Hand.L', 'Hand.R',
  'UpperLeg.L', 'UpperLeg.R', 'LowerLeg.L', 'LowerLeg.R', 'Foot.L', 'Foot.R',
];

const HANDLE_NAMES = [
  'Handle.Jaw.L', 'Handle.Jaw.R', 'Handle.EyeOuter.L', 'Handle.EyeOuter.R',
  'Handle.NoseBridge', 'Handle.Hairline', 'Handle.Shoulder.L', 'Handle.Shoulder.R', 'Handle.Height',
];

const MATERIAL_CHANNELS = ['Skin', 'Sclera', 'Iris', 'Brow', 'Freckle'];

// ---------------------------------------------------------------------------

function readGlbJson(filePath) {
  const buf = new Uint8Array(fs.readFileSync(filePath));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = String.fromCharCode(...buf.slice(0, 4));
  if (magic !== 'glTF') throw new Error(`not a GLB (magic=${magic})`);

  let offset = 12;
  let jsonChunk = '';
  while (offset + 8 <= buf.length) {
    const len = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    if (type === 0x4e4f534a) {
      jsonChunk = new TextDecoder().decode(buf.slice(offset + 8, offset + 8 + len));
      break;
    }
    offset += 8 + len;
  }
  return JSON.parse(jsonChunk);
}

function collectNodeNames(json) {
  const names = new Set();
  for (const node of json.nodes ?? []) {
    if (node.name) names.add(node.name);
  }
  return names;
}

function collectNodeNamesRecursive(json) {
  // GLB 节点树遍历（含嵌套）
  const names = new Set();
  const nodes = json.nodes ?? [];
  for (const node of nodes) {
    if (node.name) names.add(node.name);
  }
  return names;
}

function main() {
  let failures = 0;
  const pass = (msg) => console.log(`  ✅ ${msg}`);
  const fail = (msg) => { console.log(`  ❌ ${msg}`); failures++; };

  console.log(`=== NX9 Sculpt GLB 契约验证: ${path.basename(GLB_PATH)} ===\n`);

  const json = readGlbJson(GLB_PATH);
  const nodeNames = collectNodeNamesRecursive(json);
  const meshes = json.meshes ?? [];
  const materials = json.materials ?? [];
  const accessors = json.accessors ?? [];
  const bufferViews = json.bufferViews ?? [];

  // 1) 找到 HeadMesh
  let headMesh = null;
  for (const node of json.nodes ?? []) {
    if (node.name === 'HeadMesh' && node.mesh !== undefined) {
      headMesh = meshes[node.mesh];
      break;
    }
  }
  if (!headMesh) {
    fail('HeadMesh 未找到');
    process.exit(1);
  }
  pass('HeadMesh 存在');

  // 2) 检查 morph targets
  const prim = headMesh.primitives?.[0];
  const targets = prim?.targets ?? [];
  const targetNames = prim?.extras?.targetNames ?? [];

  console.log(`\n-- Morph Targets (${targets.length}) --`);
  const requiredNames = [];
  for (const paramId of MORPH_PARAMS) {
    requiredNames.push(`${paramId}.pos`, `${paramId}.neg`);
    if (BILATERAL.has(paramId)) {
      requiredNames.push(`${paramId}.pos.L`, `${paramId}.neg.L`, `${paramId}.pos.R`, `${paramId}.neg.R`);
    }
  }
  const expectedCount = requiredNames.length;
  const actualNames = new Set(targetNames);

  if (targets.length !== expectedCount) {
    fail(`morph target 数量 ${targets.length} ≠ 期望 ${expectedCount}`);
  } else {
    pass(`morph target 数量 ${targets.length} = 期望 ${expectedCount}`);
  }

  const missing = requiredNames.filter((n) => !actualNames.has(n));
  const extra = [...actualNames].filter((n) => !requiredNames.includes(n));
  if (missing.length === 0) {
    pass('全部 72 个必需 morph 名称存在');
  } else {
    fail(`缺少 morph: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    console.log(`  ⚠️ 额外 morph: ${extra.join(', ')}`);
  }

  // 检查每个 morph accessor 数据是否有效
  let badMorph = 0;
  for (const t of targets) {
    const accIdx = t.POSITION;
    if (accIdx === undefined) { badMorph++; continue; }
    const acc = accessors[accIdx];
    if (!acc || acc.count !== 4669 || acc.type !== 'VEC3' || acc.componentType !== 5126) {
      badMorph++;
    }
  }
  if (badMorph === 0) pass('全部 morph accessor 有效 (VEC3/FLOAT/4669 verts)');
  else fail(`${badMorph} 个 morph accessor 无效`);

  // 3) 检查骨骼
  console.log(`\n-- Armature --`);
  const missingBones = BONE_NAMES.filter((b) => !nodeNames.has(b));
  if (missingBones.length === 0) pass('20 块骨骼齐全');
  else fail(`缺少骨骼: ${missingBones.join(', ')}`);

  // 4) 检查 Handle
  console.log(`\n-- Handles --`);
  const missingHandles = HANDLE_NAMES.filter((h) => !nodeNames.has(h));
  if (missingHandles.length === 0) pass('9 个 Handle 齐全');
  else fail(`缺少 Handle: ${missingHandles.join(', ')}`);

  // 5) 检查材质通道
  console.log(`\n-- Materials --`);
  const matNames = materials.map((m) => m.name ?? '');
  const missingMats = MATERIAL_CHANNELS.filter((c) => !matNames.some((n) => n.toLowerCase().includes(c.toLowerCase())));
  if (missingMats.length === 0) pass('5 个材质通道齐全 (Skin/Sclera/Iris/Brow/Freckle)');
  else fail(`缺少材质通道: ${missingMats.join(', ')}`);

  // 6) 统计三角面（近似）
  console.log(`\n-- Mesh stats --`);
  let totalTris = 0;
  for (const m of meshes) {
    const p = m.primitives?.[0];
    if (!p) continue;
    const posAcc = accessors[p.attributes.POSITION];
    const idxAcc = p.indices !== undefined ? accessors[p.indices] : null;
    const n = idxAcc ? idxAcc.count / 3 : (posAcc?.count ?? 0) / 3;
    totalTris += Math.round(n);
  }
  console.log(`  总三角面: ${totalTris} ${totalTris > 100000 ? '⚠️ 超过警告线' : '✅ 低于 10 万'}`);
  if (totalTris > 100000) fail('三角面超过 100000 警告线');

  // 7) 文件大小
  const sizeKB = Math.round(fs.statSync(GLB_PATH).size / 1024);
  console.log(`\n  文件大小: ${sizeKB} KB`);

  console.log(`\n${failures === 0 ? '🎉 全部契约检查通过' : `❌ ${failures} 项检查失败`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();