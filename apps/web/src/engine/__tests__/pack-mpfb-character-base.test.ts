import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Blob as NodeBlob } from 'node:buffer';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  assertSculptMeshContract,
  loadCharacterModel,
  NX9_SCULPT_MESH_CONTRACT,
  packMpfbIntoCharacterBase,
} from '@nx9/director3d';
import type { Group } from 'three';

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
 * MPFB → 捏脸台正式基模打包。
 *
 * 前置：scripts/blender/export-mpfb-for-sculpt.py 产出 mpfb-sculpt-raw.glb
 *
 *   $env:NX9_PACK_MPFB=1
 *   pnpm vitest run src/engine/__tests__/pack-mpfb-character-base.test.ts
 */
const ENABLED = process.env.NX9_PACK_MPFB === '1' || process.env.NX9_PACK_MPFB === 'true';
const RAW_GLB = process.env.NX9_MPFB_RAW_GLB
  ? path.resolve(process.cwd(), process.env.NX9_MPFB_RAW_GLB)
  : path.resolve(process.cwd(), '../../output/mpfb-frozen/v29-shoulder-ankle-20260814/mpfb-sculpt-raw.glb');
const MODELS_DIR = path.resolve(process.cwd(), 'public/director3d/models');
const GLB_PATH = path.join(MODELS_DIR, 'nx9-character-base.glb');
const MANIFEST_PATH = path.join(MODELS_DIR, 'nx9-character-base.manifest.json');
const LICENSE_PATH = path.join(MODELS_DIR, 'LICENSE-nx9-character-base.txt');
const BACKUP_DIR = path.resolve(process.cwd(), '../../output/mpfb-frozen/v29-shoulder-ankle-20260814');

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

describe.skipIf(!ENABLED)('MPFB 打包进捏脸台正式基模', () => {
  it('raw GLB → 契约 CharacterRoot → 替换 public 基模', async () => {
    expect(fs.existsSync(RAW_GLB), `缺少 raw GLB: ${RAW_GLB}`).toBe(true);

    const rawBytes = fs.readFileSync(RAW_GLB);
    const rawBuf = new ArrayBuffer(rawBytes.byteLength);
    new Uint8Array(rawBuf).set(rawBytes);
    const rawScene = await parseGlb(rawBuf);

    const model = packMpfbIntoCharacterBase(rawScene);
    const report = assertSculptMeshContract(model, 'builtin');
    expect(report.viewportSliceMapped, JSON.stringify(report.warnings)).toBe(true);
    expect(report.missingParamIds).toEqual([]);
    expect(report.missingBones).toEqual([]);
    expect(report.hasArmature).toBe(true);
    expect(report.handleCount).toBeGreaterThanOrEqual(9);
    expect(report.warnings.some((w) => w.includes('表情头'))).toBe(false);

    const exporter = new GLTFExporter();
    const arrayBuffer = (await exporter.parseAsync(model, { binary: true })) as ArrayBuffer;
    expect(arrayBuffer.byteLength).toBeGreaterThan(1024);

    fs.mkdirSync(MODELS_DIR, { recursive: true });
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (fs.existsSync(GLB_PATH)) {
      fs.copyFileSync(GLB_PATH, path.join(BACKUP_DIR, 'nx9-character-base.prev-procedural.glb'));
    }

    fs.writeFileSync(GLB_PATH, Buffer.from(arrayBuffer));
    fs.writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(
        {
          version: 1,
          meshContractVersion: NX9_SCULPT_MESH_CONTRACT,
          modelPath: 'nx9-character-base.glb',
          license: 'NX9 internal',
          source: 'mpfb-v29-shoulder-ankle',
        },
        null,
        2,
      ) + '\n',
    );
    fs.writeFileSync(
      LICENSE_PATH,
      [
        'NX9 internal character base model (MPFB art pack).',
        'source: mpfb-v29-shoulder-ankle',
        'Contract version: ' + NX9_SCULPT_MESH_CONTRACT,
        'Packed from output/mpfb-frozen/v29-shoulder-ankle-20260814 via packMpfbIntoCharacterBase.',
        'License: NX9 internal use only.',
        '',
      ].join('\n'),
    );

    // also keep a frozen copy of the packaged base
    fs.copyFileSync(GLB_PATH, path.join(BACKUP_DIR, 'nx9-character-base.mpfb-v29.glb'));

    const disk = fs.readFileSync(GLB_PATH);
    const diskBuffer = new ArrayBuffer(disk.byteLength);
    new Uint8Array(diskBuffer).set(disk);
    const loaded = await parseGlb(diskBuffer);
    const roundtrip = assertSculptMeshContract(loaded, 'builtin');
    expect(roundtrip.viewportSliceMapped).toBe(true);
    expect(roundtrip.warnings.some((w) => w.includes('表情头'))).toBe(false);

    const result = await loadCharacterModel({
      fetchManifest: async () => ({
        version: 1,
        meshContractVersion: NX9_SCULPT_MESH_CONTRACT,
        modelPath: 'nx9-character-base.glb',
      }),
      loadGltf: async () => loaded,
    });
    expect(result.source).toBe('builtin');
    expect(result.warnings).toEqual([]);
  }, 120000);
});
