/**
 * 比较 NX9 morph 预览 PNG 与 neutral 的像素差异。
 * 纯 Node（zlib 解压 PNG IDAT），验证各 morph 是否产生可见变形。
 *
 * 用法：node scripts/compare-morph-pngs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const DIR = path.join(REPO, 'output', 'sculpt-morph-preview');

function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`not PNG: ${file}`);
  let off = 8;
  const chunks = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    chunks.push({ type, data: buf.slice(off + 8, off + 8 + len) });
    off += 12 + len;
  }
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = zlib.inflateSync(idat);
  return { w, h, bitDepth, colorType, raw };
}

function unfilter(raw, w, h, bpp) {
  // 实现 PNG 反滤波（None/Sub/Up/Average/Paeth）
  const stride = w * bpp;
  const out = Buffer.alloc(raw.length);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const line = out.slice(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const x = raw[rowStart + i];
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v;
      switch (f) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + Math.floor((a + b) / 2); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`bad filter ${f}`);
      }
      line[i] = v & 0xff;
    }
    prev = line;
  }
  return out;
}

const neutral = decodePng(path.join(DIR, 'neutral.png'));
const { w, h, colorType, bitDepth } = neutral;
const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
const neutralPx = unfilter(neutral.raw, w, h, bpp);

function diffPct(file) {
  const img = decodePng(file);
  if (img.w !== w || img.h !== h) return null;
  const px = unfilter(img.raw, w, h, bpp);
  let diff = 0;
  let maxDiff = 0;
  for (let i = 0; i < px.length; i++) {
    const d = Math.abs(px[i] - neutralPx[i]);
    if (d > maxDiff) maxDiff = d;
    if (d > 8) diff++; // 容差 8/255
  }
  return { diffPct: (diff / (w * h)) * 100, maxDiff };
}

console.log(`图像尺寸: ${w}x${h}, 位深: ${bitDepth}, 颜色类型: ${colorType}\n`);
console.log('Morph 状态              差异像素%   最大通道差');
console.log('──────────────────────────────────────────────');
const results = [];
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.png') && f !== 'neutral.png').sort()) {
  const r = diffPct(path.join(DIR, f));
  if (r === null) { console.log(`${f.padEnd(24)} 尺寸不一致`); continue; }
  results.push({ name: f, ...r });
  const flag = r.diffPct > 0.1 ? '' : ' ⚠️ 几乎无变化';
  console.log(`${f.padEnd(24)} ${r.diffPct.toFixed(3).padStart(8)}%   ${String(r.maxDiff).padStart(4)}${flag}`);
}

const noChange = results.filter((r) => r.diffPct <= 0.1);
console.log(`\n${noChange.length > 0 ? `⚠️ ${noChange.length} 个 morph 无明显像素变化: ${noChange.map(r => r.name).join(', ')}` : '🎉 全部 morph 均产生可见变形'}`);