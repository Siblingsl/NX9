import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { buildPreviewOutputNodes } from '../../engine/spawn-preview-blocks';
import { useActivityLog } from '../../stores/activity-log';

export function useImageEditProduce(sourceNodeId: string) {
  const { getNode, getNodes, addNodes, setNodes } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);

  return useCallback(
    async (urls: string[]) => {
      const clean = urls.map((u) => u.trim()).filter(Boolean);
      if (clean.length === 0) return;
      const source = getNode(sourceNodeId);
      if (!source) return;

      const allNodes = getNodes();
      const maxIndex = allNodes.reduce(
        (m, n) => Math.max(m, (n.data?.blockIndex as number) ?? 0),
        0,
      );
      const { nodes: spawned } = buildPreviewOutputNodes(source, clean, maxIndex + 1, allNodes);
      setNodes((prev) => prev.map((n) => ({ ...n, selected: false })));
      addNodes(spawned);
      appendLog(`图像编辑产物 · 创建 ${spawned.length} 个预览模块`);
    },
    [sourceNodeId, getNode, getNodes, addNodes, setNodes, appendLog],
  );
}
