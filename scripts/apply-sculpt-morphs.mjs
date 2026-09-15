/**
 * NX9 Sculpt Morph Applier（阶段 B：TS 侧施加位移到 GLB）。
 *
 * 读取 Blender 生成的 morph-displacements.json，将 shape key 位移
 * 作为 morph targets 写入源 GLB 的 HeadMesh，输出新的 GLB。
 *
 * 用法：
 *   node scripts/apply-sculpt-morphs.mjs
 *
 * 环境变量：
 *   NX9_SRC_GLB  - 源 GLB 路径（默认 apps/web/public/director3d/models/nx9-character-base.glb）
 *   NX9_DISP_JSON - 位移 JSON 路径（默认 output/refined/morph-displacements.json）
 *   NX9_OUT_GLB  - 输出 GLB 路径（默认 output/refined/nx9-character-sculpt.glb）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

const SRC_GLB = process.env.NX9_SRC_GLB
  || path.join(REPO, 'apps', 'web', 'public', 'director3d', 'models', 'nx9-character-base.glb');
const DISP_JSON = process.env.NX9_DISP_JSON
  || path.join(REPO, 'output', 'refined', 'morph-displacements.json');
const OUT_GLB = process.env.NX9_OUT_GLB
  || path.join(REPO, 'output', 'refined', 'nx9-character-sculpt.glb');

// ---------------------------------------------------------------------------
// GLB 二进制读写工具
// ---------------------------------------------------------------------------

/**
 * 读取 GLB，返回 { json, bin }。
 * bin 是原始 Uint8Array（不含 8 字节 chunk header）。
 */
function readGlb(filePath) {
  const buf = new Uint8Array(fs.readFileSync(filePath));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const magic = String.fromCharCode(...buf.slice(0, 4));
  if (magic !== 'glTF') throw new Error(`Not a GLB: ${filePath}`);

  const version = dv.getUint32(4, true);
  const totalLen = dv.getUint32(8, true);
  console.log(`GLB: version=${version}, total=${totalLen} bytes`);

  let offset = 12;
  let jsonChunk = '';
  let binChunk = null;

  while (offset + 8 <= buf.length) {
    const len = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    if (type === 0x4e4f534a) { // JSON
      jsonChunk = new TextDecoder().decode(buf.slice(offset + 8, offset + 8 + len));
    } else if (type === 0x004e4942) { // BIN
      binChunk = buf.slice(offset + 8, offset + 8 + len);
    }
    offset += 8 + len;
  }

  const json = JSON.parse(jsonChunk);
  return { json, bin: binChunk };
}

/**
 * 写入 GLB。
 * bin 为 Uint8Array（不含 chunk header），会自动对齐到 4 字节。
 */
function writeGlb(filePath, json, bin) {
  const jsonStr = JSON.stringify(json);
  const jsonBytes = new TextEncoder().encode(jsonStr);

  // JSON chunk: 对齐到 4 字节，用空格填充
  let jsonPad = '';
  while ((jsonBytes.length + jsonPad.length) % 4 !== 0) jsonPad += ' ';
  const jsonChunk = new Uint8Array(jsonBytes.length + jsonPad.length);
  jsonChunk.set(jsonBytes);
  for (let i = 0; i < jsonPad.length; i++) {
    jsonChunk[jsonBytes.length + i] = 0x20; // space
  }

  // BIN chunk: 对齐到 4 字节，用零填充
  const binLen = bin ? bin.length : 0;
  let binPad = 0;
  if (binLen % 4 !== 0) binPad = 4 - (binLen % 4);
  const binChunk = new Uint8Array(binLen + binPad);
  if (bin) binChunk.set(bin);

  // 组装
  const headerLen = 12;
  const jsonChunkHeader = 8;
  const binChunkHeader = binLen > 0 ? 8 : 0;
  const totalLen = headerLen + jsonChunkHeader + jsonChunk.length + binChunkHeader + binChunk.length;

  const out = new Uint8Array(totalLen);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  dv.setUint32(0, 0x46546c67, true); // 'glTF' magic (little-endian)
  dv.setUint32(4, 2, true); // version
  dv.setUint32(8, totalLen, true);

  // JSON chunk
  dv.setUint32(12, jsonChunk.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonChunk, 20);

  // BIN chunk
  if (binLen > 0) {
    const binOff = 20 + jsonChunk.length;
    dv.setUint32(binOff, binChunk.length, true);
    dv.setUint32(binOff + 4, 0x004e4942, true);
    out.set(binChunk, binOff + 8);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, out);
  console.log(`Wrote: ${filePath} (${totalLen} bytes)`);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  console.log('=== NX9 Sculpt Morph Applier ===');
  console.log(`Source GLB: ${SRC_GLB}`);
  console.log(`Displacements: ${DISP_JSON}`);
  console.log(`Output: ${OUT_GLB}`);

  // 1) 读取输入
  const { json, bin } = readGlb(SRC_GLB);
  const dispData = JSON.parse(fs.readFileSync(DISP_JSON, 'utf-8'));

  console.log(`Displacement shape keys: ${Object.keys(dispData.shapeKeys).length}`);
  console.log(`Basis vertices: ${dispData.basisVertices.length}`);

  // 2) 找到 HeadMesh（通过节点名查找，因为 mesh name 可能为空）
  const meshes = json.meshes ?? [];
  const nodes = json.nodes ?? [];
  let headMeshIdx = -1;

  // 先尝试从 mesh name 匹配
  for (let i = 0; i < meshes.length; i++) {
    if (meshes[i].name === 'HeadMesh') {
      headMeshIdx = i;
      break;
    }
  }
  // 如果 mesh name 为空，从节点名匹配
  if (headMeshIdx < 0) {
    for (const node of nodes) {
      if (node.name === 'HeadMesh' && node.mesh !== undefined) {
        headMeshIdx = node.mesh;
        break;
      }
    }
  }
  // 递归搜索子节点
  if (headMeshIdx < 0) {
    function findNode(nodesArr, name) {
      for (const node of nodesArr) {
        if (node.name === name && node.mesh !== undefined) return node.mesh;
        if (node.children) {
          for (const childIdx of node.children) {
            const result = findNode([nodes[childIdx]], name);
            if (result !== undefined) return result;
          }
        }
      }
      return undefined;
    }
    headMeshIdx = findNode(nodes, 'HeadMesh') ?? -1;
  }
  if (headMeshIdx < 0) {
    console.error('ERROR: HeadMesh not found in GLB');
    console.error('Available meshes:', meshes.map((m, i) => `#${i}: "${m.name}"`).join(', '));
    process.exit(1);
  }

  const headMesh = meshes[headMeshIdx];
  const prim = headMesh.primitives?.[0];
  if (!prim) {
    console.error('ERROR: HeadMesh has no primitives');
    process.exit(1);
  }

  console.log(`HeadMesh: mesh#${headMeshIdx}, verts=${json.accessors[prim.attributes.POSITION]?.count}`);

  // 3) 检查现有 morph targets
  const existingTargets = prim.targets ?? [];
  console.log(`Existing morph targets: ${existingTargets.length}`);

  // 4) 构建新的 morph targets
  // 每个 morph target 需要一个 accessor（指向 BIN 中的顶点位移数据）
  const accessors = json.accessors ?? [];
  const bufferViews = json.bufferViews ?? [];
  let binData = bin ? new Uint8Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)) : new Uint8Array(0);

  // 获取基础顶点位置 accessor 信息
  const posAccIdx = prim.attributes.POSITION;
  const posAcc = accessors[posAccIdx];
  const posBv = bufferViews[posAcc.bufferView];
  const vertexCount = posAcc.count;
  const posByteStride = posBv.byteStride || 12; // FLOAT_VEC3 = 12 bytes

  // 验证顶点数匹配
  if (vertexCount !== dispData.basisVertices.length) {
    console.error(`ERROR: vertex count mismatch: GLB=${vertexCount}, JSON=${dispData.basisVertices.length}`);
    process.exit(1);
  }

  // 需要添加的新 target accessors
  const newTargetNames = [];
  const newTargets = [];

  // 对齐要求：FLOAT_VEC3 accessor 需要 4 字节对齐
  function align4(n) { return (n + 3) & ~3; }

  // 收集所有 shape key 位移
  const shapeKeys = dispData.shapeKeys;
  const skNames = Object.keys(shapeKeys);
  let addedCount = 0;
  let skippedCount = 0;

  for (const skName of skNames) {
    const displacements = shapeKeys[skName];
    if (!displacements || displacements.length !== vertexCount) {
      console.warn(`  SKIP ${skName}: length mismatch (${displacements?.length} vs ${vertexCount})`);
      skippedCount++;
      continue;
    }

    // 检查是否所有位移均为零
    let allZero = true;
    for (let i = 0; i < displacements.length && allZero; i++) {
      const d = displacements[i];
      if (d[0] !== 0 || d[1] !== 0 || d[2] !== 0) allZero = false;
    }
    if (allZero) {
      console.warn(`  SKIP ${skName}: all displacements zero`);
      skippedCount++;
      continue;
    }

    // 将位移写入 BIN
    const floatData = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      floatData[i * 3] = displacements[i][0];
      floatData[i * 3 + 1] = displacements[i][1];
      floatData[i * 3 + 2] = displacements[i][2];
    }
    const byteData = new Uint8Array(floatData.buffer, floatData.byteOffset, floatData.byteLength);

    // 对齐到 4 字节
    const currentLen = binData.length;
    const alignedOffset = align4(currentLen);
    const newLen = alignedOffset + byteData.length;
    const newBin = new Uint8Array(newLen);
    newBin.set(binData);
    newBin.set(byteData, alignedOffset);
    binData = newBin;

    // 创建 bufferView
    const bvIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: alignedOffset,
      byteLength: byteData.length,
      byteStride: 12,
      target: 34962, // ARRAY_BUFFER
    });

    // 创建 accessor
    const accIdx = accessors.length;
    accessors.push({
      bufferView: bvIdx,
      componentType: 5126, // FLOAT
      count: vertexCount,
      type: 'VEC3',
      min: displacements.reduce(
        (m, d) => [Math.min(m[0], d[0]), Math.min(m[1], d[1]), Math.min(m[2], d[2])],
        [Infinity, Infinity, Infinity],
      ),
      max: displacements.reduce(
        (m, d) => [Math.max(m[0], d[0]), Math.max(m[1], d[1]), Math.max(m[2], d[2])],
        [-Infinity, -Infinity, -Infinity],
      ),
    });

    // 添加 morph target
    newTargets.push({ POSITION: accIdx });
    newTargetNames.push(skName);
    addedCount++;

    if (addedCount % 10 === 0) {
      console.log(`  Progress: ${addedCount}/${skNames.length} shape keys processed`);
    }
  }

  console.log(`Added: ${addedCount}, Skipped: ${skippedCount}`);

  // 5) 更新 prim（替换现有 morph targets，仅保留新的 Blender 生成的）
  prim.targets = newTargets;

  // 更新 extras.targetNames
  if (!prim.extras) prim.extras = {};
  prim.extras.targetNames = newTargetNames;

  // 6) 更新 buffer 长度
  if (json.buffers && json.buffers.length > 0) {
    json.buffers[0].byteLength = binData.length;
  }

  // 7) 写入输出
  writeGlb(OUT_GLB, json, binData);

  console.log(`\nDone! Output: ${OUT_GLB}`);
  console.log(`Total morph targets: ${prim.targets.length}`);
  console.log(`Target names: ${prim.extras.targetNames.length}`);
}

main();