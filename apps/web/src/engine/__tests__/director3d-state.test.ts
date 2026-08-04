import { describe, expect, it } from 'vitest';
import {
  emptyDirectorProject,
  normalizeShotState,
  projectFromShotState,
  sceneTemplateFromProject,
} from '@nx9/director3d';

describe('director3d shot state', () => {
  it('migrates legacy scene into independent shot states without shared references', () => {
    const legacy = emptyDirectorProject();
    legacy.objects.push({
      id: 'prop-1', name: '桌子', kind: 'prop', geometryType: 'box', visible: true, locked: false,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    });
    const a = normalizeShotState(undefined, 'shot-a', legacy);
    const b = normalizeShotState(undefined, 'shot-b', legacy);
    a.objects[0]!.transform.position[0] = 9;
    expect(b.objects[0]!.transform.position[0]).toBe(0);
    expect(a.shotId).not.toBe(b.shotId);
  });

  it('keeps a scene template separate from shot characters', () => {
    const project = emptyDirectorProject();
    project.objects.push({
      id: 'character-1', name: '角色 A', kind: 'character', sourceCharacterId: 'char-a', visible: true, locked: false,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    });
    const template = sceneTemplateFromProject(project, '片场');
    expect(template.objects).toHaveLength(0);
    const restored = projectFromShotState(normalizeShotState(undefined, 'shot-a', project));
    expect(restored.objects).toHaveLength(1);
  });
});
