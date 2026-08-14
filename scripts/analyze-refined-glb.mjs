// 分析精修 GLB：morph target 完整性 + 索引是否翻倍
// 用法: node scripts/analyze-refined-glb.mjs <glb>
import fs from 'node:fs';

const p = process.argv[2];
if (!p) {
  console.error('usage: node scripts/analyze-refined-glb.mjs <glb>');
  process.exit(1);
}
const b = fs.readFileSync(p);
const jsonLen = b.readUInt32LE(12);
const j = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
const binOff = 20 + jsonLen + 8;
const dv = new DataView(b.buffer, b.byteOffset + binOff);

function readAccessor(idx) {
  const a = j.accessors[idx];
  const off = binOff + (a.byteOffset ?? 0);
  const compSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const out = new Float32Array(a.count * comps);
  for (let i = 0; i < a.count * comps; i++) {
    if (a.componentType === 5126) out[i] = dv.getFloat32(off + i * 4, true);
    else if (a.componentType === 5123) out[i] = dv.getUint16(off + i * 2, true);
    else if (a.componentType === 5121) out[i] = dv.getUint8(off + i);
    else out[i] = dv.getInt16(off + i * 2, true);
  }
  return { a, data: out, comps };
}

console.log('== 索引翻倍检查 ==');
let totalTris = 0;
for (const m of j.meshes) {
  for (const prim of m.primitives) {
    if (prim.indices === undefined) continue;
    const { a, data } = readAccessor(prim.indices);
    const cnt = a.count;
    totalTris += cnt / 3;
    if (m.name === 'HeadMesh' || m.name === 'BodyMesh' || m.name === 'NeckMesh') {
      const half = cnt / 2;
      let same = true;
      for (let i = 0; i < half; i++) {
        if (data[i] !== data[i + half]) {
          same = false;
          break;
        }
      }
      let mx = 0;
      for (let i = 0; i < cnt; i++) if (data[i] > mx) mx = data[i];
      const posAcc = readAccessor(prim.attributes.POSITION);
      console.log(
        `${m.name}: indices=${cnt} tris=${cnt / 3} firstHalf==secondHalf=${same} maxIdx=${mx} posVerts=${posAcc.a.count}`,
      );
    }
  }
}
console.log('totalTris(sum of index/3)=', totalTris);

console.log('== morph target 完整性 ==');
const params = [
  'faceLength', 'cheekboneWidth', 'jawWidth', 'jawAngle', 'chinLength', 'chinProject',
  'templeWidth', 'cheekFullness', 'eyeSize', 'eyeSpacing', 'eyeTilt', 'eyelidFold',
  'orbitDepth', 'underEyeFold', 'browEyeGap', 'browArch', 'browAngle', 'browLength',
  'noseBridgeHeight', 'noseBridgeWidth', 'noseTipSize', 'nostrilWidth', 'noseTipAngle',
  'noseLength', 'upperLipThickness', 'lowerLipThickness', 'mouthWidth', 'lipPeak',
  'mouthCorner', 'philtrumLength', 'facialFat', 'nasolabial',
];
const expect = [];
for (const p of params) {
  if (p === 'jawWidth' || p === 'eyeSpacing') {
    expect.push(`${p}.pos`, `${p}.neg`, `${p}.pos.L`, `${p}.neg.L`, `${p}.pos.R`, `${p}.neg.R`);
  } else {
    expect.push(`${p}.pos`, `${p}.neg`);
  }
}
for (const m of j.meshes) {
  const names = m.extras?.targetNames ?? [];
  if (!names.length) continue;
  const missing = expect.filter((n) => !names.includes(n));
  console.log(`${m.name}: targets=${names.length} missing=${JSON.stringify(missing)}`);
  // 每个 target 的最大位移（相对基准）
  const prim = m.primitives[0];
  const base = readAccessor(prim.attributes.POSITION).data;
  let rep = '';
  for (let t = 0; t < prim.targets.length; t++) {
    const tpos = readAccessor(prim.targets[t].POSITION).data;
    let mx = 0;
    for (let i = 0; i < tpos.length; i++) mx = Math.max(mx, Math.abs(tpos[i] - base[i]));
    if (t < 6 || mx > 0.02) rep += `${names[t]}=${mx.toFixed(4)} `;
  }
  console.log(`  maxDelta 摘要: ${rep}`);
}
