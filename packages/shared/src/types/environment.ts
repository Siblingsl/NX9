export const MAX_ENV_REFERENCE_IMAGES = 6;

export interface EnvironmentProfile {
  id: string;
  sceneCode?: string;
  name: string;
  descriptionZh: string;
  consistencyPrompt?: string;
  era?: string;
  lighting?: string;
  props?: string[];
  /** @deprecated 迁移用，读取时合并到 referenceUrls */
  referenceImageUrl?: string | null;
  /** 多张场景参考图，最多 6 张 */
  referenceUrls?: string[];
  /** HDRI 环境贴图 URL */
  hdriUrl?: string | null;
  /** 3D 环境 mesh 引用 URL（glb/gltf） */
  meshUrl?: string | null;
}

export interface EnvironmentLibraryPayload {
  version: 1;
  environments: EnvironmentProfile[];
}

export function migrateEnvironmentProfile(env: EnvironmentProfile): EnvironmentProfile {
  const urls = [...(env.referenceUrls ?? [])];
  if (env.referenceImageUrl?.trim() && !urls.includes(env.referenceImageUrl)) {
    urls.unshift(env.referenceImageUrl);
  }
  return { ...env, referenceUrls: urls.slice(0, MAX_ENV_REFERENCE_IMAGES), referenceImageUrl: urls[0] ?? null };
}
