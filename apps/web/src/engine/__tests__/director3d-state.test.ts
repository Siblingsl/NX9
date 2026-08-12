import { describe, expect, it } from 'vitest';
import {
  applyCandidateUploadResult,
  applySceneTemplateToShotState,
  emptyDirectorProject,
  normalizeShotState,
  projectFromShotState,
  restoreCommittedSnapshot,
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

  it('applies a saved template as a deep copy and keeps current-shot characters', () => {
    const project = emptyDirectorProject();
    project.objects.push(
      {
        id: 'character-1', name: '角色 A', kind: 'character', sourceCharacterId: 'char-a', visible: true, locked: false,
        transform: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      {
        id: 'prop-old', name: '旧桌子', kind: 'prop', geometryType: 'box', visible: true, locked: false,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
    );
    const templateProject = emptyDirectorProject();
    templateProject.scene.backgroundColor = '#112233';
    templateProject.objects.push({
      id: 'prop-new', name: '新桌子', kind: 'prop', geometryType: 'box', visible: true, locked: false,
      transform: { position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    });
    const template = sceneTemplateFromProject(templateProject, '片场B');
    const applied = applySceneTemplateToShotState(
      normalizeShotState(undefined, 'shot-a', project),
      template,
    );
    expect(applied.sceneTemplateId).toBe(template.id);
    expect(applied.environment.backgroundColor).toBe('#112233');
    expect(applied.objects.filter((object) => object.kind === 'character')).toEqual(
      expect.arrayContaining([expect.objectContaining({ sourceCharacterId: 'char-a' })]),
    );
    expect(applied.objects.some((object) => object.id === 'prop-new')).toBe(true);
    expect(applied.objects.some((object) => object.id === 'prop-old')).toBe(false);
    template.objects[0]!.transform.position[0] = 9;
    expect(applied.objects.find((object) => object.id === 'prop-new')?.transform.position[0]).toBe(2);
  });

  it('restores committed snapshot without sharing object references', () => {
    const state = normalizeShotState(undefined, 'shot-a', emptyDirectorProject());
    expect(restoreCommittedSnapshot(state)).toBeNull();
    const committed = {
      ...state,
      camera: { ...state.camera, fov: 28 },
      objects: [
        {
          id: 'prop-1',
          name: '桌子',
          kind: 'prop' as const,
          geometryType: 'box' as const,
          visible: true,
          locked: false,
          transform: { position: [1, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] },
        },
      ],
      committedSnapshot: {
        stateVersion: 3,
        candidateId: 'cand-1',
        environment: { ...state.environment, backgroundColor: '#abcdef' },
        objects: [
          {
            id: 'prop-1',
            name: '桌子',
            kind: 'prop' as const,
            geometryType: 'box' as const,
            visible: true,
            locked: false,
            transform: { position: [4, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] },
          },
        ],
        camera: { ...state.camera, fov: 42 },
        committedAt: '2026-08-12T00:00:00.000Z',
      },
      dirty: true,
    };
    const restored = restoreCommittedSnapshot(committed);
    expect(restored?.dirty).toBe(false);
    expect(restored?.camera.fov).toBe(42);
    expect(restored?.environment.backgroundColor).toBe('#abcdef');
    expect(restored?.selectedCandidateId).toBe('cand-1');
    expect(restored?.objects[0]?.transform.position[0]).toBe(4);
    restored!.objects[0]!.transform.position[0] = 9;
    expect(committed.committedSnapshot?.objects[0]?.transform.position[0]).toBe(4);
  });

  it('ignores stale candidate uploads after switching shots', () => {
    const a = normalizeShotState(undefined, 'shot-a', emptyDirectorProject());
    const withCandidate = {
      ...a,
      candidates: [{
        id: 'cand-1',
        name: '候选 1',
        shotId: 'shot-a',
        stateVersion: 1,
        status: 'uploading' as const,
        createdAt: '2026-08-12T00:00:00.000Z',
        camera: { ...a.camera },
        characterPlacements: [],
        prompt: 'cam',
      }],
    };
    const switched = normalizeShotState(undefined, 'shot-b', emptyDirectorProject());
    const ignored = applyCandidateUploadResult(switched, {
      candidateId: 'cand-1',
      expectedShotId: 'shot-a',
      imageUrl: 'https://cdn.example/stale.png',
    });
    expect(ignored).toBe(switched);
    expect(ignored.candidates).toHaveLength(0);

    const applied = applyCandidateUploadResult(withCandidate, {
      candidateId: 'cand-1',
      expectedShotId: 'shot-a',
      imageUrl: 'https://cdn.example/ok.png',
    });
    expect(applied.candidates[0]?.status).toBe('ready');
    expect(applied.candidates[0]?.imageUrl).toBe('https://cdn.example/ok.png');
  });

  it('restoreCommittedSnapshot survives many switch cycles without shared refs', () => {
    let state = normalizeShotState(undefined, 'shot-a', emptyDirectorProject());
    state = {
      ...state,
      committedSnapshot: {
        stateVersion: 1,
        candidateId: 'c1',
        environment: { ...state.environment, backgroundColor: '#111111' },
        objects: [],
        camera: { ...state.camera, fov: 35 },
        committedAt: '2026-08-12T00:00:00.000Z',
      },
    };
    for (let i = 0; i < 40; i++) {
      const restored = restoreCommittedSnapshot(state);
      expect(restored).not.toBeNull();
      restored!.camera.fov = 10 + i;
      restored!.environment.backgroundColor = `#${(i + 1).toString(16).padStart(6, '0')}`;
      expect(state.committedSnapshot?.camera.fov).toBe(35);
      expect(state.committedSnapshot?.environment.backgroundColor).toBe('#111111');
      state = restored!;
    }
  });
});
