/**
 * 大师运镜库面板 —— 组件行为回归（增量新增能力）。
 *
 * 与 director3d-move-timeline-keys.test.ts 同口径：**不走 `@nx9/shared` barrel**（既有缺陷），
 * 相对路径直取 director3d / shared 源码；store 用真实 zustand 实例（不桩），
 * 因此断言的是「点按钮 → 真的写进 project.cameras / 真的并入提示词」这条真实链路。
 *
 * 舞台里无法实机点检（需 WebGL + 可运行 app），本文件覆盖的是面板自身的交互与状态映射。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  CameraMoveLibraryPanel,
  groupCameraMovesByFamily,
  resolveMoveLibraryScope,
} from '../../../../../packages/director3d/src/ui/CameraMoveLibraryPanel';
import {
  MOTION_CAMERA_PREFIX,
  describeMotionPlan,
  motionToCameraMoveTimeline,
} from '../../../../../packages/director3d/src/schema/cameraMoveMotion';
import { useDirectorStore } from '../../../../../packages/director3d/src/store/directorStore';
import { useMoveTimelineStore } from '../../../../../packages/director3d/src/store/moveTimelineStore';
import {
  emptyDirectorProject,
} from '../../../../../packages/director3d/src/schema/directorProject';
import type { DirectorCameraShot } from '../../../../../packages/director3d/src/schema/directorProject';
import {
  CAMERA_MOVE_FAMILY_ORDER,
  CAMERA_MOVE_LIBRARY,
  lookupCameraMove,
} from '../../../../../packages/shared/src/data/camera-move-library';

const TITLE = {
  apply: '把该运镜生成的机位序列写进本镜（可撤销），并写入镜头语言',
  remove: '移除本镜由运镜库生成的 cammv-* 机位，并清除镜头语言里的运镜',
  timeline: '交给下方「运镜时间轴」轨：可套用为关键帧、按秒 scrub 与播放',
  promptOnly: '只把运镜短语并入镜头语言提示词（不动机位）',
  reset: '恢复预演前的机位，并清空 A→B 轨',
  dolly: '写入既有 A→B 运镜轨：A = 当前机位、B = 运镜终点',
};

function activeCamera(): DirectorCameraShot {
  const project = useDirectorStore.getState().project;
  return project.cameras.find((camera) => camera.id === project.activeCameraId) ?? project.cameras[0]!;
}

function motionCameras() {
  return useDirectorStore.getState().project.cameras.filter((camera) => camera.id.startsWith(MOTION_CAMERA_PREFIX));
}

/** 时间轴 scrubbing 滑杆（面板里第二个 range：第一个是幅度） */
function rangeInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="range"]'));
}

beforeEach(() => {
  const store = useDirectorStore.getState();
  store.replaceProject(emptyDirectorProject());
  store.setActiveDrawer('move');
  store.setCameraMoveLibraryId(null);
  store.clearDolly();
  useMoveTimelineStore.getState().clearTimeline();
});

describe('groupCameraMovesByFamily / resolveMoveLibraryScope（纯函数）', () => {
  it('分组保持家族定义顺序、空家族不出现、词库条目一条不丢', () => {
    const groups = groupCameraMovesByFamily(CAMERA_MOVE_LIBRARY);
    expect(groups.map((group) => group.family)).toEqual(CAMERA_MOVE_FAMILY_ORDER);
    expect(groups.reduce((sum, group) => sum + group.items.length, 0)).toBe(CAMERA_MOVE_LIBRARY.length);
    expect(groups.every((group) => group.labelZh.length > 0)).toBe(true);
    // 空输入 / 非法输入不抛异常
    expect(groupCameraMovesByFamily([])).toEqual([]);
    expect(groupCameraMovesByFamily(null as never)).toEqual([]);
  });

  it('scope：当前机位取激活机位；cammv-* 计数只数运镜库生成的机位', () => {
    const cameras = [
      { ...emptyDirectorProject().cameras[0]!, id: 'cam-a' },
      { ...emptyDirectorProject().cameras[0]!, id: `${MOTION_CAMERA_PREFIX}1` },
      { ...emptyDirectorProject().cameras[0]!, id: 'movetl-1' },
    ];
    const scope = resolveMoveLibraryScope({ cameras, activeCameraId: 'cam-a', moveId: 'push-slow' });
    expect(scope.activeCamera?.id).toBe('cam-a');
    expect(scope.persistedCount).toBe(1);
    expect(scope.applied).toBe(true);
    // 只有运镜 id、没有关键帧机位时不算「已套用」
    expect(resolveMoveLibraryScope({ cameras, activeCameraId: 'cam-a', moveId: null }).applied).toBe(false);
  });
});

describe('大师运镜库面板：家族分组 / 搜索 / 说明', () => {
  it('渲染家族分组与默认选中运镜（含中文说明、建议景别、时长、难度、帧数）', () => {
    render(<CameraMoveLibraryPanel />);
    expect(screen.getByText('大师运镜库')).toBeTruthy();
    const families = Array.from(document.querySelectorAll('.nx9-stage-move-family')).map((node) => node.textContent);
    expect(families).toContain('推镜');
    expect(families).toContain('环绕');
    expect(families).toContain('手持');

    // 默认选中「缓推」：说明 + 计划摘要 + 帧数
    const def = lookupCameraMove('push-slow')!;
    expect(screen.getByText(def.descZh)).toBeTruthy();
    expect(screen.getByText(describeMotionPlan('push-slow').summaryZh)).toBeTruthy();
    expect(screen.getByText(/套用会写入 3 个 cammv-\* 关键帧机位/)).toBeTruthy();
    // native 运镜不显示代理近似块
    expect(document.querySelector('.nx9-stage-move-proxy')).toBeNull();
  });

  it('搜索按 id / 中英文名 / 标签过滤，且命中项可点选', () => {
    render(<CameraMoveLibraryPanel />);
    const search = screen.getByPlaceholderText('推镜 / orbit / 手持…');
    const items = () => Array.from(document.querySelectorAll('.nx9-stage-move-item')).map((node) => node.textContent ?? '');
    expect(items().some((text) => text.includes('缓推'))).toBe(true);
    fireEvent.change(search, { target: { value: 'orbit' } });
    expect(items().some((text) => text.includes('缓推'))).toBe(false);
    expect(items().some((text) => text.includes('半环绕'))).toBe(true);
    // 选中项即使被过滤掉，右侧说明仍保留（便于确认当前选中）
    expect(screen.getByText('缓推')).toBeTruthy();
    fireEvent.click(screen.getByText('半环绕'));
    expect(screen.getByText(describeMotionPlan('orbit-180').summaryZh)).toBeTruthy();
  });

  it('选中代理近似运镜时，面板显式标注「代理近似」原因', () => {
    render(<CameraMoveLibraryPanel />);
    fireEvent.change(screen.getByPlaceholderText('推镜 / orbit / 手持…'), { target: { value: '跟焦' } });
    fireEvent.click(screen.getByText('跟焦转移'));
    const proxy = document.querySelector('.nx9-stage-move-proxy');
    expect(proxy).toBeTruthy();
    expect(proxy!.textContent).toContain('代理近似');
    expect(proxy!.textContent).toContain('对焦');
  });

  it('家族筛选按钮按家族收窄列表', () => {
    render(<CameraMoveLibraryPanel />);
    const pill = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.startsWith('环绕'));
    expect(pill).toBeTruthy();
    fireEvent.click(pill!);
    const families = Array.from(document.querySelectorAll('.nx9-stage-move-family')).map((node) => node.textContent);
    expect(families).toEqual(['环绕']);
  });
});

describe('大师运镜库面板：套用为关键帧（写入 project.cameras）', () => {
  it('套用后写入 cammv-* 机位、不切换激活机位、首帧仍是当前取景，并写入镜头语言', () => {
    render(<CameraMoveLibraryPanel />);
    const before = activeCamera();
    fireEvent.click(screen.getByTitle(TITLE.apply));

    const store = useDirectorStore.getState();
    const plan = describeMotionPlan('push-slow', emptyDirectorProject().cameras[0]);
    expect(motionCameras().length).toBe(plan.frames);
    expect(store.project.activeCameraId).toBe(before.id);
    expect(store.cameraMoveLibraryId).toBe('push-slow');
    // 首帧 = 套用前的当前机位（不瞬移取景）
    const first = motionCameras()[0]!;
    expect(first.transform.position).toEqual(before.transform.position);
    expect(first.target).toEqual(before.target);
    // 末帧距离更近（推镜真的生成了运动）
    const last = motionCameras()[motionCameras().length - 1]!;
    const dist = (camera: DirectorCameraShot) => Math.hypot(
      camera.transform.position[0] - camera.target[0],
      camera.transform.position[1] - camera.target[1],
      camera.transform.position[2] - camera.target[2],
    );
    expect(dist(last)).toBeLessThan(dist(first));
    // 提示词同步并入词库短语（既有 camera movement 槽位，无新增字段）
    const promptBox = document.querySelector('.nx9-stage-prompt-box');
    expect(promptBox?.textContent).toContain(lookupCameraMove('push-slow')!.promptEn);
    // 按钮变成「按当前机位重套」
    expect(screen.getByTitle(TITLE.apply).textContent).toBe('按当前机位重套');
  });

  it('重复套用只保留一批 cammv-*（不会越点越多），且可 undo 撤销', () => {
    render(<CameraMoveLibraryPanel />);
    fireEvent.click(screen.getByTitle(TITLE.apply));
    const count = motionCameras().length;
    fireEvent.change(screen.getByPlaceholderText('推镜 / orbit / 手持…'), { target: { value: 'orbit-180' } });
    fireEvent.click(screen.getByText('半环绕'));
    fireEvent.click(screen.getByTitle(TITLE.apply));
    expect(motionCameras().length).toBe(describeMotionPlan('orbit-180').frames);
    expect(motionCameras().some((camera) => camera.id.startsWith(MOTION_CAMERA_PREFIX))).toBe(true);
    expect(count).toBe(3);

    useDirectorStore.getState().undo();
    expect(motionCameras().length).toBe(count);
    useDirectorStore.getState().undo();
    expect(motionCameras().length).toBe(0);
  });

  it('「移除关键帧」清空 cammv-* 与镜头语言，用户自己的机位不受影响', () => {
    useDirectorStore.getState().addCamera();
    const userCameras = useDirectorStore.getState().project.cameras.map((camera) => camera.id);
    render(<CameraMoveLibraryPanel />);
    fireEvent.click(screen.getByTitle(TITLE.apply));
    expect(motionCameras().length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTitle(TITLE.remove));
    expect(motionCameras().length).toBe(0);
    expect(useDirectorStore.getState().project.cameras.map((camera) => camera.id)).toEqual(userCameras);
    expect(useDirectorStore.getState().cameraMoveLibraryId).toBeNull();
    const promptBox = document.querySelector('.nx9-stage-prompt-box');
    expect(promptBox?.textContent).not.toContain(lookupCameraMove('push-slow')!.promptEn);
  });

  it('「加入运镜时间轴」把单段运镜推给既有交接轨（可套用 / 可播放）', () => {
    render(<CameraMoveLibraryPanel />);
    fireEvent.click(screen.getByTitle(TITLE.timeline));
    const timeline = useMoveTimelineStore.getState().timeline;
    expect(timeline).toEqual(motionToCameraMoveTimeline('push-slow'));
    expect(useMoveTimelineStore.getState().sourceLabel).toContain('缓推');
    expect(screen.getByText(/已把「缓推」交接给运镜时间轴/)).toBeTruthy();
  });
});

describe('大师运镜库面板：即时预演', () => {
  it('scrub 只改当前机位预览位姿（不入 undo 栈），「复位」回到预演前取景', () => {
    render(<CameraMoveLibraryPanel />);
    const before = activeCamera();
    const undoDepth = useDirectorStore.getState().undoStack.length;
    const sliders = rangeInputs();
    expect(sliders.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(sliders[1]!, { target: { value: '150' } });

    const scrubbed = activeCamera();
    expect(scrubbed.transform.position).not.toEqual(before.transform.position);
    // 预演不入 undo 栈
    expect(useDirectorStore.getState().undoStack.length).toBe(undoDepth);
    // 关键帧机位没有被预演写入（预演只驱动当前机位）
    expect(motionCameras().length).toBe(0);

    fireEvent.click(screen.getByTitle(TITLE.reset));
    const restored = activeCamera();
    expect(restored.transform.position).toEqual(before.transform.position);
    expect(restored.target).toEqual(before.target);
    expect(restored.fov).toBe(before.fov);
  });

  it('「预演 A→B 轨」把起点 / 终点写进既有 dollyA / dollyB 槽位', () => {
    render(<CameraMoveLibraryPanel />);
    fireEvent.click(screen.getByTitle(TITLE.dolly));
    const store = useDirectorStore.getState();
    expect(store.dollyA).toBeTruthy();
    expect(store.dollyB).toBeTruthy();
    const a = store.dollyA!.camera;
    const b = store.dollyB!.camera;
    expect(a.transform.position).not.toEqual(b.transform.position);
    // A 是预演起点（当前机位）、B 是运镜终点（推镜 → 更近）
    const dist = (camera: DirectorCameraShot) => Math.hypot(
      camera.transform.position[0] - camera.target[0],
      camera.transform.position[1] - camera.target[1],
      camera.transform.position[2] - camera.target[2],
    );
    expect(dist(b)).toBeLessThan(dist(a));
    expect(store.dollyT).toBe(0);
  });

  it('幅度滑杆改变生成的机位幅度（幅度越大推得越近）', () => {
    render(<CameraMoveLibraryPanel />);
    const amplitude = rangeInputs()[0]!;
    fireEvent.change(amplitude, { target: { value: '250' } });
    fireEvent.click(screen.getByTitle(TITLE.apply));
    const deep = motionCameras();
    const dist = (camera: DirectorCameraShot) => Math.hypot(
      camera.transform.position[0] - camera.target[0],
      camera.transform.position[1] - camera.target[1],
      camera.transform.position[2] - camera.target[2],
    );
    const deepDelta = dist(deep[0]!) - dist(deep[deep.length - 1]!);
    fireEvent.click(screen.getByTitle(TITLE.remove));
    fireEvent.change(rangeInputs()[0]!, { target: { value: '100' } });
    fireEvent.click(screen.getByTitle(TITLE.apply));
    const normal = motionCameras();
    const normalDelta = dist(normal[0]!) - dist(normal[normal.length - 1]!);
    expect(deepDelta).toBeGreaterThan(normalDelta);
    expect(normalDelta).toBeCloseTo(0.9, 3);
  });
});

describe('大师运镜库面板：镜头语言写回', () => {
  it('「写入镜头语言」只改提示词不动机位；再次点击清除', () => {
    render(<CameraMoveLibraryPanel />);
    const camerasBefore = useDirectorStore.getState().project.cameras;
    fireEvent.click(screen.getByTitle(TITLE.promptOnly));
    expect(useDirectorStore.getState().cameraMoveLibraryId).toBe('push-slow');
    expect(useDirectorStore.getState().project.cameras).toBe(camerasBefore);
    expect(screen.getByTitle(TITLE.promptOnly).textContent).toBe('清除镜头语言');
    const promptBox = () => document.querySelector('.nx9-stage-prompt-box')?.textContent ?? '';
    expect(promptBox()).toContain(lookupCameraMove('push-slow')!.promptEn);
    expect(promptBox().split('\n').filter((line) => line.toLowerCase().startsWith('camera movement:'))).toHaveLength(1);

    fireEvent.click(screen.getByTitle(TITLE.promptOnly));
    expect(useDirectorStore.getState().cameraMoveLibraryId).toBeNull();
    expect(promptBox()).not.toContain(lookupCameraMove('push-slow')!.promptEn);
  });
});
