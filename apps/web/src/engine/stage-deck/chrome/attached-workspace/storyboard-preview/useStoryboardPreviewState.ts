import { useCallback, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  buildStoryboardPreviewFrames,
  activeEpisodeShots,
  buildStoryboardPreviewFramesFromBreakdown,
  buildPictureGenDelegatePatch,
  canConfirmStoryboardPreview,
  emptyStoryboardPreview,
  flattenScriptBreakdownShots,
  resolveStoryboardPreviewPictureSettings,
  resolveConnectedDirector3dId,
  writeBackBreakdownPreviewImage,
  KEYFRAME_SCORE_THRESHOLD,
  type StoryboardPreviewFrame,
  type StoryboardPreviewGridColumns,
  type StoryboardPreviewPayload,
  type StoryboardPreviewPictureSettings,
  type StoryboardPreviewViewMode,
  type ScriptBreakdownPayload,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { useActivityLog } from '../../../../../stores/activity-log';
import {
  checkStoryboardConsistencyWithAi,
  findConnectedPictureGenNode,
  generateStoryboardFrameImage,
  generateStoryboardPanorama720,
  scoreStoryboardKeyframes,
} from '../../../../storyboard-preview-runner';

function nextInsertOrder(frames: StoryboardPreviewFrame[], afterOrder: number): number {
  const following = frames.filter((f) => f.order > afterOrder);
  if (following.length === 0) return afterOrder + 1;
  const next = following.reduce((min, f) => Math.min(min, f.order), Infinity);
  return (afterOrder + next) / 2;
}

function panoramaScopeKey(
  activeEpisodeId: string | null | undefined,
  frame: StoryboardPreviewFrame | undefined,
): string {
  return [activeEpisodeId || 'single-episode', frame?.sceneId || frame?.sceneCode || 'default-scene'].join('::');
}

function previewNodePatch(
  current: StoryboardPreviewPayload,
  frames: StoryboardPreviewFrame[],
  breakdown?: ScriptBreakdownPayload,
  extra?: Partial<StoryboardPreviewPayload>,
) {
  const summary = frames.filter((f) => f.status === 'success' || f.status === 'locked').length;
  return {
    storyboardPreview: {
      ...current,
      ...extra,
      frames,
      computedFrameCount: frames.length,
      totalDurationSec: frames.reduce((s, f) => s + Math.max(0, f.endSec - f.startSec), 0),
      confirmed: false,
      confirmedAt: null,
    },
    ...(breakdown ? { scriptBreakdown: breakdown } : {}),
    previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
    batchCount: frames.length,
    content: `Storyboard Preview · ${frames.length} Images · ${summary === frames.length ? 'Ready' : `${summary}/${frames.length}`}`,
    status: summary === frames.length && frames.length > 0 ? 'success' : 'idle',
  };
}

export function useStoryboardPreviewState(blockId: string) {
  const { getEdges, getNodes, updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const shots = useMemo(() => activeEpisodeShots(storyboard), [storyboard]);

  const upstreamBreakdown = useMemo(() => {
    const nodes = getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const edge of getEdges().filter((e) => e.target === blockId)) {
      const data = byId.get(edge.source)?.data as Record<string, unknown> | undefined;
      const payload = data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
      if (payload?.version === 1) return payload;
    }
    return undefined;
  }, [blockId, getEdges, getNodes]);

  const scopedUpstreamBreakdown = useMemo(() => {
    if (!upstreamBreakdown || !storyboard.activeEpisodeId) return upstreamBreakdown;
    const episode = upstreamBreakdown.episodes.find(
      (item) => item.id === storyboard.activeEpisodeId,
    );
    return episode ? { ...upstreamBreakdown, episodes: [episode] } : upstreamBreakdown;
  }, [storyboard.activeEpisodeId, upstreamBreakdown]);

  const connectedPictureNode = useCallback(() => {
    return findConnectedPictureGenNode(blockId, getNodes(), getEdges());
  }, [blockId, getEdges, getNodes]);

  const connectedDirector3dNode = useCallback(() => {
    const nodes = getNodes();
    const id = resolveConnectedDirector3dId(blockId, nodes, getEdges());
    return id ? nodes.find((node) => node.id === id) : undefined;
  }, [blockId, getEdges, getNodes]);

  const readPayload = useCallback((data: Record<string, unknown>): StoryboardPreviewPayload => {
    const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
    if (raw?.version === 1 && Array.isArray(raw.frames)) {
      return {
        ...emptyStoryboardPreview(),
        ...raw,
        pictureSettings: resolveStoryboardPreviewPictureSettings(raw),
      };
    }
    return emptyStoryboardPreview();
  }, []);

  const syncPictureSettingsToExecNode = useCallback(
    (settings: StoryboardPreviewPictureSettings) => {
      const pictureNode = connectedPictureNode();
      if (!pictureNode) return;
      updateNodeData(pictureNode.id, buildPictureGenDelegatePatch(settings));
    },
    [connectedPictureNode, updateNodeData],
  );

  const updatePictureSettings = useCallback(
    (patch: Partial<StoryboardPreviewPictureSettings>) => {
      let nextSettings: StoryboardPreviewPictureSettings | undefined;
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const pictureSettings = { ...current.pictureSettings, ...patch };
        nextSettings = pictureSettings;
        return {
          ...node,
          data: {
            ...data,
            storyboardPreview: { ...current, pictureSettings },
          },
        };
      });
      if (nextSettings) syncPictureSettingsToExecNode(nextSettings);
    },
    [blockId, readPayload, syncPictureSettingsToExecNode, updateNodeData],
  );

  const readBreakdown = useCallback((data: Record<string, unknown>): ScriptBreakdownPayload | undefined => {
    const local = data.scriptBreakdown as ScriptBreakdownPayload | undefined;
    if (local?.version === 1) return local;
    return scopedUpstreamBreakdown;
  }, [scopedUpstreamBreakdown]);

  const patchPayload = useCallback(
    (patch: Partial<StoryboardPreviewPayload>) => {
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const next = { ...current, ...patch };
        const frames = next.frames;
        const summary = frames.filter((f) => f.status === 'success' || f.status === 'locked').length;
        return {
          ...node,
          data: {
            ...data,
            storyboardPreview: next,
            previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
            batchCount: frames.length,
            content: `Storyboard Preview · ${frames.length} Images · ${summary === frames.length ? 'Ready' : `${summary}/${frames.length}`}`,
            status: summary === frames.length && frames.length > 0 ? 'success' : 'idle',
          },
        };
      });
    },
    [blockId, readPayload, updateNodeData],
  );

  const syncFromStoryboard = useCallback(() => {
    const breakdownShots = flattenScriptBreakdownShots(scopedUpstreamBreakdown);
    const frames = shots.length
      ? buildStoryboardPreviewFrames(shots)
      : buildStoryboardPreviewFramesFromBreakdown(breakdownShots);
    const node = getNodes().find((item) => item.id === blockId);
    const current = readPayload((node?.data ?? {}) as Record<string, unknown>);
    const selected = frames.find((frame) => frame.id === current.selectedFrameId) ?? frames[0];
    const scopeKey = panoramaScopeKey(storyboard.activeEpisodeId, selected);
    const scopedPanorama = current.panorama720ByScope?.[scopeKey]
      ?? (Object.keys(current.panorama720ByScope ?? {}).length === 0 ? current.panorama720 : null);
    patchPayload({
      frames,
      computedFrameCount: frames.length,
      totalDurationSec: frames.reduce((s, frame) => s + Math.max(0, frame.endSec - frame.startSec), 0),
      confirmed: false,
      confirmedAt: null,
      selectedFrameId: selected?.id ?? null,
      panorama720: scopedPanorama ?? null,
    });
    if (scopedUpstreamBreakdown) {
      updateNodeData(blockId, { scriptBreakdown: scopedUpstreamBreakdown });
    }
  }, [blockId, getNodes, patchPayload, readPayload, scopedUpstreamBreakdown, shots, storyboard.activeEpisodeId, updateNodeData]);

  const setViewMode = useCallback(
    (viewMode: StoryboardPreviewViewMode) => patchPayload({ viewMode }),
    [patchPayload],
  );

  const setGridColumns = useCallback(
    (gridColumns: StoryboardPreviewGridColumns) => patchPayload({ gridColumns }),
    [patchPayload],
  );

  const selectFrame = useCallback(
    (selectedFrameId: string | null) => {
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const selected = current.frames.find((frame) => frame.id === selectedFrameId);
        const scopeKey = panoramaScopeKey(storyboard.activeEpisodeId, selected);
        return {
          ...node,
          data: {
            ...data,
            storyboardPreview: {
              ...current,
              selectedFrameId,
              panorama720: current.panorama720ByScope?.[scopeKey] ?? null,
            },
          },
        };
      });
    },
    [blockId, readPayload, storyboard.activeEpisodeId, updateNodeData],
  );

  const updateFrame = useCallback(
    (frameId: string, patch: Partial<StoryboardPreviewFrame>) => {
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const frames = current.frames.map((f) =>
          f.id === frameId
            ? {
                ...f,
                ...patch,
                userModified: patch.userModified ?? true,
                status: patch.status ?? (f.locked ? f.status : 'modified'),
              }
            : f,
        );
        return {
          ...node,
          data: {
            ...data,
            storyboardPreview: { ...current, frames, confirmed: false },
          },
        };
      });
    },
    [blockId, readPayload, updateNodeData],
  );

  const toggleLock = useCallback(
    (frameId: string) => {
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const frames = current.frames.map((f) => {
          if (f.id !== frameId) return f;
          const locked = !f.locked;
          return {
            ...f,
            locked,
            status: locked ? 'locked' : f.imageUrl ? 'success' : 'idle',
          };
        });
        return {
          ...node,
          data: { ...data, storyboardPreview: { ...current, frames } },
        };
      });
    },
    [blockId, readPayload, updateNodeData],
  );

  const batchLock = useCallback(
    (frameIds: string[], locked: boolean) => {
      const idSet = new Set(frameIds);
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const frames = current.frames.map((f) => {
          if (!idSet.has(f.id)) return f;
          return {
            ...f,
            locked,
            status: locked ? 'locked' : f.imageUrl ? 'success' : 'idle',
          };
        });
        return { ...node, data: { ...data, storyboardPreview: { ...current, frames } } };
      });
    },
    [blockId, readPayload, updateNodeData],
  );

  const batchDelete = useCallback(
    (frameIds: string[]) => {
      const idSet = new Set(frameIds);
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const frames = current.frames
          .filter((f) => !idSet.has(f.id) || f.locked)
          .sort((a, b) => a.order - b.order)
          .map((f, i) => ({ ...f, order: i + 1, label: `Shot${String(i + 1).padStart(2, '0')}` }));
        return {
          ...node,
          data: previewNodePatch(current, frames, readBreakdown(data)),
        };
      });
    },
    [blockId, readBreakdown, readPayload, updateNodeData],
  );

  const batchStyleReplace = useCallback(
    (frameIds: string[], stylePreset: string) => {
      const idSet = new Set(frameIds);
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const frames = current.frames.map((f) =>
          idSet.has(f.id) && !f.locked
            ? { ...f, stylePreset, userModified: true, status: 'modified' as const }
            : f,
        );
        return {
          ...node,
          data: { ...data, storyboardPreview: { ...current, frames, confirmed: false } },
        };
      });
    },
    [blockId, readPayload, updateNodeData],
  );

  const reorderFrame = useCallback(
    (frameId: string, targetIndex: number) => {
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const sorted = [...current.frames].sort((a, b) => a.order - b.order);
        const from = sorted.findIndex((f) => f.id === frameId);
        if (from < 0) return node;
        const [item] = sorted.splice(from, 1);
        sorted.splice(targetIndex, 0, item);
        let cursor = 0;
        const frames = sorted.map((f, i) => {
          const dur = Math.max(0.5, f.endSec - f.startSec);
          const startSec = cursor;
          const endSec = cursor + dur;
          cursor = endSec;
          return {
            ...f,
            order: i + 1,
            label: `Shot${String(i + 1).padStart(2, '0')}`,
            startSec,
            endSec,
          };
        });
        return {
          ...node,
          data: previewNodePatch(current, frames, readBreakdown(data)),
        };
      });
    },
    [blockId, readBreakdown, readPayload, updateNodeData],
  );

  const insertAfter = useCallback(
    (afterFrameId: string) => {
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const sorted = [...current.frames].sort((a, b) => a.order - b.order);
        const ref = sorted.find((f) => f.id === afterFrameId);
        if (!ref) return node;
        const order = nextInsertOrder(current.frames, ref.order);
        const mid = (ref.startSec + ref.endSec) / 2;
        const newFrame: StoryboardPreviewFrame = {
          id: `spf-new-${Date.now()}`,
          order,
          label: `${ref.label}.5`,
          startSec: mid,
          endSec: mid + 1,
          sourceShotId: ref.sourceShotId,
          promptSummary: ref.promptSummary,
          status: 'idle',
          locked: false,
          userModified: true,
        };
        const frames = [...current.frames, newFrame].sort((a, b) => a.order - b.order);
        return {
          ...node,
          data: previewNodePatch(current, frames, readBreakdown(data)),
        };
      });
    },
    [blockId, readBreakdown, readPayload, updateNodeData],
  );

  const removeFrame = useCallback(
    (frameId: string) => {
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const target = current.frames.find((f) => f.id === frameId);
        if (target?.locked) return node;
        const frames = current.frames
          .filter((f) => f.id !== frameId)
          .sort((a, b) => a.order - b.order)
          .map((f, i) => ({ ...f, order: i + 1, label: `Shot${String(i + 1).padStart(2, '0')}` }));
        return {
          ...node,
          data: previewNodePatch(current, frames, readBreakdown(data)),
        };
      });
    },
    [blockId, readBreakdown, readPayload, updateNodeData],
  );

  const regenerateFrame = useCallback(
    async (frameId: string) => {
      const pictureNode = connectedPictureNode();
      if (!pictureNode) {
        appendLog('请先连接图像生成节点（红线连接）');
        return;
      }

      let targetFrame: StoryboardPreviewFrame | undefined;
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const frame = current.frames.find((f) => f.id === frameId);
        if (!frame || frame.locked) return node;
        targetFrame = frame;
        const frames = current.frames.map((f) =>
          f.id === frameId ? { ...f, status: 'generating' as const } : f,
        );
        return {
          ...node,
          data: { ...data, storyboardPreview: { ...current, frames, confirmed: false } },
        };
      });
      if (!targetFrame) return;

      const previewNode = getNodes().find((n) => n.id === blockId);
      const previewData = (previewNode?.data ?? {}) as Record<string, unknown>;
      const pictureSettings = readPayload(previewData).pictureSettings;
      syncPictureSettingsToExecNode(pictureSettings);

      const pictureData = (pictureNode.data ?? {}) as Record<string, unknown>;
      updateNodeData(pictureNode.id, {
        status: 'running',
        content: targetFrame.promptSummary,
        linkedFrameId: frameId,
        frameJob: {
          frameId,
          source: blockId,
          referenceImageUrl: targetFrame.referenceImageUrl ?? null,
        },
      });

      try {
        const imageUrl = await generateStoryboardFrameImage(
          targetFrame,
          pictureData,
          pictureSettings,
        );
        updateNodeData(blockId, (node) => {
          const data = (node.data ?? {}) as Record<string, unknown>;
          const current = readPayload(data);
          const frames = current.frames.map((f) =>
            f.id === frameId
              ? { ...f, imageUrl, status: 'success' as const, errorMessage: null }
              : f,
          );
          const breakdown = writeBackBreakdownPreviewImage(
            readBreakdown(data),
            targetFrame!.sourceShotId,
            imageUrl,
          );
          return {
            ...node,
            data: previewNodePatch(current, frames, breakdown),
          };
        });
        updateNodeData(pictureNode.id, {
          status: 'success',
          previewUrl: imageUrl,
          previewUrls: [imageUrl],
          batchCount: 1,
          lastResult: { count: 1, urls: [imageUrl], frameId },
        });
        if (targetFrame.sourceShotId) {
          useWorkspaceDocument.getState().updateShot(targetFrame.sourceShotId, {
            firstFrameAssetId: imageUrl,
            keyframeStatus: 'review',
            status: 'review',
          });
        }
        appendLog(`已重新生成 ${targetFrame.label}`);
      } catch (e) {
        updateNodeData(blockId, (node) => {
          const data = (node.data ?? {}) as Record<string, unknown>;
          const current = readPayload(data);
          const frames = current.frames.map((f) =>
            f.id === frameId
              ? { ...f, status: 'error' as const, errorMessage: String(e) }
              : f,
          );
          return {
            ...node,
            data: { ...data, storyboardPreview: { ...current, frames, confirmed: false } },
          };
        });
        updateNodeData(pictureNode.id, { status: 'error', error: String(e) });
        appendLog(`单张重新生成失败: ${String(e)}`);
      }
    },
    [appendLog, blockId, connectedPictureNode, getNodes, readBreakdown, readPayload, syncPictureSettingsToExecNode, updateNodeData],
  );

  const generateAllFrames = useCallback(
    async (onlyMissing = true) => {
      const pictureNode = connectedPictureNode();
      if (!pictureNode) {
        appendLog('请先连接图像生成节点（红线连接）');
        return;
      }
      const pictureData = (pictureNode.data ?? {}) as Record<string, unknown>;
      const node = getNodes().find((n) => n.id === blockId);
      const data = (node?.data ?? {}) as Record<string, unknown>;
      const pictureSettings = readPayload(data).pictureSettings;
      syncPictureSettingsToExecNode(pictureSettings);
      const current = readPayload(data);
      const targets = current.frames.filter((f) => {
        if (f.locked) return false;
        if (f.status === 'generating') return false;
        if (onlyMissing && (f.status === 'success' || f.status === 'locked')) return false;
        return true;
      });
      if (targets.length === 0) {
        appendLog('没有需要生成的分镜');
        return;
      }

      updateNodeData(blockId, { status: 'running' });
      let frames = [...current.frames];
      let breakdown = readBreakdown(data);

      for (const frame of targets) {
        frames = frames.map((f) => (f.id === frame.id ? { ...f, status: 'generating' as const } : f));
        updateNodeData(blockId, {
          storyboardPreview: { ...current, frames, confirmed: false },
        });

        try {
          const imageUrl = await generateStoryboardFrameImage(frame, pictureData, pictureSettings);
          frames = frames.map((f) =>
            f.id === frame.id ? { ...f, imageUrl, status: 'success' as const, errorMessage: null } : f,
          );
          breakdown = writeBackBreakdownPreviewImage(breakdown, frame.sourceShotId, imageUrl);
          // 写回故事板 SSOT（核心路径 readiness 依赖 firstFrameAssetId）
          if (frame.sourceShotId) {
            useWorkspaceDocument.getState().updateShot(frame.sourceShotId, {
              firstFrameAssetId: imageUrl,
              keyframeStatus: 'review',
              status: 'review',
            });
          }
          updateNodeData(pictureNode.id, {
            status: 'success',
            previewUrl: imageUrl,
            previewUrls: [imageUrl],
            linkedFrameId: frame.id,
            frameJob: { frameId: frame.id, source: blockId },
          });
        } catch (e) {
          frames = frames.map((f) =>
            f.id === frame.id ? { ...f, status: 'error' as const, errorMessage: String(e) } : f,
          );
        }
        updateNodeData(blockId, previewNodePatch(current, frames, breakdown));
      }

      appendLog(`批量生成完成 · ${targets.length} 张`);
      updateNodeData(blockId, { status: 'idle' });
    },
    [appendLog, blockId, connectedPictureNode, getNodes, readBreakdown, readPayload, syncPictureSettingsToExecNode, updateNodeData],
  );

  const generatePanorama720 = useCallback(
    async (prompt: string): Promise<string | undefined> => {
      const pictureNode = connectedPictureNode();
      if (!pictureNode) {
        appendLog('请先连接图像生成节点（顶部能力口）');
        return undefined;
      }
      const scenePrompt = prompt.trim();
      if (!scenePrompt) {
        appendLog('请先填写 720° 全景场景描述');
        return undefined;
      }

      updateNodeData(blockId, { status: 'running' });
      updateNodeData(pictureNode.id, {
        status: 'running',
        pictureGenMode: 'panorama-720',
        aspectRatio: '2:1',
        imageCount: 1,
        panoramaProjection: 'equirectangular',
        content: scenePrompt,
      });

      try {
        const imageUrl = await generateStoryboardPanorama720(
          scenePrompt,
          (pictureNode.data ?? {}) as Record<string, unknown>,
        );
        updateNodeData(blockId, (node) => {
          const data = (node.data ?? {}) as Record<string, unknown>;
          const current = readPayload(data);
          const selected = current.frames.find((frame) => frame.id === current.selectedFrameId);
          const scopeKey = panoramaScopeKey(storyboard.activeEpisodeId, selected);
          const panorama = {
            imageUrl,
            prompt: scenePrompt,
            sourcePictureNodeId: pictureNode.id,
            scopeKey,
            updatedAt: new Date().toISOString(),
          };
          return {
            ...node,
            data: {
              ...data,
              status: 'idle',
              storyboardPreview: {
                ...current,
                panorama720: panorama,
                panorama720ByScope: {
                  ...(current.panorama720ByScope ?? {}),
                  [scopeKey]: panorama,
                },
              },
            },
          };
        });
        updateNodeData(pictureNode.id, {
          status: 'success',
          previewUrl: imageUrl,
          previewUrls: [imageUrl],
          panoramaUrl: imageUrl,
          panoramaProjection: 'equirectangular',
          lastResult: { count: 1, urls: [imageUrl], mode: 'panorama-720' },
        });
        appendLog('720° 全景场景已生成，可加载到 3D 导演台');
        return imageUrl;
      } catch (error) {
        updateNodeData(blockId, { status: 'error', error: String(error) });
        updateNodeData(pictureNode.id, { status: 'error', error: String(error) });
        appendLog(`720° 全景生成失败: ${String(error)}`);
        return undefined;
      }
    },
    [appendLog, blockId, connectedPictureNode, readPayload, storyboard.activeEpisodeId, updateNodeData],
  );

  const confirmAll = useCallback(() => {
    updateNodeData(blockId, (node) => {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const current = readPayload(data);
      if (!canConfirmStoryboardPreview(current)) return node;
      // 分镜预览只提交批审；批准动作统一由下游 review-gate 完成。
      for (const frame of current.frames) {
        if (frame.sourceShotId && frame.imageUrl) {
          useWorkspaceDocument.getState().updateShot(frame.sourceShotId, {
            firstFrameAssetId: frame.imageUrl,
            keyframeStatus: 'review',
            status: 'review',
          });
        }
      }
      return {
        ...node,
        data: {
          ...data,
          storyboardPreview: {
            ...current,
            confirmed: true,
            confirmedAt: new Date().toISOString(),
          },
          status: 'success',
        },
      };
    });
  }, [blockId, readPayload, updateNodeData]);

  const checkConsistency = useCallback(
    async (dimension: 'character' | 'scene' | 'other' | 'full' = 'full') => {
      const node = getNodes().find((n) => n.id === blockId);
      const data = (node?.data ?? {}) as Record<string, unknown>;
      const current = readPayload(data);
      updateNodeData(blockId, { status: 'running' });
      try {
        if (dimension === 'full') {
          const { report, frames } = await scoreStoryboardKeyframes(
            current.frames,
            KEYFRAME_SCORE_THRESHOLD,
          );
          updateNodeData(blockId, {
            status: 'idle',
            storyboardPreview: {
              ...current,
              frames,
              lastConsistencyReport: report,
            },
          });
          const low = report.suggestRegenerateFrameIds?.length ?? 0;
          appendLog(
            `关键帧评分完成 · 综合 ${report.overallScore}/100（角色/场景/其它）`
            + (low > 0 ? ` · ${low} 镜低于 ${KEYFRAME_SCORE_THRESHOLD} 分建议重生成` : ' · 全部达标'),
          );
          return report;
        }
        const report = await checkStoryboardConsistencyWithAi(current.frames, dimension);
        updateNodeData(blockId, {
          status: 'idle',
          storyboardPreview: { ...current, lastConsistencyReport: report },
        });
        const labels = { character: '角色', scene: '场景', other: '其它' } as const;
        appendLog(`${labels[dimension]}一致性检查完成 · ${report.overallScore}/100`);
        return report;
      } catch (e) {
        updateNodeData(blockId, { status: 'error', error: String(e) });
        appendLog(`一致性检查失败: ${String(e)}`);
        return null;
      }
    },
    [appendLog, blockId, getNodes, readPayload, updateNodeData],
  );

  const shotCount = shots.length;

  return useMemo(
    () => ({
      shots,
      shotCount,
      activeEpisodeId: storyboard.activeEpisodeId ?? null,
      upstreamBreakdown: scopedUpstreamBreakdown,
      connectedPictureNode,
      connectedDirector3dNode,
      readPayload,
      syncFromStoryboard,
      setViewMode,
      setGridColumns,
      selectFrame,
      updateFrame,
      toggleLock,
      batchLock,
      batchDelete,
      batchStyleReplace,
      reorderFrame,
      insertAfter,
      removeFrame,
      regenerateFrame,
      generateAllFrames,
      generatePanorama720,
      confirmAll,
      checkConsistency,
      patchPayload,
      updatePictureSettings,
      syncPictureSettingsToExecNode,
    }),
    [
      shots,
      shotCount,
      storyboard.activeEpisodeId,
      scopedUpstreamBreakdown,
      connectedPictureNode,
      connectedDirector3dNode,
      readPayload,
      syncFromStoryboard,
      setViewMode,
      setGridColumns,
      selectFrame,
      updateFrame,
      toggleLock,
      batchLock,
      batchDelete,
      batchStyleReplace,
      reorderFrame,
      insertAfter,
      removeFrame,
      regenerateFrame,
      generateAllFrames,
      generatePanorama720,
      confirmAll,
      checkConsistency,
      patchPayload,
      updatePictureSettings,
      syncPictureSettingsToExecNode,
    ],
  );
}
