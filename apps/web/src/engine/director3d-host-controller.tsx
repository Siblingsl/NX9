import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Node } from '@xyflow/react';
import {
  activeChainEpisodeShots,
  DIRECTOR3D_NODE_SCHEMA_VERSION,
  isDirector3dDeskLink,
  resolveBlockCharacters,
  type ChainStoryboardPayload,
  type CharacterProfile,
  type StoryboardShot,
} from '@nx9/shared';
import {
  Director3dShell,
  applySceneTemplateToShotState,
  emptyDirectorProject,
  normalizeDirectorProject,
  normalizeShotState,
  projectFromShotState,
  quarantineDirector3dShotStates,
  type Director3dCommitPayload,
  type Director3dPerformanceMode,
  type Director3dSceneTemplate,
  type Director3dShotState,
  type DirectorProject,
} from '@nx9/director3d';
import { api } from '../api/client';
import { askConfirm } from '../stores/confirm-dialog';
import AgentPoseInput from '../blocks/core/director-desk/agent-pose-input';
import { applyPoseTransaction } from './agent-director3d-bridge';
import {
  createDirector3dCommitAdapter,
  sceneByShotFromNodeData,
} from './director3d-commit-adapter';
import { prepareDirectorProjectForShot } from './director3d-character-sync';
import { disposeDirectorWebGLLifecycle } from './director-webgl-lifecycle';
import {
  readDeskChainStoryboard,
  resolveUpstreamChainDesk,
} from './chain-storyboard-utils';

export type Director3dHostEdge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type Director3dStorageState = {
  schemaVersion?: number;
  standaloneProject?: DirectorProject;
  activeShotId?: string | null;
  sceneByShot: Record<string, Director3dShotState>;
  sceneTemplates: Record<string, Director3dSceneTemplate>;
  last3dCommit?: Director3dCommitPayload;
  consumedCommitIds: string[];
};

export interface ResolvedDirector3dHostContext {
  contextBlockId: string;
  contextNode?: Node;
  chainHostBlockId: string;
  storageBlockId: string;
  storageMode: 'external-node' | 'embedded-director' | 'ephemeral';
  attachedDirectorDeskId?: string;
  attachedDirector3dId?: string;
  sourceChainDeskId?: string;
  chain?: ChainStoryboardPayload;
  episodeId?: string;
  episodeConfirmed: boolean;
  shots: StoryboardShot[];
  activeShotId: string | null;
  lineArtByShotId: Record<string, string>;
  episodeLabel?: string;
  panoramaUrl?: string;
  previewFrameId?: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function findDirector3dDeskAttachment(
  blockId: string,
  nodes: Node[],
  edges: Director3dHostEdge[],
): { directorDeskId?: string; director3dId?: string } {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    if (edge.source !== blockId && edge.target !== blockId) continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (
      !source?.type ||
      !target?.type ||
      !isDirector3dDeskLink(
        source.type,
        target.type,
        edge.sourceHandle,
        edge.targetHandle,
      )
    ) {
      continue;
    }
    return {
      directorDeskId:
        source.type === 'director-desk' ? source.id : target.id,
      director3dId:
        source.type === 'director-3d' ? source.id : target.id,
    };
  }
  return {};
}

function resolveEpisodeId(
  chain: ChainStoryboardPayload | undefined,
  directorData: Record<string, unknown>,
  storageData: Record<string, unknown>,
): string | undefined {
  const handoffEpisodeId = record(directorData.lastHandoff).episodeId;
  const candidates = [
    typeof handoffEpisodeId === 'string' ? handoffEpisodeId : undefined,
    typeof storageData.activeEpisodeId === 'string'
      ? storageData.activeEpisodeId
      : undefined,
    chain?.activeEpisodeId ?? undefined,
    chain?.episodes?.[0]?.id,
  ].filter((value): value is string => Boolean(value));
  return candidates.find(
    (candidate) =>
      !chain ||
      chain.shots.some((shot) => shot.episodeId === candidate) ||
      chain.episodes?.some((episode) => episode.id === candidate),
  );
}

/**
 * 独立节点、全屏面板与导演台嵌入共用的唯一 chain/episode/shot/storage 解析器。
 */
export function resolveDirector3dHostContext(input: {
  contextBlockId: string;
  requestedShotId?: string | null;
  requestedPreviewFrameId?: string | null;
  nodes: Node[];
  edges: Director3dHostEdge[];
}): ResolvedDirector3dHostContext {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const contextNode = nodeById.get(input.contextBlockId);
  const attachment = findDirector3dDeskAttachment(
    input.contextBlockId,
    input.nodes,
    input.edges,
  );
  const contextKind = contextNode?.type;
  const chainHostBlockId =
    contextKind === 'director-3d' && attachment.directorDeskId
      ? attachment.directorDeskId
      : input.contextBlockId;
  const storageBlockId =
    contextKind === 'director-desk' && attachment.director3dId
      ? attachment.director3dId
      : input.contextBlockId;
  const storageMode: ResolvedDirector3dHostContext['storageMode'] =
    !contextNode
      ? 'ephemeral'
      : contextKind === 'director-desk' && storageBlockId === input.contextBlockId
        ? 'embedded-director'
        : 'external-node';
  const chainHostNode = nodeById.get(chainHostBlockId);
  const storageNode = nodeById.get(storageBlockId);
  const directorNode =
    chainHostNode?.type === 'director-desk' ? chainHostNode : undefined;
  const directorData = record(directorNode?.data);
  const storageData = record(storageNode?.data);
  const sourceChainDeskId =
    resolveUpstreamChainDesk(chainHostBlockId, input.nodes, input.edges) ??
    undefined;
  const chain = sourceChainDeskId
    ? readDeskChainStoryboard(record(nodeById.get(sourceChainDeskId)?.data))
    : undefined;
  const episodeId = resolveEpisodeId(chain, directorData, storageData);
  const shots = chain
    ? activeChainEpisodeShots({
        ...chain,
        activeEpisodeId: episodeId ?? chain.activeEpisodeId,
      })
    : [];
  const preview = record(record(nodeById.get(sourceChainDeskId ?? '')?.data).storyboardPreview);
  const previewFrames = Array.isArray(preview.frames)
    ? (preview.frames as Array<Record<string, unknown>>)
    : [];
  const previewFrameId =
    input.requestedPreviewFrameId !== undefined
      ? input.requestedPreviewFrameId
      : typeof storageData.linkedStoryboardPreviewFrameId === 'string'
        ? storageData.linkedStoryboardPreviewFrameId
        : typeof directorData.linkedStoryboardPreviewFrameId === 'string'
          ? directorData.linkedStoryboardPreviewFrameId
          : typeof preview.selectedFrameId === 'string'
            ? preview.selectedFrameId
            : null;
  const previewFrame = previewFrames.find(
    (frame) => frame.id === previewFrameId,
  );
  const requestedShotId =
    input.requestedShotId !== undefined
      ? input.requestedShotId
      : typeof previewFrame?.sourceShotId === 'string'
        ? previewFrame.sourceShotId
        : typeof storageData.activeShotId === 'string'
          ? storageData.activeShotId
          : typeof storageData.linkedShotId === 'string'
            ? storageData.linkedShotId
            : typeof directorData.linkedShotId === 'string'
              ? directorData.linkedShotId
              : null;
  const activeShotId =
    (requestedShotId &&
    (!chain || shots.some((shot) => shot.id === requestedShotId))
      ? requestedShotId
      : shots[0]?.id) ?? null;
  const lineArtByShotId = Object.fromEntries(
    shots
      .filter((shot) => Boolean(shot.lineArtUrl))
      .map((shot) => [shot.id, shot.lineArtUrl as string]),
  );
  const handoff = record(directorData.lastHandoff);
  const episodeConfirmed = Boolean(
    handoff.confirmed ||
      (episodeId &&
        Array.isArray(handoff.confirmedEpisodeIds) &&
        handoff.confirmedEpisodeIds.includes(episodeId)) ||
      (episodeId && chain?.confirmedEpisodeIds?.includes(episodeId)) ||
      chain?.gridConfirmed,
  );
  const episode = chain?.episodes?.find((item) => item.id === episodeId);
  const panorama720 = record(preview.panorama720);

  return {
    contextBlockId: input.contextBlockId,
    contextNode,
    chainHostBlockId,
    storageBlockId,
    storageMode,
    attachedDirectorDeskId: attachment.directorDeskId,
    attachedDirector3dId: attachment.director3dId,
    sourceChainDeskId,
    chain,
    episodeId,
    episodeConfirmed,
    shots,
    activeShotId,
    lineArtByShotId,
    episodeLabel: episode
      ? `第 ${episode.index} 集 · ${episode.title}`
      : undefined,
    panoramaUrl:
      typeof panorama720.imageUrl === 'string'
        ? panorama720.imageUrl
        : undefined,
    previewFrameId:
      typeof previewFrame?.id === 'string' ? previewFrame.id : undefined,
  };
}

export function readDirector3dStorageState(
  resolved: ResolvedDirector3dHostContext,
  nodes: Node[],
): Director3dStorageState {
  const node = nodes.find((item) => item.id === resolved.storageBlockId);
  const nodeData = record(node?.data);
  const raw =
    resolved.storageMode === 'embedded-director'
      ? record(nodeData.director3d)
      : nodeData;
  const legacyFallback =
    resolved.storageMode === 'embedded-director' ? nodeData : {};
  const primarySceneByShot = sceneByShotFromNodeData(raw);
  const sceneByShot =
    Object.keys(primarySceneByShot).length > 0
      ? primarySceneByShot
      : sceneByShotFromNodeData(legacyFallback);
  return {
    schemaVersion:
      typeof raw.schemaVersion === 'number'
        ? raw.schemaVersion
        : undefined,
    standaloneProject: normalizeDirectorProject(
      raw.standaloneProject ??
        raw.scene ??
        legacyFallback.standaloneProject ??
        legacyFallback.scene,
    ),
    activeShotId:
      typeof raw.activeShotId === 'string' || raw.activeShotId === null
        ? raw.activeShotId
        : undefined,
    sceneByShot,
    sceneTemplates:
      Object.keys(record(raw.sceneTemplates)).length > 0
        ? (record(raw.sceneTemplates) as Record<string, Director3dSceneTemplate>)
        : (record(legacyFallback.sceneTemplates) as Record<
            string,
            Director3dSceneTemplate
          >),
    last3dCommit:
      (raw.last3dCommit ??
        legacyFallback.last3dCommit) as Director3dCommitPayload | undefined,
    consumedCommitIds: Array.isArray(
      raw.consumedCommitIds ?? legacyFallback.consumedCommitIds,
    )
      ? ((raw.consumedCommitIds ??
          legacyFallback.consumedCommitIds) as string[])
      : [],
  };
}

/** 把 sceneByShot 中仍占交付位的 Data URL 候选帧写回节点，避免脏数据反复读出。 */
export function persistDirector3dStorageHygiene(
  updateNodeData: (id: string, patch: Record<string, unknown>) => void,
  resolved: ResolvedDirector3dHostContext,
  nodes: Node[],
): number {
  if (resolved.storageMode === 'ephemeral') return 0;
  const node = nodes.find((item) => item.id === resolved.storageBlockId);
  if (!node) return 0;
  const nodeData = record(node.data);
  const scope =
    resolved.storageMode === 'embedded-director'
      ? record(nodeData.director3d)
      : nodeData;
  const rawSceneByShot = scope.sceneByShot;
  if (!rawSceneByShot || typeof rawSceneByShot !== 'object' || Array.isArray(rawSceneByShot)) {
    return 0;
  }
  const { states, quarantinedCount } = quarantineDirector3dShotStates(
    rawSceneByShot as Record<string, Director3dShotState>,
  );
  if (quarantinedCount === 0) return 0;
  if (resolved.storageMode === 'embedded-director') {
    updateNodeData(resolved.storageBlockId, {
      director3d: {
        ...scope,
        schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
        sceneByShot: states,
      },
    });
  } else {
    updateNodeData(resolved.storageBlockId, {
      schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
      sceneByShot: states,
    });
  }
  return quarantinedCount;
}

export function resolveEmbeddedDirector3dMigration(input: {
  contextBlockId: string;
  nodes: Node[];
  edges: Director3dHostEdge[];
}): {
  available: boolean;
  targetStorageBlockId?: string;
  shotCount: number;
  templateCount: number;
} {
  const resolved = resolveDirector3dHostContext(input);
  if (
    resolved.contextNode?.type !== 'director-desk' ||
    !resolved.attachedDirector3dId
  ) {
    return { available: false, shotCount: 0, templateCount: 0 };
  }
  const directorData = record(resolved.contextNode.data);
  const namespace = record(directorData.director3d);
  if (
    namespace.copiedToStorageBlockId === resolved.attachedDirector3dId
  ) {
    return { available: false, shotCount: 0, templateCount: 0 };
  }
  const internalResolved: ResolvedDirector3dHostContext = {
    ...resolved,
    storageBlockId: resolved.contextBlockId,
    storageMode: 'embedded-director',
  };
  const internal = readDirector3dStorageState(internalResolved, input.nodes);
  const shotCount = Object.keys(internal.sceneByShot).length;
  const templateCount = Object.keys(internal.sceneTemplates).length;
  return {
    available: shotCount > 0 || templateCount > 0,
    targetStorageBlockId: resolved.attachedDirector3dId,
    shotCount,
    templateCount,
  };
}

export function copyEmbeddedDirector3dStateToExternal(input: {
  contextBlockId: string;
  nodes: Node[];
  edges: Director3dHostEdge[];
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
}): boolean {
  const resolved = resolveDirector3dHostContext(input);
  if (
    resolved.contextNode?.type !== 'director-desk' ||
    !resolved.attachedDirector3dId
  ) {
    return false;
  }
  const internalResolved: ResolvedDirector3dHostContext = {
    ...resolved,
    storageBlockId: resolved.contextBlockId,
    storageMode: 'embedded-director',
  };
  const internal = readDirector3dStorageState(
    internalResolved,
    input.nodes,
  );
  const external = readDirector3dStorageState(resolved, input.nodes);
  input.updateNodeData(resolved.attachedDirector3dId, {
    schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
    standaloneProject:
      internal.standaloneProject ?? external.standaloneProject,
    sceneByShot: {
      ...external.sceneByShot,
      ...internal.sceneByShot,
    },
    sceneTemplates: {
      ...external.sceneTemplates,
      ...internal.sceneTemplates,
    },
    activeShotId: internal.activeShotId ?? external.activeShotId ?? null,
    last3dCommit: internal.last3dCommit ?? external.last3dCommit,
    consumedCommitIds: [
      ...new Set([
        ...external.consumedCommitIds,
        ...internal.consumedCommitIds,
      ]),
    ].slice(-100),
  });
  const directorData = record(resolved.contextNode.data);
  input.updateNodeData(resolved.contextBlockId, {
    director3d: {
      ...record(directorData.director3d),
      copiedToStorageBlockId: resolved.attachedDirector3dId,
      copiedAt: new Date().toISOString(),
    },
  });
  return true;
}

export interface Director3dHostControllerProps {
  contextBlockId: string;
  requestedShotId?: string | null;
  initialProject?: DirectorProject;
  nodes: Node[];
  edges: Director3dHostEdge[];
  getNodes?: () => Node[];
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  characters: CharacterProfile[];
  appendLog: (message: string) => void;
  onSelectShot?: (shotId: string) => void;
  onClose?: () => void;
  performanceMode?: Director3dPerformanceMode;
  nodeCount?: number;
  crowdMax?: number;
  showAgentPose?: boolean;
}

export function Director3dHostController({
  contextBlockId,
  requestedShotId,
  initialProject,
  nodes,
  edges,
  getNodes,
  updateNodeData,
  characters,
  appendLog,
  onSelectShot,
  onClose,
  performanceMode = 'normal',
  nodeCount,
  crowdMax = 20,
  showAgentPose = true,
}: Director3dHostControllerProps) {
  const resolved = useMemo(
    () =>
      resolveDirector3dHostContext({
        contextBlockId,
        requestedShotId,
        nodes,
        edges,
      }),
    [contextBlockId, edges, nodes, requestedShotId],
  );
  const storage = useMemo(
    () => readDirector3dStorageState(resolved, nodes),
    [nodes, resolved],
  );
  useEffect(() => {
    const quarantined = persistDirector3dStorageHygiene(
      updateNodeData,
      resolved,
      nodes,
    );
    if (quarantined > 0) {
      appendLog(`3D 导演台 · 已隔离 ${quarantined} 张本地草稿截图，请重新上传后再提交`);
    }
  }, [appendLog, nodes, resolved, updateNodeData]);
  const embeddedMigration = useMemo(
    () =>
      resolveEmbeddedDirector3dMigration({
        contextBlockId,
        nodes,
        edges,
      }),
    [contextBlockId, edges, nodes],
  );
  const baseProject = useMemo(() => {
    const base = normalizeDirectorProject(
      initialProject ?? storage.standaloneProject ?? emptyDirectorProject(),
    );
    if (!resolved.panoramaUrl || base.panorama?.url === resolved.panoramaUrl) {
      return base;
    }
    return {
      ...base,
      panorama: {
        url: resolved.panoramaUrl,
        yaw: 0,
        exposure: 1,
      },
    };
  }, [initialProject, resolved.panoramaUrl, storage.standaloneProject]);
  const [currentShotId, setCurrentShotId] = useState<string | null>(
    resolved.activeShotId,
  );
  const currentKey = currentShotId ?? '__standalone__';

  const writeStoragePatch = useCallback(
    (patch: Record<string, unknown>) => {
      if (resolved.storageMode === 'ephemeral') return;
      const latestNodes = getNodes?.() ?? nodes;
      const storageNode = latestNodes.find(
        (node) => node.id === resolved.storageBlockId,
      );
      const nodeData = record(storageNode?.data);
      if (resolved.storageMode === 'embedded-director') {
        updateNodeData(resolved.storageBlockId, {
          director3d: {
            ...record(nodeData.director3d),
            schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
            ...patch,
          },
        });
        return;
      }
      updateNodeData(resolved.storageBlockId, {
        schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
        ...patch,
      });
    },
    [getNodes, nodes, resolved.storageBlockId, resolved.storageMode, updateNodeData],
  );

  const buildState = useCallback(
    (shotId: string | null): Director3dShotState => {
      const key = shotId ?? '__standalone__';
      const stored = storage.sceneByShot[key];
      const normalized = normalizeShotState(stored, key, baseProject);
      const shot = resolved.shots.find((item) => item.id === shotId);
      if (!shot || stored) return normalized;
      const hostData = record(
        nodes.find((node) => node.id === resolved.chainHostBlockId)?.data,
      );
      const shotCharacters = resolveBlockCharacters(
        hostData,
        shot,
        characters,
      );
      const characterIds = shot.characterIds?.length
        ? shot.characterIds
        : shotCharacters.map((character) => character.id);
      const characterNames = shot.characterNames?.length
        ? shot.characterNames
        : shotCharacters.map((character) => character.name);
      const prepared = prepareDirectorProjectForShot(
        projectFromShotState(normalized, baseProject),
        characterIds,
        characters,
        shot.director3dGuide?.characterPlacements,
        characterNames,
      );
      return {
        ...normalized,
        episodeId: resolved.episodeId,
        sourceChainDeskId: resolved.sourceChainDeskId,
        sourceShotRevision: shot.sourceRevision,
        objects: prepared.objects,
      };
    },
    [
      baseProject,
      characters,
      nodes,
      resolved.chainHostBlockId,
      resolved.episodeId,
      resolved.shots,
      resolved.sourceChainDeskId,
      storage.sceneByShot,
    ],
  );
  const [shotState, setShotState] = useState<Director3dShotState>(() =>
    buildState(resolved.activeShotId),
  );
  const loadedKeyRef = useRef(
    `${resolved.storageBlockId}:${resolved.activeShotId ?? '__standalone__'}`,
  );
  const disposeRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (requestedShotId === undefined) return;
    const next =
      requestedShotId &&
      resolved.shots.some((shot) => shot.id === requestedShotId)
        ? requestedShotId
        : resolved.activeShotId;
    setCurrentShotId(next);
  }, [requestedShotId, resolved.activeShotId, resolved.shots]);

  useEffect(() => {
    const loadKey = `${resolved.storageBlockId}:${currentKey}`;
    if (loadedKeyRef.current === loadKey) return;
    const next = buildState(currentShotId);
    loadedKeyRef.current = loadKey;
    setShotState(next);
    if (!storage.sceneByShot[currentKey]) {
      writeStoragePatch({
        sceneByShot: {
          ...storage.sceneByShot,
          [currentKey]: next,
        },
        activeShotId: currentShotId,
      });
    }
  }, [
    buildState,
    currentKey,
    currentShotId,
    resolved.storageBlockId,
    storage.sceneByShot,
    writeStoragePatch,
  ]);

  useEffect(() => {
    if (
      resolved.storageMode === 'ephemeral' ||
      storage.schemaVersion === DIRECTOR3D_NODE_SCHEMA_VERSION
    ) {
      return;
    }
    writeStoragePatch({
      standaloneProject: baseProject,
      sceneByShot: storage.sceneByShot,
      sceneTemplates: storage.sceneTemplates,
      activeShotId: currentShotId,
      consumedCommitIds: storage.consumedCommitIds,
    });
  }, [
    baseProject,
    currentShotId,
    resolved.storageMode,
    storage.consumedCommitIds,
    storage.sceneByShot,
    storage.sceneTemplates,
    storage.schemaVersion,
    writeStoragePatch,
  ]);

  const persistState = useCallback(
    (next: Director3dShotState) => {
      setShotState(next);
      const latestNodes = getNodes?.() ?? nodes;
      const latestResolved = resolveDirector3dHostContext({
        contextBlockId,
        requestedShotId: next.shotId === '__standalone__' ? null : next.shotId,
        nodes: latestNodes,
        edges,
      });
      const latestStorage = readDirector3dStorageState(
        latestResolved,
        latestNodes,
      );
      writeStoragePatch({
        sceneByShot: {
          ...latestStorage.sceneByShot,
          [next.shotId]: next,
        },
        activeShotId:
          next.shotId === '__standalone__' ? null : next.shotId,
      });
    },
    [
      contextBlockId,
      edges,
      getNodes,
      nodes,
      writeStoragePatch,
    ],
  );

  const selectShot = useCallback(
    (shotId: string) => {
      setCurrentShotId(shotId);
      writeStoragePatch({ activeShotId: shotId, linkedShotId: shotId });
      onSelectShot?.(shotId);
    },
    [onSelectShot, writeStoragePatch],
  );

  const commit = useMemo(
    () =>
      createDirector3dCommitAdapter({
        blockId: resolved.storageBlockId,
        sourceBlockId: resolved.chainHostBlockId,
        guideSourceBlockId: resolved.storageBlockId,
        nodes,
        edges,
        getLatestNodes: getNodes,
        updateNodeData,
        currentSourceShotRevision: resolved.shots.find(
          (item) => item.id === shotState.shotId,
        )?.sourceRevision,
        consumedCommitIds: storage.consumedCommitIds,
        persistCommit: (payload) => {
          const latestNodes = getNodes?.() ?? nodes;
          const latestStorage = readDirector3dStorageState(
            resolved,
            latestNodes,
          );
          const consumedCommitIds = [
            ...new Set([
              ...latestStorage.consumedCommitIds,
              payload.commitId,
            ]),
          ].slice(-100);
          writeStoragePatch({
            sceneByShot: {
              ...latestStorage.sceneByShot,
              [payload.shotId]: payload.sceneState,
            },
            last3dCommit: payload,
            last3dCommitMessage:
              '3D 构图已提交，可进入彩色关键帧批出',
            consumedCommitIds,
          });
        },
        onCommitted: (payload) =>
          appendLog(
            `3D 构图已提交，可进入彩色关键帧批出 · 镜 ${payload.shotId}`,
          ),
      }),
    [
      appendLog,
      edges,
      getNodes,
      nodes,
      resolved,
      shotState.shotId,
      storage.consumedCommitIds,
      updateNodeData,
      writeStoragePatch,
    ],
  );

  const handleCommit = useCallback(
    (payload: Director3dCommitPayload) => {
      const result = commit(payload);
      if (!result.ok) throw new Error(result.error ?? '3D 构图提交失败');
    },
    [commit],
  );

  const handleCandidate = useCallback(
    async (payload: { dataUrl: string; shotId: string }) => {
      if (payload.shotId !== shotState.shotId) {
        throw new Error('镜头已切换，请重新记录候选帧');
      }
      const blob = await (await fetch(payload.dataUrl)).blob();
      const file = new File(
        [blob],
        `director3d-${payload.shotId}-${Date.now()}.png`,
        { type: 'image/png' },
      );
      const uploaded = await api.uploadAsset(file);
      return { imageUrl: uploaded.url };
    },
    [shotState.shotId],
  );

  const handleTemplate = useCallback(
    (template: Director3dSceneTemplate) => {
      writeStoragePatch({
        sceneTemplates: {
          ...storage.sceneTemplates,
          [template.id]: template,
        },
        lastSceneTemplateId: template.id,
      });
      appendLog(
        `已保存场景模板「${template.name}」，角色不会固化到模板`,
      );
    },
    [appendLog, storage.sceneTemplates, writeStoragePatch],
  );

  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      const template = storage.sceneTemplates[templateId];
      if (!template) return;
      const applied = applySceneTemplateToShotState(shotState, template);
      const shot = resolved.shots.find((item) => item.id === applied.shotId);
      const hostData = record(
        nodes.find((node) => node.id === resolved.chainHostBlockId)?.data,
      );
      const prepared = shot
        ? prepareDirectorProjectForShot(
            projectFromShotState(applied, baseProject),
            shot.characterIds?.length ? shot.characterIds : undefined,
            characters,
            shot.director3dGuide?.characterPlacements,
            shot.characterNames,
          )
        : projectFromShotState(applied, baseProject);
      persistState({
        ...applied,
        objects: prepared.objects,
      });
      appendLog(`已应用场景模板「${template.name}」，角色已按当前镜头重绑定`);
    },
    [
      appendLog,
      baseProject,
      characters,
      nodes,
      persistState,
      resolved.chainHostBlockId,
      resolved.shots,
      shotState,
      storage.sceneTemplates,
    ],
  );

  const handleReloadSource = useCallback(() => {
    const shot = resolved.shots.find((item) => item.id === shotState.shotId);
    if (!shot) return;
    persistState({
      ...shotState,
      sourceShotRevision: shot.sourceRevision,
      updatedAt: new Date().toISOString(),
    });
    appendLog(`已重新对齐上游镜头版本 · 镜 ${shot.id}`);
  }, [appendLog, persistState, resolved.shots, shotState]);

  const handleAgentPose = useCallback(
    async (
      command: Parameters<
        typeof applyPoseTransaction
      >[1]['command'] | null,
    ) => {
      if (!command) return;
      const confirmed = await askConfirm({
        title: '确认应用 Agent 3D 摆位',
        description:
          '将把预览中的角色和相机变化应用到当前镜头，可使用撤销恢复。',
        confirmLabel: '应用摆位',
      });
      const result = applyPoseTransaction(
        shotState,
        {
          shotId: shotState.shotId,
          baseStateVersion: shotState.stateVersion,
          command,
        },
        confirmed,
      );
      if (!result.ok || !result.nextState) {
        throw new Error(result.error ?? 'Agent 摆位应用失败');
      }
      persistState(result.nextState);
      appendLog(`Agent 3D 摆位已应用 · ${result.summary ?? ''}`);
    },
    [appendLog, persistState, shotState],
  );

  const handleRendererReady = useCallback(
    (renderer: { dispose: () => void }) => {
      disposeRef.current = renderer.dispose;
    },
    [],
  );

  const copyEmbeddedState = useCallback(async () => {
    if (!embeddedMigration.available) return;
    const confirmed = await askConfirm({
      title: '复制内嵌 3D 草稿到独立节点',
      description: `将复制 ${embeddedMigration.shotCount} 个镜头状态和 ${embeddedMigration.templateCount} 个模板；同镜头数据以当前内嵌草稿为准。`,
      confirmLabel: '复制到节点',
    });
    if (!confirmed) return;
    const latestNodes = getNodes?.() ?? nodes;
    const copied = copyEmbeddedDirector3dStateToExternal({
      contextBlockId,
      nodes: latestNodes,
      edges,
      updateNodeData,
    });
    if (copied) appendLog('内嵌 3D 草稿已复制到独立 3D 导演台节点');
  }, [
    appendLog,
    contextBlockId,
    edges,
    embeddedMigration,
    getNodes,
    nodes,
    updateNodeData,
  ]);

  useEffect(
    () => () => {
      disposeRef.current?.();
      disposeDirectorWebGLLifecycle();
    },
    [],
  );

  const project = useMemo(
    () => projectFromShotState(shotState, baseProject),
    [baseProject, shotState],
  );
  const shotItems = resolved.shots.map((shot) => ({
    id: shot.id,
    index: shot.index,
    label: shot.descriptionZh || shot.promptEn,
    episodeId: shot.episodeId,
    status: shot.status,
    has3dGuide: Boolean(shot.director3dGuide?.captureUrl),
    lineArtUrl: resolved.lineArtByShotId[shot.id],
  }));
  const linkedShotId =
    shotState.shotId === '__standalone__' ? undefined : shotState.shotId;
  const liveSourceShotRevision = linkedShotId
    ? resolved.shots.find((item) => item.id === linkedShotId)?.sourceRevision
    : undefined;
  const sourceStale = Boolean(
    linkedShotId
    && liveSourceShotRevision != null
    && shotState.sourceShotRevision !== liveSourceShotRevision,
  );

  return (
    <div className="flex flex-col h-full" style={{ height: '100%' }}>
      {embeddedMigration.available && (
        <div className="nx9-stage-switch-warning">
          <span>
            检测到导演台内嵌草稿；当前已连接独立 3D 节点，数据不会自动合并。
          </span>
          <button
            type="button"
            className="nx9-stage-mini-btn is-on"
            onClick={() => void copyEmbeddedState()}
          >
            复制到独立节点
          </button>
        </div>
      )}
      {showAgentPose && <AgentPoseInput onPose={handleAgentPose} />}
      <Director3dShell
        key={`${resolved.storageBlockId}:${shotState.shotId}`}
        options={{
          project,
          shotState,
          shotContext: {
            shotId: linkedShotId,
            episodeId: resolved.episodeId,
            sourceChainDeskId: resolved.sourceChainDeskId,
            sourceShotRevision: shotState.sourceShotRevision,
            liveSourceShotRevision,
            sourceStale,
            sourceLabel: resolved.sourceChainDeskId
              ? '分镜台链镜表'
              : undefined,
            episodeLabel: resolved.episodeLabel,
            lineArtUrl: linkedShotId
              ? resolved.lineArtByShotId[linkedShotId]
              : undefined,
            confirmed: resolved.episodeConfirmed,
            upstreamConnected: Boolean(
              resolved.sourceChainDeskId && linkedShotId,
            ),
            shots: shotItems,
          },
          performanceMode,
          nodeCount,
          crowdMax,
          onShotStateChange: persistState,
          onSelectShot: selectShot,
          onCandidateCreated: handleCandidate,
          onCommit: handleCommit,
          onProjectChange: (nextProject) => {
            if (!linkedShotId) {
              writeStoragePatch({ standaloneProject: nextProject });
            }
          },
          onUploadFile: async (file) => {
            const uploaded = await api.uploadAsset(file);
            return { url: uploaded.url, filename: uploaded.filename };
          },
          onSaveSceneTemplate: handleTemplate,
          sceneTemplates: Object.values(storage.sceneTemplates),
          onApplySceneTemplate: handleApplyTemplate,
          onReloadSource: handleReloadSource,
          onClose,
          onRendererReady: handleRendererReady,
        }}
      />
    </div>
  );
}
