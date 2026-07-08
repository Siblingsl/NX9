import type { DirectorAsset } from '../schema/directorProject';

const STORAGE_KEY = 'nx9-director3d-model-library';

export function loadLocalLibrary(): DirectorAsset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DirectorAsset[];
    return Array.isArray(parsed) ? parsed.filter((a) => a?.id && a?.url) : [];
  } catch {
    return [];
  }
}

export function saveLocalLibrary(assets: DirectorAsset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets.slice(-80)));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function upsertLocalAsset(asset: DirectorAsset) {
  const list = loadLocalLibrary().filter((a) => a.id !== asset.id);
  saveLocalLibrary([...list, asset]);
}
