import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';
import type { Director3dCapturePayload, DirectorProject } from '@nx9/director3d';
import { normalizeDirectorProject, isWebGLAvailable } from '@nx9/director3d';
import { newBacklotWorkspaceItem } from '@nx9/shared';
import { useDirector3dUi } from '../stores/director3d-ui';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useBacklotLibraryUi } from '../stores/backlot-library-ui';
import { useActivityLog } from '../stores/activity-log';
import { toastSuccess } from '../stores/toast';
import { api } from '../api/client';
import { useTakeStore } from '../engine/stage-deck/stores/take-store';
import { applyPrimaryTakeToNodeData } from '../engine/stage-deck/utils/take-utils';
import { isStageDeckEnabled } from '../stores/stage-deck-flag';

const Director3dShell = lazy(() =>
  import('@nx9/director3d').then((m) => ({ default: m.Director3dShell })),
);

async function dataUrlToFile(dataUrl: string, name: string) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: 'image/png' });
}

export function Director3dPanel() {
  const open = useDirector3dUi((s) => s.open);
  const blockId = useDirector3dUi((s) => s.blockId);
  const linkedShotId = useDirector3dUi((s) => s.linkedShotId);
  const project = useDirector3dUi((s) => s.project);
  const close = useDirector3dUi((s) => s.close);
  const setProject = useDirector3dUi((s) => s.setProject);
  const runtime = useFlowRuntime((s) => s.runtime);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const upsertBacklotWorkspace = useWorkspaceDocument((s) => s.upsertBacklotWorkspace);
  const openWorkspace = useBacklotLibraryUi((s) => s.openWorkspace);
  const appendLog = useActivityLog((s) => s.append);
  const intensive = runtime?.intensive ?? false;
  const webglOk = useMemo(() => isWebGLAvailable(), [open]);

  const persistProject = useCallback(
    (next: DirectorProject) => {
      setProject(next);
      if (blockId && runtime) {
        runtime.updateNodeData(blockId, {
          scene: next,
          sceneVersion: 1,
        });
      }
    },
    [blockId, runtime, setProject],
  );

  const handleCapture = useCallback(
    async (payload: Director3dCapturePayload) => {
      try {
        const file = await dataUrlToFile(payload.dataUrl, `director3d-${Date.now()}.png`);
        const uploaded = await api.uploadAsset(file);
        appendLog(`3D 截图已上传 · ${uploaded.url}`);

        if (blockId && runtime) {
          const patch: Record<string, unknown> = {
            lastCaptureUrl: uploaded.url,
            lastCameraPrompt: payload.cameraPrompt,
            previewUrl: uploaded.url,
            content: payload.cameraPrompt ?? '',
            outputPrompt: payload.cameraPrompt ?? '',
            status: 'done',
          };
          if (isStageDeckEnabled()) {
            const take = useTakeStore.getState().appendTake(
              blockId,
              uploaded.url,
              uploaded.url,
              { mediaKind: 'picture', source: 'director3d' },
            );
            if (take.picked) {
              Object.assign(patch, applyPrimaryTakeToNodeData(take));
            }
          }
          runtime.updateNodeData(blockId, patch);
        }

        if (linkedShotId) {
          const reviewMode = useWorkspaceDocument.getState().storyboard.reviewMode;
          updateShot(linkedShotId, {
            firstFrameAssetId: uploaded.url,
            status: reviewMode === 'manual' ? 'review' : 'approved',
          });
          appendLog(`截图已写入故事板镜头`);
        }
      } catch (e) {
        appendLog(`3D 截图上传失败: ${String(e)}`);
      }
    },
    [blockId, runtime, linkedShotId, updateShot, appendLog],
  );

  const handleSaveSceneTemplate = useCallback(
    (sceneProject: DirectorProject, label: string) => {
      const sceneLabel = label.trim() || 'Stage Deck 场景';
      const item = {
        ...newBacklotWorkspaceItem('scene'),
        label: sceneLabel,
        promptEn: sceneProject.panorama?.url
          ? `Panorama scene, ${sceneProject.objects.length} objects placed`
          : `Stage Deck scene, ${sceneProject.objects.length} objects`,
        stageDeckScene: sceneProject,
      };
      upsertBacklotWorkspace(item);
      openWorkspace({ tab: 'scene', itemId: item.id, expandSave: true });
      appendLog('场景已载入工作区，请在 Backlot 选择分组保存');
      toastSuccess('场景已载入工作区，请选择分组保存');
    },
    [upsertBacklotWorkspace, openWorkspace, appendLog],
  );

  const handleClose = useCallback(() => {
    close();
  }, [close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  if (!open) return null;

  if (!webglOk) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#fafaf8] px-8 text-center">
        <p className="text-lg font-semibold text-ink mb-2">无法启动 Stage Deck</p>
        <p className="text-sm text-ink/60 max-w-md mb-6">
          当前环境不支持 WebGL。请使用支持硬件加速的桌面浏览器，或在系统设置中启用 GPU 加速后重试。
        </p>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-xl bg-brand text-white px-4 py-2 text-sm"
        >
          关闭
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center bg-[#fafaf8] text-ink/50 text-sm">
            加载 Stage Deck…
          </div>
        }
      >
        <Director3dShell
          options={{
            project: normalizeDirectorProject(project),
            linkedShotId: linkedShotId ?? undefined,
            performanceMode: intensive ? 'low' : 'normal',
            onProjectChange: persistProject,
            onCapture: handleCapture,
            onUploadFile: async (file) => {
              const uploaded = await api.uploadAsset(file);
              return { url: uploaded.url, filename: uploaded.filename };
            },
            onSaveSceneTemplate: handleSaveSceneTemplate,
            onClose: handleClose,
          }}
        />
      </Suspense>
    </div>
  );
}
