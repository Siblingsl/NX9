/**
 * 一镜多机位 / 多关键帧机位 **持久化结构** 回归（增量新增能力）。
 *
 * 背景：镜头态 `Director3dShotState` 原先只有单机位 `camera`，而导演台保存路径只写 `cameras[0]`，
 * 于是运镜时间轴交接生成的 `movetl-*` 关键帧机位在「联动镜」模式下不跨会话保留。
 * 本次给镜头态补上可选 `cameraKeys` / `activeCameraKeyId`，本文件覆盖：
 * 老 version:2 数据平滑升级、keys ↔ project 往返稳定、非法 keys 裁剪、清除生效、
 * 含 keys 的提交载荷结构，以及场景模板 / 提交快照对机位序列的处理口径。
 *
 * 与同目录既有用例一致：**不走 `@nx9/shared` barrel**（既有缺陷：其 `index.ts` 引用 9 个
 * 不存在的 `data/*` 模块），全部相对路径直取源码，因此本用例可独立运行。
 */
import { describe, expect, it } from 'vitest';
import {
  applySceneTemplateToShotState,
  cameraKeysFromCameras,
  cameraKeysFromProject,
  coerceCameraKeys,
  directorCamerasFromCameraKeys,
  emptyDirectorProject,
  emptyShotState,
  normalizeDirectorProject,
  normalizeShotState,
  projectFromShotState,
  restoreCommittedSnapshot,
  sceneTemplateFromProject,
  shotCameraEquals,
  shotStateFromProject,
  syncShotStateWithProject,
  type Director3dCameraKey,
  type Director3dCandidate,
  type Director3dCommitPayload,
  type Director3dShotState,
  type DirectorCameraShot,
  type DirectorProject,
} from '../../../../../packages/director3d/src/schema/directorProject';
import {
  MOVE_TIMELINE_CAMERA_PREFIX,
  buildCameraMoveKeyframes,
  moveTimelineToDirectorCameras,
} from '../../../../../packages/director3d/src/schema/cameraMoveTimelineKeys';
import { resolveMoveTimelineRailState } from '../../../../../packages/director3d/src/ui/CameraMoveTimelineRail';
import { useDirectorStore } from '../../../../../packages/director3d/src/store/directorStore';
import { CAMERA_MOVE_TIMELINE_VERSION } from '../../../../../packages/shared/src/types/camera-move-timeline';
import type { CameraMoveTimeline } from '../../../../../packages/shared/src/types/camera-move-timeline';

function makeCamera(
  id: string,
  name: string,
  position: [number, number, number],
  fov = 50,
): DirectorCameraShot {
  return {
    id,
    name,
    fov,
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
    target: [0, 1, 0],
    captures: [],
  };
}

function baseProject(): DirectorProject {
  const project = emptyDirectorProject();
  project.cameras = [makeCamera('cam-base', '主镜头', [0, 1.6, 5])];
  project.activeCameraId = 'cam-base';
  return project;
}

const TWO_SEGMENT_TIMELINE: CameraMoveTimeline = {
  version: CAMERA_MOVE_TIMELINE_VERSION,
  durationSec: 4,
  segments: [
    { id: 'a', moveId: 'push-slow', startT: 0, endT: 2 },
    { id: 'b', moveId: 'pan-slow', startT: 2, endT: 4 },
  ],
};

/** 模拟「运镜时间轴 → 套用为关键帧」之后的 project：基准机位 + 3 个 movetl-* 机位，激活到末帧。 */
function projectWithMoveTimelineCameras(): DirectorProject {
  const project = baseProject();
  const base = project.cameras[0]!;
  const keys = moveTimelineToDirectorCameras(TWO_SEGMENT_TIMELINE, base);
  project.cameras = [...project.cameras, ...keys];
  project.activeCameraId = keys[2]!.id;
  return project;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 老 version:2 数据：只有单机位 `camera`，没有任何关键帧字段（旧版本落盘形状）。 */
function legacyVersion2State(): unknown {
  return {
    version: 2,
    stateVersion: 7,
    shotId: 'shot-legacy',
    environment: {
      backgroundColor: '#101014',
      groundVisible: false,
      groundOpacity: 0.4,
      lights: [],
      ambientIntensity: 0.2,
      exposure: 1.1,
    },
    objects: [
      {
        id: 'prop-1',
        name: '桌子',
        kind: 'prop',
        geometryType: 'box',
        visible: true,
        locked: false,
        transform: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
    ],
    camera: { position: [2, 1.5, 4], target: [0, 1, 0], rotation: [0, 0.3, 0], fov: 35, aspectRatio: '16:9' },
    candidates: [],
    selectedCandidateId: null,
    committedCandidateId: null,
    committedSnapshot: null,
    dirty: true,
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

describe('镜头态多机位：老 version:2 数据平滑升级', () => {
  it('缺 cameraKeys 的老数据补空数组，场景 / 机位 / 候选帧一个都不丢', () => {
    const normalized = normalizeShotState(legacyVersion2State(), 'shot-legacy');
    expect(normalized.version).toBe(2);
    expect(normalized.stateVersion).toBe(7);
    expect(normalized.cameraKeys).toEqual([]);
    expect(normalized.activeCameraKeyId).toBeNull();
    expect(normalized.environment.backgroundColor).toBe('#101014');
    expect(normalized.environment.exposure).toBe(1.1);
    expect(normalized.objects.map((object) => object.id)).toEqual(['prop-1']);
    expect(normalized.camera.fov).toBe(35);
    expect(normalized.dirty).toBe(true);
  });

  it('老数据仍按单机位还原 project（与升级前行为一致，激活机位取自基准项目）', () => {
    const normalized = normalizeShotState(legacyVersion2State(), 'shot-legacy');
    const project = projectFromShotState(normalized, baseProject());
    expect(project.cameras).toHaveLength(1);
    expect(project.cameras[0]!.transform.position).toEqual([2, 1.5, 4]);
    expect(project.cameras[0]!.target).toEqual([0, 1, 0]);
    expect(project.cameras[0]!.fov).toBe(35);
    expect(project.activeCameraId).toBe(project.cameras[0]!.id);
  });

  it('version 保持 2：keys 是纯增量可选字段，不靠升版区分，老读取分支不会丢场景', () => {
    const project = projectWithMoveTimelineCameras();
    const state = shotStateFromProject(project, 'shot-1');
    expect(state.version).toBe(2);
    const normalized = normalizeShotState(jsonClone(state), 'shot-1');
    // 仍进 version === 2 分支（未被判为非法而回落到空白镜头态）
    expect(normalized.shotId).toBe('shot-1');
    expect(normalized.cameraKeys).toHaveLength(project.cameras.length);
  });

  it('cameraKeys 整体非法（非数组 / 脏值）时只退化机位序列，场景数据完好', () => {
    const raw = legacyVersion2State() as Record<string, unknown>;
    const broken = normalizeShotState({ ...raw, cameraKeys: 'oops' }, 'shot-legacy');
    expect(broken.cameraKeys).toEqual([]);
    expect(broken.objects.map((object) => object.id)).toEqual(['prop-1']);
    expect(projectFromShotState(broken, baseProject()).cameras).toHaveLength(1);
  });
});

describe('镜头态多机位：落盘口径（cameraKeys / activeCameraKeyId）', () => {
  it('单机位不写 keys：落盘形状与老数据一致', () => {
    const project = baseProject();
    const state = shotStateFromProject(project, 'shot-1');
    expect(state.cameraKeys).toEqual([]);
    expect(state.activeCameraKeyId).toBeNull();
    expect(cameraKeysFromProject(project)).toEqual([]);
  });

  it('多机位写全量序列：t 首 0 末 1 单调，id / name / 机位姿态与 project.cameras 对应', () => {
    const project = projectWithMoveTimelineCameras();
    const state = shotStateFromProject(project, 'shot-1');
    const keys = state.cameraKeys!;
    expect(keys.map((key) => key.id)).toEqual(project.cameras.map((camera) => camera.id));
    expect(keys.map((key) => key.name)).toEqual(project.cameras.map((camera) => camera.name));
    expect(keys[0]!.t).toBe(0);
    expect(keys.at(-1)!.t).toBe(1);
    for (let i = 1; i < keys.length; i += 1) expect(keys[i]!.t).toBeGreaterThan(keys[i - 1]!.t);
    keys.forEach((key, index) => {
      expect(key.camera.position).toEqual(project.cameras[index]!.transform.position);
      expect(key.camera.target).toEqual(project.cameras[index]!.target);
      expect(key.camera.fov).toBe(project.cameras[index]!.fov);
      expect(key.camera.aspectRatio).toBe(project.viewportAspectRatio);
    });
    expect(state.activeCameraKeyId).toBe(project.activeCameraId);
  });

  it('syncShotStateWithProject 取「激活机位」而非 cameras[0]，且保留既有 candidates / stateVersion', () => {
    const project = projectWithMoveTimelineCameras();
    const before = emptyShotState('shot-1', project);
    const withCandidate: Director3dShotState = {
      ...before,
      stateVersion: 12,
      candidates: [{
        id: 'cand-old',
        shotId: 'shot-1',
        stateVersion: 11,
        status: 'ready',
        createdAt: '2026-01-01T00:00:00.000Z',
        camera: { ...before.camera },
        characterPlacements: [],
        prompt: '旧候选帧',
      }],
    };
    const next = syncShotStateWithProject(withCandidate, project);
    expect(next.stateVersion).toBe(12);
    expect(next.candidates.map((item) => item.id)).toEqual(['cand-old']);

    const active = project.cameras.find((camera) => camera.id === project.activeCameraId)!;
    expect(active.id).not.toBe(project.cameras[0]!.id);
    expect(next.camera.position).toEqual(active.transform.position);
    expect(next.camera.fov).toBe(active.fov);
    // 激活机位与激活 key 同源 → 候选帧机位（handleCapture 取同一口径）与 sceneState.camera 不自相矛盾
    const activeKey = next.cameraKeys!.find((key) => key.id === next.activeCameraKeyId)!;
    expect(shotCameraEquals(activeKey.camera, next.camera)).toBe(true);
  });
});

describe('镜头态多机位：keys ↔ project 往返稳定', () => {
  it('state → project 还原机位顺序 / id / 名 / 姿态 / 激活机位，且再落盘幂等', () => {
    const project = projectWithMoveTimelineCameras();
    const state = shotStateFromProject(project, 'shot-1');
    const restored = projectFromShotState(normalizeShotState(jsonClone(state), 'shot-1'), baseProject());

    expect(restored.cameras.map((camera) => camera.id)).toEqual(project.cameras.map((camera) => camera.id));
    expect(restored.cameras.map((camera) => camera.name)).toEqual(project.cameras.map((camera) => camera.name));
    expect(restored.activeCameraId).toBe(project.activeCameraId);
    // 机位几何完全往返（captures 按既有口径不入镜头态，两侧都为空）
    expect(restored.cameras).toEqual(project.cameras);

    const again = shotStateFromProject(restored, 'shot-1');
    expect(again.cameraKeys).toEqual(state.cameraKeys);
    expect(again.activeCameraKeyId).toBe(state.activeCameraKeyId);
    expect(again.camera).toEqual(state.camera);
  });

  it('工程导出 / 再导入（normalizeDirectorProject）保留多机位与激活机位', () => {
    const project = projectWithMoveTimelineCameras();
    const reimported = normalizeDirectorProject(jsonClone(project));
    expect(reimported.cameras.map((camera) => camera.id)).toEqual(project.cameras.map((camera) => camera.id));
    expect(reimported.activeCameraId).toBe(project.activeCameraId);
    expect(normalizeDirectorProject(jsonClone(reimported))).toEqual(reimported);
  });

  it('激活机位失效时回落：activeCameraKeyId 优先，其次姿态一致帧，最后首帧', () => {
    const project = projectWithMoveTimelineCameras();
    const state = shotStateFromProject(project, 'shot-1');

    const byId = projectFromShotState({ ...state, activeCameraKeyId: state.cameraKeys![1]!.id }, baseProject());
    expect(byId.activeCameraId).toBe(state.cameraKeys![1]!.id);

    const byPose = projectFromShotState({ ...state, activeCameraKeyId: 'missing-key' }, baseProject());
    expect(byPose.activeCameraId).toBe(state.activeCameraKeyId);

    const fallback = projectFromShotState(
      { ...state, activeCameraKeyId: 'missing-key', camera: { ...state.camera, fov: 91 } },
      baseProject(),
    );
    expect(fallback.activeCameraId).toBe(state.cameraKeys![0]!.id);
    expect(fallback.cameras[0]!.fov).toBe(91); // 激活帧姿态以 camera 为准
  });

  it('只改 camera 的写入方（如 Agent 摆位）不会凭空多出一台机位', () => {
    const project = projectWithMoveTimelineCameras();
    const state = syncShotStateWithProject(emptyShotState('shot-1', project), project);
    const posed: Director3dShotState = {
      ...state,
      camera: { ...state.camera, position: [9, 2, 9], target: [1, 1, 1] },
    };
    const restored = projectFromShotState(posed, baseProject());
    expect(restored.cameras).toHaveLength(project.cameras.length);
    const active = restored.cameras.find((camera) => camera.id === restored.activeCameraId)!;
    expect(active.id).toBe(project.activeCameraId);
    expect(active.transform.position).toEqual([9, 2, 9]);
    expect(active.target).toEqual([1, 1, 1]);
    // 其它关键帧机位不受影响
    expect(restored.cameras.filter((camera) => camera.id !== active.id)).toEqual(
      project.cameras.filter((camera) => camera.id !== active.id),
    );
  });
});

describe('镜头态多机位：非法 keys 裁剪', () => {
  const validCamera = { position: [1, 1, 1], target: [0, 1, 0], rotation: [0, 0, 0], fov: 40, aspectRatio: '16:9' };

  it('丢弃无机位 / 机位非法的条目，t 越界被裁、非有限按序补位', () => {
    const keys = coerceCameraKeys([
      null,
      { id: 'k-bad-pose', t: 0.1, camera: { position: [1, 2], target: [0, 0, 0], fov: 50 } },
      { id: 'k-bad-fov', t: 0.2, camera: { ...validCamera, fov: Number.NaN } },
      { id: 'k-1', t: -3, camera: validCamera, name: ' 缓推 ' },
      { id: 'k-2', t: 9, camera: { ...validCamera, position: [3, 1, 3] } },
    ])!;
    expect(keys.map((key) => key.id)).toEqual(['k-1', 'k-2']);
    expect(keys.map((key) => key.t)).toEqual([0, 1]);
    expect(keys[0]!.name).toBe(' 缓推 ');
    expect(keys[1]!.name).toBeUndefined();
    // rotation 缺失补零、aspectRatio 缺失用兜底，不影响机位可用性
    const restored = coerceCameraKeys([{ camera: { position: [2, 2, 2], target: [0, 1, 0], fov: 24 } }], '9:16')!;
    expect(restored[0]!.camera.rotation).toEqual([0, 0, 0]);
    expect(restored[0]!.camera.aspectRatio).toBe('9:16');
    expect(restored[0]!.id).toBe('camkey-1');
  });

  it('id 重复被重编；t 非有限按序补位；空数组 → 空数组', () => {
    const keys = coerceCameraKeys([
      { id: 'dup', camera: validCamera, t: 'x' },
      { id: 'dup', camera: { ...validCamera, position: [2, 1, 2] } },
      { camera: { ...validCamera, position: [3, 1, 3] }, t: Number.NaN },
    ])!;
    expect(new Set(keys.map((key) => key.id)).size).toBe(3);
    expect(keys.map((key) => key.t)).toEqual([0, 0.5, 1]);
    expect(coerceCameraKeys([])).toEqual([]);
    expect(coerceCameraKeys(undefined)).toBeUndefined();
  });

  it('裁剪只作用于机位序列，镜头态其余字段原样保留', () => {
    const project = projectWithMoveTimelineCameras();
    const state = shotStateFromProject(project, 'shot-1');
    const dirty = { ...jsonClone(state), cameraKeys: [null, 'x', { t: 0.5 }, state.cameraKeys![0]!] };
    const normalized = normalizeShotState(dirty, 'shot-1');
    expect(normalized.cameraKeys).toHaveLength(1);
    expect(normalized.cameraKeys![0]!.t).toBe(0);
    // 激活 key 失效 → 按姿态回落（camera 与首帧一致）
    expect(normalized.activeCameraKeyId).toBe(state.cameraKeys![0]!.id);
    expect(normalized.objects).toEqual(state.objects);
  });

  it('cameraKeysFromCameras / directorCamerasFromCameraKeys 直接互逆（captures 除外）', () => {
    const cameras = projectWithMoveTimelineCameras().cameras;
    const keys = cameraKeysFromCameras(cameras, '1:1');
    expect(keys.every((key) => key.camera.aspectRatio === '1:1')).toBe(true);
    const back = directorCamerasFromCameraKeys(keys);
    expect(back.map((camera) => camera.id)).toEqual(cameras.map((camera) => camera.id));
    expect(back.map((camera) => camera.name)).toEqual(cameras.map((camera) => camera.name));
    expect(back.every((camera) => camera.captures.length === 0)).toBe(true);
  });
});

describe('镜头态多机位：清除关键帧生效（可直接移除已落盘的 keys）', () => {
  it('applyMoveTimelineKeys 落盘 → clearMoveTimelineKeys 后落盘 keys 里不再有 movetl-*', () => {
    const store = useDirectorStore;
    store.getState().replaceProject(baseProject());
    store.getState().addCamera(); // 用户自己的第二台机位，清除时不应被误删
    const before = store.getState().project;
    const userCameras = before.cameras.map((camera) => camera.id);

    const base = before.cameras.find((camera) => camera.id === before.activeCameraId)!;
    store.getState().applyMoveTimelineKeys(moveTimelineToDirectorCameras(TWO_SEGMENT_TIMELINE, base));

    const applied = store.getState().project;
    const movetl = applied.cameras.filter((camera) => camera.id.startsWith(MOVE_TIMELINE_CAMERA_PREFIX));
    expect(movetl.length).toBeGreaterThan(1);
    const appliedState = syncShotStateWithProject(emptyShotState('shot-1', applied), applied);
    expect(appliedState.cameraKeys!.map((key) => key.id)).toEqual(applied.cameras.map((camera) => camera.id));
    expect(appliedState.activeCameraKeyId).toBe(applied.activeCameraId);

    store.getState().clearMoveTimelineKeys();

    const cleared = store.getState().project;
    expect(cleared.cameras.map((camera) => camera.id)).toEqual(userCameras);
    expect(cleared.cameras.some((camera) => camera.id.startsWith(MOVE_TIMELINE_CAMERA_PREFIX))).toBe(false);
    const clearedState = syncShotStateWithProject(emptyShotState('shot-1', cleared), cleared);
    // 仍有两台用户机位 → keys 保留它们，但 movetl-* 已彻底消失
    expect(clearedState.cameraKeys!.map((key) => key.id)).toEqual(userCameras);
    expect(clearedState.cameraKeys!.some((key) => key.id.startsWith(MOVE_TIMELINE_CAMERA_PREFIX))).toBe(false);

    // 清到只剩一台时回到「单机位 → 不写 keys」的老形状
    store.getState().replaceProject(baseProject());
    const single = syncShotStateWithProject(emptyShotState('shot-1', store.getState().project), store.getState().project);
    expect(single.cameraKeys).toEqual([]);
    expect(single.activeCameraKeyId).toBeNull();
  });
});

describe('镜头态多机位：含 keys 的提交载荷', () => {
  it('sceneState 带 keys / activeCameraKeyId，候选帧机位与激活机位同源，且往返后仍可还原', () => {
    const project = projectWithMoveTimelineCameras();
    const state = { ...syncShotStateWithProject(emptyShotState('shot-1', project), project), stateVersion: 3 };
    const candidate: Director3dCandidate = {
      id: 'cand-1',
      name: '候选 1',
      shotId: 'shot-1',
      stateVersion: state.stateVersion,
      imageUrl: 'https://cdn.example/frame.png',
      // handleCapture 取「当前机位」→ 与 sceneState.camera 同源（F-018 机位预设写回口径）
      camera: { ...state.camera },
      characterPlacements: [],
      prompt: 'cinematic wide shot',
      status: 'ready',
      createdAt: '2026-01-03T00:00:00.000Z',
    };
    const payload: Director3dCommitPayload = {
      version: 1,
      commitId: 'commit-1',
      blockId: 'storage-1',
      shotId: 'shot-1',
      episodeId: null,
      sourceShotRevision: 3,
      candidate,
      sceneState: { ...state, committedCandidateId: candidate.id },
      committedAt: '2026-01-03T00:00:01.000Z',
    };
    const wire = jsonClone(payload);

    expect(wire.version).toBe(1);
    expect(wire.shotId).toBe('shot-1');
    expect(wire.candidate.shotId).toBe(wire.shotId);
    expect(wire.sceneState.shotId).toBe(wire.shotId);
    expect(wire.sceneState.version).toBe(2);
    expect(wire.sceneState.committedCandidateId).toBe('cand-1');
    expect(wire.sceneState.cameraKeys!.map((key) => key.id)).toEqual(project.cameras.map((camera) => camera.id));
    expect(wire.sceneState.activeCameraKeyId).toBe(project.activeCameraId);
    expect(wire.candidate.camera).toEqual(wire.sceneState.camera);
    const activeKey = wire.sceneState.cameraKeys!.find((key) => key.id === wire.sceneState.activeCameraKeyId)!;
    expect(shotCameraEquals(activeKey.camera, wire.sceneState.camera)).toBe(true);

    // host 会把 payload.sceneState 写回 sceneByShot：重新载入镜头必须还能还原多机位与激活机位
    const reloaded = projectFromShotState(normalizeShotState(wire.sceneState, 'shot-1', baseProject()), baseProject());
    expect(reloaded.cameras.map((camera) => camera.id)).toEqual(project.cameras.map((camera) => camera.id));
    expect(reloaded.activeCameraId).toBe(project.activeCameraId);
    expect(reloaded.cameras).toEqual(project.cameras);
  });

  it('提交快照一并记录机位序列：恢复已提交版本时环境 / 物体 / 机位一起回滚', () => {
    const committedProject = projectWithMoveTimelineCameras();
    const committedAt = '2026-01-04T00:00:00.000Z';
    const state = syncShotStateWithProject(emptyShotState('shot-1', committedProject), committedProject);
    const withSnapshot: Director3dShotState = {
      ...state,
      committedSnapshot: {
        stateVersion: state.stateVersion,
        candidateId: 'cand-1',
        environment: structuredClone(state.environment),
        objects: structuredClone(state.objects),
        camera: structuredClone(state.camera),
        cameraKeys: structuredClone(state.cameraKeys ?? []),
        activeCameraKeyId: state.activeCameraKeyId ?? null,
        committedAt,
      },
    };
    // 提交后又套了一轮新关键帧并切了激活机位（模拟未提交漂移）
    const driftedKey: Director3dCameraKey = {
      id: `${MOVE_TIMELINE_CAMERA_PREFIX}extra`,
      t: 1,
      camera: { ...state.camera, position: [7, 2, 7] },
    };
    const drifted: Director3dShotState = {
      ...withSnapshot,
      camera: { ...state.camera, fov: 12 },
      cameraKeys: [...(withSnapshot.cameraKeys ?? []), driftedKey],
      activeCameraKeyId: driftedKey.id,
    };

    const restored = restoreCommittedSnapshot(drifted)!;
    expect(restored.cameraKeys!.map((key) => key.id)).toEqual(state.cameraKeys!.map((key) => key.id));
    expect(restored.activeCameraKeyId).toBe(state.activeCameraKeyId);
    expect(restored.camera.fov).toBe(state.camera.fov);
    expect(restored.dirty).toBe(false);
    expect(projectFromShotState(restored, baseProject()).cameras.map((camera) => camera.id))
      .toEqual(committedProject.cameras.map((camera) => camera.id));

    // 老快照（没有 cameraKeys）→ 按单机位恢复，与升级前行为一致
    const legacySnapshot = restoreCommittedSnapshot({
      ...withSnapshot,
      committedSnapshot: {
        stateVersion: 1,
        candidateId: 'cand-0',
        environment: structuredClone(state.environment),
        objects: [],
        camera: structuredClone(state.camera),
        committedAt,
      },
    })!;
    expect(legacySnapshot.cameraKeys).toEqual([]);
    expect(legacySnapshot.activeCameraKeyId).toBeNull();
  });

  it('快照回滚不共享引用：反复恢复并就地改写，快照与源状态都不被污染', () => {
    const project = projectWithMoveTimelineCameras();
    const committed = syncShotStateWithProject(emptyShotState('shot-1', project), project);
    let state: Director3dShotState = {
      ...committed,
      committedSnapshot: {
        stateVersion: 1,
        candidateId: 'cand-1',
        environment: structuredClone(committed.environment),
        objects: structuredClone(committed.objects),
        camera: structuredClone(committed.camera),
        cameraKeys: structuredClone(committed.cameraKeys ?? []),
        activeCameraKeyId: committed.activeCameraKeyId ?? null,
        committedAt: '2026-01-05T00:00:00.000Z',
      },
    };
    const snapshotPose = [...state.committedSnapshot!.cameraKeys![0]!.camera.position];
    for (let i = 0; i < 40; i += 1) {
      const restored = restoreCommittedSnapshot(state)!;
      expect(restored.cameraKeys![0]!.camera.position).toEqual(snapshotPose);
      restored.cameraKeys![0]!.camera.position[0] = 100 + i;
      restored.objects.push({
        id: `dirty-${i}`,
        name: '脏对象',
        kind: 'prop',
        visible: true,
        locked: false,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      });
      expect(state.committedSnapshot!.cameraKeys![0]!.camera.position).toEqual(snapshotPose);
      expect(state.committedSnapshot!.objects).toHaveLength(0);
      state = restored;
    }
  });
});

describe('运镜时间轴轨：可用状态由落盘态推导，不依赖会话标记', () => {
  const sessionKeys = buildCameraMoveKeyframes(TWO_SEGMENT_TIMELINE, projectWithMoveTimelineCameras().cameras[0]!);

  it('本会话对「本镜」套用过且时间轴还在 → 可 scrub', () => {
    const project = projectWithMoveTimelineCameras();
    const state = resolveMoveTimelineRailState({
      project,
      sessionKeys,
      appliedShotId: 'shot-1',
      shotId: 'shot-1',
      durationSec: 4,
    });
    expect(state).toEqual({ persistedCount: 3, applied: true, scrubbable: true });
    expect(state.persistedCount).toBe(
      project.cameras.filter((camera) => camera.id.startsWith(MOVE_TIMELINE_CAMERA_PREFIX)).length,
    );
  });

  it('重新打开同一镜头（会话已无 keys / 无时间轴）→ 仍显示已套用，但不假装能按秒 scrub', () => {
    const state = resolveMoveTimelineRailState({
      project: projectWithMoveTimelineCameras(),
      sessionKeys: [],
      appliedShotId: null,
      shotId: 'shot-1',
      durationSec: 0,
    });
    expect(state).toEqual({ persistedCount: 3, applied: true, scrubbable: false });
  });

  it('会话关键帧属于别的镜头 → 不跨镜 scrub（中转站不随切镜清空）', () => {
    const state = resolveMoveTimelineRailState({
      project: projectWithMoveTimelineCameras(),
      sessionKeys,
      appliedShotId: 'shot-A',
      shotId: 'shot-B',
      durationSec: 4,
    });
    expect(state.applied).toBe(true);
    expect(state.scrubbable).toBe(false);
  });

  it('清除落盘关键帧后（project 已无 movetl-*）→ 回到未套用', () => {
    const state = resolveMoveTimelineRailState({
      project: baseProject(),
      sessionKeys,
      appliedShotId: null,
      shotId: 'shot-1',
      durationSec: 4,
    });
    expect(state).toEqual({ persistedCount: 0, applied: false, scrubbable: false });
  });
});

describe('镜头态多机位：场景模板不干预机位序列', () => {
  it('模板不带机位；套模板保留当前机位与关键帧序列', () => {
    const project = projectWithMoveTimelineCameras();
    const template = sceneTemplateFromProject(project, '片场');
    expect(template).not.toHaveProperty('cameras');
    expect(template).not.toHaveProperty('cameraKeys');

    const state = syncShotStateWithProject(emptyShotState('shot-1', project), project);
    const applied = applySceneTemplateToShotState(state, template);
    expect(applied.camera).toEqual(state.camera);
    expect(applied.cameraKeys).toEqual(state.cameraKeys);
    expect(applied.activeCameraKeyId).toBe(state.activeCameraKeyId);
    expect(applied.sceneTemplateId).toBe(template.id);
  });
});
