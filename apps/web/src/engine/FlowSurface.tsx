import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  SelectionMode,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  type Viewport,
  type OnConnectEnd,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PERF, validateLink, WORKFLOW_TEMPLATES, lookupBlock } from '@nx9/shared';
import { blockTypes, preloadBlockTypes } from '../blocks/registry';
import { api } from '../api/client';
import { useFlowHistory, type FlowSnapshot } from '../hooks/use-flow-history';
import { debounce, usePerfController } from './perf-controller';
import { runFlowBatch, RUNNABLE_BLOCKS } from './flow-runner';
import { useActivityLog } from '../stores/activity-log';
import { toastError, useToast } from '../stores/toast';
import { useCredentialVault } from '../stores/credential-vault';
import { useFlowCommands } from '../stores/flow-commands';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useStoryboardUi } from '../stores/flow-runtime';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { PLAYBOOK_DEFINITIONS, type PlaybookId } from '@nx9/shared';
import { useExecutionQueue } from '../stores/execution-queue';
import {
  copySelection,
  duplicateNodeWithIncomingEdges,
  getClipboardCount,
  pasteClipboard,
  setPasteAnchorScreen,
} from './flow-clipboard';
import { applyNodeAlignment, type NodeAlignAction } from './node-align';
import { type FlowEdgeTypeId, normalizeFlowEdgeType } from './flow-edge-types';
import { EdgeContextMenu, PaneContextMenu, SelectionContextMenu } from './FlowContextMenu';
import { exactDropPosition, findOpenPosition, relocateNodeGroup } from './spawn-placement';
import { fromPayload as parseFlowPayload, toPayload as buildFlowPayload } from './flow-payload';
import { channelEdgeTypes } from './stage-deck/canvas/ChannelEdge';
import { LaneBackground } from './stage-deck/canvas/LaneBackground';
import { LensMenu } from './stage-deck/canvas/LensMenu';
import { useStageDeckNodeTypes } from './stage-deck/canvas/stage-deck-node-types';
import { CommandPalette, useCommandPaletteHotkey } from './stage-deck/chrome/CommandPalette';
import { useDeckUi } from './stage-deck/stores/deck-ui';
import { useViewMode } from './stage-deck/stores/view-mode';
import { useTakeStore } from './stage-deck/stores/take-store';
import { useAliasStore } from './stage-deck/stores/alias-store';
import {
  importWorkflowZip as parseWorkflowZip,
  mergeImportedWorkflow,
} from './stage-deck/utils/workflow-zip';
import {
  propagateStaleFlags,
  stampInputHashOnSuccess,
} from './stage-deck/utils/dag-stale';
import { isReviewMode } from './stage-deck/modes/review-mode';
import { isProduceMode } from './stage-deck/modes/produce-mode';
import { SmartGuides } from './stage-deck/canvas/SmartGuides';
import { computeSmartSnap } from './stage-deck/utils/smart-guides';
import { applyUpstreamHighlight } from './stage-deck/utils/upstream-graph';
import { openReviewGateSession } from './stage-deck/utils/review-gate-session';
import { useContextRailUi } from './stage-deck/stores/context-rail-ui';
import { runCascadeFromBlock, runDownstreamFromBlock } from './stage-deck/execution/cascade-runner';
import { withPendingTake } from './stage-deck/execution/pending-take';
import {
  applyPrimaryTakeToNodeData,
  extractTakeAsset,
  isTakeEligibleStatus,
} from './stage-deck/utils/take-utils';
import { TakeRail } from './stage-deck/chrome/TakeRail';
import { TakeLightboxHost } from './stage-deck/chrome/CompareLightbox';
import { PlaybookLauncherOverlay } from './stage-deck/chrome/PlaybookLauncherOverlay';
import { CanvasFlowRail } from './stage-deck/chrome/CanvasFlowRail';
import { filterBlocksForWireDrop } from './stage-deck/interaction/wire-drop';
import { computeGroupBounds } from './stage-deck/canvas/SceneGroup';
import { StageDeckInteractionBridge } from './stage-deck/StageDeckInteractionBridge';
import { normalizeDirectorProject } from '@nx9/director3d';
import { useDirector3dUi } from '../stores/director3d-ui';

export interface FlowSurfaceProps {
  workspaceId: string;
  variant?: 'legacy' | 'stage-deck';
}

/** 已完成的模板请求序号（按 templateRequestId 去重，兼容 StrictMode 双跑） */
const sessionHandledTemplateRequestId: { current: number } = { current: 0 };
const inFlightTemplateRequestId: { current: number } = { current: 0 };

async function applyPendingTemplate(
  load: (id: string, mode: 'merge' | 'replace') => Promise<void>,
) {
  const { templateId, templateMode, templateRequestId } = useFlowCommands.getState();
  if (!templateId || templateRequestId === 0) return;
  if (sessionHandledTemplateRequestId.current >= templateRequestId) return;
  if (inFlightTemplateRequestId.current === templateRequestId) return;
  inFlightTemplateRequestId.current = templateRequestId;
  try {
    await load(templateId, templateMode);
    sessionHandledTemplateRequestId.current = templateRequestId;
    useFlowCommands.setState({ templateId: null });
  } finally {
    if (inFlightTemplateRequestId.current === templateRequestId) {
      inFlightTemplateRequestId.current = 0;
    }
  }
}

function FlowFocusBridge({
  bindFocusBlock,
  bindScreenToFlow,
  onHighlightBlock,
}: {
  bindFocusBlock: (fn: (blockId: string) => void) => void;
  bindScreenToFlow: (fn: (screen: { x: number; y: number }) => { x: number; y: number }) => void;
  onHighlightBlock?: (blockId: string) => void;
}) {
  const { fitView, getNode, screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    bindFocusBlock((blockId: string) => {
      onHighlightBlock?.(blockId);
      const node = getNode(blockId);
      if (node) void fitView({ nodes: [node], duration: 300, padding: 0.4 });
    });
    bindScreenToFlow((screen) => screenToFlowPosition(screen));
  }, [fitView, getNode, bindFocusBlock, bindScreenToFlow, screenToFlowPosition, onHighlightBlock]);

  return null;
}

const FlowSurfaceInner = memo(function FlowSurfaceInner({
  workspaceId,
  variant = 'stage-deck',
}: FlowSurfaceProps) {
  const isStageDeck = variant === 'stage-deck';
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [ready, setReady] = useState(false);
  const [recipePickerDismissed, setRecipePickerDismissed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const selectedBlockIdRef = useRef<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const [paneMenu, setPaneMenu] = useState<{ x: number; y: number } | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null);
  const [lensMenu, setLensMenu] = useState<{ x: number; y: number; filterKinds?: string[] } | null>(
    null,
  );
  const [commandOpen, setCommandOpen] = useState(false);
  const [smartGuides, setSmartGuides] = useState<import('./stage-deck/utils/smart-guides').GuideLine[]>([]);
  const [clipboardCount, setClipboardCount] = useState(0);
  const wireDropRef = useRef<{
    sourceNodeId: string;
    sourceHandle: string | null;
    sourceType: string;
    sourceData?: Record<string, unknown>;
  } | null>(null);
  const altShiftDuplicatedRef = useRef<string | null>(null);
  const [pointerOverNode, setPointerOverNode] = useState(false);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const nextIndexRef = useRef(1);
  const skipSaveRef = useRef(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const focusBlockRef = useRef<(blockId: string) => void>(() => {});
  const screenToFlowRef = useRef<(screen: { x: number; y: number }) => { x: number; y: number }>(
    (screen) => screen,
  );
  const cancelRunRef = useRef(false);
  const resumedGateRef = useRef<Set<string>>(new Set());
  const loadWorkflowTemplateRef = useRef<
    (id: string, mode: 'merge' | 'replace') => Promise<void>
  >(async () => {});
  const lastSaveRef = useRef<{
    workspaceId: string;
    nodes: Node[];
    edges: Edge[];
    viewport: Viewport;
    idx: number;
  } | null>(null);
  const exportAliases = useAliasStore((s) => s.exportAliases);
  const hydrateAliases = useAliasStore((s) => s.hydrate);
  const aliasRevision = useAliasStore((s) => s.aliases);
  const openDirector3dForBlock = useDirector3dUi((s) => s.openForBlock);

  const viewMode = useViewMode((s) => s.mode);
  const hydrateViewMode = useViewMode((s) => s.hydrate);
  const setDeckSelection = useDeckUi((s) => s.setSelection);
  const hydrateTakes = useTakeStore((s) => s.hydrate);
  const stageDeckNodeTypes = useStageDeckNodeTypes();

  useCommandPaletteHotkey(() => {
    if (isStageDeck) setCommandOpen(true);
  });

  nodesRef.current = nodes;
  edgesRef.current = edges;
  selectedBlockIdRef.current = selectedBlockId;

  const bindFocusBlock = useCallback((fn: (blockId: string) => void) => {
    focusBlockRef.current = fn;
  }, []);

  const bindScreenToFlow = useCallback(
    (fn: (screen: { x: number; y: number }) => { x: number; y: number }) => {
      screenToFlowRef.current = fn;
    },
    [],
  );

  const appendLog = useActivityLog((s) => s.append);
  const reduceMotion = useCredentialVault((s) => s.settings?.preferences?.reduceMotion ?? false);
  const consumeSpawn = useFlowCommands((s) => s.consumeSpawn);
  const spawnKind = useFlowCommands((s) => s.spawnKind);
  const templateRequestId = useFlowCommands((s) => s.templateRequestId);
  const { push, undo, redo, canUndo, canRedo } = useFlowHistory(PERF.historyDepth);
  const pushRef = useRef(push);
  pushRef.current = push;

  const pushFlowSnapshot = useCallback(
    (snapshotNodes: Node[], snapshotEdges: Edge[]) => {
      push({
        nodes: snapshotNodes,
        edges: snapshotEdges,
        takes: isStageDeck ? structuredClone(useTakeStore.getState().exportTakes()) : undefined,
      });
    },
    [push, isStageDeck],
  );
  const registerRuntime = useFlowRuntime((s) => s.register);
  const unregisterRuntime = useFlowRuntime((s) => s.unregister);
  const setRuntimeSelectedBlockId = useFlowRuntime((s) => s.setSelectedBlockId);
  const syncSelectedBlockId = useCallback(
    (id: string | null) => {
      setSelectedBlockId(id);
      setRuntimeSelectedBlockId(id);
    },
    [setRuntimeSelectedBlockId],
  );
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const selectShot = useStoryboardUi((s) => s.selectShot);
  const requestScrollToShot = useStoryboardUi((s) => s.requestScrollToShot);
  const setStoryboardOpen = useStoryboardUi((s) => s.setOpen);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const voice = useWorkspaceDocument((s) => s.voice);
  const characters = useWorkspaceDocument((s) => s.characters);
  const canvasAppearance = useWorkspaceDocument((s) => s.canvasAppearance);
  const startBatch = useExecutionQueue((s) => s.startBatch);
  const finishBatch = useExecutionQueue((s) => s.finish);
  const reportProgress = useExecutionQueue((s) => s.reportProgress);
  const reportError = useExecutionQueue((s) => s.reportError);
  const cancelBatch = useExecutionQueue((s) => s.cancel);
  const isBatchRunning = useExecutionQueue((s) => s.phase === 'running');

  const perf = usePerfController(nodes, edges, dragging, reduceMotion);
  const effectiveIntensive =
    perf.intensive || (isStageDeck && isProduceMode(viewMode));

  const nodeTypes = useMemo(
    () => (isStageDeck ? stageDeckNodeTypes : blockTypes),
    [isStageDeck, stageDeckNodeTypes],
  );
  const edgeTypes = useMemo(
    () => (isStageDeck ? channelEdgeTypes : undefined),
    [isStageDeck],
  );
  const defaultEdgeOptions = useMemo(
    () => ({
      animated: !effectiveIntensive && !perf.reduceEdgeMotion,
      className: perf.reduceEdgeMotion ? 'nx9-edge-static' : undefined,
    }),
    [effectiveIntensive, perf.reduceEdgeMotion],
  );
  const proOptions = useMemo(() => ({ hideAttribution: true }), []);
  const snapGrid = useMemo(() => [PERF.gridStep, PERF.gridStep] as [number, number], []);

  const persist = useMemo(() => {
    const flushSave = async (
      id: string,
      n: Node[],
      e: Edge[],
      vp: Viewport,
      idx: number,
    ) => {
      lastSaveRef.current = { workspaceId: id, nodes: n, edges: e, viewport: vp, idx };
      try {
        await api.saveWorkspace(id, buildFlowPayload(n, e, vp, idx, isStageDeck ? {
          version: 3,
          aliases: exportAliases(),
          viewMode: useViewMode.getState().mode,
          takes: useTakeStore.getState().takes,
        } : { version: 2 }));
        lastSaveRef.current = null;
        useToast.getState().dismiss('workspace-save-error');
      } catch (err) {
        appendLog(`保存失败: ${String(err)}`);
        toastError('工作区保存失败，请检查网络或后端服务', {
          label: '重试',
          onClick: () => {
            const pending = lastSaveRef.current;
            if (pending) {
              void flushSave(
                pending.workspaceId,
                pending.nodes,
                pending.edges,
                pending.viewport,
                pending.idx,
              );
            }
          },
        });
      }
    };
    return debounce((id: string, n: Node[], e: Edge[], vp: Viewport, idx: number) => {
      void flushSave(id, n, e, vp, idx);
    }, PERF.saveDebounceMs);
  }, [appendLog, isStageDeck, exportAliases]);

  useEffect(() => {
    let cancelled = false;

    setReady(false);
    setRecipePickerDismissed(false);
    syncSelectedBlockId(null);
    skipSaveRef.current = true;
    useWorkspaceDocument.getState().reset();

    void (async () => {
      try {
        const payload = await api.loadWorkspace(workspaceId);
        if (cancelled) return;
        const parsed = parseFlowPayload(payload, { channelEdges: isStageDeck });
        setNodes(parsed.nodes);
        setEdges(parsed.edges);
        viewportRef.current = parsed.viewport;
        nextIndexRef.current = parsed.nextBlockIndex;
        if (isStageDeck) {
          hydrateAliases(parsed.v3.aliases);
          hydrateViewMode(parsed.v3.viewMode);
          hydrateTakes(parsed.v3.takes);
        }
        useWorkspaceDocument.getState().hydrate(workspaceId, payload);
        pushRef.current({
          nodes: parsed.nodes,
          edges: parsed.edges,
          takes: isStageDeck ? parsed.v3.takes : undefined,
        });
        setReady(true);

        await applyPendingTemplate((id, mode) => loadWorkflowTemplateRef.current(id, mode));
      } finally {
        if (!cancelled) {
          setTimeout(() => {
            skipSaveRef.current = false;
          }, 100);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, setNodes, setEdges, isStageDeck, hydrateViewMode, hydrateTakes, hydrateAliases]);

  useEffect(() => {
    if (!ready || !spawnKind) return;
    const pending = consumeSpawn();
    if (!pending) return;
    const id = `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const shot = pending.shotId
      ? useWorkspaceDocument.getState().storyboard.shots.find((s) => s.id === pending.shotId)
      : undefined;
    pushFlowSnapshot(nodes, edges);
    const at =
      pending.exact && pending.at
        ? exactDropPosition(pending.at)
        : findOpenPosition(nodes, pending.at ? { preferred: pending.at } : {});
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: pending.kind,
        position: at,
        data: {
          blockIndex: nextIndexRef.current++,
          status: 'idle',
          linkedShotId: pending.shotId ?? undefined,
          content: shot?.promptEn || shot?.descriptionZh || '',
          ...(pending.data ?? {}),
        },
      },
    ]);
    if (pending.shotId) {
      updateShot(pending.shotId, { linkedBlockId: id });
      selectShot(pending.shotId);
      setStoryboardOpen(true);
    }
    appendLog(`添加模块: ${pending.kind}${shot ? ` · 镜头 #${shot.index}` : ''}`);
  }, [spawnKind, ready, consumeSpawn, nodes, edges, push, setNodes, appendLog, updateShot, selectShot, setStoryboardOpen]);

  const loadWorkflowTemplate = useCallback(
    async (id: string, mode: 'merge' | 'replace' = 'merge') => {
      const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === id);
      if (!tpl) return;
      skipSaveRef.current = true;
      const built = tpl.build();
      await preloadBlockTypes(built.blocks.map((b) => b.type));
      pushRef.current({ nodes: nodesRef.current, edges: edgesRef.current });
      const flowNodes: Node[] = built.blocks.map((b) => ({
        id: b.id,
        type: b.type,
        position: b.position,
        data: b.data,
        width: b.width,
        height: b.height,
      }));
      const flowEdges: Edge[] = built.links.map((l) => ({
        id: l.id,
        source: l.source,
        target: l.target,
        sourceHandle: l.sourceHandle ?? undefined,
        targetHandle: l.targetHandle ?? undefined,
        type: l.edgeType && l.edgeType !== 'default' ? l.edgeType : undefined,
      }));
      if (mode === 'replace') {
        setNodes(flowNodes);
        setEdges(flowEdges);
      } else {
        const placed = relocateNodeGroup(flowNodes, nodesRef.current);
        setNodes((nds) => [...nds, ...placed]);
        setEdges((eds) => [...eds, ...flowEdges]);
      }
      appendLog(`已加载工作流模板：${tpl.label}`);
      setTimeout(() => {
        skipSaveRef.current = false;
      }, 100);
    },
    [setNodes, setEdges, appendLog],
  );

  loadWorkflowTemplateRef.current = loadWorkflowTemplate;

  const importWorkflowZipRef = useRef<
    (file: File, mode?: 'merge' | 'replace') => Promise<void>
  >(async () => {});

  const importWorkflowZip = useCallback(
    async (file: File, mode: 'merge' | 'replace' = 'merge') => {
      const imported = await parseWorkflowZip(file);
      skipSaveRef.current = true;
      pushFlowSnapshot(nodesRef.current, edgesRef.current);

      if (mode === 'replace') {
        setNodes(imported.nodes);
        setEdges(imported.edges);
        hydrateAliases(imported.aliases);
        hydrateTakes(imported.takes);
        if (imported.viewMode) hydrateViewMode(imported.viewMode);
        appendLog('已替换画布（ZIP 导入）');
      } else {
        const merged = mergeImportedWorkflow(
          nodesRef.current,
          edgesRef.current,
          imported,
        );
        setNodes((prev) => [
          ...prev.map((n) => ({ ...n, selected: false })),
          ...merged.nodes,
        ]);
        setEdges((prev) => [...prev, ...merged.edges]);
        useAliasStore.setState((s) => ({
          aliases: { ...s.aliases, ...merged.aliases },
        }));
        hydrateTakes([...useTakeStore.getState().exportTakes(), ...merged.takes]);
        appendLog(`已追加 ${merged.nodes.length} 个模块（ZIP 导入）`);
      }

      setTimeout(() => {
        skipSaveRef.current = false;
      }, 100);
    },
    [
      pushFlowSnapshot,
      setNodes,
      setEdges,
      hydrateAliases,
      hydrateTakes,
      hydrateViewMode,
      appendLog,
    ],
  );
  importWorkflowZipRef.current = importWorkflowZip;

  useEffect(() => {
    if (!ready || templateRequestId === 0) return;
    void applyPendingTemplate(loadWorkflowTemplate);
  }, [templateRequestId, ready, loadWorkflowTemplate]);

  useEffect(() => {
    if (!ready || skipSaveRef.current) return;
    persist(workspaceId, nodes, edges, viewportRef.current, nextIndexRef.current);
  }, [nodes, edges, storyboard, voice, characters, workspaceId, persist, ready, aliasRevision]);

  const staleFingerprint = useMemo(
    () =>
      isStageDeck
        ? nodes
            .map(
              (n) =>
                `${n.id}:${String(n.data?.content ?? '')}:${String(n.data?.previewUrl ?? '')}:${String(n.data?.videoUrl ?? '')}`,
            )
            .join('|')
        : '',
    [nodes, isStageDeck],
  );

  useEffect(() => {
    if (!isStageDeck || !ready) return;
    setNodes((nds) => propagateStaleFlags(nds, edgesRef.current));
  }, [staleFingerprint, edges, isStageDeck, ready, setNodes]);

  const applySnapshot = useCallback(
    (snapshot: FlowSnapshot | null) => {
      if (!snapshot) return;
      skipSaveRef.current = true;
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      if (isStageDeck && snapshot.takes !== undefined) {
        hydrateTakes(snapshot.takes);
      }
      setTimeout(() => {
        skipSaveRef.current = false;
      }, 100);
    },
    [setNodes, setEdges, isStageDeck, hydrateTakes],
  );

  const handleUndo = useCallback(() => {
    applySnapshot(undo());
    appendLog('撤销');
  }, [undo, applySnapshot, appendLog]);

  const handleRedo = useCallback(() => {
    applySnapshot(redo());
    appendLog('重做');
  }, [redo, applySnapshot, appendLog]);

  const updateNodeDataStable = useCallback(
    (id: string, data: Record<string, unknown>) => {
      const patch = isStageDeck ? withPendingTake(data) : data;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          let merged = { ...n.data, ...patch } as Record<string, unknown>;
          if (isStageDeck) {
            merged = stampInputHashOnSuccess(id, nds, edgesRef.current, merged);
          }
          if (isStageDeck && isTakeEligibleStatus(merged.status)) {
            const asset = extractTakeAsset(merged);
            const prevAsset = extractTakeAsset(n.data as Record<string, unknown>);
            if (asset.assetUrl && asset.assetUrl !== prevAsset.assetUrl) {
              const take = useTakeStore.getState().appendTake(
                id,
                asset.assetUrl,
                asset.thumbUrl,
                asset.mediaKind ? { mediaKind: asset.mediaKind } : undefined,
              );
              if (take.picked) {
                merged = { ...merged, ...applyPrimaryTakeToNodeData(take) };
              }
            }
          }
          return { ...n, data: merged };
        }),
      );
    },
    [setNodes, isStageDeck],
  );

  const handlePickTake = useCallback(
    (takeId: string, after?: () => void) => {
      pushFlowSnapshot(nodesRef.current, edgesRef.current);
      useTakeStore.getState().pickTake(takeId, { updateNodeData: updateNodeDataStable });
      after?.();
      appendLog('已设为主 Take');
    },
    [pushFlowSnapshot, updateNodeDataStable, appendLog],
  );

  const highlightBlock = useCallback(
    (blockId: string, opts?: { keepMode?: boolean }) => {
      const until = Date.now() + 3000;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === blockId ? { ...n, data: { ...n.data, highlightUntil: until } } : n,
        ),
      );
      if (!opts?.keepMode) {
        useViewMode.getState().setMode('explore');
      }
    },
    [setNodes],
  );

  const runBatchInternal = useCallback(
    async (onlyIds?: Set<string>, label = '画布批量运行') => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      let taskId: string | null = null;
      cancelRunRef.current = false;
      try {
        const task = await api.createTask('batch', label);
        taskId = task.id;
      } catch {
        /* task queue optional */
      }
      const runnableIds = onlyIds
        ? [...onlyIds].filter((id) => {
            const n = currentNodes.find((node) => node.id === id);
            return n?.type && RUNNABLE_BLOCKS.has(n.type);
          })
        : currentNodes.filter((n) => n.type && RUNNABLE_BLOCKS.has(n.type)).map((n) => n.id);
      startBatch(runnableIds, taskId);
      appendLog(onlyIds ? '运行选中模块' : '批量运行开始');

      const reportTask = async (patch: {
        progress?: number;
        status?: string;
        message?: string;
      }) => {
        if (!taskId) return;
        try {
          await api.updateTask(taskId, patch);
        } catch {
          /* ignore */
        }
      };

      await runFlowBatch(
        currentNodes,
        currentEdges,
        updateNodeDataStable,
        (p) => {
          if (p.phase === 'running') {
            const node = p.currentId
              ? currentNodes.find((n) => n.id === p.currentId)
              : undefined;
            const label = node?.type ? lookupBlock(node.type)?.label ?? node.type : undefined;
            reportProgress({
              done: p.current,
              total: p.total,
              currentBlockId: p.currentId ?? null,
              currentLabel: label ?? null,
            });
            if (p.currentId) {
              void reportTask({
                progress: p.total ? Math.round((p.current / p.total) * 100) : 0,
                status: 'running',
                message: label ? `执行 · ${label}` : `执行模块 ${p.current + 1}/${p.total}`,
              });
            }
          }
          if (p.phase === 'done') {
            appendLog(`批量运行完成 (${p.total} 模块)`);
            void reportTask({ progress: 100, status: 'done', message: '批量运行完成' });
          }
          if (p.phase === 'error') {
            appendLog(`批量运行中断: ${p.error ?? ''}`);
            reportError(p.error ?? '运行失败');
            void reportTask({ status: 'failed', message: p.error });
          }
          if (p.phase === 'blocked') {
            appendLog(`审阅关卡阻塞 · 待审镜头 ${(p.pendingShots ?? []).join(', ')}`);
            reportError(p.error ?? '审阅关卡阻塞');
            void reportTask({ status: 'blocked', message: p.error });
            openReviewGateSession(p.pendingShots);
            if (p.currentId) highlightBlock(p.currentId, { keepMode: true });
          }
        },
        { get cancelled() { return cancelRunRef.current; } },
        onlyIds,
      );
      finishBatch();
    },
    [startBatch, finishBatch, reportProgress, reportError, updateNodeDataStable, appendLog, highlightBlock],
  );

  const runBatch = useCallback(() => runBatchInternal(), [runBatchInternal]);

  const runSelected = useCallback(
    (ids: string[]) => {
      void runBatchInternal(new Set(ids), '运行选中模块');
    },
    [runBatchInternal],
  );

  const runCascade = useCallback(
    async (blockId: string) => {
      cancelRunRef.current = false;
      appendLog('Cascade 级联运行开始');
      try {
        await runCascadeFromBlock({
          blockId,
          nodes: nodesRef.current,
          edges: edgesRef.current,
          getNodes: () => nodesRef.current,
          setEdges,
          updateNodeData: updateNodeDataStable,
          signal: { get cancelled() { return cancelRunRef.current; } },
          onProgress: (p) => {
            if (p.phase === 'blocked') {
              appendLog(`Cascade 审阅阻塞 · 待审 ${(p.pendingShots ?? []).join(', ')}`);
              openReviewGateSession(p.pendingShots);
              if (p.currentId) highlightBlock(p.currentId, { keepMode: true });
            }
          },
        });
        appendLog('Cascade 级联运行完成');
      } catch (e) {
        appendLog(`Cascade 中断: ${String(e)}`);
      }
    },
    [setEdges, updateNodeDataStable, appendLog, highlightBlock],
  );

  const runSelectedDownstream = useCallback(
    async (ids: string[]) => {
      cancelRunRef.current = false;
      appendLog('重跑下游链开始');
      for (const id of ids) {
        await runDownstreamFromBlock({
          blockId: id,
          nodes: nodesRef.current,
          edges: edgesRef.current,
          getNodes: () => nodesRef.current,
          setEdges,
          updateNodeData: updateNodeDataStable,
          signal: { get cancelled() { return cancelRunRef.current; } },
          onProgress: (p) => {
            if (p.phase === 'blocked') {
              appendLog(`下游链审阅阻塞 · ${(p.pendingShots ?? []).join(', ')}`);
              openReviewGateSession(p.pendingShots);
            }
          },
        });
      }
      appendLog('重跑下游链完成');
    },
    [setEdges, updateNodeDataStable, appendLog, openReviewGateSession],
  );

  useEffect(() => {
    if (!isStageDeck || !ready) return;
    const gate = nodes.find(
      (n) => n.type === 'review-gate' && n.data?.status === 'blocked',
    );
    const setBanner = useContextRailUi.getState().setBanner;
    if (gate) {
      const pending = (gate.data?.pendingShots as number[] | undefined) ?? [];
      setBanner({ kind: 'blocked', shotIds: pending.map(String) });
    } else if (useContextRailUi.getState().banner?.kind === 'blocked') {
      setBanner(null);
    }
  }, [nodes, isStageDeck, ready]);

  useEffect(() => {
    if (!isStageDeck || !ready) return;
    const gates = nodesRef.current.filter(
      (n) => n.type === 'review-gate' && n.data?.status === 'blocked',
    );
    for (const gate of gates) {
      const pending = (gate.data?.pendingShots as number[] | undefined) ?? [];
      if (pending.length === 0) continue;
      const allApproved = pending.every((idx) => {
        const shot = useWorkspaceDocument.getState().storyboard.shots.find((s) => s.index === idx);
        return shot?.status === 'approved';
      });
      if (allApproved) {
        if (!resumedGateRef.current.has(gate.id)) {
          resumedGateRef.current.add(gate.id);
          appendLog(`审阅关卡通过 · 自动续跑 Cascade · ${gate.id}`);
          void runCascade(gate.id);
        }
      } else {
        resumedGateRef.current.delete(gate.id);
      }
    }
  }, [storyboard, isStageDeck, ready, runCascade, appendLog]);

  const stopRun = useCallback(() => {
    cancelRunRef.current = true;
    cancelBatch();
    appendLog('已请求停止运行');
  }, [cancelBatch, appendLog]);

  const spawnBlockForShot = useCallback(
    (shotId: string, kind: string, extraData?: Record<string, unknown>) => {
      useFlowCommands.getState().requestSpawnForShot(shotId, kind, undefined, extraData);
    },
    [],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[] }) => {
      const id = selected.length === 1 ? selected[0].id : null;
      syncSelectedBlockId(id);
      if (isStageDeck) {
        if (!id) {
          setDeckSelection(null, false);
        } else {
          setDeckSelection(id, false);
        }
      }
      if (!id) return;
      const node = selected[0];
      const linkedShot = storyboard.shots.find(
        (s) => s.linkedBlockId === id || s.id === (node.data?.linkedShotId as string),
      );
      if (linkedShot) {
        selectShot(linkedShot.id);
        setStoryboardOpen(true);
        requestScrollToShot(linkedShot.id);
      } else if (node.type === 'director-desk') {
        const shotId = node.data?.linkedShotId as string | undefined;
        if (shotId) {
          selectShot(shotId);
          setStoryboardOpen(true);
          requestScrollToShot(shotId);
        }
      }
    },
    [
      storyboard.shots,
      selectShot,
      setStoryboardOpen,
      requestScrollToShot,
      isStageDeck,
      setDeckSelection,
      syncSelectedBlockId,
    ],
  );

  useEffect(() => {
    if (!isStageDeck || !ready) return;
    const highlighted = applyUpstreamHighlight(
      selectedBlockId,
      nodesRef.current,
      edgesRef.current,
    );
    const prevNodeById = new Map(nodesRef.current.map((n) => [n.id, n]));
    const nodesNeedUpdate = highlighted.nodes.some((n) => n !== prevNodeById.get(n.id));
    const prevEdgeById = new Map(edgesRef.current.map((e) => [e.id, e]));
    const edgesNeedUpdate = highlighted.edges.some((e) => e !== prevEdgeById.get(e.id));

    if (nodesNeedUpdate) {
      const nextNodeById = new Map(highlighted.nodes.map((n) => [n.id, n]));
      setNodes((prev) =>
        prev.map((n) => {
          const next = nextNodeById.get(n.id);
          if (!next || next === n) return n;
          return { ...n, data: next.data };
        }),
      );
    }
    if (edgesNeedUpdate) {
      const nextEdgeById = new Map(highlighted.edges.map((e) => [e.id, e]));
      setEdges((prev) =>
        prev.map((e) => {
          const next = nextEdgeById.get(e.id);
          if (!next || next === e) return e;
          return { ...e, data: next.data };
        }),
      );
    }
  }, [selectedBlockId, isStageDeck, ready, setNodes, setEdges]);

  const closeMenus = useCallback(() => {
    setContextMenu(null);
    setPaneMenu(null);
    setEdgeMenu(null);
  }, []);

  const openNodeContextMenuAt = useCallback((clientX: number, clientY: number, nodeId: string) => {
    const currentNodes = nodesRef.current;
    let ids: string[];
    const currentSelected = currentNodes.filter((n) => n.selected).map((n) => n.id);
    if (currentSelected.includes(nodeId) && currentSelected.length > 1) {
      ids = currentSelected;
    } else {
      setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === nodeId })));
      ids = [nodeId];
    }
    setPasteAnchorScreen({ x: clientX, y: clientY });
    setPaneMenu(null);
    setContextMenu({ x: clientX, y: clientY, ids });
  }, [setNodes]);

  const onNodeContextMenu = useCallback(
    (e: ReactMouseEvent, node: Node) => {
      e.preventDefault();
      openNodeContextMenuAt(e.clientX, e.clientY, node.id);
    },
    [openNodeContextMenuAt],
  );

  const onSelectionContextMenu = useCallback((e: ReactMouseEvent, sels: Node[]) => {
    e.preventDefault();
    const ids = sels.map((n) => n.id);
    if (ids.length === 0) return;
    setPasteAnchorScreen({ x: e.clientX, y: e.clientY });
    setPaneMenu(null);
    setContextMenu({ x: e.clientX, y: e.clientY, ids });
  }, []);

  const onPaneContextMenu = useCallback((e: ReactMouseEvent | MouseEvent) => {
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;
    setPasteAnchorScreen({ x, y });
    setContextMenu(null);
    setEdgeMenu(null);
    setPaneMenu({ x, y });
  }, []);

  const onCanvasContextMenuCapture = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target) return;
      if (target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      const nodeEl = target.closest('.react-flow__node') as HTMLElement | null;
      const nodeId = nodeEl?.getAttribute('data-id') || '';
      if (!nodeId || !nodesRef.current.some((n) => n.id === nodeId)) return;
      e.preventDefault();
      e.stopPropagation();
      openNodeContextMenuAt(e.clientX, e.clientY, nodeId);
    },
    [openNodeContextMenuAt],
  );

  const handleCopy = useCallback(() => {
    const copied = copySelection(nodesRef.current, edgesRef.current);
    if (copied) {
      setClipboardCount(copied.nodes.length);
      appendLog(`已复制 ${copied.nodes.length} 个模块`);
    }
  }, [appendLog]);

  const handlePaste = useCallback(
    (mode: 'pointer' | 'offset' = 'pointer') => {
      const result = pasteClipboard(nodesRef.current, screenToFlowRef.current, mode);
      if (!result) return;
      pushFlowSnapshot(nodesRef.current, edgesRef.current);
      setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), ...result.nodes]);
      setEdges((prev) => [...prev, ...result.edges]);
      nextIndexRef.current += result.nodes.length;
      appendLog(`已粘贴 ${result.nodes.length} 个模块`);
    },
    [push, setNodes, setEdges, appendLog],
  );

  const handleDuplicate = useCallback(() => {
    handleCopy();
    setTimeout(() => handlePaste('offset'), 0);
  }, [handleCopy, handlePaste]);

  const handleDeleteSelected = useCallback(
    (ids?: string[]) => {
      const removeIds = new Set(
        ids ?? nodesRef.current.filter((n) => n.selected).map((n) => n.id),
      );
      if (removeIds.size === 0) return;
      pushFlowSnapshot(nodesRef.current, edgesRef.current);
      setNodes((prev) => prev.filter((n) => !removeIds.has(n.id)));
      setEdges((prev) => prev.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)));
      for (const shot of useWorkspaceDocument.getState().storyboard.shots) {
        if (shot.linkedBlockId && removeIds.has(shot.linkedBlockId)) {
          useWorkspaceDocument.getState().updateShot(shot.id, { linkedBlockId: undefined });
        }
      }
      appendLog(`已删除 ${removeIds.size} 个模块`);
    },
    [push, setNodes, setEdges, appendLog],
  );

  const handleDeleteEdges = useCallback(
    (ids?: string[]) => {
      const removeIds = new Set(
        ids ?? edgesRef.current.filter((e) => e.selected).map((e) => e.id),
      );
      if (removeIds.size === 0) return;
      pushFlowSnapshot(nodesRef.current, edgesRef.current);
      setEdges((prev) => prev.filter((e) => !removeIds.has(e.id)));
      appendLog(`已删除 ${removeIds.size} 条连接线`);
    },
    [push, setEdges, appendLog],
  );

  const handleChangeEdgeType = useCallback(
    (edgeId: string, edgeType: FlowEdgeTypeId) => {
      const current = edgesRef.current.find((e) => e.id === edgeId);
      if (!current) return;
      const nextType = edgeType === 'default' ? undefined : edgeType;
      const currentPath =
        current.type === 'channel'
          ? (current.data?.pathType as string | undefined) ?? 'default'
          : current.type ?? 'default';
      if (currentPath === (nextType ?? 'default')) return;
      pushFlowSnapshot(nodesRef.current, edgesRef.current);
      setEdges((prev) =>
        prev.map((e) => {
          if (e.id !== edgeId) return e;
          if (isStageDeck) {
            return {
              ...e,
              type: 'channel',
              data: { ...e.data, pathType: edgeType },
              selected: true,
            };
          }
          return { ...e, type: nextType, selected: true };
        }),
      );
      appendLog(`连接线类型已切换`);
    },
    [push, setEdges, appendLog, isStageDeck],
  );

  const handleAlignSelection = useCallback(
    (action: NodeAlignAction, ids: string[]) => {
      const result = applyNodeAlignment(nodesRef.current, ids, action, {
        grid: [PERF.gridStep, PERF.gridStep],
        edges: edgesRef.current,
      });
      if (!result.changed) return;
      pushFlowSnapshot(nodesRef.current, edgesRef.current);
      setNodes(result.nodes);
      appendLog('已整理选中模块');
    },
    [push, setNodes, appendLog],
  );

  const handleFocusStoryboard = useCallback(
    (ids: string[]) => {
      const selNodes = nodesRef.current.filter((n) => ids.includes(n.id));
      setStoryboardOpen(true);
      for (const node of selNodes) {
        const shotId = node.data?.linkedShotId as string | undefined;
        const linked = storyboard.shots.find(
          (s) => s.id === shotId || s.linkedBlockId === node.id,
        );
        if (linked) {
          selectShot(linked.id);
          return;
        }
      }
      appendLog('打开故事板');
    },
    [storyboard.shots, selectShot, setStoryboardOpen, appendLog],
  );

  const handleAddBlockAtPane = useCallback((kind: string) => {
    if (!paneMenu) return;
    const at = screenToFlowRef.current({ x: paneMenu.x, y: paneMenu.y });
    useFlowCommands.getState().requestSpawn(kind, at);
  }, [paneMenu]);

  const handleCreateSceneGroup = useCallback(() => {
    const selected = nodesRef.current.filter(
      (n) => n.selected && n.type !== 'scene-group' && !n.parentId,
    );
    if (selected.length < 2) {
      appendLog('请框选至少 2 个模块后成组');
      return;
    }
    pushFlowSnapshot(nodesRef.current, edgesRef.current);
    const bounds = computeGroupBounds(selected);
    const groupId = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const selectedIds = new Set(selected.map((n) => n.id));
    setNodes((prev) => {
      const groupNode: Node = {
        id: groupId,
        type: 'scene-group',
        position: { x: bounds.x, y: bounds.y },
        data: { label: '场景组', width: bounds.width, height: bounds.height },
        style: { width: bounds.width, height: bounds.height, zIndex: -1 },
        selectable: true,
        draggable: true,
      };
      return [
        ...prev.map((n) => {
          if (!selectedIds.has(n.id)) return { ...n, selected: false };
          return {
            ...n,
            parentId: groupId,
            extent: 'parent' as const,
            position: {
              x: n.position.x - bounds.x,
              y: n.position.y - bounds.y,
            },
            selected: false,
          };
        }),
        groupNode,
      ];
    });
    appendLog(`已创建场景组（${selected.length} 个模块）`);
  }, [push, setNodes, appendLog]);

  const getNodeCenterPositions = useCallback(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const n of nodesRef.current) {
      const w = n.width ?? 220;
      const h = n.height ?? 160;
      map.set(n.id, { x: n.position.x + w / 2, y: n.position.y + h / 2 });
    }
    return map;
  }, []);

  const selectedCount = useMemo(
    () => nodes.filter((n) => n.selected).length,
    [nodes],
  );

  const deleteNodes = useCallback(
    (ids: string[]) => handleDeleteSelected(ids),
    [handleDeleteSelected],
  );

  const canUndoRef = useRef(canUndo);
  const canRedoRef = useRef(canRedo);
  const effectiveIntensiveRef = useRef(effectiveIntensive);
  const isStageDeckRef = useRef(isStageDeck);
  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);
  const runBatchRef = useRef(runBatch);
  const runSelectedRef = useRef(runSelected);
  const runCascadeRef = useRef(runCascade);
  const stopRunRef = useRef(stopRun);
  const deleteNodesRef = useRef(deleteNodes);
  const spawnBlockForShotRef = useRef(spawnBlockForShot);

  canUndoRef.current = canUndo;
  canRedoRef.current = canRedo;
  effectiveIntensiveRef.current = effectiveIntensive;
  isStageDeckRef.current = isStageDeck;
  handleUndoRef.current = handleUndo;
  handleRedoRef.current = handleRedo;
  runBatchRef.current = runBatch;
  runSelectedRef.current = runSelected;
  runCascadeRef.current = runCascade;
  stopRunRef.current = stopRun;
  deleteNodesRef.current = deleteNodes;
  spawnBlockForShotRef.current = spawnBlockForShot;

  const { fitView } = useReactFlow();

  const fitViewToNodes = useCallback((nodeIds: string[]) => {
    const nodeList = nodeIds
      .map((id) => nodesRef.current.find((n) => n.id === id))
      .filter((n): n is Node => !!n);
    if (nodeList.length === 0) return;
    void fitView({ nodes: nodeList, duration: 300, padding: 0.4 });
  }, [fitView]);

  const highlightNodes = useCallback((nodeIds: string[], opts?: { durationMs?: number }) => {
    const durationMs = opts?.durationMs ?? 1200;
    const until = Date.now() + durationMs;
    const idSet = new Set(nodeIds);
    setNodes((nds) =>
      nds.map((n) =>
        idSet.has(n.id) ? { ...n, data: { ...n.data, highlightUntil: until } } : n,
      ),
    );
    setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) =>
          idSet.has(n.id) && n.data?.highlightUntil
            ? { ...n, data: { ...n.data, highlightUntil: undefined } }
            : n,
        ),
      );
    }, durationMs + 50);
  }, [setNodes]);

  useEffect(() => {
    if (!ready) return;
    registerRuntime({
      getNodes: () => nodesRef.current,
      getEdges: () => edgesRef.current,
      getViewport: () => viewportRef.current,
      setNodes,
      setEdges,
      updateNodeData: updateNodeDataStable,
      undo: () => handleUndoRef.current(),
      redo: () => handleRedoRef.current(),
      get canUndo() {
        return canUndoRef.current;
      },
      get canRedo() {
        return canRedoRef.current;
      },
      get intensive() {
        return effectiveIntensiveRef.current;
      },
      runBatch: () => Promise.resolve(runBatchRef.current ? runBatchRef.current() : undefined),
      runSelected: (ids) => void runSelectedRef.current(ids),
      get runCascade() {
        return isStageDeckRef.current
          ? (blockId: string) => void runCascadeRef.current(blockId)
          : undefined;
      },
      stopRun: () => stopRunRef.current(),
      deleteNodes: (ids) => deleteNodesRef.current(ids),
      focusBlock: (blockId) => focusBlockRef.current(blockId),
      fitViewToNodes,
      highlightNodes,
      spawnBlockForShot: (shotId, kind, extraData) =>
        spawnBlockForShotRef.current(shotId, kind, extraData),
      loadWorkflowTemplate: (id, mode) => loadWorkflowTemplateRef.current(id, mode ?? 'merge'),
      importWorkflowZip: (file, mode) => importWorkflowZipRef.current(file, mode),
      get selectedBlockId() {
        return selectedBlockIdRef.current;
      },
    });
    return () => unregisterRuntime();
  }, [ready, registerRuntime, unregisterRuntime, setNodes, setEdges, updateNodeDataStable, fitViewToNodes, highlightNodes]);

  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setNodes((prev) => prev.map((n) => ({ ...n, selected: true })));
        syncSelectedBlockId(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
      if (e.key === 'b' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        void import('../stores/flow-runtime').then(({ useStoryboardUi }) => {
          useStoryboardUi.getState().toggle();
        });
      }
      if (isStageDeck && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g' && !e.shiftKey) {
        e.preventDefault();
        handleCreateSceneGroup();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopy();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        handlePaste('pointer');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        handleDuplicate();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const selectedEdgeIds = edgesRef.current.filter((edge) => edge.selected).map((edge) => edge.id);
        if (selectedEdgeIds.length > 0) {
          handleDeleteEdges(selectedEdgeIds);
        } else {
          handleDeleteSelected();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, handleUndo, handleRedo, handleCopy, handlePaste, handleDuplicate, handleDeleteSelected, handleDeleteEdges, setNodes, isStageDeck, handleCreateSceneGroup]);

  const isValidConnection = useCallback(
    (conn: Edge | Connection) => {
      const source = nodes.find((n) => n.id === conn.source);
      const target = nodes.find((n) => n.id === conn.target);
      if (!source || !target) return false;
      return validateLink(
        source.type ?? '',
        target.type ?? '',
        source.data as Record<string, unknown>,
      );
    },
    [nodes],
  );

  const onConnect: OnConnect = useCallback(
    (conn) => {
      pushFlowSnapshot(nodes, edges);
      setEdges((eds) =>
        addEdge(
          {
            ...conn,
            id: `link-${Date.now()}`,
            ...(isStageDeck
              ? { type: 'channel', data: { pathType: 'default' } }
              : {}),
          },
          eds,
        ),
      );
    },
    [edges, nodes, push, setEdges, isStageDeck],
  );

  const onMoveEnd = useCallback((_evt: unknown, viewport: Viewport) => {
    viewportRef.current = viewport;
  }, []);

  const onNodeDragStart: OnNodeDrag = useCallback(
    (event, node) => {
      setDragging(true);
      if (!isStageDeck) return;
      if (event.altKey && event.shiftKey && altShiftDuplicatedRef.current !== node.id) {
        altShiftDuplicatedRef.current = node.id;
        const result = duplicateNodeWithIncomingEdges(
          node.id,
          nodesRef.current,
          edgesRef.current,
          nextIndexRef.current,
        );
        if (result) {
          pushFlowSnapshot(nodesRef.current, edgesRef.current);
          nextIndexRef.current += 1;
          setNodes((prev) => [...prev, ...result.nodes.slice(1)]);
          setEdges((prev) => [...prev, ...result.edges]);
          appendLog('Alt+Shift 复制（保留入边）');
        }
      }
    },
    [isStageDeck, push, setNodes, setEdges, appendLog],
  );

  const onNodeDrag: OnNodeDrag = useCallback(
    (_event, node) => {
      if (!isStageDeck) return;
      const others = nodesRef.current.filter((n) => n.id !== node.id && !n.parentId);
      const snap = computeSmartSnap(node, others);
      setSmartGuides(snap.guides);
      if (snap.guides.length > 0 && (snap.x !== node.position.x || snap.y !== node.position.y)) {
        setNodes((nds) =>
          nds.map((n) => (n.id === node.id ? { ...n, position: { x: snap.x, y: snap.y } } : n)),
        );
      }
    },
    [isStageDeck, setNodes],
  );

  const onNodeDragStop = useCallback(() => {
    setDragging(false);
    altShiftDuplicatedRef.current = null;
    setSmartGuides([]);
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      if (!isStageDeck || connectionState.isValid) return;
      const fromNode = connectionState.fromNode;
      if (!fromNode?.id || !fromNode.type) return;
      const clientX = 'clientX' in event ? event.clientX : event.changedTouches[0]?.clientX ?? 0;
      const clientY = 'clientY' in event ? event.clientY : event.changedTouches[0]?.clientY ?? 0;
      const kinds = filterBlocksForWireDrop({
        x: clientX,
        y: clientY,
        sourceNodeId: fromNode.id,
        sourceHandle: connectionState.fromHandle?.id ?? null,
        sourceType: fromNode.type,
        sourceData: fromNode.data as Record<string, unknown>,
      });
      if (kinds.length === 0) return;
      wireDropRef.current = {
        sourceNodeId: fromNode.id,
        sourceHandle: connectionState.fromHandle?.id ?? null,
        sourceType: fromNode.type,
        sourceData: fromNode.data as Record<string, unknown>,
      };
      setLensMenu({ x: clientX, y: clientY, filterKinds: kinds });
    },
    [isStageDeck],
  );

  const flowClass = [
    isStageDeck ? 'nx9-stage-deck' : 'nx9-flow',
    isStageDeck && viewMode === 'explore' ? 'nx9-stage-deck--explore' : '',
    isStageDeck && viewMode === 'produce' ? 'nx9-stage-deck--produce' : '',
    isStageDeck && isReviewMode(viewMode) ? 'nx9-stage-deck--review' : '',
    'w-full h-full',
    effectiveIntensive ? 'intensive' : '',
    dragging ? 'is-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleLensPick = useCallback(
    (kind: string) => {
      const wire = wireDropRef.current;
      if (wire && lensMenu) {
        wireDropRef.current = null;
        const at = screenToFlowRef.current({ x: lensMenu.x, y: lensMenu.y });
        const id = `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        pushFlowSnapshot(nodesRef.current, edgesRef.current);
        setNodes((nds) => [
          ...nds,
          {
            id,
            type: kind,
            position: at,
            data: {
              blockIndex: nextIndexRef.current++,
              status: 'idle',
            },
          },
        ]);
        setEdges((eds) =>
          addEdge(
            {
              id: `link-${Date.now()}`,
              source: wire.sourceNodeId,
              target: id,
              sourceHandle: wire.sourceHandle ?? undefined,
              type: 'channel',
              data: { pathType: 'default' },
            },
            eds,
          ),
        );
        appendLog(`拖线创建 · ${kind}`);
        return;
      }
      if (!lensMenu) return;
      const at = screenToFlowRef.current({ x: lensMenu.x, y: lensMenu.y });
      useFlowCommands.getState().requestSpawn(kind, at);
    },
    [lensMenu, push, setNodes, setEdges, appendLog],
  );

  const onPaneDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!isStageDeck) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target?.classList.contains('react-flow__pane')) return;
      setLensMenu({ x: e.clientX, y: e.clientY });
    },
    [isStageDeck],
  );

  const handleCommandAlign = useCallback(
    (action: NodeAlignAction) => {
      const ids = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
      if (ids.length === 0) return;
      handleAlignSelection(action, ids);
    },
    [handleAlignSelection],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const assetUrl = e.dataTransfer.getData('application/nx9-asset-url');
    const kind = e.dataTransfer.getData('application/nx9-block') || 'asset-import';
    const flowAt = screenToFlowRef.current({ x: e.clientX, y: e.clientY });
    const dropAt = exactDropPosition({
      x: flowAt.x - 110,
      y: flowAt.y - 80,
    });
    if (assetUrl) {
      const id = `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      pushFlowSnapshot(nodesRef.current, edgesRef.current);
      const isPic = /\.(png|jpe?g|gif|webp)$/i.test(assetUrl);
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: 'asset-import',
          position: dropAt,
          data: {
            blockIndex: nextIndexRef.current++,
            assetUrl,
            mediaKind: isPic ? 'picture' : 'clip',
            status: 'done',
          },
        },
      ]);
      appendLog(`从资源库放置素材`);
      return;
    }
    if (!kind) return;
    useFlowCommands.getState().requestSpawn(kind, dropAt, undefined, true);
  }, [push, setNodes, appendLog]);

  const selectEdge = useCallback(
    (edgeId: string) => {
      setNodes((prev) => prev.map((n) => ({ ...n, selected: false })));
      setEdges((prev) => prev.map((e) => ({ ...e, selected: e.id === edgeId })));
      syncSelectedBlockId(null);
    },
    [setNodes, setEdges, syncSelectedBlockId],
  );

  const onEdgeClick = useCallback(
    (_e: ReactMouseEvent, edge: Edge) => {
      selectEdge(edge.id);
      setContextMenu(null);
      setPaneMenu(null);
      setEdgeMenu(null);
    },
    [selectEdge],
  );

  const onEdgeContextMenu = useCallback(
    (e: ReactMouseEvent, edge: Edge) => {
      e.preventDefault();
      selectEdge(edge.id);
      setPasteAnchorScreen({ x: e.clientX, y: e.clientY });
      setContextMenu(null);
      setPaneMenu(null);
      setEdgeMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id });
    },
    [selectEdge],
  );

  const onNodeDoubleClick = useCallback(
    (_e: ReactMouseEvent, node: Node) => {
      setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === node.id })));
      syncSelectedBlockId(node.id);
      if (isStageDeck && (node.type === 'director-3d' || node.type === 'blocking-stage' || node.type === 'light-rig')) {
        openDirector3dForBlock(
          node.id,
          normalizeDirectorProject(node.data?.scene),
          node.data?.linkedShotId as string | undefined,
        );
        appendLog('打开 Stage Deck 预演');
        return;
      }
      if (isStageDeck && (isProduceMode(viewMode) || viewMode === 'review')) {
        const expanded = Boolean(node.data?.expanded);
        updateNodeDataStable(node.id, { expanded: !expanded });
        appendLog(expanded ? '收起模块' : '展开模块');
        return;
      }
      focusBlockRef.current(node.id);
      appendLog(`聚焦模块 · ${node.type ?? 'unknown'}`);
    },
    [setNodes, appendLog, isStageDeck, openDirector3dForBlock, viewMode, updateNodeDataStable, syncSelectedBlockId],
  );

  return (
    <div
      className={`relative h-full w-full ${flowClass} ${canvasAppearance.theme === 'dark' ? 'nx9-theme-dark' : ''}`}
      style={canvasAppearance.theme === 'dark' ? { background: '#181715' } : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDoubleClick={onPaneDoubleClick}
      onContextMenuCapture={onCanvasContextMenuCapture}
    >
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/90 text-sm text-ink/50">
          加载工作区…
        </div>
      )}
      {isStageDeck && ready && nodes.length === 0 && !recipePickerDismissed && (
        <PlaybookLauncherOverlay
          onStartPlaybook={(playbookId) => {
            const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === playbookId);
            if (!def) return;
            useWorkspaceDocument.getState().startPlaybook(playbookId);
            if (def.bootstrapTemplates.length > 0) {
              void loadWorkflowTemplate(def.bootstrapTemplates[0].templateId, 'replace');
            }
            setRecipePickerDismissed(true);
          }}
          onOpenLibrary={() => {
            setRecipePickerDismissed(true);
          }}
          onDismiss={() => setRecipePickerDismissed(true)}
        />
      )}
      {isStageDeck && ready && <CanvasFlowRail />}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={isStageDeck ? onConnectEnd : undefined}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        proOptions={proOptions}
        snapToGrid
        snapGrid={snapGrid}
        minZoom={PERF.minZoom}
        maxZoom={PERF.maxZoom}
        panOnDrag
        selectionOnDrag={false}
        selectionKeyCode={['Control', 'Meta']}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Control', 'Meta']}
        autoPanOnSelection
        onMoveEnd={onMoveEnd}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={isStageDeck ? onNodeDrag : undefined}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeClick={onEdgeClick}
        onEdgeContextMenu={onEdgeContextMenu}
        onSelectionContextMenu={onSelectionContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeMouseEnter={() => setPointerOverNode(true)}
        onNodeMouseLeave={() => setPointerOverNode(false)}
        onPaneMouseEnter={() => setPointerOverNode(false)}
        zoomOnScroll={!pointerOverNode}
        noWheelClassName="nowheel"
        zoomOnDoubleClick={false}
        defaultViewport={viewportRef.current}
        onlyRenderVisibleElements={effectiveIntensive}
        nodesDraggable
        elevateNodesOnSelect={!effectiveIntensive}
      >
        {canvasAppearance.gridStyle === 'blank' ? null : canvasAppearance.gridStyle === 'lines' ? (
          <Background variant={BackgroundVariant.Lines} gap={PERF.gridStep} size={1} color={canvasAppearance.theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#E0E0E0'} />
        ) : (
          <Background variant={BackgroundVariant.Dots} gap={PERF.gridStep} size={1} color={canvasAppearance.theme === 'dark' ? 'rgba(255,255,255,0.08)' : '#E6E6E6'} />
        )}
        {canvasAppearance.backgroundImageUrl && (
          <div
            className="absolute inset-0 pointer-events-none bg-cover bg-center"
            style={{
              backgroundImage: `url(${canvasAppearance.backgroundImageUrl})`,
              opacity: canvasAppearance.backgroundImageOpacity ?? 0.35,
            }}
          />
        )}
        {isStageDeck && <LaneBackground />}
        {isStageDeck && <SmartGuides guides={smartGuides} />}
        {!effectiveIntensive && <MiniMap pannable zoomable className="!bottom-4 !right-4" />}
        <Controls showInteractive={false} className="!bottom-4 !left-4" />
        <FlowFocusBridge
          bindFocusBlock={bindFocusBlock}
          bindScreenToFlow={bindScreenToFlow}
          onHighlightBlock={isStageDeck ? highlightBlock : undefined}
        />
        {isStageDeck && (
            <StageDeckInteractionBridge
              getEdges={() => edgesRef.current}
              getNodePositions={getNodeCenterPositions}
              onCutEdges={(ids) => handleDeleteEdges(ids)}
              onChangeEdgeType={(edgeId, edgeType) => handleChangeEdgeType(edgeId, edgeType)}
              onDeleteEdge={(edgeId) => handleDeleteEdges([edgeId])}
            />
        )}
      </ReactFlow>

      {isStageDeck && lensMenu && (
        <LensMenu
          x={lensMenu.x}
          y={lensMenu.y}
          filterKinds={lensMenu.filterKinds}
          onPick={handleLensPick}
          onClose={() => {
            wireDropRef.current = null;
            setLensMenu(null);
          }}
        />
      )}

      {isStageDeck && (
        <CommandPalette
          open={commandOpen}
          onClose={() => setCommandOpen(false)}
          onAlign={handleCommandAlign}
        />
      )}

      {isStageDeck && isReviewMode(viewMode) && (
        <TakeRail blockId={selectedBlockId} onPickTake={handlePickTake} />
      )}

      {isStageDeck && (
        <TakeLightboxHost onPick={(takeId, after) => handlePickTake(takeId, after)} />
      )}

      {isStageDeck && contextMenu && (
        <SelectionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          ids={contextMenu.ids}
          nodes={nodes}
          executableCount={contextMenu.ids.filter((id) => {
            const n = nodes.find((node) => node.id === id);
            return n?.type && RUNNABLE_BLOCKS.has(n.type);
          }).length}
          isRunning={isBatchRunning}
          storyboardActionCount={contextMenu.ids.filter((id) => {
            const n = nodes.find((node) => node.id === id);
            if (!n) return false;
            const shotId = n.data?.linkedShotId as string | undefined;
            return Boolean(
              shotId || storyboard.shots.some((s) => s.linkedBlockId === n.id),
            );
          }).length}
          cascadeEnabled={
            contextMenu.ids.length === 1 &&
            Boolean(
              nodes.find((n) => n.id === contextMenu.ids[0])?.type &&
                RUNNABLE_BLOCKS.has(nodes.find((n) => n.id === contextMenu.ids[0])!.type!),
            )
          }
          expandLabel={
            contextMenu.ids.length === 1 && (isProduceMode(viewMode) || viewMode === 'review')
              ? nodes.find((n) => n.id === contextMenu.ids[0])?.data?.expanded
                ? '收起模块'
                : '展开模块'
              : undefined
          }
          onClose={closeMenus}
          onRun={() => runSelected(contextMenu.ids)}
          onStop={stopRun}
          onCascade={() => {
            const id = contextMenu.ids[0];
            if (id) void runCascade(id);
          }}
          rerunDownstreamEnabled={contextMenu.ids.some((id) => {
            const n = nodes.find((node) => node.id === id);
            return Boolean(n?.type && RUNNABLE_BLOCKS.has(n.type));
          })}
          onRerunDownstream={() => void runSelectedDownstream(contextMenu.ids)}
          onToggleExpand={() => {
            const id = contextMenu.ids[0];
            const node = nodes.find((n) => n.id === id);
            if (id && node) {
              updateNodeDataStable(id, { expanded: !node.data?.expanded });
            }
          }}
          onCopy={handleCopy}
          onDuplicate={handleDuplicate}
          onDelete={() => handleDeleteSelected(contextMenu.ids)}
          onAlign={(action) => handleAlignSelection(action, contextMenu.ids)}
          onFocusStoryboard={() => handleFocusStoryboard(contextMenu.ids)}
        />
      )}

      {isStageDeck && edgeMenu && (
        <EdgeContextMenu
          x={edgeMenu.x}
          y={edgeMenu.y}
          edgeId={edgeMenu.edgeId}
          edgeType={normalizeFlowEdgeType(edges.find((e) => e.id === edgeMenu.edgeId)?.type)}
          onClose={closeMenus}
          onChangeType={(type) => handleChangeEdgeType(edgeMenu.edgeId, type)}
          onDelete={() => handleDeleteEdges([edgeMenu.edgeId])}
        />
      )}

      {isStageDeck && paneMenu && (
        <PaneContextMenu
          x={paneMenu.x}
          y={paneMenu.y}
          selectedCount={selectedCount}
          clipboardCount={clipboardCount || getClipboardCount()}
          onClose={closeMenus}
          onAddBlock={handleAddBlockAtPane}
          onPaste={() => handlePaste('pointer')}
          onArrangeGrid={() => {
            const ids = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
            if (ids.length >= 2) handleAlignSelection('arrange-grid', ids);
          }}
        />
      )}

    </div>
  );
});

export function FlowSurface({ variant = 'stage-deck', ...props }: FlowSurfaceProps) {
  return (
    <ReactFlowProvider>
      <FlowSurfaceInner {...props} variant={variant} />
    </ReactFlowProvider>
  );
}
