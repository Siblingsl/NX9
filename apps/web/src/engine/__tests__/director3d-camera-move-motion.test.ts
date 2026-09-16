/**
 * 「大师运镜库 → 3D 导演台机位运动」回归（增量新增能力）。
 *
 * 与既有 director3d 适配器测试同一口径：**不走 `@nx9/shared` barrel**（既有缺陷），
 * 相对路径直取 shared / director3d 源码。
 *
 * 覆盖：家族关键帧数量、起点=当前机位、终点边界、推拉方向相反、环绕 az 单调、
 * 变焦只改 FOV、滑动变焦 dist×FOV 联动、代理近似显式标记、非法输入不抛异常、
 * 镜头态 / project.cameras 两条落盘路径的一致性、提示词并入不新增字段。
 */
import { describe, expect, it } from 'vitest';
import {
  MOTION_CAMERA_PREFIX,
  MOTION_FOV_MAX,
  MOTION_FOV_MIN,
  applyMotionToShotState,
  buildMotionCameraKeys,
  buildMotionCameraPrompt,
  buildMotionKeyframes,
  buildMotionPreview,
  countMotionCameras,
  describeMotionPlan,
  isMotionlessSpec,
  isProxyMotion,
  motionDeltaPhrases,
  motionJitterSample,
  motionProxyNote,
  motionToCameraMoveTimeline,
  resolveMotionSpec,
} from '../../../../../packages/director3d/src/schema/cameraMoveMotion';
import {
  DEFAULT_PROMPT_DETAILS,
  buildCameraPrompt,
  getOrbit,
  norm360,
} from '../../../../../packages/director3d/src/schema/cameraGeometry';
import {
  cameraKeysFromProject,
  emptyDirectorProject,
  shotCameraEquals,
  shotStateFromProject,
} from '../../../../../packages/director3d/src/schema/directorProject';
import type {
  DirectorCameraShot,
  DirectorProject,
} from '../../../../../packages/director3d/src/schema/directorProject';
import {
  CAMERA_MOVE_FAMILY_ORDER,
  CAMERA_MOVE_LIBRARY,
  lookupCameraMove,
} from '../../../../../packages/shared/src/data/camera-move-library';
import type { CameraMoveFamily } from '../../../../../packages/shared/src/data/camera-move-library';

function baseCamera(): DirectorCameraShot {
  return {
    id: 'cam-1',
    name: '主机位',
    fov: 50,
    target: [0, 1.05, 0],
    transform: { position: [0, 1.55, 5.4], rotation: [0, 0, 0], scale: [1, 1, 1] },
    captures: [],
  };
}

function orbitOf(camera: DirectorCameraShot) {
  return getOrbit(
    { x: camera.transform.position[0], y: camera.transform.position[1], z: camera.transform.position[2] },
    { x: camera.target[0], y: camera.target[1], z: camera.target[2] },
  );
}

/** 某条运镜的机位序列 */
function keysOf(moveId: string, opts?: Parameters<typeof buildMotionKeyframes>[2]) {
  return buildMotionKeyframes(moveId, baseCamera(), opts);
}

/** 家庭代表词条（每个 family 至少一条） */
const FAMILY_SAMPLE: Record<CameraMoveFamily, string> = {
  static: 'static-locked-off',
  push: 'push-slow',
  pull: 'pull-slow',
  pan: 'pan-slow',
  tilt: 'tilt-up',
  track: 'truck-left',
  crane: 'crane-up',
  orbit: 'orbit-90',
  zoom: 'zoom-in',
  handheld: 'handheld-follow',
  aerial: 'drone-pullback',
  special: 'whip-pan',
};

describe('resolveMotionSpec：家族 → 可执行机位参数', () => {
  it('56 条运镜全部能解析出参数（无遗漏家族）', () => {
    expect(CAMERA_MOVE_LIBRARY.length).toBe(56);
    for (const def of CAMERA_MOVE_LIBRARY) {
      const spec = resolveMotionSpec(def.id);
      expect(spec.family).toBe(def.family);
      expect(spec.frames).toBeGreaterThanOrEqual(2);
      expect(spec.frames).toBeLessThanOrEqual(12);
      expect(spec.durationHintSec[0]).toBeGreaterThan(0);
      expect(spec.durationHintSec[1]).toBeGreaterThanOrEqual(spec.durationHintSec[0]);
    }
  });

  it('每个家族的代表词条都有真实位移（除 static）', () => {
    for (const family of CAMERA_MOVE_FAMILY_ORDER) {
      const spec = resolveMotionSpec(FAMILY_SAMPLE[family]);
      if (family === 'static') {
        expect(isMotionlessSpec(spec)).toBe(true);
      } else {
        expect(isMotionlessSpec(spec)).toBe(false);
      }
    }
  });

  it('未知 / 空 id → 家族按 static、帧数为 1（无运动），不抛异常', () => {
    for (const bad of ['', '   ', 'no-such-move', null, undefined, '12345']) {
      const spec = resolveMotionSpec(bad as string | null | undefined);
      expect(spec.family).toBe('static');
      expect(spec.frames).toBe(1);
      expect(isMotionlessSpec(spec)).toBe(true);
    }
  });

  it('幅度倍数线性缩放（amplitude=2 时距离增量翻倍）', () => {
    const one = resolveMotionSpec('push-slow', { amplitude: 1 });
    const two = resolveMotionSpec('push-slow', { amplitude: 2 });
    expect(two.delta.dist).toBeCloseTo(one.delta.dist * 2, 9);
    // 越界幅度被钳制，不产生荒谬的机位
    expect(resolveMotionSpec('push-slow', { amplitude: 999 }).delta.dist).toBeCloseTo(one.delta.dist * 4, 9);
    expect(resolveMotionSpec('push-slow', { amplitude: 0 }).delta.dist).toBeCloseTo(one.delta.dist * 0.05, 9);
  });
});

describe('buildMotionKeyframes：关键帧数量与边界', () => {
  it('关键帧数量与家族 / 词条设定一致（含首尾）', () => {
    const expected: Record<string, number> = {
      'static-locked-off': 2,
      'push-slow': 3,
      'pull-slow': 3,
      'pan-slow': 3,
      'tilt-up': 3,
      'truck-left': 3,
      'crane-up': 4,
      'orbit-90': 5,
      'orbit-180': 7,
      'orbit-360': 9,
      'zoom-in': 3,
      'handheld-follow': 6,
      'handheld-verite': 8,
      'drone-pullback': 5,
      'dolly-zoom': 4,
      'whip-pan': 3,
    };
    for (const [id, count] of Object.entries(expected)) {
      expect(keysOf(id).length, id).toBe(count);
      expect(resolveMotionSpec(id).frames, id).toBe(count);
    }
  });

  it('首帧逐字节等于当前机位（套用不瞬移取景）', () => {
    for (const def of CAMERA_MOVE_LIBRARY) {
      const base = baseCamera();
      const first = keysOf(def.id)[0]!;
      expect(first.transform.position, def.id).toEqual(base.transform.position);
      expect(first.target, def.id).toEqual(base.target);
      expect(first.transform.rotation, def.id).toEqual(base.transform.rotation);
      expect(first.fov, def.id).toBe(base.fov);
    }
  });

  it('每帧都在机位台允许的取值区间内（仰角 / 距离 / FOV / 方位角）', () => {
    for (const def of CAMERA_MOVE_LIBRARY) {
      const keys = keysOf(def.id);
      const first = orbitOf(keys[0]!);
      for (const key of keys) {
        const orbit = orbitOf(key);
        expect(orbit.el, `${def.id} el`).toBeGreaterThanOrEqual(-85 - 1e-6);
        expect(orbit.el, `${def.id} el`).toBeLessThanOrEqual(88 + 1e-6);
        expect(orbit.dist, `${def.id} dist`).toBeGreaterThanOrEqual(0.3 - 1e-6);
        expect(orbit.dist, `${def.id} dist`).toBeLessThanOrEqual(30 + 1e-6);
        expect(key.fov, `${def.id} fov`).toBeGreaterThanOrEqual(MOTION_FOV_MIN - 1e-6);
        expect(key.fov, `${def.id} fov`).toBeLessThanOrEqual(MOTION_FOV_MAX + 1e-6);
        // 方位角总位移不超过一圈多（orbit-360 是上限）
        expect(Math.abs(norm360(orbit.az - first.az)), `${def.id} az`).toBeLessThanOrEqual(360 + 1e-3);
      }
    }
  });

  it('关键帧 id 用 cammv-* 前缀，便于批量移除', () => {
    const keys = keysOf('orbit-180');
    for (const key of keys) expect(key.id.startsWith(MOTION_CAMERA_PREFIX)).toBe(true);
    expect(new Set(keys.map((k) => k.id)).size).toBe(keys.length);
  });

  it('关键帧数可被覆盖（2~12 钳制）', () => {
    expect(keysOf('orbit-180', { frames: 3 }).length).toBe(3);
    expect(keysOf('orbit-180', { frames: 1 }).length).toBe(2);
    expect(keysOf('orbit-180', { frames: 99 }).length).toBe(12);
  });

  it('固定类运镜：所有帧与当前机位一致', () => {
    const base = baseCamera();
    for (const key of keysOf('static-locked-off')) {
      expect(key.transform.position).toEqual(base.transform.position);
      expect(key.target).toEqual(base.target);
      expect(key.fov).toBe(base.fov);
      expect(key.transform.rotation).toEqual(base.transform.rotation);
    }
  });

  it('非法基准机位不抛异常，回落到默认导演视角', () => {
    const broken = { id: 'x', fov: Number.NaN } as unknown as DirectorCameraShot;
    const keys = buildMotionKeyframes('push-slow', broken);
    expect(keys.length).toBe(3);
    expect(Number.isFinite(keys[0]!.fov)).toBe(true);
    expect(keys[0]!.target).toEqual([0, 1.05, 0]);
  });
});

describe('推镜 / 拉镜：方向相反', () => {
  it('push 距离单调减小，pull 距离单调增大，方向互为反向', () => {
    const push = keysOf('push-slow');
    const pull = keysOf('pull-slow');
    const d = (keys: DirectorCameraShot[]) => keys.map((k) => orbitOf(k).dist);
    const dp = d(push);
    const dl = d(pull);
    for (let i = 1; i < dp.length; i += 1) expect(dp[i]!).toBeLessThan(dp[i - 1]!);
    for (let i = 1; i < dl.length; i += 1) expect(dl[i]!).toBeGreaterThan(dl[i - 1]!);
    expect(dp[dp.length - 1]! - dp[0]!).toBeLessThan(0);
    expect(dl[dl.length - 1]! - dl[0]!).toBeGreaterThan(0);
    // 同一点位、只差符号方向
    expect(resolveMotionSpec('push-slow').delta.dist).toBeLessThan(0);
    expect(resolveMotionSpec('pull-slow').delta.dist).toBeGreaterThan(0);
    // 推拉不改变视线方向与视野
    expect(resolveMotionSpec('push-slow').delta.fov).toBe(0);
    expect(resolveMotionSpec('pull-slow').delta.fov).toBe(0);
    expect(resolveMotionSpec('pull-slow').delta.yaw).toBe(0);
    expect(pull[0]!.target).toEqual(push[0]!.target);
  });
});

describe('环绕：方位角单调', () => {
  it('orbit-90 / orbit-180 的方位角单调递增（展开后）', () => {
    for (const id of ['orbit-90', 'orbit-180']) {
      const keys = keysOf(id);
      const first = orbitOf(keys[0]!).az;
      const series = keys.map((k) => norm360(orbitOf(k).az - first));
      for (let i = 1; i < series.length; i += 1) {
        expect(series[i]!, `${id} 第 ${i} 帧`).toBeGreaterThan(series[i - 1]!);
      }
      const expected = resolveMotionSpec(id).delta.az;
      expect(series[series.length - 1]!).toBeCloseTo(expected, 3);
    }
  });

  it('orbit-360 环绕一整圈后回到起点方位（其余通道不变）', () => {
    const keys = keysOf('orbit-360');
    const first = orbitOf(keys[0]!);
    const last = orbitOf(keys[keys.length - 1]!);
    const delta = Math.abs(norm360(last.az - first.az));
    expect(Math.min(delta, 360 - delta)).toBeLessThan(0.5);
    expect(last.el).toBeCloseTo(first.el, 6);
    expect(last.dist).toBeCloseTo(first.dist, 6);
  });

  it('orbit-arc-in 环绕同时靠近主体', () => {
    const keys = keysOf('orbit-arc-in');
    expect(orbitOf(keys[keys.length - 1]!).dist).toBeLessThan(orbitOf(keys[0]!).dist);
    expect(resolveMotionSpec('orbit-arc-in').delta.az).toBeGreaterThan(0);
  });
});

describe('变焦：只改 FOV', () => {
  it('zoom-in 收紧 FOV，机位与目标点不动', () => {
    const base = baseCamera();
    const keys = keysOf('zoom-in');
    for (const key of keys) {
      expect(key.transform.position).toEqual(base.transform.position);
      expect(key.target).toEqual(base.target);
      expect(key.transform.rotation).toEqual(base.transform.rotation);
    }
    expect(keys[keys.length - 1]!.fov).toBeLessThan(base.fov);
  });

  it('zoom-out 放宽 FOV', () => {
    const keys = keysOf('zoom-out');
    const base = baseCamera();
    expect(keys[keys.length - 1]!.fov).toBeGreaterThan(base.fov);
  });

  it('滑动变焦（dolly-zoom）：dist 单调减小、FOV 单调增大、dist×tan(FOV/2) 恒定', () => {
    const keys = keysOf('dolly-zoom');
    const orbits = keys.map((k) => orbitOf(k));
    const subjectScale = keys.map((k, i) => orbits[i]!.dist * Math.tan((k.fov * Math.PI) / 360));
    for (let i = 1; i < keys.length; i += 1) {
      expect(orbits[i]!.dist, `第 ${i} 帧距离`).toBeLessThan(orbits[i - 1]!.dist);
      expect(keys[i]!.fov, `第 ${i} 帧 FOV`).toBeGreaterThan(keys[i - 1]!.fov);
      expect(subjectScale[i]! / subjectScale[0]!, `第 ${i} 帧主体尺寸比`).toBeCloseTo(1, 6);
    }
    expect(describeMotionPlan('dolly-zoom').preserveSubjectSize).toBe(true);
    // 与「纯推轨 + 无联动」形成对照：后者主体会放大
    const plainPass = keysOf('push-slow').map((k) => orbitOf(k).dist * Math.tan((k.fov * Math.PI) / 360));
    expect(plainPass[plainPass.length - 1]! / plainPass[0]!).toBeLessThan(0.95);
  });
});

describe('摇 / 俯仰 / 横移 / 升降 / 手持', () => {
  it('摇镜只转视线：机位不动、目标点位移', () => {
    const base = baseCamera();
    const keys = keysOf('pan-slow');
    for (const key of keys) expect(key.transform.position).toEqual(base.transform.position);
    const first = keys[0]!;
    const last = keys[keys.length - 1]!;
    const move = Math.hypot(
      last.target[0] - first.target[0],
      last.target[2] - first.target[2],
    );
    expect(move).toBeGreaterThan(0.5);
    expect(resolveMotionSpec('pan-slow').delta.dist).toBe(0);
  });

  it('tilt-up / tilt-down 视线方向相反', () => {
    const up = keysOf('tilt-up');
    const down = keysOf('tilt-down');
    const lastUp = up[up.length - 1]!;
    const lastDown = down[down.length - 1]!;
    expect(lastUp.target[1]).toBeGreaterThan(up[0]!.target[1]);
    expect(lastDown.target[1]).toBeLessThan(down[0]!.target[1]);
  });

  it('横移（truck）机位与目标点同步平移，构图保持不变', () => {
    const right = keysOf('truck-right');
    const base = baseCamera();
    const first = right[0]!;
    const last = right[right.length - 1]!;
    const posDelta = [
      last.transform.position[0] - first.transform.position[0],
      last.transform.position[2] - first.transform.position[2],
    ];
    const tgtDelta = [last.target[0] - first.target[0], last.target[2] - first.target[2]];
    expect(Math.hypot(posDelta[0]!, posDelta[1]!)).toBeCloseTo(1.2, 6);
    expect(Math.hypot(tgtDelta[0]!, tgtDelta[1]!)).toBeCloseTo(1.2, 6);
    // 同步平移 → 视线方向不变、距离不变（构图不动）
    expect(orbitOf(last).dist).toBeCloseTo(orbitOf(first).dist, 6);
    expect(last.target[1] - first.target[1]).toBeCloseTo(0, 9);
    // 左横移与右横移方向相反
    const left = keysOf('truck-left');
    expect(resolveMotionSpec('truck-right').delta.side).toBeGreaterThan(0);
    expect(resolveMotionSpec('truck-left').delta.side).toBeLessThan(0);
    expect(base.transform.position[0]).toBe(0);
  });

  it('升降（crane-up）：仰角抬高且后退拉开；crane-down 反向', () => {
    const up = keysOf('crane-up');
    const down = keysOf('crane-down');
    expect(orbitOf(up[up.length - 1]!).el).toBeGreaterThan(orbitOf(up[0]!).el);
    expect(orbitOf(up[up.length - 1]!).dist).toBeGreaterThan(orbitOf(up[0]!).dist);
    expect(orbitOf(down[down.length - 1]!).el).toBeLessThan(orbitOf(down[0]!).el);
  });

  it('手持：抖动出现振荡（非单调），且两端不残留抖动', () => {
    const keys = keysOf('handheld-verite');
    const az = keys.map((k) => orbitOf(k).az);
    let ups = 0;
    let downs = 0;
    for (let i = 1; i < az.length; i += 1) {
      const diff = az[i]! - az[i - 1]!;
      if (diff > 1e-9) ups += 1;
      if (diff < -1e-9) downs += 1;
    }
    expect(ups, '抖动应同时出现正负扰动').toBeGreaterThan(0);
    expect(downs).toBeGreaterThan(0);
    const base = baseCamera();
    const last = keys[keys.length - 1]!;
    // 末帧抖动已归零：只剩词条本身的位移（handheld-verite 距离 -0.2）
    expect(Math.abs(orbitOf(last).az - orbitOf(base).az)).toBeLessThan(1e-9);
    expect(last.transform.rotation[2]).toBeCloseTo(base.transform.rotation[2], 9);
    expect(orbitOf(last).dist).toBeCloseTo(orbitOf(base).dist - 0.2, 6);
  });

  it('抖动噪声确定性：同 id + 同序号恒等，且落在 [-1,1]', () => {
    for (let i = 0; i < 12; i += 1) {
      const a = motionJitterSample('handheld-tense', i);
      expect(a).toBe(motionJitterSample('handheld-tense', i));
      expect(a).toBeGreaterThanOrEqual(-1);
      expect(a).toBeLessThanOrEqual(1);
    }
    expect(motionJitterSample('handheld-tense', 3)).not.toBe(motionJitterSample('handheld-verite', 3));
  });
});

describe('代理近似：显式标记，不假装等价', () => {
  const PROXY_IDS = [
    'static-foreground-frame',
    'push-through',
    'push-past-foreground',
    'pull-through-frames',
    'crane-reveal',
    'drone-rise-reveal',
    'fpv-flythrough',
    'track-follow',
    'track-walk-talk',
    'pan-follow',
    'rack-focus',
    'bullet-time',
    'snorricam',
  ];

  it('代理近似词条都在词库里，且 representation=proxy + 有中文说明', () => {
    for (const id of PROXY_IDS) {
      expect(lookupCameraMove(id), id).toBeTruthy();
      const plan = describeMotionPlan(id, baseCamera());
      expect(plan.representation, id).toBe('proxy');
      expect(plan.proxyNoteZh.length, id).toBeGreaterThan(4);
      expect(plan.summaryZh, id).toContain('代理近似');
      expect(isProxyMotion(id), id).toBe(true);
      expect(motionProxyNote(id)).toBe(plan.proxyNoteZh);
      // 近似标记不影响它仍然生成可预演的机位（唯一的「本来就不动机位」例外见下一条用例）
      if (id === 'static-foreground-frame') continue;
      const channels = Object.values(plan.delta).reduce((sum, value) => sum + Math.abs(value), 0);
      expect(channels, id).toBeGreaterThan(0);
    }
  });

  it('可用现有自由度等价表达的词条一律 native，且不带代理说明', () => {
    for (const id of ['push-slow', 'pull-isolate', 'orbit-180', 'zoom-in', 'dolly-zoom', 'tilt-up', 'dutch-roll', 'drone-orbit']) {
      const plan = describeMotionPlan(id, baseCamera());
      expect(plan.representation, id).toBe('native');
      expect(plan.proxyNoteZh, id).toBe('');
      expect(isProxyMotion(id), id).toBe(false);
      expect(plan.summaryZh, id).not.toContain('代理近似');
    }
  });

  it('固定机位的前景框定：机位真的不动，但仍如实标成代理近似（不假装有位移）', () => {
    const plan = describeMotionPlan('static-foreground-frame', baseCamera());
    expect(plan.representation).toBe('proxy');
    expect(Object.values(plan.delta).every((value) => value === 0)).toBe(true);
    expect(plan.summaryZh).toContain('机位保持不动');
    expect(plan.summaryZh).toContain('代理近似');
    const keys = keysOf('static-foreground-frame');
    expect(keys.every((key) => key.transform.position[0] === 0 && key.transform.position[2] === 5.4)).toBe(true);
  });

  it('代理说明逐条不同（不是同一句套话）', () => {
    const notes = PROXY_IDS.map((id) => motionProxyNote(id));
    expect(new Set(notes).size).toBe(notes.length);
  });
});

describe('describeMotionPlan：中文计划说明', () => {
  it('推镜说明含方向与幅度，并标注帧数与建议时长', () => {
    const plan = describeMotionPlan('push-slow', baseCamera());
    expect(plan.found).toBe(true);
    expect(plan.family).toBe('push');
    expect(plan.familyLabelZh).toBe('推镜');
    expect(plan.summaryZh).toContain('缓推');
    expect(plan.summaryZh).toContain('前推');
    expect(plan.summaryZh).toContain('m');
    expect(plan.summaryZh).toContain('3 帧机位关键帧');
    expect(plan.changesFov).toBe(false);
    expect(plan.start).toBeTruthy();
    expect(plan.end).toBeTruthy();
    expect(plan.shotSizes.length).toBeGreaterThan(0);
    // 起点与终点机位确实不同（距离变近）
    const d0 = getOrbit(
      { x: plan.start!.position[0], y: plan.start!.position[1], z: plan.start!.position[2] },
      { x: plan.start!.target[0], y: plan.start!.target[1], z: plan.start!.target[2] },
    ).dist;
    const d1 = getOrbit(
      { x: plan.end!.position[0], y: plan.end!.position[1], z: plan.end!.position[2] },
      { x: plan.end!.target[0], y: plan.end!.target[1], z: plan.end!.target[2] },
    ).dist;
    expect(d1).toBeLessThan(d0);
  });

  it('未知 id 的说明如实写「不生成机位运动」', () => {
    const plan = describeMotionPlan('nope', baseCamera());
    expect(plan.found).toBe(false);
    expect(plan.frames).toBe(1);
    expect(plan.summaryZh).toContain('未识别');
    expect(plan.delta).toEqual({
      az: 0, el: 0, dist: 0, yaw: 0, pitch: 0, side: 0, up: 0, forward: 0, fov: 0, roll: 0,
    });
  });

  it('不带基准机位也能给出计划（start/end 为 null）', () => {
    const plan = describeMotionPlan('orbit-90');
    expect(plan.start).toBeNull();
    expect(plan.end).toBeNull();
    expect(plan.delta.az).toBe(90);
  });

  it('通道短语覆盖全部自由度（平移 / 视线 / 滚转 / 视野）', () => {
    const phrases = motionDeltaPhrases({
      delta: { az: 10, el: 5, dist: -1, yaw: 20, pitch: -8, side: 1, up: 0.5, forward: 1.2, fov: -6, roll: 4 },
      preserveSubjectSize: false,
    });
    const text = phrases.join('|');
    expect(text).toContain('环绕');
    expect(text).toContain('抬升机位');
    expect(text).toContain('视线向右转');
    expect(text).toContain('视线向下转');
    expect(text).toContain('横移');
    expect(text).toContain('上升');
    expect(text).toContain('沿视线前进');
    expect(text).toContain('滚转');
    expect(phrases.length).toBe(10);
  });
});

describe('非法输入：绝不抛异常', () => {
  it('buildMotionKeyframes / buildMotionCameraKeys / buildMotionPreview 对垃圾输入都返回可用结果', () => {
    const garbage = [null, undefined, '', '   ', 'unknown-move', 42, {}] as unknown[];
    const brokenBases = [
      null,
      undefined,
      {} as DirectorCameraShot,
      { id: 'x', fov: 'nope' } as unknown as DirectorCameraShot,
    ];
    for (const move of garbage) {
      for (const base of brokenBases) {
        const keys = buildMotionKeyframes(move as string, base as DirectorCameraShot);
        expect(Array.isArray(keys)).toBe(true);
        expect(keys.length).toBeGreaterThanOrEqual(1);
        const cameraKeys = buildMotionCameraKeys(move as string, base as DirectorCameraShot);
        expect(cameraKeys.length).toBe(keys.length);
        expect(Number.isFinite(cameraKeys[0]!.camera.fov)).toBe(true);
      }
    }
    const preview = buildMotionPreview('nope', null);
    expect(preview.plan.found).toBe(false);
    expect(preview.cameras.length).toBe(1);
    expect(preview.keyframes.length).toBe(1);
    expect(motionToCameraMoveTimeline('nope')).toBeNull();
  });
});

describe('applyMotionToShotState：镜头态落盘映射', () => {
  function shotState() {
    return shotStateFromProject(emptyDirectorProject(), 'shot-1');
  }

  it('写入 cameraKeys（首帧激活）、不动 camera 语义与环境 / 物体', () => {
    const state = shotState();
    const before = structuredClone(state);
    const { state: next, plan } = applyMotionToShotState(state, 'orbit-90');
    expect(plan.found).toBe(true);
    expect(next.cameraKeys!.length).toBe(plan.frames);
    expect(next.activeCameraKeyId).toBe(next.cameraKeys![0]!.id);
    expect(next.cameraKeys!.map((k) => k.t)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    // 激活帧姿态 = 套用前的当前机位 → 取景不瞬移
    expect(next.cameraKeys![0]!.camera.position).toEqual(before.camera.position);
    expect(next.cameraKeys![0]!.camera.target).toEqual(before.camera.target);
    // 既有字段语义不变
    expect(next.camera).toEqual(before.camera);
    expect(next.objects).toEqual(before.objects);
    expect(next.environment).toEqual(before.environment);
    expect(next.shotId).toBe(state.shotId);
    expect(next.stateVersion).toBe(state.stateVersion);
    // 不改动入参
    expect(state.cameraKeys ?? []).toEqual([]);
  });

  it('与既有 project.cameras → cameraKeys 落盘路径产出同一机位序列', () => {
    const state = shotState();
    const { state: next } = applyMotionToShotState(state, 'push-slow');
    const project: DirectorProject = {
      ...emptyDirectorProject(),
      cameras: buildMotionKeyframes('push-slow', {
        id: 'cam-base',
        name: '主镜头',
        fov: state.camera.fov,
        target: [...state.camera.target] as [number, number, number],
        transform: {
          position: [...state.camera.position] as [number, number, number],
          rotation: [...state.camera.rotation] as [number, number, number],
          scale: [1, 1, 1],
        },
        captures: [],
      }),
      activeCameraId: `${MOTION_CAMERA_PREFIX}1`,
    };
    const fromProject = cameraKeysFromProject(project);
    expect(fromProject.length).toBe(next.cameraKeys!.length);
    fromProject.forEach((key, index) => {
      const other = next.cameraKeys![index]!;
      expect(key.id, `第 ${index} 帧 id`).toBe(other.id);
      expect(shotCameraEquals(key.camera, other.camera), `第 ${index} 帧姿态`).toBe(true);
    });
  });

  it('countMotionCameras 只数 cammv-* 机位（不误伤 movetl-* 与手动机位）', () => {
    const cameras = [
      { id: 'cam-1' },
      { id: `${MOTION_CAMERA_PREFIX}1` },
      { id: `${MOTION_CAMERA_PREFIX}2` },
      { id: 'movetl-1' },
    ];
    expect(countMotionCameras(cameras)).toBe(2);
    expect(countMotionCameras([])).toBe(0);
    expect(countMotionCameras(null)).toBe(0);
    expect(countMotionCameras([{ id: 'cam-1' }, { id: 'cam-mv-1' }])).toBe(0);
  });

  it('未知运镜 → 只写一帧（当前机位），不产生假运动', () => {
    const state = shotState();
    const { state: next, plan } = applyMotionToShotState(state, 'nope');
    expect(plan.found).toBe(false);
    expect(next.cameraKeys!.length).toBe(1);
    expect(shotCameraEquals(
      { ...next.cameraKeys![0]!.camera },
      { ...state.camera },
    )).toBe(true);
  });
});

describe('机位运动时间轴 / 提示词协同', () => {
  it('加入运镜时间轴：单段、时长与计划一致、可被既有校验口径接受', () => {
    const timeline = motionToCameraMoveTimeline('orbit-180');
    expect(timeline).not.toBeNull();
    expect(timeline!.segments.length).toBe(1);
    expect(timeline!.segments[0]!.moveId).toBe('orbit-180');
    expect(timeline!.segments[0]!.startT).toBe(0);
    expect(timeline!.segments[0]!.endT).toBe(timeline!.durationSec);
    expect(timeline!.durationSec).toBe(describeMotionPlan('orbit-180').durationSec);
    expect(timeline!.segments[0]!.amplitude).toBe(1);
    expect(motionToCameraMoveTimeline('orbit-180', { amplitude: 2 })!.segments[0]!.amplitude).toBe(2);
  });

  it('提示词：套用后短语并入 camera movement 槽位，且只有一条运镜行', () => {
    const camera = baseCamera();
    const plain = buildCameraPrompt(camera, { move: 'static', details: DEFAULT_PROMPT_DETAILS });
    const withMove = buildMotionCameraPrompt(camera, {
      moveId: 'orbit-180',
      details: DEFAULT_PROMPT_DETAILS,
    });
    const def = lookupCameraMove('orbit-180')!;
    expect(withMove).toContain(def.promptEn);
    expect(withMove.split('\n').filter((line) => line.trim().toLowerCase().startsWith('camera movement:'))).toHaveLength(1);
    // 老行为：未套用大师运镜时输出与改动前逐字符一致
    expect(buildMotionCameraPrompt(camera, { fallbackMove: 'static', details: DEFAULT_PROMPT_DETAILS })).toBe(plain);
    // 未套用 + 无 fallback 时与 buildCameraPrompt 同参调用一致
    expect(buildMotionCameraPrompt(camera, { details: DEFAULT_PROMPT_DETAILS })).toBe(
      buildCameraPrompt(camera, { move: null, details: DEFAULT_PROMPT_DETAILS }),
    );
    // 未知 id 不注入
    expect(buildMotionCameraPrompt(camera, { moveId: 'nope', fallbackMove: 'static', details: DEFAULT_PROMPT_DETAILS })).toBe(plain);
    // 清除套用（moveId=null）时运镜行被移除，其余内容保留
    const cleared = buildMotionCameraPrompt(camera, { moveId: null, fallbackMove: 'static', details: DEFAULT_PROMPT_DETAILS });
    expect(cleared).toBe(plain);
  });
});
