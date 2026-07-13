import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Director3dCapturePayload, DirectorProject } from '@nx9/director3d';
import { normalizeDirectorProject, isWebGLAvailable } from '@nx9/director3d';
import { useToast } from '../stores/toast';
import { toastSuccess } from '../stores/toast';
import {
  emptyStoryboardPreview,
  newBacklotWorkspaceItem,
  type StoryboardPreviewPayload,
} from '@nx9/shared';
import { useDirector3dUi } from '../stores/director3d-ui';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useAssetLibraryModalUi } from '../stores/asset-library-modal-ui';
import { useActivityLog } from '../stores/activity-log';
import { api } from '../api/client';
import { useTakeStore } from '../engine/stage-deck/stores/take-store';
import { applyPrimaryTakeToNodeData } from '../engine/stage-deck/utils/take-utils';
import { isStageDeckEnabled } from '../stores/stage-deck-flag';
import { syncDirector3dToBlocking } from '../engine/blocking-3d-sync';

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
  const linkedStoryboardPreviewId = useDirector3dUi((s) => s.linkedStoryboardPreviewId);
  const linkedStoryboardPreviewFrameId = useDirector3dUi(
    (s) => s.linkedStoryboardPreviewFrameId,
  );
  const project = useDirector3dUi((s) => s.project);
  const close = useDirector3dUi((s) => s.close);
  const setProject = useDirector3dUi((s) => s.setProject);
  const runtime = useFlowRuntime((s) => s.runtime);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const upsertBacklotWorkspace = useWorkspaceDocument((s) => s.upsertBacklotWorkspace);
  const openAssetAt = useAssetLibraryModalUi((s) => s.openAt);
  const appendLog = useActivityLog((s) => s.append);
  const intensive = runtime?.intensive ?? false;
  const webglOk = useMemo(() => isWebGLAvailable(), [open]);
  const intensiveShownRef = useRef(false);

  useEffect(() => {
    if (intensive && !intensiveShownRef.current) {
      intensiveShownRef.current = true;
      useToast.getState().push({ message: '画布节点较多，3D 导演台将使用性能模式', variant: 'info' });
    }
  }, [intensive]);

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
            linkedStoryboardPreviewId,
            linkedStoryboardPreviewFrameId,
          };
          if (isStageDeckEnabled()) {
            const take = useTakeStore.getState().appendTake(
              blockId,
              uploaded.url,
              uploaded.url,
              {
                mediaKind: 'picture',
                source: 'director3d',
                cameraPosition: payload.cameraPosition,
                cameraRotation: payload.cameraRotation,
                cameraFov: payload.cameraFov,
              },
            );
            if (take.picked) {
              Object.assign(patch, applyPrimaryTakeToNodeData(take));
            }
          }
          runtime.updateNodeData(blockId, patch);
        }

        let appliedToStoryboardPreview = false;
        if (linkedStoryboardPreviewId && linkedStoryboardPreviewFrameId && runtime && blockId) {
          const previewNode = runtime
            .getNodes()
            .find((node) => node.id === linkedStoryboardPreviewId);
          const previewData = (previewNode?.data ?? {}) as Record<string, unknown>;
          const raw = previewData.storyboardPreview as StoryboardPreviewPayload | undefined;
          const current =
            raw?.version === 1 && Array.isArray(raw.frames)
              ? { ...emptyStoryboardPreview(), ...raw }
              : undefined;
          const target = current?.frames.find(
            (frame) => frame.id === linkedStoryboardPreviewFrameId,
          );

          if (current && target && !target.locked) {
            const frames = current.frames.map((frame) =>
              frame.id === linkedStoryboardPreviewFrameId
                ? {
                    ...frame,
                    referenceImageUrl: uploaded.url,
                    director3dGuide: {
                      sourceBlockId: blockId,
                      captureId: payload.captureId,
                      captureUrl: uploaded.url,
                      cameraPrompt: payload.cameraPrompt,
                      cameraPosition: payload.cameraPosition,
                      cameraRotation: payload.cameraRotation,
                      cameraFov: payload.cameraFov,
                      appliedAt: new Date().toISOString(),
                    },
                    userModified: true,
                    status: 'modified' as const,
                    errorMessage: null,
                  }
                : frame,
            );
            runtime.updateNodeData(linkedStoryboardPreviewId, {
              storyboardPreview: {
                ...current,
                frames,
                selectedFrameId: linkedStoryboardPreviewFrameId,
                confirmed: false,
                confirmedAt: null,
              },
              status: 'idle',
            });
            appliedToStoryboardPreview = true;
            appendLog(`3D 机位已应用到 ${target.label}，可返回分镜预览正式出图`);
          } else if (target?.locked) {
            appendLog(`${target.label} 已锁定，3D 截图仅保存在导演台节点`);
          }
        }

        if (linkedShotId) {
          const reviewMode = useWorkspaceDocument.getState().storyboard.reviewMode;
          const linkedShot = useWorkspaceDocument
            .getState()
            .storyboard.shots.find((shot) => shot.id === linkedShotId);
          const cameraJson = JSON.stringify({
            position: payload.cameraPosition,
            rotation: payload.cameraRotation,
            fov: payload.cameraFov,
          });
          updateShot(linkedShotId, {
            firstFrameAssetId: appliedToStoryboardPreview
              ? linkedShot?.firstFrameAssetId
              : uploaded.url,
            status: appliedToStoryboardPreview
              ? linkedShot?.status
              : reviewMode === 'manual'
                ? 'review'
                : 'approved',
            notes: cameraJson,
            promptEn: payload.cameraPrompt
              ? `${linkedShot?.promptEn ?? ''} ${payload.cameraPrompt}`.trim()
              : undefined,
          });
          syncDirector3dToBlocking(cameraJson);
          appendLog(
            appliedToStoryboardPreview
              ? '机位数据已写入故事板镜头'
              : '截图已写入故事板镜头',
          );
        }
      } catch (e) {
        appendLog(`3D 截图上传失败: ${String(e)}`);
      }
    },
    [
      blockId,
      runtime,
      linkedShotId,
      linkedStoryboardPreviewId,
      linkedStoryboardPreviewFrameId,
      updateShot,
      appendLog,
    ],
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
      openAssetAt({ tab: 'scene', itemId: item.id, scope: 'private' });
      appendLog('场景已载入工作区，请在素材库中编辑保存');
      toastSuccess('场景已载入工作区，请选择分组保存');
    },
    [upsertBacklotWorkspace, openAssetAt, appendLog],
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
          当前环境不支持 WebGL。请使用支持硬件加速的桌面浏览器（Chrome / Edge / Firefox），或在系统设置中启用 GPU 加速后重试。
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl bg-brand text-white px-4 py-2 text-sm"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={() => window.open('https://get.webgl.org/', '_blank')}
            className="rounded-xl border border-line px-4 py-2 text-sm"
          >
            检测 WebGL 支持
          </button>
        </div>
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
            nodeCount: runtime?.getNodes()?.length ?? 0,
            crowdMax: 20,
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
