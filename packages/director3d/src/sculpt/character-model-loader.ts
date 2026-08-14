import type { Object3D } from 'three';
import { assertSculptMeshContract, NX9_SCULPT_MESH_CONTRACT } from './sculpt-contract';
import { createProxyCharacter } from './procedural-body';

/** 正式身份基模的运行时路径；资产就位后放入 `apps/web/public/director3d/models/`。 */
export const NX9_CHARACTER_BASE_GLB_URL = '/director3d/models/nx9-character-base.glb';
export const NX9_CHARACTER_BASE_MANIFEST_URL = '/director3d/models/nx9-character-base.manifest.json';

export interface Nx9CharacterAssetManifest {
  version: 1;
  meshContractVersion: number;
  modelPath: string;
  license?: string;
}

export interface CharacterModelLoadResult {
  source: 'builtin' | 'proxy';
  root: Object3D;
  manifest?: Nx9CharacterAssetManifest;
  warnings: string[];
}

export interface LoadCharacterModelOptions {
  glbUrl?: string;
  manifestUrl?: string;
  loadGltf?: (url: string) => Promise<Object3D>;
  fetchManifest?: (url: string) => Promise<unknown>;
  fallback?: () => Object3D;
}

export function validateCharacterAssetManifest(
  raw: unknown,
): { ok: true; manifest: Nx9CharacterAssetManifest } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'manifest 不是 JSON 对象' };
  const input = raw as Record<string, unknown>;
  if (input.version !== 1) return { ok: false, reason: 'manifest version 必须为 1' };
  if (input.meshContractVersion !== NX9_SCULPT_MESH_CONTRACT) {
    return { ok: false, reason: `manifest meshContractVersion 必须为 ${NX9_SCULPT_MESH_CONTRACT}` };
  }
  if (typeof input.modelPath !== 'string' || !input.modelPath.trim()) {
    return { ok: false, reason: 'manifest modelPath 缺失' };
  }
  return {
    ok: true,
    manifest: {
      version: 1,
      meshContractVersion: input.meshContractVersion,
      modelPath: input.modelPath,
      license: typeof input.license === 'string' ? input.license : undefined,
    },
  };
}

async function defaultFetchManifest(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
  return res.json();
}

async function defaultLoadGltf(url: string): Promise<Object3D> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  return new Promise<Object3D>((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

/**
 * B2：正式 GLB 加载路径 + manifest 校验 + 契约判定 + 失败回退代理。
 * 资产未到位时 manifest 404 → 返回 proxy；资产到位但契约不合格也强制回退 proxy。
 */
export async function loadCharacterModel(options: LoadCharacterModelOptions = {}): Promise<CharacterModelLoadResult> {
  const warnings: string[] = [];
  const glbUrl = options.glbUrl ?? NX9_CHARACTER_BASE_GLB_URL;
  const manifestUrl = options.manifestUrl ?? NX9_CHARACTER_BASE_MANIFEST_URL;
  const fetchManifest = options.fetchManifest ?? defaultFetchManifest;
  const loadGltf = options.loadGltf ?? defaultLoadGltf;
  const fallback = options.fallback ?? createProxyCharacter;

  let manifest: Nx9CharacterAssetManifest | undefined;
  try {
    const raw = await fetchManifest(manifestUrl);
    const validated = validateCharacterAssetManifest(raw);
    if (!validated.ok) throw new Error(validated.reason);
    manifest = validated.manifest;

    const loaded = await loadGltf(glbUrl);
    const report = assertSculptMeshContract(loaded, 'builtin');
    const looksLikeEmotionHead = !report.viewportSliceMapped || report.warnings.some((w) => w.includes('表情头'));
    if (looksLikeEmotionHead) {
      warnings.push(
        `内置基模未通过捏模契约（切片映射=${report.viewportSliceMapped}），强制回退代理`,
      );
      return { source: 'proxy', root: fallback(), manifest, warnings };
    }
    return { source: 'builtin', root: loaded, manifest, warnings };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    warnings.push(`内置基模加载失败，回退代理：${reason}`);
    return { source: 'proxy', root: fallback(), manifest, warnings };
  }
}
