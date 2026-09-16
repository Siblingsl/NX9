/**
 * session-review-probe.test.ts —— 本会话「对抗式实现评审」新增的边界回归（第 1 组：持久化 / 并发 / 注入）。
 *
 * 说明：文件由评审探针演化而来，命名保留 `probe` 以免与既有用例名冲突。
 * 断言分两类：
 * - **不变量**：应当成立的契约（修复或既有正确行为）；
 * - **characterization（现状刻画）**：经实际调用确认的已知边界，代码注释里指向
 *   `docs/NX9-SESSION-IMPLEMENTATION-REVIEW.md` 的缺陷条目。这类断言不是「认可缺陷」，
 *   而是把已确认的现状钉住，避免下次改动悄悄改变口径却无人发现。
 *
 * 依赖形态：全部走相对路径直取源码（`packages/shared` barrel 当前引用了 8 个不存在的
 * `data/*` 模块，无法解析；详见评审文档 D-01），因此本文件不 import `@nx9/shared`。
 */
import { describe, expect, it } from 'vitest';
import {
  cameraKeysFromProject,
  coerceCameraKeys,
  emptyDirectorProject,
  normalizeShotState,
  projectFromShotState,
  shotStateFromProject,
  type Director3dShotState,
  type DirectorCameraShot,
  type DirectorProject,
} from '../../../../../packages/director3d/src/schema/directorProject';
import { resolveRunConcurrency, runWithConcurrency } from '../run-with-concurrency';
import { runCellGenBatch } from '../flow-runner-ops/cell-gen-batch';
import {
  readPresetSections,
  withAnimeTagPrompt,
  withCinemaPrompt,
  withLightRigPrompt,
  withPortraitPrompt,
} from '../../../../../packages/shared/src/utils/preset-entrypoints';
import { withShotBlockingHint } from '../shot-blocking-hint';
import { withMoveTimelinePrompt } from '../../../../../packages/shared/src/utils/camera-move-timeline';
import { withCameraMovePrompt } from '../../../../../packages/shared/src/data/camera-move-library';

function makeCamera(
  id: string,
  position: [number, number, number],
  fov = 50,
): DirectorCameraShot {
  return {
    id,
    name: id,
    fov,
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
    target: [0, 1, 0],
    captures: [],
  };
}

function projectWith(cameras: DirectorCameraShot[], activeId: string): DirectorProject {
  const project = emptyDirectorProject();
  project.cameras = cameras;
  project.activeCameraId = activeId;
  return project;
}

const jsonClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/* ───────────────── ① 持久化：画幅与机位序列边界 ───────────────── */

describe('持久化边界：非法画幅不写进工程（评审修复项）', () => {
  it('state.camera.aspectRatio 合法时原样透传（既有行为不变）', () => {
    const project = projectWith([makeCamera('c1', [0, 1, 5])], 'c1');
    project.viewportAspectRatio = '9:16';
    const state = shotStateFromProject(project, 'shot-1');
    expect(state.camera.aspectRatio).toBe('9:16');
    expect(projectFromShotState(state, project).viewportAspectRatio).toBe('9:16');
  });

  it('state.camera.aspectRatio 非法时按基准工程回落，不把脏值写进工程', () => {
    const project = projectWith([makeCamera('c1', [0, 1, 5])], 'c1');
    project.viewportAspectRatio = '1:1';
    const state = shotStateFromProject(project, 'shot-1');
    const broken: Director3dShotState = {
      ...state,
      camera: { ...state.camera, aspectRatio: 'garbage' as never },
    };
    expect(projectFromShotState(broken, project).viewportAspectRatio).toBe('1:1');
    // 基准工程缺失 / 脏值 → 兜底 16:9
    expect(projectFromShotState(broken).viewportAspectRatio).toBe('16:9');
    expect(
      projectFromShotState(broken, { ...project, viewportAspectRatio: 'x' as never })
        .viewportAspectRatio,
    ).toBe('16:9');
  });
});

describe('持久化边界：机位序列裁剪与回落', () => {
  it('单机位不落 keys（落盘形状与老数据一致）', () => {
    const project = projectWith([makeCamera('c1', [0, 1, 5])], 'c1');
    expect(cameraKeysFromProject(project)).toEqual([]);
    const state = shotStateFromProject(project, 'shot-1');
    expect(state.cameraKeys).toEqual([]);
    expect(state.activeCameraKeyId).toBeNull();
  });

  it('keys 内 id 重复被重编；空数组 / 非数组口径分开', () => {
    const base = {
      position: [1, 1, 1] as [number, number, number],
      target: [0, 1, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      fov: 40,
      aspectRatio: '16:9' as const,
    };
    const keys = coerceCameraKeys([
      { id: 'dup', camera: base, t: 0 },
      { id: 'dup', camera: { ...base, position: [2, 1, 1] }, t: 1 },
    ])!;
    expect(keys.map((key) => key.id)).toEqual(['dup', 'dup-2']);
    expect(coerceCameraKeys([])).toEqual([]);
    expect(coerceCameraKeys(undefined)).toBeUndefined();
    expect(coerceCameraKeys('oops')).toBeUndefined();
  });

  it('老 version:2 数据（无 keys）归一化后补空数组，场景数据不丢', () => {
    const legacy = {
      version: 2,
      stateVersion: 3,
      shotId: 'shot-1',
      environment: { backgroundColor: '#111', groundVisible: true, groundOpacity: 0.5 },
      objects: [{ id: 'o1', name: '桌', kind: 'prop', visible: true, locked: false, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }],
      camera: { position: [1, 1, 5], target: [0, 1, 0], rotation: [0, 0, 0], fov: 35, aspectRatio: '16:9' },
      candidates: [],
      dirty: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const normalized = normalizeShotState(legacy, 'shot-1');
    expect(normalized.cameraKeys).toEqual([]);
    expect(normalized.activeCameraKeyId).toBeNull();
    expect(normalized.objects.map((o) => o.id)).toEqual(['o1']);
    expect(projectFromShotState(normalized).cameras[0]!.fov).toBe(35);
  });

  it('多数机位往返幂等（keys / 激活机位 / 姿态逐项还原）', () => {
    const project = projectWith(
      [makeCamera('c1', [0, 1, 5]), makeCamera('c2', [3, 1, 5]), makeCamera('c3', [6, 1, 5])],
      'c2',
    );
    const state = shotStateFromProject(project, 'shot-1');
    const back = projectFromShotState(normalizeShotState(jsonClone(state), 'shot-1'), project);
    expect(back.cameras.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(back.activeCameraId).toBe('c2');
    const again = shotStateFromProject(back, 'shot-1');
    expect(again.cameraKeys).toEqual(state.cameraKeys);
    expect(again.activeCameraKeyId).toBe('c2');
  });

  it('characterization：激活 key id 丢失且两机位姿态完全相同时，激活机位回落到首个同姿态帧', () => {
    // 见评审文档 D-04：这是 `camerasFromCameraKeys` 已声明的回落顺序（id → 姿态 → 首帧）的必然结果，
    // 姿态等价所以画面不变，只有机位 id 变化；触发条件是「老快照缺 activeCameraKeyId + 两台机位姿态完全相同」。
    const project = projectWith(
      [makeCamera('c1', [0, 1, 5]), makeCamera('c2', [0, 1, 5]), makeCamera('c3', [9, 1, 5])],
      'c2',
    );
    const state = shotStateFromProject(project, 'shot-1');
    expect(state.activeCameraKeyId).toBe('c2');
    const back = projectFromShotState({ ...state, activeCameraKeyId: null }, project);
    expect(back.activeCameraId).toBe('c1');
    expect(back.cameras.find((c) => c.id === 'c1')!.transform.position).toEqual([0, 1, 5]);
  });

  it('characterization：coerceCameraKeys 把自定义 t 归一为均分位（t 被定义为「序列内归一化索引」）', () => {
    const base = {
      position: [0, 0, 0] as [number, number, number],
      target: [0, 1, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      fov: 50,
      aspectRatio: '16:9' as const,
    };
    const keys = coerceCameraKeys([
      { id: 'a', t: 0, camera: base },
      { id: 'b', t: 0.1, camera: base },
      { id: 'c', t: 0.9, camera: base },
      { id: 'd', t: 1, camera: base },
    ])!;
    expect(keys.map((key) => key.t)).toEqual([0, 1 / 3, 2 / 3, 1]);
    // 生产写入方（cameraKeysFromCameras / 运镜时间轴机位）产出的就是均分位，故该归一今日为恒等映射。
    expect(cameraKeysFromProject(projectWith([makeCamera('a', [0, 0, 0]), makeCamera('b', [1, 0, 0])], 'a')).map((k) => k.t)).toEqual([0, 1]);
  });
});

/* ───────────────── ② 并发：账目口径 ───────────────── */

describe('并发布界：进度 / 取消 / 失败隔离账目', () => {
  it('跑满时按下标对齐并收尾一次 (total, total)', async () => {
    const progress: [number, number][] = [];
    const outcome = await runWithConcurrency([1, 2, 3], async (i) => i * 2, {
      limit: 2,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(outcome.results).toEqual([2, 4, 6]);
    expect(outcome.done).toBe(3);
    expect(progress.at(-1)).toEqual([3, 3]);
    expect(progress.every(([, total]) => total === 3)).toBe(true);
  });

  it('characterization：被取消提前收场时不补收尾回调（最后一次回调停在启动计数）', async () => {
    // 见评审文档 D-06：文件头契约已按实际行为更正（取消路径不补收尾）。
    const controller = new AbortController();
    const progress: [number, number][] = [];
    const gates: Array<(v: number) => void> = [];
    const running = runWithConcurrency(
      [0, 1, 2, 3],
      (i) => new Promise<number>((resolve) => { gates[i] = resolve; }),
      { limit: 2, signal: controller.signal, onProgress: (done, total) => progress.push([done, total]) },
    );
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    gates[0]!(0);
    gates[1]!(1);
    const outcome = await running;
    expect(outcome.done).toBe(2);
    expect(outcome.cancelled).toBe(true);
    expect(progress).toEqual([[0, 4], [0, 4]]);
  });

  it('单点失败只记在该项名下；同步抛错同样收敛', async () => {
    const outcome = await runWithConcurrency(
      ['ok', 'bad'],
      (item) => {
        if (item === 'bad') throw new Error('同步失败');
        return item;
      },
      { limit: 2 },
    );
    expect(outcome.results[0]).toBe('ok');
    expect(outcome.failed).toBe(1);
    expect((outcome.errors[1] as Error).message).toBe('同步失败');
    expect(outcome.cancelled).toBe(false);
  });

  it('并发上限归一：非有限值 = 1（串行），上限不超过项数，空输入 = 0', () => {
    expect(resolveRunConcurrency(Number.POSITIVE_INFINITY, 5)).toBe(1);
    expect(resolveRunConcurrency(1e9, 5)).toBe(5);
    expect(resolveRunConcurrency(-3, 5)).toBe(1);
    expect(resolveRunConcurrency(0, 5)).toBe(1);
    expect(resolveRunConcurrency(2, 0)).toBe(0);
  });
});

describe('并发布界：cell-gen-batch 取消与失败账单', () => {
  it('characterization：signal 已 abort 期间的任何异常都不进失败账单（整轮按取消上报）', async () => {
    // 见评审文档 D-05：这保证了「abort 引发的网络错误」不会被误报成格失败，代价是
    // abort 期间某个格的真实失败也不出现在 failures 里（状态仍可由「逐格重试」补跑）。
    const controller = new AbortController();
    const result = await runCellGenBatch({
      cells: [
        { role: 'r0', imagePrompt: 'p0' },
        { role: 'r1', imagePrompt: 'p1' },
      ],
      sourceUrl: 'src',
      concurrency: 2,
      signal: controller.signal,
      generate: async ({ index }) => {
        if (index === 0) {
          controller.abort();
          throw new Error('模型配额不足');
        }
        return [`u${index}`];
      },
    });
    expect(result.failures).toEqual([]);
    expect(result.cancelled).toBe(true);
  });

  it('未取消时的失败按格号升序入账，成功格保图（不假绿）', async () => {
    const result = await runCellGenBatch({
      cells: [
        { role: 'r0', imagePrompt: 'p0' },
        { role: 'r1', imagePrompt: 'p1' },
        { role: 'r2', imagePrompt: 'p2' },
      ],
      sourceUrl: 'src',
      concurrency: 2,
      generate: async ({ index }) => {
        if (index === 1) throw new Error('第 2 格失败');
        if (index === 2) return [];
        return [`u${index}`];
      },
    });
    expect(result.slots).toEqual(['u0', undefined, undefined]);
    expect(result.failures.map((f) => f.index)).toEqual([1, 2]);
    expect(result.failures[1]!.error).toContain('禁止空成功');
    expect(result.generatedCount).toBe(1);
  });

  it('indexes 为空数组时不开工，且不报取消', async () => {
    let called = 0;
    const result = await runCellGenBatch({
      cells: [{ role: 'r0', imagePrompt: 'p0' }],
      sourceUrl: 'src',
      indexes: [],
      generate: async () => {
        called += 1;
        return ['u'];
      },
    });
    expect(called).toBe(0);
    expect(result.total).toBe(0);
    expect(result.cancelled).toBe(false);
  });

  it('onPendingChange 传的是快照副本，调用方就地改写不会污染内部台账', async () => {
    const snapshots: Array<Array<{ taskId: string }>> = [];
    await runCellGenBatch({
      cells: [
        { role: 'r0', imagePrompt: 'p0' },
        { role: 'r1', imagePrompt: 'p1' },
      ],
      sourceUrl: 'src',
      concurrency: 2,
      onPendingChange: (tasks) => snapshots.push(tasks as Array<{ taskId: string }>),
      generate: async ({ index, onTaskId }) => {
        onTaskId(`t${index}`);
        return [`u${index}`];
      },
    });
    expect(snapshots.length).toBe(2);
    expect(snapshots[0]).not.toBe(snapshots[1]);
    snapshots[0]!.length = 0;
    expect(snapshots[1]!.map((t) => t.taskId)).toEqual(['t0', 't1']);
  });
});

/* ───────────────── ③ 提示词注入：共存 / 幂等 / 清除 / 边界 ───────────────── */

const MOVE_LINE = 'camera movement: slow dolly in';
const HINT_LINE = '机位建议：客厅 · 推机位';
const BASE = `主角推门而入\n${MOVE_LINE}\n${HINT_LINE}`;

const CINEMA_IDS = ['cine-golden-hour'];
const LIGHT_IDS = ['three-point-soft'];
const PORTRAIT_IDS = ['face-round'];
const ANIME_IDS = ['night-neon'];

function applyAll(text: string): string {
  return withAnimeTagPrompt(
    withPortraitPrompt(
      withLightRigPrompt(withCinemaPrompt(text, CINEMA_IDS), LIGHT_IDS),
      PORTRAIT_IDS,
    ),
    ANIME_IDS,
  );
}

describe('注入边界：四类预设段落与外来注入行共存', () => {
  it('四个 section 全部写入，且运镜行 / 机位建议行原样保留', () => {
    const text = applyAll(BASE);
    const sections = readPresetSections(text);
    expect(Object.keys(sections).sort()).toEqual(['anime', 'cinema', 'lighting', 'portrait']);
    expect(text).toContain(MOVE_LINE);
    expect(text).toContain(HINT_LINE);
    expect(text).toContain('主角推门而入');
  });

  it('重复套用幂等（顺序无关：同一组选择永远产出同一段文本）', () => {
    const once = applyAll(BASE);
    const twice = applyAll(once);
    expect(twice).toBe(once);
  });

  it('清除只移除本 section 行，其余正文与外来行不受影响', () => {
    const cleared = withLightRigPrompt(applyAll(BASE), []);
    expect(cleared).not.toContain('lighting:');
    expect(cleared).toContain('cinematic style:');
    expect(cleared).toContain(MOVE_LINE);
    expect(cleared).toContain(HINT_LINE);
  });

  it('空文本注入再清除回到空串（不残留空行）', () => {
    expect(withCinemaPrompt(withCinemaPrompt('', CINEMA_IDS), [])).toBe('');
  });

  it('机位建议与预设段落交替套用互不丢失', () => {
    const suggest = () => ({
      suggestedCamera: '客厅',
      suggestedAngle: 'eye-level',
      suggestedDistance: '2m',
    });
    let text = 'body';
    text = withShotBlockingHint(text, { descriptionZh: '推门' }, suggest);
    text = withCinemaPrompt(text, CINEMA_IDS);
    text = withShotBlockingHint(text, { descriptionZh: '推门' }, suggest);
    text = withCinemaPrompt(text, CINEMA_IDS);
    expect(text).toContain('cinematic style:');
    expect(text).toContain('机位建议： 客厅 · eye-level · 2m');
    expect(text).toContain('body');
  });

  it('运镜时间轴与大师运镜共用同一行槽位（后写者替换，不堆叠）', () => {
    const move = withCameraMovePrompt('body', ['push-slow']);
    expect(move).toContain('camera movement:');
    const timeline = withMoveTimelinePrompt(move, {
      version: 1,
      durationSec: 4,
      segments: [{ id: 's1', moveId: 'pan-slow', startT: 0, endT: 4 }],
    } as never);
    // 同一槽位：只剩一条运镜行，且是时间轴那条
    expect(timeline.split('\n').filter((l) => l.startsWith('camera movement:')).length).toBe(1);
    expect(timeline).toContain('horizontal pan');
    expect(withMoveTimelinePrompt(timeline, undefined)).toBe('body');
  });
});

describe('注入边界：前缀所有权带来的已知误伤（characterization）', () => {
  it('用户手写的 `lighting: …` 行会被灯光 section 视为本模块所有并被替换 / 清除', () => {
    // 见评审文档 D-03：`lighting:` 前缀同时被 shared 的场景卡 / 创意素材提示词、
    // 3D 导演台 buildSceneLightingPrompt、分镜 runner 的 craft 行使用，若它们与
    // 预设选择器写同一字段，就会出现互相覆盖。当前 UI 不共享同一字段，故未修。
    const user = 'a warm scene\nlighting: warm afternoon sun through blinds\nkeep subject centered';
    const injected = withLightRigPrompt(user, LIGHT_IDS);
    expect(injected).not.toContain('warm afternoon sun through blinds');
    expect(injected).toContain('lighting: three-point soft lighting');
    expect(withLightRigPrompt(user, [])).not.toContain('warm afternoon sun through blinds');
  });

  it('用户手写的 `机位建议：…` 行会被清除 / 替换（同一前缀所有权口径）', () => {
    const user = 'a warm scene\n机位建议：我自己写的\nkeep subject centered';
    const suggest = () => ({
      suggestedCamera: 'x',
      suggestedAngle: 'y',
      suggestedDistance: 'z',
    });
    expect(withShotBlockingHint(user, null, suggest)).not.toContain('我自己写的');
    expect(withShotBlockingHint(user, { descriptionZh: '推门' }, suggest)).toContain('机位建议： x · y · z');
  });

  it('非词表 id 会静默清掉同名 section（UI 只传词表 id，因此当前不可达）', () => {
    // 见评审文档 D-07。
    const seeded = withCinemaPrompt('body', CINEMA_IDS);
    expect(withCinemaPrompt(seeded, ['cine-golden-hour-typo'])).toBe('body');
  });

  it('外来运镜 id 会清掉既有运镜行（UI 只传词表 id，因此当前不可达）', () => {
    const seeded = withCameraMovePrompt('body', ['push-slow']);
    expect(withCameraMovePrompt(seeded, ['dolly-in-typo'])).toBe('body');
  });
});
