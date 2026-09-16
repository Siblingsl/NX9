/**
 * NX9「运镜时间轴」交接中转站（增量新增，会话级）。
 *
 * 为什么需要它：运镜时间轴的编排发生在视频/图片工作台与分镜编辑弹窗，
 * 而关键帧套用发生在 3D 导演台（全屏舞台，另一棵 React 树）。
 * 两者无法互相传 props，因此在 director3d 内放一个 zustand 中转站：
 * - 工作台点「交接 3D 导演台」→ `pushTimeline`；
 * - 舞台的 `CameraMoveTimelineRail` 读取并生成关键帧 → `setKeys` → 调 directorStore 写机位。
 *
 * 诚实边界：本中转站是**会话级**的（刷新页面即丢失）：时间轴本体、缓动 / 速度曲线、
 * 真实秒数都只活在本会话。但「套用」生成的机位会进入 `project.cameras`，并由导演台的
 * 保存路径写进镜头态 `cameraKeys`（一镜多机位关键帧结构），因此**机位序列本身跨会话保留**
 * （见 docs/NX9-CAMERA-MOVE-TIMELINE.md §5.4）。
 */
import { create } from 'zustand';
import type { CameraMoveTimeline } from '../../../shared/src/types/camera-move-timeline';
import type { CameraMoveKeyframe } from '../schema/cameraMoveTimelineKeys';

export interface MoveTimelineStoreState {
  /** 待套用的运镜时间轴；null 表示尚未交接 */
  timeline: CameraMoveTimeline | null;
  /** 交接来源（哪个工作台推过来的），仅用于展示 */
  sourceLabel: string | null;
  /** 最近一次交接的时间戳（ms），用于回显「刚刚交接」 */
  pushedAt: number | null;
  /** 已在导演台生成的关键帧（会话级） */
  keys: CameraMoveKeyframe[];
  /** 本次会话是否套用过关键帧（会话记录；界面判定以 project.cameras 里的 movetl-* 为准） */
  applied: boolean;
  /**
   * 这批关键帧套用到了哪个镜头。
   * 关键帧本身是会话级的、不随镜头切换清空，因此必须记住归属镜头，
   * 否则切到别的镜头后会出现「用 A 镜的时间轴 scrub B 镜」的错位。
   */
  appliedShotId: string | null;
  pushTimeline: (timeline: CameraMoveTimeline, sourceLabel?: string) => void;
  clearTimeline: () => void;
  setKeys: (keys: CameraMoveKeyframe[], applied: boolean, shotId?: string | null) => void;
  /** 只改 applied 标记（例如用户手动删掉了机位） */
  setApplied: (applied: boolean) => void;
}

export const useMoveTimelineStore = create<MoveTimelineStoreState>((set) => ({
  timeline: null,
  sourceLabel: null,
  pushedAt: null,
  keys: [],
  applied: false,
  appliedShotId: null,

  pushTimeline: (timeline, sourceLabel) =>
    set({
      timeline: structuredClone(timeline),
      sourceLabel: sourceLabel ?? null,
      pushedAt: Date.now(),
      keys: [],
      applied: false,
      appliedShotId: null,
    }),

  clearTimeline: () => set({
    timeline: null,
    sourceLabel: null,
    pushedAt: null,
    keys: [],
    applied: false,
    appliedShotId: null,
  }),

  setKeys: (keys, applied, shotId = null) => set({ keys, applied, appliedShotId: applied ? shotId : null }),

  setApplied: (applied) => set({ applied }),
}));
