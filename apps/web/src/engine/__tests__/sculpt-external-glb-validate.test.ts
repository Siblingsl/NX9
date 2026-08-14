import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Blob as NodeBlob } from 'node:buffer';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assertSculptMeshContract, loadCharacterModel, NX9_SCULPT_MESH_CONTRACT } from '@nx9/director3d';
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
 * 方案 B 质检门：Blender 精修导出的 GLB 必须重新通过捏模台契约。
 *
 * 用法：
 *   NX9_GLB_VALIDATE=F:\code\project\NX9\output\refined\nx9-character-refined.glb
 *   pnpm vitest run src/engine/__tests__/sculpt-external-glb-validate.test.ts
 *
 * 未设置环境变量时整组跳过（日常跑全套不干扰）。
 */
const GLB_PATH = process.env.NX9_GLB_VALIDATE ? path.resolve(process.cwd(), process.env.NX9_GLB_VALIDATE) : '';

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

function collectMorphCounts(root: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (o: unknown) => {
    const obj = o as { isMesh?: boolean; name?: string; morphTargetDictionary?: Record<string, number>; children?: unknown[] };
    if (obj.isMesh) {
      out[obj.name ?? '(unnamed)'] = Object.keys(obj.morphTargetDictionary ?? {}).length;
    }
    for (const c of obj.children ?? []) walk(c);
  };
  walk(root);
  return out;
}

describe.skipIf(!GLB_PATH)('外部 GLB 契约校验门（Blender 精修输出）', () => {
  it('通过 assertSculptMeshContract + loadCharacterModel，morph/三角面达标', async () => {
    expect(GLB_PATH, 'NX9_GLB_VALIDATE 指向的文件必须存在').toSatisfy((p: string) => fs.existsSync(p));

    const disk = fs.readFileSync(GLB_PATH);
    const diskBuffer = new ArrayBuffer(disk.byteLength);
    new Uint8Array(diskBuffer).set(disk);
    const loaded = await parseGlb(diskBuffer);

    const report = assertSculptMeshContract(loaded, 'builtin');
    expect(report.viewportSliceMapped, JSON.stringify(report.warnings)).toBe(true);
    expect(report.missingParamIds).toEqual([]);
    expect(report.missingBones).toEqual([]);
    expect(report.hasArmature).toBe(true);
    expect(report.handleCount).toBeGreaterThanOrEqual(9);
    expect(report.warnings.some((w) => w.includes('表情头'))).toBe(false);

    const result = await loadCharacterModel({
      fetchManifest: async () => ({
        version: 1,
        meshContractVersion: NX9_SCULPT_MESH_CONTRACT,
        modelPath: path.basename(GLB_PATH),
      }),
      loadGltf: async () => loaded,
    });
    expect(result.source).toBe('builtin');
    expect(result.warnings).toEqual([]);

    // 面数：捏模台 10 万三角警告线之下（精修前约 2.2k，细分 2 级约 36k）
    const tris = countTris(loaded);
    expect(tris, `三角面数 ${tris} 超过 100000 警告线`).toBeLessThan(100000);

    // morph：头 72（34 身份参数 pos/neg 含 .L/.R）+ 躯干 4（bodyFat/muscleMass）
    const morphs = collectMorphCounts(loaded);
    const head = morphs['HeadMesh'] ?? 0;
    const body = morphs['BodyMesh'] ?? 0;
    expect(head, `HeadMesh morph=${head}（需 72）`).toBe(72);
    expect(body, `BodyMesh morph=${body}（需 4）`).toBe(4);
  }, 60000);
});
