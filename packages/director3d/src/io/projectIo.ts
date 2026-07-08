import type { DirectorProject } from '../schema/directorProject';
import { normalizeDirectorProject } from '../schema/directorProject';

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
