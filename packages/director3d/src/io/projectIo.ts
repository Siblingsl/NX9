import type { DirectorProject } from '../schema/directorProject';
import type { Director3dSceneTemplate } from '../schema/directorProject';
import { normalizeDirectorProject, projectFromSceneTemplate } from '../schema/directorProject';

export function exportProjectJson(project: DirectorProject, filename = 'stage-deck-project.json') {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importProjectJson(file: File): Promise<DirectorProject> {
  const text = await file.text();
  const raw = JSON.parse(text) as unknown;
  return normalizeDirectorProject(raw);
}

export function exportSceneTemplateJson(template: Director3dSceneTemplate, filename = 'nx9-scene-template.json') {
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importSceneTemplateJson(file: File): Promise<Director3dSceneTemplate> {
  const raw = JSON.parse(await file.text()) as Partial<Director3dSceneTemplate>;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.objects) || !raw.environment) {
    throw new Error('无效的 NX9 场景模板');
  }
  return {
    id: raw.id ?? `scene-template-${Date.now().toString(36)}`,
    version: raw.version ?? 1,
    name: raw.name ?? 'NX9 场景模板',
    environment: raw.environment,
    assets: raw.assets ?? [],
    objects: raw.objects,
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  } as Director3dSceneTemplate;
}

export { projectFromSceneTemplate };
