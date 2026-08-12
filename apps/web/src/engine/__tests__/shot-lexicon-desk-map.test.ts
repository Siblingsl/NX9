import { describe, expect, it } from 'vitest';
import {
  mapShotSizeToDeskEnum,
  mapCameraMoveToDeskEnum,
  mapShotLexiconToDeskEnums,
} from '@nx9/shared';

describe('OL-10 shot lexicon → desk enums', () => {
  it('maps English / Chinese shot sizes', () => {
    expect(mapShotSizeToDeskEnum('CU')).toBe('CU');
    expect(mapShotSizeToDeskEnum('close-up')).toBe('CU');
    expect(mapShotSizeToDeskEnum('特写')).toBe('CU');
    expect(mapShotSizeToDeskEnum('wide shot')).toBe('WS');
    expect(mapShotSizeToDeskEnum('unknown-xyz')).toBeNull();
  });

  it('maps camera moves', () => {
    expect(mapCameraMoveToDeskEnum('推')).toBe('推');
    expect(mapCameraMoveToDeskEnum('dolly in')).toBe('推');
    expect(mapCameraMoveToDeskEnum('handheld')).toBe('手持');
    expect(mapCameraMoveToDeskEnum('static')).toBe('固定');
    expect(mapCameraMoveToDeskEnum('pan left')).toBe('摇');
    expect(mapCameraMoveToDeskEnum('跟踪')).toBe('跟');
  });

  it('mapShotLexiconToDeskEnums combines both', () => {
    expect(
      mapShotLexiconToDeskEnums({ shotSize: 'close up', cameraMove: 'push in' }),
    ).toEqual({ shotSize: 'CU', cameraMove: '推' });
    expect(
      mapShotLexiconToDeskEnums({ shotSize: '全景', cameraMove: '拉' }),
    ).toEqual({ shotSize: 'FS', cameraMove: '拉' });
    expect(
      mapShotLexiconToDeskEnums({ shotSize: 'wide shot', cameraMove: '拉' }),
    ).toEqual({ shotSize: 'WS', cameraMove: '拉' });
  });
});
