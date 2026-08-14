import type { Material, Object3D } from 'three';

/**
 * B3：material 驱动契约。正式基模须提供命名材质通道：
 * `Iris` / `Brow` / `Freckle` / `Skin`（名字含关键词即可）。
 */
export interface MaterialDriverDef {
  channel: string;
  property: string;
  /** u ∈ [-1, 1] 时属性增量；u=0 恢复材质原值 */
  k: number;
  min?: number;
  max?: number;
  transparent?: boolean;
}

export const MATERIAL_DRIVERS: Record<string, MaterialDriverDef> = {
  irisSize: { channel: 'iris', property: 'emissiveIntensity', k: 1, min: 0, max: 1.5 },
  browDensity: { channel: 'brow', property: 'opacity', k: 0.7, min: 0.15, max: 1, transparent: true },
  skinTexture: { channel: 'skin', property: 'roughness', k: 0.55, min: 0.3, max: 1 },
  underEyeShadow: { channel: 'skin', property: 'emissiveIntensity', k: 0.45, min: 0, max: 0.8 },
  freckles: { channel: 'freckle', property: 'opacity', k: 0.8, min: 0, max: 0.9, transparent: true },
};

export const MATERIAL_DRIVER_PARAM_IDS = Object.keys(MATERIAL_DRIVERS);

function clamp(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

export function materialChannelName(material: Material): string | undefined {
  const name = (material.name ?? '').trim().toLowerCase();
  if (name.includes('iris')) return 'iris';
  if (name.includes('brow')) return 'brow';
  if (name.includes('freckle')) return 'freckle';
  if (name.includes('skin')) return 'skin';
  return undefined;
}

export function collectMaterialChannels(root: Object3D): Map<string, Material[]> {
  const map = new Map<string, Material[]>();
  root.traverse((obj) => {
    const mesh = obj as { isMesh?: boolean; material?: Material | Material[] };
    if (mesh.isMesh !== true) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (!material) continue;
      const channel = materialChannelName(material);
      if (!channel) continue;
      const arr = map.get(channel);
      if (arr) arr.push(material);
      else map.set(channel, [material]);
    }
  });
  return map;
}

export function hasMaterialChannel(root: Object3D, channel: string | undefined): boolean {
  return Boolean(channel && collectMaterialChannels(root).has(channel));
}

/** 有材质通道则驱动属性并返回 true；无通道返回 false（兼容报告会标 missing）。 */
export function applyMaterialDriver(root: Object3D, paramId: string, u: number): boolean {
  const def = MATERIAL_DRIVERS[paramId];
  if (!def) return false;
  const materials = collectMaterialChannels(root).get(def.channel);
  if (!materials || materials.length === 0) return false;

  let applied = false;
  for (const material of materials) {
    const record = material as unknown as Record<string, unknown>;
    const current = record[def.property];
    if (typeof current !== 'number') continue;
    const baseKey = `nx9:base:${def.property}`;
    const userData = (material.userData ??= {}) as Record<string, unknown>;
    if (typeof userData[baseKey] !== 'number') userData[baseKey] = current;
    const base = userData[baseKey] as number;
    record[def.property] = u === 0 ? base : clamp(base + u * def.k, def.min, def.max);
    if (def.transparent) material.transparent = true;
    material.needsUpdate = true;
    applied = true;
  }
  return applied;
}
