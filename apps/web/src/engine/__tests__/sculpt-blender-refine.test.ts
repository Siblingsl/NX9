import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Blob as NodeBlob } from 'node:buffer';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assertSculptMeshContract, createCharacterBaseModel, loadCharacterModel, NX9_SCULPT_MESH_CONTRACT } from '@nx9/director3d';
import { Box3, Quaternion, Vector3 } from 'three';
import type { Group, Mesh } from 'three';

// jsdom FileReader 兜底
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
 * 方案 B · TS 阶段：把 Blender 阶段1（refine-base-model.py）输出的每顶点位移
 * 按空间最近邻施加到内存基模，用验证过的 GLTFExporter 重新出 GLB，
 * 并立即跑契约校验（morph/骨骼/Handle/面数/加载判定）。
 *
 * 用法（apps/web 下）：
 *   $env:NX9_REFINE_DISP = "F:\code\project\NX9\output\refined\displacement.json"
 *   $env:NX9_REFINE_OUT  = "F:\code\project\NX9\output\refined\nx9-character-refined.glb"
 *   pnpm vitest run src/engine/__tests__/sculpt-blender-refine.test.ts
 *
 * 未设置 NX9_REFINE_DISP 时整组跳过。
 */
const DISP_PATH = process.env.NX9_REFINE_DISP ? path.resolve(process.cwd(), process.env.NX9_REFINE_DISP) : '';
const OUT_GLB = process.env.NX9_REFINE_OUT
  ? path.resolve(process.cwd(), process.env.NX9_REFINE_OUT)
  : path.resolve(process.cwd(), '../../output/refined/nx9-character-refined.glb');

interface DispMesh {
  src: number[][]; // 笔刷前世界坐标
  disp: number[][]; // 世界位移
}

function parseGlb(bytes: ArrayBuffer): Promise<Group> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      bytes,
      '',
      (gltf) => resolve(gltf.scene as Group),
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}

function countTris(root: unknown): number {
  let n = 0;
  const walk = (o: unknown) => {
    const obj = o as { isMesh?: boolean; geometry?: { index?: { count: number }; attributes?: { position?: { count: number } } }; children?: unknown[] };
    if (obj.isMesh && obj.geometry) {
      n += obj.geometry.index ? obj.geometry.index.count / 3 : (obj.geometry.attributes?.position?.count ?? 0) / 3;
    }
    for (const c of obj.children ?? []) walk(c);
  };
  walk(root);
  return Math.round(n);
}

interface DispFile {
  version?: number;
  rootRotation?: number[][]; // Blender 世界系 ← GLTF 世界系 旋转（3x3，供参考）
  rootRotationInv?: number[][];
  meshes: Record<string, DispMesh>;
}

describe.skipIf(!DISP_PATH)('方案 B TS 阶段：施加 Blender 位移并出 GLB', () => {
  it('位移施加 → 导出 → 契约回环全部通过', async () => {
    const dispData = JSON.parse(fs.readFileSync(DISP_PATH, 'utf-8')) as DispFile;
    const model = createCharacterBaseModel();
    model.updateMatrixWorld(true);

    const tmp = new Vector3();
    const worldPos = new Vector3();
    const dispWorld = new Vector3();
    const worldQuat = new Quaternion();
    const invQuat = new Quaternion();
    let totalMatched = 0;
    let totalVerts = 0;
    const applied: string[] = [];

    const walk = (o: unknown) => {
      const obj = o as { isMesh?: boolean; name?: string; geometry?: { attributes?: { position?: { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } }; computeVertexNormals?: () => void }; children?: unknown[] };
      if (obj.isMesh) {
        const name = obj.name ?? '';
        const dm = dispData.meshes[name];
        if (dm && obj.geometry?.attributes?.position) {
          const pos = obj.geometry.attributes.position;
          const count = pos.count;
          totalVerts += count;
          let matched = 0;
          for (let i = 0; i < count; i++) {
            worldPos.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4((o as Mesh).matrixWorld);
            // 最近邻（Blender 侧已把 src/disp 换算到 GLTF 世界系，直接匹配）
            let bestD = Infinity;
            let best = -1;
            for (let s = 0; s < dm.src.length; s++) {
              tmp.set(dm.src[s][0], dm.src[s][1], dm.src[s][2]);
              const d = tmp.distanceToSquared(worldPos);
              if (d < bestD) {
                bestD = d;
                best = s;
              }
            }
            if (best < 0 || bestD > 4e-6) {
              const nearSrc = best >= 0 ? dm.src[best] : null;
              throw new Error(
                `${name} 顶点#${i} 未匹配 (dist^2=${bestD.toFixed(4)}) ` +
                  `world=${worldPos.toArray().map((n) => n.toFixed(4)).join(',')} ` +
                  `bestSrc=${nearSrc ? nearSrc.map((n) => n.toFixed(4)).join(',') : 'none'}`,
              );
            }
            dispWorld.set(dm.disp[best][0], dm.disp[best][1], dm.disp[best][2]);
            // 世界位移 → 局部位移：只取对象旋转的逆（不能 transformDirection——它会归一化向量！
            // 位移量纲会被毁成单位向量，导致网格爆炸）
            (o as Mesh).getWorldQuaternion(worldQuat);
            dispWorld.applyQuaternion(invQuat.copy(worldQuat).invert());
            pos.setXYZ(i, pos.getX(i) + dispWorld.x, pos.getY(i) + dispWorld.y, pos.getZ(i) + dispWorld.z);
            matched++;
          }
          obj.geometry.computeVertexNormals?.();
          totalMatched += matched;
          applied.push(`${name}(${matched})`);
        }
      }
      for (const c of obj.children ?? []) walk(c);
    };
    walk(model);

    expect(totalMatched).toBe(totalVerts);
    // eslint-disable-next-line no-console
    console.log(`[REFINE] 已施加位移: ${applied.join(', ')}`);

    // 导出 GLB
    const exporter = new GLTFExporter();
    const arrayBuffer = (await exporter.parseAsync(model, { binary: true })) as ArrayBuffer;
    fs.mkdirSync(path.dirname(OUT_GLB), { recursive: true });
    fs.writeFileSync(OUT_GLB, Buffer.from(arrayBuffer));
    // eslint-disable-next-line no-console
    console.log(`[REFINE] 已导出 ${OUT_GLB} (${arrayBuffer.byteLength} bytes)`);

    // 读回契约校验
    const disk = fs.readFileSync(OUT_GLB);
    const diskBuffer = new ArrayBuffer(disk.byteLength);
    new Uint8Array(diskBuffer).set(disk);
    const loaded = await parseGlb(diskBuffer);

    const report = assertSculptMeshContract(loaded, 'builtin');
    expect(report.viewportSliceMapped, JSON.stringify(report.warnings)).toBe(true);
    expect(report.missingParamIds).toEqual([]);
    expect(report.missingBones).toEqual([]);
    expect(report.handleCount).toBeGreaterThanOrEqual(9);
    expect(report.warnings.some((w) => w.includes('表情头'))).toBe(false);

    const result = await loadCharacterModel({
      fetchManifest: async () => ({
        version: 1,
        meshContractVersion: NX9_SCULPT_MESH_CONTRACT,
        modelPath: path.basename(OUT_GLB),
      }),
      loadGltf: async () => loaded,
    });
    expect(result.source).toBe('builtin');
    expect(result.warnings).toEqual([]);
    expect(countTris(loaded)).toBeLessThan(100000);

    // 几何健全性：头/躯干 AABB 必须保持人形尺度（防位移归一化类爆炸回归）
    loaded.updateMatrixWorld(true);
    const findBox = (name: string): Box3 | null => {
      let box: Box3 | null = null;
      const walk = (o: unknown) => {
        const obj = o as { isMesh?: boolean; name?: string; children?: unknown[] };
        if (obj.isMesh && obj.name === name) box = new Box3().setFromObject(obj as never);
        for (const c of obj.children ?? []) walk(c);
      };
      walk(loaded);
      return box;
    };
    const headBox = findBox('HeadMesh');
    const bodyBox = findBox('BodyMesh');
    expect(headBox, '找不到 HeadMesh').not.toBeNull();
    expect(bodyBox, '找不到 BodyMesh').not.toBeNull();
    const headSize = headBox!.getSize(new Vector3());
    const bodySize = bodyBox!.getSize(new Vector3());
    expect(
      Math.max(headSize.x, headSize.y, headSize.z),
      `HeadMesh AABB 异常膨胀: ${headSize.toArray().map((n) => n.toFixed(3)).join(',')}`,
    ).toBeLessThan(0.6);
    expect(
      Math.max(bodySize.x, bodySize.y, bodySize.z),
      `BodyMesh AABB 异常膨胀: ${bodySize.toArray().map((n) => n.toFixed(3)).join(',')}`,
    ).toBeLessThan(1.0);
    const headCenter = headBox!.getCenter(new Vector3());
    expect(headCenter.y, `HeadMesh 位置异常: ${headCenter.y.toFixed(3)}`).toBeGreaterThan(1.3);
    expect(headCenter.y).toBeLessThan(1.8);
  }, 60000);
});
