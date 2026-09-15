/**
 * 诊断探针（非验收测试）：加载 NX9_GLB_PREVIEW 指定的身体 GLB，
 * 输出手臂/腿的几何数据报告到 output/mpfb-diag/body-geometry.txt。
 * 坐标系：glTF Y-up（x 右 / y 上 / z 前），与基模模型空间一致。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Matrix4, Vector3, type Group } from 'three';
import { CAM_PRESETS, SIL_BG, renderScene, type Cam } from './sculpt-preview-render.test';

const GLB_PREVIEW = process.env.NX9_GLB_PREVIEW;
const TAG = process.env.NX9_PROBE_TAG ?? 'v19d';
const OUT = path.resolve(process.cwd(), `../../output/mpfb-diag/body-geometry-${TAG}.txt`);

interface V3 {
  x: number;
  y: number;
  z: number;
}

async function loadPositions(): Promise<V3[]> {  const disk = fs.readFileSync(path.resolve(process.cwd(), GLB_PREVIEW!));
  const buf = new ArrayBuffer(disk.byteLength);
  new Uint8Array(buf).set(disk);
  const gltf = await new Promise<Group>((resolve, reject) => {
    new GLTFLoader().parse(buf, '', (g) => resolve(g.scene as Group), (e) => reject(e));
  });
  gltf.updateMatrixWorld(true);
  const out: V3[] = [];
  const walk = (o: { isMesh?: boolean; children?: unknown[] }) => {
    if (o.isMesh) {
      const mesh = o as unknown as {
        geometry: { getAttribute: (n: string) => { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } };
        matrixWorld: Matrix4;
      };
      const pos = mesh.geometry.getAttribute('position');
      const v = new Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
        out.push({ x: v.x, y: v.y, z: v.z });
      }
    }
    for (const c of o.children ?? []) walk(c as { isMesh?: boolean; children?: unknown[] });
  };
  walk(gltf as unknown as { isMesh?: boolean; children?: unknown[] });
  return out;
}

async function loadRoot(): Promise<Group> {
  const disk = fs.readFileSync(path.resolve(process.cwd(), GLB_PREVIEW!));
  const buf = new ArrayBuffer(disk.byteLength);
  new Uint8Array(buf).set(disk);
  return new Promise<Group>((resolve, reject) => {
    new GLTFLoader().parse(buf, '', (g) => resolve(g.scene as Group), (e) => reject(e));
  });
}

const fmt = (n: number, d = 3) => n.toFixed(d);

/**
 * 表面轮廓：用软渲染器输出掩码，逐行找全部连续区间（可分离两腿/两臂）。
 * 返回按行(自上而下)的区间列表：{ y, segs: [xL, xR][] }（世界坐标，米）。
 */
function surfaceContour(root: unknown, cam: Cam, W: number, H: number, isFront: boolean) {
  const img = renderScene(root, cam, W, H, SIL_BG);
  const dist = cam.pos.distanceTo(cam.target);
  const halfV = dist * Math.tan((cam.fov * Math.PI) / 180 / 2);
  const halfH = halfV * (W / H);
  const pxX = halfH / (W / 2);
  const pxY = halfV / (H / 2);
  const rows: { y: number; segs: [number, number][] }[] = [];
  for (let r = 0; r < H; r += 2) {
    const segs: [number, number][] = [];
    let start = -1;
    for (let c = 0; c < W; c++) {
      let hit = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const o = ((r + dy) * W + (c + dx)) * 3;
          if (
            Math.abs(img[o] - SIL_BG.top[0]) > 4 ||
            Math.abs(img[o + 1] - SIL_BG.top[1]) > 4 ||
            Math.abs(img[o + 2] - SIL_BG.top[2]) > 4
          ) {
            hit++;
          }
        }
      }
      if (hit > 0) {
        if (start < 0) start = c;
      } else if (start >= 0) {
        segs.push([start, c - 1]);
        start = -1;
      }
    }
    if (start >= 0) segs.push([start, W - 1]);
    if (segs.length === 0) continue;
    const py = r + 0.5;
    const worldY = cam.target.y + (H / 2 - py) * pxY;
    rows.push({
      y: worldY,
      segs: segs.map(([a, b]) => {
        const wxa = (a + 0.5 - W / 2) * pxX;
        const wxb = (b + 0.5 - W / 2) * pxX;
        return isFront ? [Math.min(wxa, wxb), Math.max(wxa, wxb)] : [Math.min(wxa, wxb), Math.max(wxa, wxb)];
      }),
    });
  }
  return rows;
}

// 诊断探针（非验收测试）：缺 NX9_GLB_PREVIEW 时跳过而不是红
describe.skipIf(!GLB_PREVIEW)('探针: 身体几何报告（手臂/腿）', () => {
  it('输出 geometry 报告', async () => {
    expect(GLB_PREVIEW, '需要 NX9_GLB_PREVIEW').toBeTruthy();
    const pts = await loadPositions();
    const L: string[] = [];
    const P = (s = '') => L.push(s);
    const lines: string[] = [];

    // ── 总 AABB ──
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    P(`=== BODY GEOMETRY PROBE ===`);
    P(`verts=${pts.length} AABB x=[${fmt(minX)},${fmt(maxX)}] y=[${fmt(minY)},${fmt(maxY)}] h=${fmt(maxY - minY)}m`);

    // ── 整身轮廓（每 1cm 带）──
    P(`\n--- FRONT OUTLINE per 1cm band (cm) ---`);
    P(` y      R(x)  L(x)   width   zmin  zmax  depth`);
    const rOut: number[] = [];
    for (let y0 = 3; y0 < 178; y0++) {
      const y1 = y0 + 1;
      let r = -Infinity, l = Infinity, zmin = Infinity, zmax = -Infinity;
      for (const p of pts) {
        const yc = p.y * 100;
        if (yc < y0 || yc >= y1) continue;
        if (p.x > r) r = p.x;
        if (p.x < l) l = p.x;
        if (p.z < zmin) zmin = p.z;
        if (p.z > zmax) zmax = p.z;
      }
      if (r === -Infinity) continue;
      rOut.push(r);
      P(` ${y0}    ${fmt(r * 100, 1)}  ${fmt(l * 100, 1)}  ${fmt((r - l) * 100, 1)}  ${fmt(zmin * 100, 1)} ${fmt(zmax * 100, 1)}  ${fmt((zmax - zmin) * 100, 1)}`);
    }

    // ── 正面 ASCII 图（1 行/cm，100 列 = ±0.31m）──
    const COLS = 100;
    const span = 0.62;
    const rows: string[] = [];
    for (let y0 = 176; y0 >= 3; y0--) {
      const y1 = y0 + 1;
      let r = -Infinity, l = Infinity;
      for (const p of pts) {
        const yc = p.y * 100;
        if (yc < y0 || yc >= y1) continue;
        if (p.x > r) r = p.x;
        if (p.x < l) l = p.x;
      }
      if (r === -Infinity) { rows.push(''); continue; }
      const row = new Array<string>(COLS).fill(' ');
      const ci = (x: number) => Math.max(0, Math.min(COLS - 1, Math.round((x + span / 2) / span * (COLS - 1))));
      row[ci(l)] = '#'; row[ci(r)] = '#';
      rows.push(row.join(''));
    }
    P(`\n--- FRONT ASCII (top->bottom, 1 row/cm, ${COLS} cols = ±0.31m) ---`);
    P(rows.join('\n'));

    // ── 手臂中心线（每 2cm 带，含肩/三角肌）──
    for (const side of [1, -1]) {
      P(`\n--- ARM side ${side > 0 ? 'R' : 'L'} centerline (2cm bins) ---`);
      P(` y      n    cx    outer  inner  angle(deg)`);
      let prev: { y: number; cx: number } | null = null;
      for (let y0 = 68; y0 <= 150; y0 += 2) {
        const y1 = y0 + 2;
        const sel: V3[] = [];
        for (const p of pts) {
          const yc = p.y * 100;
          if (yc < y0 || yc >= y1) continue;
          const sx = side * p.x;
          if (y0 < 110 ? sx > 0.20 : sx > 0.16) sel.push(p);
        }
        if (sel.length < 4) { prev = null; continue; }
        let cx = 0, outer = 0, inner = Infinity;
        for (const p of sel) {
          const sx = side * p.x;
          cx += sx;
          if (sx > outer) outer = sx;
          if (sx < inner) inner = sx;
        }
        cx /= sel.length;
        let ang = NaN;
        if (prev) {
          const dy = prev.y - y1; // 下行距离（cm）
          ang = Math.atan2(cx - prev.cx, dy / 100) * 180 / Math.PI;
        }
        P(` ${y0}   ${String(sel.length).padStart(4)}  ${fmt(cx * 100, 1)}  ${fmt(outer * 100, 1)}  ${fmt(inner * 100, 1)}  ${Number.isNaN(ang) ? '   -' : fmt(ang, 1).padStart(5)}`);
        prev = { y: y1, cx };
      }
    }

    // ── 手臂粗细（横截面宽度）──
    P(`\n--- ARM cross-section width (cm) per 2cm band ---`);
    P(` y      n   width  depth  cx`);
    for (let y0 = 104; y0 <= 146; y0 += 2) {
      const y1 = y0 + 2;
      let w = 0, d = 0, cx = 0, n = 0;
      let zmin = Infinity, zmax = -Infinity;
      for (const p of pts) {
        const yc = p.y * 100;
        if (yc < y0 || yc >= y1) continue;
        const sx = Math.abs(p.x);
        if (sx < 0.15) continue;
        w += sx; cx += sx; n++;
        if (p.z < zmin) zmin = p.z;
        if (p.z > zmax) zmax = p.z;
      }
      if (n === 0) continue;
      w = w / n;
      // 用最外层 30% 的均值差估算管宽
      const xs = pts.filter((p) => { const yc = p.y * 100; return yc >= y0 && yc < y1 && Math.abs(p.x) >= 0.15; }).map((p) => Math.abs(p.x)).sort((a, b) => b - a);
      const k = Math.max(1, Math.floor(xs.length * 0.3));
      const out30 = xs.slice(0, k).reduce((a, b) => a + b, 0) / k;
      const in30 = xs.slice(-k).reduce((a, b) => a + b, 0) / k;
      d = (zmax - zmin) * 100;
      P(` ${y0}   ${String(n).padStart(4)}  ${fmt((out30 - in30) * 100, 1)}  ${fmt(d, 1)}  ${fmt(w * 100, 1)}  (out30=${fmt(out30 * 100, 1)} in30=${fmt(in30 * 100, 1)})`);
    }

    // ── 腿中心线 ──
    for (const side of [1, -1]) {
      P(`\n--- LEG side ${side > 0 ? 'R' : 'L'} centerline (2cm bins) ---`);
      P(` y      n    cx    outer  inner  angle(deg)`);
      let prev: { y: number; cx: number } | null = null;
      for (let y0 = 4; y0 <= 96; y0 += 2) {
        const y1 = y0 + 2;
        const sel: V3[] = [];
        for (const p of pts) {
          const yc = p.y * 100;
          if (yc < y0 || yc >= y1) continue;
          const sx = side * p.x;
          if (sx < 0.015 || sx > 0.30) continue;
          if (y0 >= 8 && (p.z < -0.14 || p.z > 0.14)) continue; // 排除脚（低带除外）
          sel.push(p);
        }
        if (sel.length < 4) { prev = null; continue; }
        let cx = 0, outer = 0, inner = Infinity;
        for (const p of sel) {
          const sx = side * p.x;
          cx += sx;
          if (sx > outer) outer = sx;
          if (sx < inner) inner = sx;
        }
        cx /= sel.length;
        let ang = NaN;
        if (prev) {
          const dy = prev.y - y1;
          ang = Math.atan2(cx - prev.cx, dy / 100) * 180 / Math.PI;
        }
        P(` ${y0}   ${String(sel.length).padStart(4)}  ${fmt(cx * 100, 1)}  ${fmt(outer * 100, 1)}  ${fmt(inner * 100, 1)}  ${Number.isNaN(ang) ? '   -' : fmt(ang, 1).padStart(5)}`);
        prev = { y: y1, cx };
      }
    }

    // ── 腿横截面 ──
    P(`\n--- LEG cross-section (width/depth cm) ---`);
    P(` y      n   width  depth  cx`);
    for (const y0 of [8, 16, 30, 45, 60, 70, 80]) {
      const y1 = y0 + 4;
      const sel = pts.filter((p) => {
        const yc = p.y * 100;
        if (yc < y0 || yc >= y1) return false;
        const sx = Math.abs(p.x);
        if (sx < 0.015 || sx > 0.30) return false;
        return true;
      });
      if (sel.length < 4) continue;
      const xs = sel.map((p) => Math.abs(p.x)).sort((a, b) => b - a);
      const w = xs[0] - xs[xs.length - 1];
      let zmin = Infinity, zmax = -Infinity;
      for (const p of sel) {
        if (p.z < zmin) zmin = p.z;
        if (p.z > zmax) zmax = p.z;
      }
      let cx = 0;
      for (const p of sel) cx += Math.abs(p.x);
      cx /= sel.length;
      P(` ${y0}   ${String(sel.length).padStart(4)}  ${fmt(w * 100, 1)}  ${fmt((zmax - zmin) * 100, 1)}  ${fmt(cx * 100, 1)}`);
    }

    // ── 脚 ──
    for (const side of [1, -1]) {
      const foot = pts.filter((p) => p.y < 0.05 && side * p.x > 0.02);
      if (foot.length < 5) continue;
      const toe = foot.filter((p) => p.z > 0.10);
      const heel = foot.filter((p) => p.z < 0.03);
      let tx = 0, tz = 0, hx = 0, hz = 0;
      for (const p of toe) { tx += side * p.x; tz += p.z; }
      for (const p of heel) { hx += side * p.x; hz += p.z; }
      tx /= toe.length; tz /= toe.length; hx /= heel.length; hz /= heel.length;
      let zmin = Infinity, zmax = -Infinity, xmax = 0;
      for (const p of foot) {
        if (p.z < zmin) zmin = p.z;
        if (p.z > zmax) zmax = p.z;
        if (Math.abs(p.x) > xmax) xmax = Math.abs(p.x);
      }
      const ang = Math.atan2(tx - hx, tz - hz) * 180 / Math.PI;
      P(`\n--- FOOT ${side > 0 ? 'R' : 'L'} ---`);
      P(` heel=(${fmt(hx * 100, 1)},${fmt(hz * 100, 1)}) toe=(${fmt(tx * 100, 1)},${fmt(tz * 100, 1)}) splay=${fmt(ang, 1)}deg len=${fmt((zmax - zmin) * 100, 1)}cm outer|x|=${fmt(xmax * 100, 1)}cm`);
    }

    // ── 表面轮廓（渲染掩码，真实外轮廓）──
    const root = await loadRoot();
    const front = surfaceContour(root, CAM_PRESETS.body, 288, 440, true);
    const side = surfaceContour(root, CAM_PRESETS.side, 288, 440, false);
    P(`\n--- FRONT SURFACE CONTOUR (rows ~0.94cm, segs=[xL,xR] cm) ---`);
    for (const r of front) {
      P(` y=${fmt(r.y * 100, 1).padStart(6)}  ${r.segs.map((s) => `[${fmt(s[0] * 100, 1)},${fmt(s[1] * 100, 1)}]`).join(' ')}`);
    }
    P(`\n--- SIDE SURFACE CONTOUR (rows ~0.94cm, segs=[zBack,zFront] cm) ---`);
    for (const r of side) {
      P(` y=${fmt(r.y * 100, 1).padStart(6)}  ${r.segs.map((s) => `[${fmt(s[0] * 100, 1)},${fmt(s[1] * 100, 1)}]`).join(' ')}`);
    }

    // ── 腿统计（两段区间行：gap=两腿内缘距；w=单腿宽；c=腿心）──
    P(`\n--- LEG STATS (2-seg rows, y<0.88) ---`);
    for (const r of front) {
      if (r.y >= 0.88 || r.segs.length !== 2) continue;
      const [a, b] = r.segs;
      const gap = b[0] - a[1];
      const wL = a[1] - a[0];
      const wR = b[1] - b[0];
      const cR = (b[0] + b[1]) / 2;
      P(` y=${fmt(r.y * 100, 1).padStart(6)}  gap=${fmt(gap * 100, 1).padStart(5)}  wL=${fmt(wL * 100, 1)}  wR=${fmt(wR * 100, 1)}  cR=${fmt(cR * 100, 1)}`);
    }

    P(`\n--- WEIRD VERTS (y>1.8 or x>0.35) ---`);
    const weird = pts.filter((p) => p.y > 1.8 || Math.abs(p.x) > 0.35).slice(0, 12);
    for (const p of weird) P(`  (${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})`);
    P(` weird count=${pts.filter((p) => p.y > 1.8 || Math.abs(p.x) > 0.35).length}`);

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, L.join('\n') + '\n');
    // eslint-disable-next-line no-console
    console.log(`probe written: ${OUT} (${L.length} lines)`);
    expect(fs.existsSync(OUT)).toBe(true);
  }, 60000);
});
