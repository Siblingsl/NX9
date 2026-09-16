/**
 * 场面调度预设面板（增量新增）。
 *
 * 词表：`@nx9/shared` 的 `BLOCKING_CAMERA_PRESETS`（5 条场面调度机位）与
 * `BLOCKING_LAYOUTS`（一字排开 / 对话对峙 / 三角站位），
 * 源码 `packages/shared/src/data/blocking-presets.ts`，原本没有任何消费方。
 * 站位几何解算在 `solveBlockingLayout`（`packages/shared/src/utils/blocking-layout.ts`）。
 *
 * 与既有 `CameraPresetBar` 的关系 —— **不制造第二套机位来源**：
 * 二者写入的是同一个 `project.cameras[activeCameraId]`，调用同一个 `updateCamera`，
 * 持久化只有一份真源。区别只在词表口径与用途：
 * - `CameraPresetBar` = 通用机位角度（正面 / 荷兰角 / 侧拍 / 全景 / 特写 / 正俯），
 *   用于快速换视角构图；
 * - 本面板「场面调度机位」= 全景主镜 / 中景 / 过肩左 / 过肩右 / 低角度，
 *   与下方走位布局**配套使用**（先排站位、再取景），固定 fov 42–55。
 * 因此这里不复制一份机位状态，也不覆盖 `CameraPresetBar` 的按钮；
 * 只新增一组带明确口径标注的按钮，写回同一份数据。
 *
 * 走位只影响 `position` / `rotation`，不动 `scale`；已锁定（`locked`）的演员会被跳过，
 * 跳过数量在面板上如实显示，不做「静默成功」。
 */
import { useState } from 'react';
import {
  blockingCameraPatch,
  blockingLayoutLabel,
  listBlockingCameraPresets,
  listBlockingLayouts,
  solveBlockingLayout,
  type BlockingLayout,
} from '@nx9/shared';
import { useDirectorStore } from '../store/directorStore';

export function BlockingPresetPanel() {
  const project = useDirectorStore((s) => s.project);
  const updateCamera = useDirectorStore((s) => s.updateCamera);
  const updateObjectTransform = useDirectorStore((s) => s.updateObjectTransform);

  const [activeLayout, setActiveLayout] = useState<BlockingLayout | null>(null);
  const [notice, setNotice] = useState('');

  const activeCamera =
    project.cameras.find((c) => c.id === project.activeCameraId) ?? project.cameras[0];

  const cameraPresets = listBlockingCameraPresets();
  const layouts = listBlockingLayouts();

  const applyBlockingCamera = (presetId: string) => {
    if (!activeCamera) {
      setNotice('当前没有可套用的镜头，请先在「层」里添加镜头。');
      return;
    }
    const patch = blockingCameraPatch(presetId);
    if (!patch) {
      setNotice(`未找到场面调度机位：${presetId}`);
      return;
    }
    updateCamera(activeCamera.id, {
      name: patch.name,
      fov: patch.fov,
      target: patch.target,
      transform: { ...activeCamera.transform, position: patch.position },
    });
    setNotice(`已套用机位「${patch.name}」到当前镜头。`);
  };

  const applyLayout = (layout: BlockingLayout) => {
    const characters = project.objects.filter((o) => o.kind === 'character' && o.visible);
    if (characters.length === 0) {
      setNotice('场景中没有可见演员，请先在「+」里添加演员。');
      return;
    }
    const movable = characters.filter((o) => !o.locked);
    const skipped = characters.length - movable.length;
    if (movable.length === 0) {
      setNotice(`全部 ${characters.length} 位演员都已锁定，未做任何移动。`);
      return;
    }
    const solved = solveBlockingLayout(layout, movable.length);
    movable.forEach((obj, index) => {
      updateObjectTransform(obj.id, {
        position: solved[index].position,
        rotation: solved[index].rotation,
      });
    });
    setActiveLayout(layout);
    setNotice(
      `已套用走位「${blockingLayoutLabel(layout)}」，移动 ${movable.length} 位演员` +
        (skipped > 0 ? `；跳过 ${skipped} 位已锁定演员。` : '。'),
    );
  };

  return (
    <div className="nx9-stage-preset-bar" aria-label="场面调度预设">
      <span className="nx9-stage-preset-bar__label">场面调度机位</span>
      <div className="nx9-stage-preset-bar__row">
        {cameraPresets.map((p) => (
          <button
            key={p.id}
            type="button"
            className="nx9-stage-pill"
            title={`${p.label} / ${p.name} · pos ${p.position.join(',')} · fov ${p.fov}`}
            onClick={() => applyBlockingCamera(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <span className="nx9-stage-preset-bar__label">走位布局</span>
      <div className="nx9-stage-preset-bar__row">
        {layouts.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`nx9-stage-pill${activeLayout === l.id ? ' is-on' : ''}`}
            title={`按当前可见且未锁定的演员人数解算「${l.label}」站位`}
            onClick={() => applyLayout(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>
      {notice && (
        <span className="nx9-stage-blocking-note" title={notice}>
          {notice}
        </span>
      )}
    </div>
  );
}
