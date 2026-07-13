import { useCallback, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  buildStoryboardPreviewFrames,
  canConfirmStoryboardPreview,
  emptyStoryboardPreview,
  type StoryboardPreviewFrame,
  type StoryboardPreviewGridColumns,
  type StoryboardPreviewPayload,
  type StoryboardPreviewViewMode,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';

function nextInsertOrder(frames: StoryboardPreviewFrame[], afterOrder: number): number {
  const following = frames.filter((f) => f.order > afterOrder);
  if (following.length === 0) return afterOrder + 1;
  const next = following.reduce((min, f) => Math.min(min, f.order), Infinity);
  return (afterOrder + next) / 2;
}

export function useStoryboardPreviewState(blockId: string) {
  const { updateNodeData } = useReactFlow();
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);

  const readPayload = useCallback((data: Record<string, unknown>): StoryboardPreviewPayload => {
    const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
    if (raw?.version === 1 && Array.isArray(raw.frames)) return raw;
    return emptyStoryboardPreview();
  }, []);

  const patchPayload = useCallback(
    (patch: Partial<StoryboardPreviewPayload>) => {
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const next = { ...current, ...patch };
        const summary = next.frames.filter(
          (f) => f.status === 'success' || f.status === 'locked',
        ).length;
        return {
          ...node,
          data: {
            ...data,
            storyboardPreview: next,
            previewUrls: next.frames.map((f) => f.imageUrl).filter(Boolean),
            batchCount: next.frames.length,
            content: `Storyboard Preview · ${next.frames.length} Images · ${summary === next.frames.length ? 'Ready' : `${summary}/${next.frames.length}`}`,
            status: summary === next.frames.length && next.frames.length > 0 ? 'success' : 'idle',
          },
        };
      });
    },
    [blockId, readPayload, updateNodeData],
  );

  const syncFromStoryboard = useCallback(() => {
    const frames = buildStoryboardPreviewFrames(shots);
    const totalDurationSec = shots.reduce((s, shot) => s + shot.durationSec, 0);
    patchPayload({
      frames,
      computedFrameCount: frames.length,
      totalDurationSec,
      confirmed: false,
      confirmedAt: null,
    });
  }, [patchPayload, shots]);

  const setViewMode = useCallback(
    (viewMode: StoryboardPreviewViewMode) => patchPayload({ viewMode }),
    [patchPayload],
  );

  const setGridColumns = useCallback(
    (gridColumns: StoryboardPreviewGridColumns) => patchPayload({ gridColumns }),
    [patchPayload],
  );

  const selectFrame = useCallback(
    (selectedFrameId: string | null) => patchPayload({ selectedFrameId }),
    [patchPayload],
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
          data: {
            ...data,
            storyboardPreview: {
              ...current,
              frames,
              totalDurationSec: cursor,
              confirmed: false,
            },
          },
        };
      });
    },
    [blockId, readPayload, updateNodeData],
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
          data: { ...data, storyboardPreview: { ...current, frames, confirmed: false } },
        };
      });
    },
    [blockId, readPayload, updateNodeData],
  );

  const removeFrame = useCallback(
    (frameId: string) => {
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const frames = current.frames
          .filter((f) => f.id !== frameId)
          .sort((a, b) => a.order - b.order)
          .map((f, i) => ({ ...f, order: i + 1, label: `Shot${String(i + 1).padStart(2, '0')}` }));
        return {
          ...node,
          data: { ...data, storyboardPreview: { ...current, frames, confirmed: false } },
        };
      });
    },
    [blockId, readPayload, updateNodeData],
  );

  const regenerateFrame = useCallback(
    (frameId: string) => {
      updateNodeData(blockId, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        const current = readPayload(data);
        const frame = current.frames.find((f) => f.id === frameId);
        if (!frame || frame.locked) return node;
        const frames = current.frames.map((f) =>
          f.id === frameId ? { ...f, status: 'generating' as const } : f,
        );
        return {
          ...node,
          data: { ...data, storyboardPreview: { ...current, frames, confirmed: false } },
        };
      });
      // TODO: wire picture-gen executor for single frame
    },
    [blockId, readPayload, updateNodeData],
  );

  const confirmAll = useCallback(() => {
    updateNodeData(blockId, (node) => {
      const data = (node.data ?? {}) as Record<string, unknown>;
      const current = readPayload(data);
      if (!canConfirmStoryboardPreview(current)) return node;
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

  const shotCount = shots.length;

  return useMemo(
    () => ({
      shots,
      shotCount,
      readPayload,
      syncFromStoryboard,
      setViewMode,
      setGridColumns,
      selectFrame,
      updateFrame,
      toggleLock,
      reorderFrame,
      insertAfter,
      removeFrame,
      regenerateFrame,
      confirmAll,
      patchPayload,
    }),
    [
      shots,
      shotCount,
      readPayload,
      syncFromStoryboard,
      setViewMode,
      setGridColumns,
      selectFrame,
      updateFrame,
      toggleLock,
      reorderFrame,
      insertAfter,
      removeFrame,
      regenerateFrame,
      confirmAll,
      patchPayload,
    ],
  );
}
