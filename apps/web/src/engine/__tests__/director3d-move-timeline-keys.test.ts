/**
 * 运镜时间轴 → 3D 导演台 关键帧适配器回归（增量新增能力）。
 *
 * 与 camera-move-timeline.test.ts 相同：不走 '@nx9/shared' barrel（既有缺陷），
 * 相对路径直取源码；director3d 侧适配器本身也只用相对路径依赖 shared 源码。
 */
import { describe, expect, it } from 'vitest';
import {
  MOVE_TIMELINE_CAMERA_PREFIX,
  buildCameraMoveKeyframes,
  describeMoveTimelinePlan,
  moveTimelineToDirectorCameras,
  sampleCameraMoveTimeline,
} from '../../../../../packages/director3d/src/schema/cameraMoveTimelineKeys';
import {
  DEFAULT_DIRECTOR_VIEW,
  describeCameraShot,
  getOrbit,
} from '../../../../../packages/director3d/src/schema/cameraGeometry';
import type { DirectorCameraShot } from '../../../../../packages/director3d/src/schema/directorProject';
import { CAMERA_MOVE_TIMELINE_VERSION } from '../../../../../packages/shared/src/types/camera-move-timeline';
import type { CameraMoveTimeline } from '../../../../../packages/shared/src/types/camera-move-timeline';

function baseCamera(): DirectorCameraShot {
  return {
    id: 'cam-1',
    name: '主机位',
    fov: DEFAULT_DIRECTOR_VIEW.fov,
    target: [...DEFAULT_DIRECTOR_VIEW.target] as [number, number, number],
    transform: {
      position: [...DEFAULT_DIRECTOR_VIEW.position] as [number, number, number],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    captures: [],
  };
}

function timeline(
  segments: Array<{ id: string; moveId: string; startT: number; endT: number; amplitude?: number; easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'; speedRamp?: 'accelerate' | 'decelerate' | 'steady' }>,
  durationSec = 6,
): CameraMoveTimeline {
  return { version: CAMERA_MOVE_TIMELINE_VERSION, durationSec, segments };
}

function orbitOf(camera: DirectorCameraShot) {
  return getOrbit(
    { x: camera.transform.position[0], y: camera.transform.position[1], z: camera.transform.position[2] },
    { x: camera.target[0], y: camera.target[1], z: camera.target[2] },
  );
}

describe('buildCameraMoveKeyframes：多段 A→B 关键帧', () => {
  it('两段连续运镜 → 3 帧（起始持稳 + 两段终点），时间戳与段边界一致', () => {
    const keys = buildCameraMoveKeyframes(timeline([
      { id: 'a', moveId: 'push-slow', startT: 0, endT: 3 },
      { id: 'b', moveId: 'orbit-180', startT: 3, endT: 6 },
    ]), baseCamera());
    expect(keys.map((k) => k.tSec)).toEqual([0, 3, 6]);
    // 边界帧归属「从它开始的那一段」；末帧沿用最后一段名
    expect(keys.map((k) => k.labelZh)).toEqual(['缓推', '半环绕', '半环绕']);
    expect(keys.map((k) => k.segmentId)).toEqual(['a', 'b', 'b']);
  });

  it('每段终点相对本段起点施加代理机位增量：推镜拉近、环绕转向', () => {
    const base = baseCamera();
    const keys = buildCameraMoveKeyframes(timeline([
      { id: 'a', moveId: 'push-slow', startT: 0, endT: 2 },
      { id: 'b', moveId: 'orbit-180', startT: 2, endT: 4 },
    ]), base);
    const d0 = orbitOf(base).dist;
    const d1 = orbitOf(keys[1].camera).dist;
    const d2 = orbitOf(keys[2].camera).dist;
    expect(d1).toBeLessThan(d0); // 推镜：距离减小
    expect(d2).toBeLessThan(d1); // 环绕同时带轻微推进
    const az0 = orbitOf(keys[1].camera).az;
    const az1 = orbitOf(keys[2].camera).az;
    expect(Math.abs(az1 - az0)).toBeGreaterThan(90); // 半环绕方位角大幅变化
  });

  it('amplitude 线性放大代理增量；scale 可整体缩放', () => {
    const one = buildCameraMoveKeyframes(timeline([{ id: 'a', moveId: 'push-slow', startT: 0, endT: 2 }]), baseCamera());
    const two = buildCameraMoveKeyframes(
      timeline([{ id: 'a', moveId: 'push-slow', startT: 0, endT: 2, amplitude: 2 }]),
      baseCamera(),
    );
    const half = buildCameraMoveKeyframes(
      timeline([{ id: 'a', moveId: 'push-slow', startT: 0, endT: 2 }]),
      baseCamera(),
      { scale: { distance: 0.5 } },
    );
    const base = orbitOf(baseCamera()).dist;
    const delta1 = base - orbitOf(one[1].camera).dist;
    const delta2 = base - orbitOf(two[1].camera).dist;
    const deltaHalf = base - orbitOf(half[1].camera).dist;
    expect(delta2).toBeCloseTo(delta1 * 2, 6);
    expect(deltaHalf).toBeCloseTo(delta1 * 0.5, 6);
  });

  it('段间空隙不产生额外帧，采样在该区间内保持持稳', () => {
    const keys = buildCameraMoveKeyframes(timeline([
      { id: 'a', moveId: 'push-slow', startT: 0, endT: 2 },
      { id: 'b', moveId: 'pan-slow', startT: 4, endT: 6 },
    ]), baseCamera());
    expect(keys.map((k) => k.tSec)).toEqual([0, 2, 4, 6]);
    const at3 = sampleCameraMoveTimeline(keys, 3)!;
    expect(orbitOf(at3.camera).dist).toBeCloseTo(orbitOf(keys[1].camera).dist, 9);
    expect(at3.local).toBeGreaterThan(0);
    expect(at3.local).toBeLessThan(1);
  });

  it('区间缓动取自「起点帧所属片段」（段尾帧不会污染下一段）', () => {
    const keys = buildCameraMoveKeyframes(timeline([
      { id: 'a', moveId: 'push-slow', startT: 0, endT: 2 },
      { id: 'b', moveId: 'pan-slow', startT: 2, endT: 4, easing: 'ease-in', speedRamp: 'accelerate' },
    ]), baseCamera());
    // 区间 [0,2] 属 a → linear；区间 [2,4] 属 b → ease-in + accelerate
    expect(keys[0].easing).toBe('linear');
    expect(keys[1].easing).toBe('ease-in');
    expect(keys[1].speedRamp).toBe('accelerate');
  });

  it('首段不从 0 开始时补 t=0 持稳帧；leadIn=false 时不补', () => {
    const tl = timeline([{ id: 'a', moveId: 'push-slow', startT: 1, endT: 3 }], 3);
    expect(buildCameraMoveKeyframes(tl, baseCamera())[0].labelZh).toBe('起始持稳');
    expect(buildCameraMoveKeyframes(tl, baseCamera(), { leadIn: false })[0].tSec).toBe(1);
  });

  it('空时间轴 → 只有可选的持稳帧，不抛异常', () => {
    const keys = buildCameraMoveKeyframes(null, baseCamera());
    expect(keys).toHaveLength(1);
    expect(keys[0].labelZh).toBe('起始持稳');
    expect(sampleCameraMoveTimeline(keys, 3)!.local).toBe(0);
    expect(sampleCameraMoveTimeline([], 1)).toBeNull();
  });

  it('未知 moveId 按静态处理（不产生运动）但仍保留帧与标签', () => {
    const base = baseCamera();
    const keys = buildCameraMoveKeyframes(
      timeline([{ id: 'a', moveId: 'ghost-move', startT: 0, endT: 2 }]),
      base,
    );
    expect(keys[1].labelZh).toBe('ghost-move');
    expect(orbitOf(keys[1].camera).dist).toBeCloseTo(orbitOf(base).dist, 9);
  });

  it('不修改传入的基础机位对象', () => {
    const base = baseCamera();
    const snapshot = JSON.stringify(base);
    buildCameraMoveKeyframes(
      timeline([{ id: 'a', moveId: 'dutch-roll', startT: 0, endT: 2 }]),
      base,
    );
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe('sampleCameraMoveTimeline：按时间采样', () => {
  const keys = buildCameraMoveKeyframes(timeline([
    { id: 'a', moveId: 'push-slow', startT: 0, endT: 2 },
    { id: 'b', moveId: 'orbit-180', startT: 2, endT: 4 },
  ]), baseCamera());

  it('端点精确命中关键帧机位；越界被钳制', () => {
    const start = sampleCameraMoveTimeline(keys, 0)!;
    expect(start.camera.transform.position).toEqual(keys[0].camera.transform.position);
    expect(start.local).toBe(0);
    const end = sampleCameraMoveTimeline(keys, 4)!;
    expect(end.camera.transform.position[0]).toBeCloseTo(keys[2].camera.transform.position[0], 9);
    expect(end.camera.transform.position[2]).toBeCloseTo(keys[2].camera.transform.position[2], 9);
    expect(end.local).toBe(1);
    expect(sampleCameraMoveTimeline(keys, -99)!.local).toBe(0);
    expect(sampleCameraMoveTimeline(keys, 99)!.local).toBe(1);
  });

  it('端点与中点都落在关键帧机位的球坐标链上（不产生 NaN）', () => {
    for (const t of [0, 0.5, 1, 2, 2.5, 3, 4]) {
      const s = sampleCameraMoveTimeline(keys, t)!;
      expect(Number.isFinite(s.camera.fov)).toBe(true);
      for (const v of s.camera.transform.position) expect(Number.isFinite(v)).toBe(true);
      for (const v of s.camera.target) expect(Number.isFinite(v)).toBe(true);
      const o = orbitOf(s.camera);
      expect(Number.isFinite(o.az)).toBe(true);
      expect(Number.isFinite(o.dist)).toBe(true);
    }
  });

  it('easing 影响中点位置（与 linear 不同），但端点一致', () => {
    const lin = buildCameraMoveKeyframes(timeline([
      { id: 'a', moveId: 'push-slow', startT: 0, endT: 4, easing: 'linear' },
    ]), baseCamera());
    const easeIn = buildCameraMoveKeyframes(timeline([
      { id: 'a', moveId: 'push-slow', startT: 0, endT: 4, easing: 'ease-in' },
    ]), baseCamera());
    const midLin = orbitOf(sampleCameraMoveTimeline(lin, 1)!.camera).dist;
    const midEase = orbitOf(sampleCameraMoveTimeline(easeIn, 1)!.camera).dist;
    expect(midLin).not.toBeCloseTo(midEase, 6);
    const endLin = orbitOf(sampleCameraMoveTimeline(lin, 4)!.camera).dist;
    const endEase = orbitOf(sampleCameraMoveTimeline(easeIn, 4)!.camera).dist;
    expect(endLin).toBeCloseTo(endEase, 9);
    const s = sampleCameraMoveTimeline(easeIn, 1)!;
    expect(s.eased).toBeCloseTo(0.0625, 6); // ease-in(0.25) 再经 speedRamp steady
    expect(s.local).toBeCloseTo(0.25, 6);
  });

  it('采样结果可继续交给既有 buildCameraPrompt 使用（导演台提示词口径一致）', () => {
    const s = sampleCameraMoveTimeline(keys, 1.2)!;
    const desc = describeCameraShot(s.camera, { move: 'dolly-in' });
    expect(desc.prompt).toContain('camera movement: slow dolly in');
    expect(desc.shot.length).toBeGreaterThan(0);
  });
});

describe('moveTimelineToDirectorCameras / 计划描述', () => {
  it('生成带前缀 id 与片段名的机位数组，与关键帧一一对应', () => {
    const tl = timeline([
      { id: 'a', moveId: 'push-slow', startT: 0, endT: 2 },
      { id: 'b', moveId: 'pan-slow', startT: 2, endT: 4 },
    ], 4);
    const cameras = moveTimelineToDirectorCameras(tl, baseCamera());
    const keys = buildCameraMoveKeyframes(tl, baseCamera());
    expect(cameras).toHaveLength(keys.length);
    expect(cameras[0].id).toBe(`${MOVE_TIMELINE_CAMERA_PREFIX}1`);
    expect(cameras.every((c) => c.id.startsWith(MOVE_TIMELINE_CAMERA_PREFIX))).toBe(true);
    expect(cameras[0].name).toBe('缓推');
    expect(cameras.every((c) => c.captures.length === 0)).toBe(true);
    // id 唯一
    expect(new Set(cameras.map((c) => c.id)).size).toBe(cameras.length);
  });

  it('describeMoveTimelinePlan 输出中文顺序描述，空轨有明确文案', () => {
    const plan = describeMoveTimelinePlan(timeline([
      { id: 'a', moveId: 'push-slow', startT: 0, endT: 2 },
      { id: 'b', moveId: 'orbit-180', startT: 2, endT: 4 },
    ], 4));
    expect(plan).toContain('缓推');
    expect(plan).toContain('半环绕');
    expect(plan.indexOf('缓推')).toBeLessThan(plan.indexOf('半环绕'));
    expect(describeMoveTimelinePlan(null)).toBe('运镜时间轴为空');
  });
});
