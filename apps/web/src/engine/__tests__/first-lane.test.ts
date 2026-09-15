import { beforeEach, describe, expect, it } from 'vitest';
import {
  FIRST_LANE_STORAGE_KEY,
  filterPlaybooksForFirstLane,
  filterTemplatesForFirstLane,
  resetFirstLaneForTests,
  unlockFirstLane,
} from '../first-lane';

describe('first-lane filter', () => {
  beforeEach(() => {
    resetFirstLaneForTests();
  });

  it('锁定时只放行核心模板与 Playbook', () => {
    expect(localStorage.getItem(FIRST_LANE_STORAGE_KEY)).toBeNull();
    const tpls = filterTemplatesForFirstLane([
      { id: 'tpl-core-episode' },
      { id: 'tpl-ai-short-film' },
      { id: 'tpl-bridge-sequence' },
    ]);
    expect(tpls.map((t) => t.id)).toEqual(['tpl-core-episode']);

    const pbs = filterPlaybooksForFirstLane([
      { id: 'pb-ai-comic-live' },
      { id: 'pb-ai-short-film' },
      { id: 'pb-viral-short' },
    ]);
    expect(pbs.map((p) => p.id)).toEqual(['pb-ai-comic-live']);
  });

  it('解锁后原样返回', () => {
    unlockFirstLane();
    const all = [
      { id: 'tpl-core-episode' },
      { id: 'tpl-ai-short-film' },
    ];
    expect(filterTemplatesForFirstLane(all)).toEqual(all);
  });
});
