import { describe, expect, it } from 'vitest';
import { applyPoseTransaction } from '../agent-director3d-bridge';
import type { Director3dShotState } from '@nx9/director3d';

const base: Director3dShotState = {
  version: 2,
  stateVersion: 4,
  shotId: 'shot-a',
  environment: { backgroundColor: '#111', groundVisible: true, groundOpacity: 0.7 },
  objects: [{
    id: 'obj-a', name: '角色 A', kind: 'character', sourceCharacterId: 'char-a', visible: true, locked: false,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  }],
  camera: { position: [0, 1, 5], target: [0, 1, 0], rotation: [0, 0, 0], fov: 50, aspectRatio: '16:9' },
  candidates: [],
  selectedCandidateId: null,
  committedCandidateId: null,
  dirty: false,
  updatedAt: new Date().toISOString(),
};

const command = {
  version: 1 as const,
  characters: [{ characterId: 'char-a', name: '角色 A', position: [2, 0, 0] as [number, number, number], rotation: [0, 20, 0] as [number, number, number] }],
  camera: { position: [2, 1, 5] as [number, number, number], target: [0, 1, 0] as [number, number, number], fov: 55 },
};

describe('director3d pose transaction', () => {
  it('requires confirmation, shot identity and current state version', () => {
    expect(applyPoseTransaction(base, { shotId: 'shot-a', baseStateVersion: 4, command }, false).ok).toBe(false);
    expect(applyPoseTransaction(base, { shotId: 'shot-b', baseStateVersion: 4, command }, true).ok).toBe(false);
    expect(applyPoseTransaction(base, { shotId: 'shot-a', baseStateVersion: 3, command }, true).ok).toBe(false);
  });

  it('returns one undoable next state after confirmation', () => {
    const result = applyPoseTransaction(base, { shotId: 'shot-a', baseStateVersion: 4, command }, true);
    expect(result.ok).toBe(true);
    expect(result.nextState?.objects[0]?.transform.position).toEqual([2, 0, 0]);
    expect(result.nextState?.camera.fov).toBe(55);
    expect(result.nextState?.dirty).toBe(true);
  });
});
