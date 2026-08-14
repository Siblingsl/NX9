import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Blob as NodeBlob } from 'node:buffer';
import { createCharacterBaseModel } from '@nx9/director3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, Vector3, Matrix4 } from 'three';
import type { Group, Mesh } from 'three';

// jsdom FileReader 兜底（与 generate-character-base-model 测试一致）
class NodeFileReader {
  result: unknown = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob): void {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(buf).toString('base64')}`;
      this.onloadend?.();
    });
  }
}

(globalThis as unknown as { Blob: unknown; FileReader: unknown }).Blob = NodeBlob;
(globalThis as unknown as { Blob: unknown; FileReader: unknown }).FileReader = NodeFileReader;

/**
 * 软渲染预览工具（无 WebGL）：
 * 把捏模基模用软件光栅化渲染成 PNG，便于人工查看建模形态。
 * 输出到 output/sculpt-preview/{face,side,quarter,back,body,headClose}.png
 *
 * 设置 NX9_GLB_PREVIEW=<相对 apps/web 的 glb 路径> 时，改为渲染外部 GLB
 * （方案 B：Blender 精修输出），输出到 output/sculpt-preview-refined/。
 */
const GLB_PREVIEW = process.env.NX9_GLB_PREVIEW;
const OUT_DIR = GLB_PREVIEW
  ? path.resolve(process.cwd(), '../../output/sculpt-preview-refined')
  : path.resolve(process.cwd(), '../../output/sculpt-preview');

let externalRoot: Group | null = null;
async function getPreviewRoot(): Promise<unknown> {
  if (!GLB_PREVIEW) return createCharacterBaseModel();
  if (externalRoot) return externalRoot;
  const disk = fs.readFileSync(path.resolve(process.cwd(), GLB_PREVIEW));
  const diskBuffer = new ArrayBuffer(disk.byteLength);
  new Uint8Array(diskBuffer).set(disk);
  externalRoot = await new Promise<Group>((resolve, reject) => {
    new GLTFLoader().parse(
      diskBuffer,
      '',
      (gltf) => resolve(gltf.scene as Group),
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
  return externalRoot;
}

// ── 最小 PNG 编码器（zlib + CRC32）──────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter none
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (1 + width * 3) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 软渲染器 ────────────────────────────────────────────────────────────────
interface Cam {
  pos: Vector3;
  target: Vector3;
  fov: number;
}

interface Tri {
  v: [number, number, number, number][]; // [x,y,z,viewZ] 屏幕坐标
  n: number[][]; // 三个顶点的世界法线（Gouraud 插值，mesh 多为纯平移，本地≈世界）
  base: [number, number, number]; // 材质基础色（未受光）
  c: number[][]; // 可选顶点色（0-255），像素处重心插值后与 base 相乘
}

function renderScene(root: unknown, cam: Cam, width: number, height: number): Uint8Array {
  const aspect = width / height;
  const fovRad = (cam.fov * Math.PI) / 180;
  const projScale = 1 / Math.tan(fovRad / 2);
  const near = 0.05;

  const view = new Matrix4()
    .lookAt(cam.pos, cam.target, new Vector3(0, 1, 0))
    .transpose(); // lookAt 返回朝向矩阵；世界→相机旋转取其转置

  // 收集三角形（世界坐标 → 相机 → 屏幕）
  const tris: Tri[] = [];
  // 双灯 + 环境光（生产级预览观感）
  const KEY = new Vector3(0.45, 0.8, 0.7).normalize(); // 主光（右上前方）
  const FILL = new Vector3(-0.6, 0.3, 0.5).normalize(); // 补光（左）
  const AMBIENT = 0.22;
  const SPEC_STRENGTH = 0.16;
  const SPEC_SHININESS = 32;
  const tmp = new Vector3();
  const lightDir = new Vector3();
  const viewDir = new Vector3();
  const halfVec = new Vector3();
  // 相机→世界旋转（用于逐像素重建视线方向做高光）
  const viewInv = view.clone().transpose();

  (root as { updateMatrixWorld?: (f: boolean) => void }).updateMatrixWorld?.(true);

  const walk = (obj: { children?: unknown[]; isMesh?: boolean }) => {
    if (obj.isMesh) {
      const mesh = obj as Mesh;
      const geo = mesh.geometry;
      const pos = geo.getAttribute('position');
      const nor = geo.getAttribute('normal');
      const idx = geo.index;
      const mat = mesh.material as { color?: { r: number; g: number; b: number }; name?: string } | undefined;
      const base = mat?.color
        ? [mat.color.r * 255, mat.color.g * 255, mat.color.b * 255]
        : [200, 196, 190];
      const colAttr = geo.getAttribute('color');
      const mw = mesh.matrixWorld;
      const count = idx ? idx.count : pos.count;

      for (let i = 0; i < count; i += 3) {
        const ia = idx ? idx.getX(i) : i;
        const ib = idx ? idx.getX(i + 1) : i + 1;
        const ic = idx ? idx.getX(i + 2) : i + 2;
        const verts: [number, number, number, number][] = [];
        for (const j of [ia, ib, ic]) {
          tmp.set(pos.getX(j), pos.getY(j), pos.getZ(j)).applyMatrix4(mw);
          const v = tmp.clone().sub(cam.pos);
          v.applyMatrix4(view);
          const viewZ = v.z;
          if (viewZ > -near) continue;
          const sx = (v.x / -viewZ) * projScale * (height / 2) + width / 2;
          const sy = (-v.y / -viewZ) * projScale * (height / 2) + height / 2;
          verts.push([sx, sy, viewZ, viewZ]);
        }
        if (verts.length !== 3) continue;

        // 背面剔除（屏幕空间绕序）；预览用双面渲染，避免绕序歧义
        const ax = verts[1][0] - verts[0][0];
        const ay = verts[1][1] - verts[0][1];
        const bx = verts[2][0] - verts[0][0];
        const by = verts[2][1] - verts[0][1];
        const area = ax * by - ay * bx;
        void area;

        // 光照（Gouraud）：每顶点法线，像素处重心插值（修复棱面感）
        const n0 = new Vector3(nor.getX(ia), nor.getY(ia), nor.getZ(ia)).normalize();
        const n1 = new Vector3(nor.getX(ib), nor.getY(ib), nor.getZ(ib)).normalize();
        const n2 = new Vector3(nor.getX(ic), nor.getY(ic), nor.getZ(ic)).normalize();
        const vc = colAttr
          ? [
              [colAttr.getX(ia) * 255, colAttr.getY(ia) * 255, colAttr.getZ(ia) * 255],
              [colAttr.getX(ib) * 255, colAttr.getY(ib) * 255, colAttr.getZ(ib) * 255],
              [colAttr.getX(ic) * 255, colAttr.getY(ic) * 255, colAttr.getZ(ic) * 255],
            ]
          : null;
        tris.push({
          v: verts,
          n: [n0.toArray(), n1.toArray(), n2.toArray()],
          base: [base[0], base[1], base[2]],
          c: vc,
        });
      }
    }
    for (const c of obj.children ?? []) walk(c);
  };
  walk(root as { children?: unknown[] });

  // 背景（顶部浅蓝灰 → 底部近白的垂直渐变，影棚感）
  const bgTop = [205, 215, 226];
  const bgBottom = [238, 242, 246];
  const img = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const r = bgTop[0] + (bgBottom[0] - bgTop[0]) * t;
    const g = bgTop[1] + (bgBottom[1] - bgTop[1]) * t;
    const b = bgTop[2] + (bgBottom[2] - bgTop[2]) * t;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      img[o] = r;
      img[o + 1] = g;
      img[o + 2] = b;
    }
  }
  const depth = new Float32Array(width * height).fill(-Infinity);

  for (const t of tris) {
    const minX = Math.max(0, Math.floor(Math.min(t.v[0][0], t.v[1][0], t.v[2][0])));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(t.v[0][0], t.v[1][0], t.v[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(t.v[0][1], t.v[1][1], t.v[2][1])));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(t.v[0][1], t.v[1][1], t.v[2][1])));
    const [p0, p1, p2] = t.v;
    const area2 = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (Math.abs(area2) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area2;
        const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area2;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = p0[2] * w0 + p1[2] * w1 + p2[2] * w2;
        const o = (y * width + x) * 3;
        // z 为相机空间负值：越大越近；保留最近的表面
        if (z <= depth[y * width + x]) continue;
        depth[y * width + x] = z;
        // Gouraud：插值顶点法线 → 逐像素漫反射（使棱面平滑）
        lightDir
          .set(
            t.n[0][0] * w0 + t.n[1][0] * w1 + t.n[2][0] * w2,
            t.n[0][1] * w0 + t.n[1][1] * w1 + t.n[2][1] * w2,
            t.n[0][2] * w0 + t.n[1][2] * w1 + t.n[2][2] * w2,
          )
          .normalize();
        const lambertKey = Math.max(0, lightDir.dot(KEY));
        const lambertFill = Math.max(0, lightDir.dot(FILL));
        let shade = AMBIENT + 0.9 * lambertKey + 0.35 * lambertFill;
        // Blinn 高光：重建视线方向（相机空间 → 世界空间）
        const camX = (px - width / 2) * (-z) / (projScale * (height / 2));
        const camY = (py - height / 2) * (-z) / (projScale * (height / 2));
        viewDir.set(camX, camY, z).applyMatrix4(viewInv).negate().normalize();
        halfVec.copy(KEY).add(viewDir).normalize();
        const ndh = lightDir.dot(halfVec);
        if (ndh > 0 && lambertKey > 0) {
          shade += SPEC_STRENGTH * Math.pow(ndh, SPEC_SHININESS);
        }
        if (shade > 1) shade = 1;
        // 顶点色：重心插值后与材质基础色相乘（材质为白时即纯顶点色）
        const c0 = t.c
          ? [
              (t.c[0][0] * w0 + t.c[1][0] * w1 + t.c[2][0] * w2) / 255,
              (t.c[0][1] * w0 + t.c[1][1] * w1 + t.c[2][1] * w2) / 255,
              (t.c[0][2] * w0 + t.c[1][2] * w1 + t.c[2][2] * w2) / 255,
            ]
          : [1, 1, 1];
        img[o] = Math.min(255, t.base[0] * c0[0] * shade);
        img[o + 1] = Math.min(255, t.base[1] * c0[1] * shade);
        img[o + 2] = Math.min(255, t.base[2] * c0[2] * shade);
      }
    }
  }
  return img;
}

async function renderAndWrite(name: string, cam: Cam, width = 1024, height = 1536): Promise<void> {
  const root = await getPreviewRoot();
  const img = renderScene(root, cam, width, height);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), encodePng(width, height, img));
}

const CAM_PRESETS: Record<string, Cam> = {
  face: { pos: new Vector3(0, 1.25, 2.55), target: new Vector3(0, 1.15, 0), fov: 32 },
  side: { pos: new Vector3(2.6, 1.25, 0.15), target: new Vector3(0, 1.15, 0), fov: 32 },
  quarter: { pos: new Vector3(1.9, 1.35, 1.9), target: new Vector3(0, 1.15, 0), fov: 32 },
  back: { pos: new Vector3(0, 1.25, -2.55), target: new Vector3(0, 1.15, 0), fov: 32 },
  body: { pos: new Vector3(0, 1.05, 3.6), target: new Vector3(0, 0.95, 0), fov: 32 },
  headClose: { pos: new Vector3(0, 1.64, 0.85), target: new Vector3(0, 1.64, 0), fov: 40 },
};

describe('捏模基模软渲染预览', () => {
  it('渲染 6 个机位 PNG 到 output/sculpt-preview', async () => {
    for (const [name, cam] of Object.entries(CAM_PRESETS)) {
      await renderAndWrite(name, cam);
    }
    for (const name of Object.keys(CAM_PRESETS)) {
      const p = path.join(OUT_DIR, `${name}.png`);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).size).toBeGreaterThan(1000);
    }
  }, 180000);

  it('输出低分辨率 ASCII 预览（控制台可读形态）', async () => {
    const RAMPS = [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'];
    const root = await getPreviewRoot();
    for (const name of ['face', 'side', 'quarter', 'headClose']) {
      const img = renderScene(root, CAM_PRESETS[name], 64, 88);
      // eslint-disable-next-line no-console
      console.log(`\n=== ${name} ASCII 64x88 ===`);
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < 64 * 88; i++) {
        const l = 0.299 * img[i * 3] + 0.587 * img[i * 3 + 1] + 0.114 * img[i * 3 + 2];
        if (l < min) min = l;
        if (l > max) max = l;
      }
      for (let y = 0; y < 88; y++) {
        let line = '';
        for (let x = 0; x < 64; x++) {
          const i = (y * 64 + x) * 3;
          const l = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
          const t = (l - min) / (max - min + 1e-9);
          line += RAMPS[Math.min(RAMPS.length - 1, Math.floor(t * RAMPS.length))];
        }
        // eslint-disable-next-line no-console
        console.log(line);
      }
    }
  }, 30000);

  it('输出世界包围盒（诊断分段位置）', async () => {
    const root = await getPreviewRoot();
    root.updateMatrixWorld(true);
    const out: string[] = [];
    const walk = (obj: unknown) => {
      const o = obj as { isMesh?: boolean; name?: string; children?: unknown[] };
      if (o.isMesh) {
        const box = new Box3().setFromObject(o as never);
        out.push(
          `${o.name}: center=(${box.getCenter(new Vector3()).toArray().map((n: number) => n.toFixed(3)).join(',')}) size=(${box.getSize(new Vector3()).toArray().map((n: number) => n.toFixed(3)).join(',')})`,
        );
      }
      for (const c of o.children ?? []) walk(c);
    };
    for (const c of root.children) walk(c);
    // eslint-disable-next-line no-console
    console.log('AABB:\n' + out.sort().join('\n'));
  }, 30000);
});
