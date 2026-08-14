/**
 * GLB 结构检查工具（只读诊断）。
 *
 * 用法：node scripts/inspect-glb.mjs <path-to.glb>
 *
 * 输出：节点树（含 mesh/skin 引用）、网格属性顶点数、morph 目标名、
 * 材质名与 accessor 汇总。不加载任何 WebGL/DOM。
 */
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/inspect-glb.mjs <file.glb>');
  process.exit(1);
}

const bytes = new Uint8Array(fs.readFileSync(file));
const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const magic = String.fromCharCode(...bytes.slice(0, 4));
const version = dv.getUint32(4, true);
const totalLen = dv.getUint32(8, true);
if (magic !== 'glTF') {
  console.error(`not a GLB (magic=${magic})`);
  process.exit(1);
}
console.log(`GLB ${path.basename(file)}: version=${version} totalBytes=${totalLen}`);

let offset = 12;
let jsonChunk = '';
const chunkTypes = [];
while (offset + 8 <= bytes.length) {
  const len = dv.getUint32(offset, true);
  const type = dv.getUint32(offset + 4, true);
  const typeName =
    type === 0x4e4f534a ? 'JSON' : type === 0x004e4942 ? 'BIN' : `0x${type.toString(16)}`;
  chunkTypes.push(`${typeName}(${len})`);
  if (type === 0x4e4f534a) {
    jsonChunk = new TextDecoder().decode(bytes.slice(offset + 8, offset + 8 + len));
  }
  offset += 8 + len;
}
console.log(`chunks: ${chunkTypes.join(', ')}`);

const json = JSON.parse(jsonChunk);
const nodes = json.nodes ?? [];
const meshes = json.meshes ?? [];
const materials = json.materials ?? [];
const accessors = json.accessors ?? [];
const skins = json.skins ?? [];

const nodeById = new Map(nodes.map((n, i) => [i, n]));

function dumpTree(nodeIdx, depth, visited) {
  const n = nodeById.get(nodeIdx);
  if (!n) return;
  const tag = visited.has(nodeIdx) ? ' [cycle]' : '';
  visited.add(nodeIdx);
  const parts = [n.name || '(unnamed)'];
  if (n.mesh !== undefined) parts.push(`mesh#${n.mesh}`);
  if (n.skin !== undefined) parts.push(`skin#${n.skin}`);
  if (n.camera !== undefined) parts.push(`camera#${n.camera}`);
  console.log('  '.repeat(depth) + parts.join(' '));
  for (const c of n.children ?? []) dumpTree(c, depth + 1, visited);
}

console.log('\n== scene ==');
for (const s of json.scenes ?? []) {
  console.log(`scene: ${s.name ?? '(unnamed)'}`);
  for (const r of s.nodes ?? []) dumpTree(r, 1, new Set());
}
if (!json.scenes?.length) {
  // 无 scene 时按全部根节点（无父）dump
  const parents = new Set();
  for (const n of nodes) for (const c of n.children ?? []) parents.add(c);
  nodes.forEach((n, i) => {
    if (!parents.has(i)) dumpTree(i, 1, new Set());
  });
}

console.log('\n== meshes ==');
for (let mi = 0; mi < meshes.length; mi++) {
  const m = meshes[mi];
  const prim = m.primitives?.[0];
  const attrib = prim?.attributes ?? {};
  const posAcc = attrib.POSITION !== undefined ? accessors[attrib.POSITION] : null;
  const morphCount = prim?.targets?.length ?? 0;
  const targetNames = prim?.extras?.targetNames ?? [];
  const triCount = posAcc ? Math.round((posAcc.count / 3) * (prim?.indices !== undefined ? 1 : 3)) : 0;
  console.log(
    `mesh#${mi} "${m.name ?? ''}" verts=${posAcc?.count ?? '?'} tris~=${triCount} morphTargets=${morphCount}${morphCount ? ` names[${morphCount}]: ${targetNames.join(', ') || '(no extras.targetNames)'}` : ''}`,
  );
}

console.log('\n== materials ==');
for (let i = 0; i < materials.length; i++) {
  const mat = materials[i];
  const pbr = mat.pbrMetallicRoughness ?? {};
  const base = pbr.baseColorFactor ?? [1, 1, 1, 1];
  const color = base.slice(0, 3).map((v) => Math.round(v * 255)).join(',');
  console.log(`material#${i} "${mat.name ?? ''}" baseColor=rgb(${color}) alpha=${base[3]}`);
}

console.log('\n== accessor counts (top 12 by count) ==');
const counts = accessors
  .map((a, i) => ({ i, count: a.count, type: a.type, componentType: a.componentType }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 12);
for (const c of counts) {
  console.log(`accessor#${c.i} count=${c.count} type=${c.type} componentType=${c.componentType}`);
}

console.log(`\nskins=${skins.length}`);
