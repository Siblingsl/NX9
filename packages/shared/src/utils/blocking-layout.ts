/**
 * NX9 场面调度（blocking）接入层。
 *
 * 背景：`packages/shared/src/data/blocking-presets.ts` 里已定义
 * `BLOCKING_CAMERA_PRESETS`（5 条场面调度机位）与 `BLOCKING_LAYOUTS`
 * （一字排开 / 对话对峙 / 三角站位），但仓库内没有任何消费方。
 * 本模块把二者接成**可一键套用且可断言**的纯函数：
 *
 * - 机位 → 既有 `DirectorCameraShot` 的 `name / fov / target / transform.position` 补丁；
 * - 走位 → 按人数解算每个演员的 `position` 与 `rotation`（yaw）。
 *
 * 与 3D 导演台既有 `CameraPresetBar` 的关系（避免两套冲突的机位来源）：
 * 二者写入的是**同一个** `project.cameras[activeCameraId]`，走**同一个**
 * `updateCamera` 动作，因此持久化只有一份真源。差别只在词表口径：
 * `CameraPresetBar` 是通用机位角度（正面 / 荷兰角 / 侧拍 / 全景 / 特写 / 正俯），
 * 本模块的 `BLOCKING_CAMERA_PRESETS` 是**场面调度取景**（全景主镜 / 中景 /
 * 过肩左 / 过肩右 / 低角度，固定 fov 42–55），且与走位布局配套使用。
 *
 * 几何约定：演员默认站立于地面（y = 0），朝向以 `rotation[1]`（yaw）表示，
 * yaw = 0 表示面向 +Z（正对默认机位视野方向）。
 */
import {
  BLOCKING_CAMERA_PRESETS,
  BLOCKING_LAYOUTS,
  type BlockingCameraPreset,
  type BlockingLayout,
} from '../data/blocking-presets';

/** 演员站位解算结果：只含 `position` 与 `rotation`，不碰 `scale` / 其他字段。 */
export interface BlockingPlacement {
  position: [number, number, number];
  rotation: [number, number, number];
}

/** 机位补丁：可直接喂给 `updateCamera(activeCameraId, patch)`。 */
export interface BlockingCameraPatch {
  name: string;
  fov: number;
  target: [number, number, number];
  position: [number, number, number];
}

/** 一字排开的横向间距（米）。 */
export const BLOCKING_LINE_SPACING = 1.6;
/** 对话对峙两列的纵向间距（米）。 */
export const BLOCKING_DIALOGUE_SPACING = 1.2;
/** 对话对峙两列各自的横向偏置（米）。 */
export const BLOCKING_DIALOGUE_HALF_WIDTH = 1.4;
/** 三角站位的基准半径（米）。 */
export const BLOCKING_TRIANGLE_RADIUS = 1.8;

/** 三角站位的三个锚点角度（弧度，0 = 正前方 +Z），下标即演员序号。 */
const TRIANGLE_ANCHORS = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3] as const;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** 全部合法布局 id（保持 `BLOCKING_LAYOUTS` 词表顺序）。 */
export const BLOCKING_LAYOUT_IDS: BlockingLayout[] = BLOCKING_LAYOUTS.map((l) => l.id);

/** 布局 id → 中文标签；未命中返回原 id（只读转出 `BLOCKING_LAYOUTS`）。 */
export function blockingLayoutLabel(layoutId: string): string {
  return BLOCKING_LAYOUTS.find((l) => l.id === layoutId)?.label ?? String(layoutId);
}

/** 布局词表（只读转出 `BLOCKING_LAYOUTS`）。 */
export function listBlockingLayouts(): { id: BlockingLayout; label: string }[] {
  return BLOCKING_LAYOUTS.map((l) => ({ id: l.id, label: l.label }));
}

/** 按 id 取场面调度机位；未命中返回 undefined。 */
export function blockingCameraPreset(
  presetId: string | undefined | null,
): BlockingCameraPreset | undefined {
  if (!presetId) return undefined;
  return BLOCKING_CAMERA_PRESETS.find((p) => p.id === String(presetId).trim());
}

/** 场面调度机位词表（只读转出 `BLOCKING_CAMERA_PRESETS`）。 */
export function listBlockingCameraPresets(): BlockingCameraPreset[] {
  return BLOCKING_CAMERA_PRESETS.map((p) => ({ ...p }));
}

/**
 * 机位 id → 既有 `DirectorCameraShot` 补丁；未命中返回 undefined
 * （调用方据此报错或忽略，不做「静默套用首条」的兜底）。
 */
export function blockingCameraPatch(
  presetId: string | undefined | null,
): BlockingCameraPatch | undefined {
  const preset = blockingCameraPreset(presetId);
  if (!preset) return undefined;
  return {
    name: preset.name,
    fov: preset.fov,
    target: [...preset.target] as [number, number, number],
    position: [...preset.position] as [number, number, number],
  };
}

/**
 * 按布局与演员人数解算站位。
 *
 * - `line`：沿 X 轴一字排开，全部面向 +Z（默认机位方向）；
 * - `dialogue`：分左右两列对峙，左列朝 +X、右列朝 -X，沿 Z 轴展开；
 * - `triangle`：三人一组落在正前 / 左后 / 右后三个锚点，人数超过 3 时按环外扩，
 *   每个演员的 yaw 指向原点（画面中心）。
 *
 * `count <= 0` 返回空数组（无人可排，属合法输入）；
 * 传入不在 `BLOCKING_LAYOUTS` 中的 id 抛错，不返回空数组假装成功。
 */
export function solveBlockingLayout(
  layout: BlockingLayout,
  count: number,
): BlockingPlacement[] {
  if (!BLOCKING_LAYOUT_IDS.includes(layout)) {
    throw new Error(`未知走位布局 id: ${String(layout)}`);
  }
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];

  if (layout === 'line') {
    return Array.from({ length: n }, (_, i) => ({
      position: [round3((i - (n - 1) / 2) * BLOCKING_LINE_SPACING), 0, 0] as [
        number,
        number,
        number,
      ],
      rotation: [0, 0, 0] as [number, number, number],
    }));
  }

  if (layout === 'dialogue') {
    const leftCount = Math.ceil(n / 2);
    const rightCount = n - leftCount;
    const out: BlockingPlacement[] = [];
    for (let i = 0; i < leftCount; i += 1) {
      out.push({
        position: [
          -BLOCKING_DIALOGUE_HALF_WIDTH,
          0,
          round3((i - (leftCount - 1) / 2) * BLOCKING_DIALOGUE_SPACING),
        ] as [number, number, number],
        // 左列面向 +X
        rotation: [0, round3(Math.PI / 2), 0] as [number, number, number],
      });
    }
    for (let i = 0; i < rightCount; i += 1) {
      out.push({
        position: [
          BLOCKING_DIALOGUE_HALF_WIDTH,
          0,
          round3((i - (rightCount - 1) / 2) * BLOCKING_DIALOGUE_SPACING),
        ] as [number, number, number],
        // 右列面向 -X
        rotation: [0, round3(-Math.PI / 2), 0] as [number, number, number],
      });
    }
    return out;
  }

  // triangle
  return Array.from({ length: n }, (_, i) => {
    const anchor = TRIANGLE_ANCHORS[i % TRIANGLE_ANCHORS.length];
    const ring = Math.floor(i / TRIANGLE_ANCHORS.length);
    const radius = BLOCKING_TRIANGLE_RADIUS + ring * BLOCKING_DIALOGUE_SPACING;
    const yaw = anchor + Math.PI; // 面向原点
    return {
      position: [
        round3(radius * Math.sin(anchor)),
        0,
        round3(radius * Math.cos(anchor)),
      ] as [number, number, number],
      rotation: [0, round3(yaw), 0] as [number, number, number],
    };
  });
}
