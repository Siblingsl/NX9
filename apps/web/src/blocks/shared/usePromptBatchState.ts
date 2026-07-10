import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  collectUpstreamForPromptMerge,
  mergePromptBatchItems,
  newPromptBatchItem,
  promptItemsToBatch,
  type PromptBatchItem,
  type PromptComposeAction,
  type PromptDispatchMode,
} from '@nx9/shared';

export interface UsePromptBatchStateOptions {
  blockId: string;
  data: Record<string, unknown>;
  updateNode: (patch: Record<string, unknown>) => void;
}

export function usePromptBatchState({ blockId, data, updateNode }: UsePromptBatchStateOptions) {
  const nodes = useNodes();
  const edges = useEdges();
  const syncedRef = useRef('');

  const legacyContent = (data.content as string) ?? '';
  const promptItems = (data.promptItems as PromptBatchItem[] | undefined) ?? [];
  const promptMode = (data.promptMode as PromptDispatchMode) ?? 'batch';
  const globalPrompt = (data.globalPrompt as string) ?? '';
  const composeAction = (data.composeAction as PromptComposeAction) ?? 'generate';

  const items = useMemo(() => {
    if (promptItems.length > 0) return promptItems;
    if (legacyContent.trim()) return [newPromptBatchItem(legacyContent)];
    return [newPromptBatchItem()];
  }, [promptItems, legacyContent]);

  const upstreamCollected = useMemo(() => {
    const flowBlocks = nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'prompt',
      data: (n.data ?? {}) as Record<string, unknown>,
    }));
    const flowLinks = edges
      .filter((e) => e.target === blockId && nodes.some((n) => n.id === e.source))
      .map((e) => ({ source: e.source, target: e.target }));
    const collected = collectUpstreamForPromptMerge(blockId, flowBlocks, flowLinks);
    const hasEffectiveUpstream =
      collected.pictures.length > 0 ||
      collected.texts.length > 0 ||
      collected.items.some((i) => Boolean(i.text?.trim() || i.imageUrl));
    return { ...collected, flowLinks, hasEffectiveUpstream };
  }, [nodes, edges, blockId]);

  /** 有效上游：源节点存在且确有素材或文本输出（空素材导入节点不算） */
  const hasUpstream = upstreamCollected.hasEffectiveUpstream;
  const imageCount = items.filter((i) => i.imageUrl).length;
  const hasAssets = imageCount > 0;
  /** 仅在上游连接且 ≥2 张素材时启用批量配对 UI */
  const useBatchWorkspace = hasUpstream && imageCount >= 2;
  const effectiveMode: PromptDispatchMode = hasAssets ? promptMode : 'batch';
  const effectiveGlobal = hasAssets ? globalPrompt : '';

  const upstreamKey = useMemo(() => {
    const incoming = upstreamCollected.flowLinks
      .map((l) => l.source)
      .sort()
      .join(',');
    const snapshot = incoming
      .split(',')
      .filter(Boolean)
      .map((id) => {
        const n = nodes.find((x) => x.id === id);
        const d = n?.data ?? {};
        return `${id}:${d.assetUrl ?? ''}:${d.content ?? ''}:${JSON.stringify(d.promptItems ?? [])}:${JSON.stringify(d.importItems ?? [])}:${JSON.stringify(d.previewUrls ?? [])}`;
      })
      .join('|');
    return `${incoming}::${snapshot}`;
  }, [nodes, upstreamCollected.flowLinks]);

  const syncFromUpstream = useCallback(
    (baseItems: PromptBatchItem[]) => {
      const { pictures, texts, items: upstreamItems } = upstreamCollected;
      upstreamItems.sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
      const sortedPics = upstreamItems.map((i) => i.imageUrl).filter(Boolean) as string[];
      const sortedTexts = upstreamItems.map((i) => i.text).filter(Boolean);
      const picSource = sortedPics.length > 0 ? sortedPics : pictures;
      const textSource = sortedTexts.length > 0 ? sortedTexts : texts;
      const merged = mergePromptBatchItems(baseItems, picSource, textSource);
      if (picSource.length === 0) {
        return merged.map((row) => ({ ...row, imageUrl: undefined }));
      }
      return merged;
    },
    [upstreamCollected],
  );

  const persistState = useCallback(
    (
      nextItems: PromptBatchItem[],
      patch?: Partial<{
        promptMode: PromptDispatchMode;
        globalPrompt: string;
        composeAction: PromptComposeAction;
      }>,
    ) => {
      const assets = nextItems.some((i) => i.imageUrl);
      const mode = assets ? (patch?.promptMode ?? promptMode) : 'batch';
      const global = assets ? (patch?.globalPrompt ?? globalPrompt) : '';
      const compose = patch?.composeAction ?? composeAction;
      const { jobs } = promptItemsToBatch(nextItems, mode, global, compose);
      updateNode({
        promptItems: nextItems,
        promptMode: mode,
        globalPrompt: global,
        composeAction: compose,
        content: nextItems.map((i) => i.text).filter(Boolean).join('\n\n') || nextItems[0]?.text || '',
        batchCount: jobs.length,
      });
    },
    [composeAction, globalPrompt, promptMode, updateNode],
  );

  useEffect(() => {
    if (!hasUpstream) {
      if (syncedRef.current === upstreamKey) return;
      const hasStaleImages = items.some((i) => i.imageUrl);
      if (!hasStaleImages) {
        syncedRef.current = upstreamKey;
        return;
      }
      const cleared = items.map((i) => ({ ...i, imageUrl: undefined }));
      syncedRef.current = upstreamKey;
      persistState(cleared);
      return;
    }

    if (syncedRef.current === upstreamKey) return;
    const merged = syncFromUpstream(items);
    const changed =
      merged.length !== items.length ||
      merged.some(
        (row, i) => row.imageUrl !== items[i]?.imageUrl || row.text !== items[i]?.text,
      );
    if (!changed) {
      syncedRef.current = upstreamKey;
      return;
    }
    syncedRef.current = upstreamKey;
    persistState(merged);
  }, [upstreamKey, hasUpstream, items, persistState, syncFromUpstream]);

  const updateItem = useCallback(
    (id: string, patch: Partial<PromptBatchItem>) => {
      persistState(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    },
    [items, persistState],
  );

  const addItem = useCallback(() => {
    persistState([...items, newPromptBatchItem()]);
  }, [items, persistState]);

  const removeItem = useCallback(
    (id: string) => {
      const next = items.filter((item) => item.id !== id);
      persistState(next.length > 0 ? next : [newPromptBatchItem()]);
    },
    [items, persistState],
  );

  const handleManualSync = useCallback(() => {
    const merged = syncFromUpstream(items);
    syncedRef.current = upstreamKey;
    persistState(merged);
  }, [items, syncFromUpstream, upstreamKey, persistState]);

  const { jobs } = promptItemsToBatch(items, effectiveMode, effectiveGlobal, composeAction);
  const filledCount = items.filter((i) => i.text.trim()).length;

  const simplePromptText = useMemo(() => {
    const withText = items.find((i) => i.text.trim());
    if (withText?.text) return withText.text;
    if (globalPrompt.trim()) return globalPrompt;
    if (legacyContent.trim()) return legacyContent;
    return items[0]?.text ?? '';
  }, [globalPrompt, items, legacyContent]);

  const setSimplePrompt = useCallback(
    (text: string) => {
      const imageUrl = hasUpstream ? items.find((i) => i.imageUrl)?.imageUrl : undefined;
      const base = items[0] ?? newPromptBatchItem();
      persistState([{ ...base, text, imageUrl: imageUrl ?? (hasUpstream ? base.imageUrl : undefined) }]);
    },
    [hasUpstream, items, persistState],
  );

  return {
    items,
    promptMode,
    globalPrompt,
    composeAction,
    hasUpstream,
    hasAssets,
    imageCount,
    useBatchWorkspace,
    effectiveMode,
    jobs,
    filledCount,
    simplePromptText,
    setSimplePrompt,
    persistState,
    updateItem,
    addItem,
    removeItem,
    handleManualSync,
  };
}

/** 节点内/工作区通用 updateNode 适配器 */
export function usePromptBatchNodeAdapter(blockId: string) {
  const { getNode, updateNodeData } = useReactFlow();
  const node = getNode(blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const updateNode = useCallback(
    (patch: Record<string, unknown>) => updateNodeData(blockId, patch),
    [blockId, updateNodeData],
  );
  return { data, updateNode };
}
