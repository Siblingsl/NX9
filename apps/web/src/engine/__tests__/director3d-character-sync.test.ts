import { describe, expect, it } from 'vitest';
import { emptyDirectorProject } from '@nx9/director3d';
import type { CharacterProfile } from '@nx9/shared';
import { prepareDirectorProjectForShot } from '../director3d-character-sync';

describe('B4 · 角色 faceRig 写入导演台人偶', () => {
  it('新建角色对象携带 creative.faceRig', () => {
    const profile: CharacterProfile = {
      id: 'char-a',
      name: '林晓',
      creative: { faceRig: { version: 1, values: { body: { heightFeel: 100 } } } },
    };
    const project = prepareDirectorProjectForShot(emptyDirectorProject(), ['char-a'], [profile]);
    const object = project.objects[0];
    expect(object?.sourceCharacterId).toBe('char-a');
    expect(object?.faceRig?.values?.body?.heightFeel).toBe(100);
  });

  it('已有对象随档案刷新 faceRig', () => {
    const first: CharacterProfile = {
      id: 'char-a',
      name: '林晓',
      creative: { faceRig: { version: 1, values: { body: { heightFeel: 100 } } } },
    };
    const project = prepareDirectorProjectForShot(emptyDirectorProject(), ['char-a'], [first]);
    const second: CharacterProfile = {
      id: 'char-a',
      name: '林晓',
      creative: { faceRig: { version: 1, values: { body: { shoulderWidth: -50 } } } },
    };
    const refreshed = prepareDirectorProjectForShot(project, ['char-a'], [second]);
    expect(refreshed.objects[0]?.faceRig?.values?.body?.shoulderWidth).toBe(-50);
  });
});
