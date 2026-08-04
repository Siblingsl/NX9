import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Director3dCommitPayload, DirectorProject } from '@nx9/director3d';
import {
  emptyDirectorProject,
  normalizeDirectorProject,
  normalizeShotState,
  projectFromShotState,
  type Director3dSceneTemplate,
} from '@nx9/director3d';
import { activeChainEpisodeShots, resolveBlockCharacters } from '@nx9/shared';
import { useDirector3dUi } from '../stores/director3d-ui';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useAssetLibraryModalUi } from '../stores/asset-library-modal-ui';
import { useActivityLog } from '../stores/activity-log';
import { api } from '../api/client';
import { disposeDirectorWebGLLifecycle } from '../engine/director-webgl-lifecycle';
import { createDirector3dCommitAdapter, sceneByShotFromNodeData } from '../engine/director3d-commit-adapter';
import { readUpstreamChainStoryboard, resolveUpstreamChainDesk } from '../engine/chain-storyboard-utils';
import { prepareDirectorProjectForShot } from '../engine/director3d-character-sync';
import { useWorkspaceDocument } from '../stores/workspace-document';

const Director3dShell = lazy(() =>
  import('@nx9/director3d').then((module) => ({ default: module.Director3dShell })),
);

export function Director3dPanel() {
  const open = useDirector3dUi((state) => state.open);
  const blockId = useDirector3dUi((state) => state.blockId);
  const linkedShotId = useDirector3dUi((state) => state.linkedShotId);
  const baseProject = useDirector3dUi((state) => state.project);
  const close = useDirector3dUi((state) => state.close);
  const selectShot = useDirector3dUi((state) => state.selectShot);
  const runtime = useFlowRuntime((state) => state.runtime);
  const appendLog = useActivityLog((state) => state.append);
  const characters = useWorkspaceDocument((state) => state.characters.characters);
  const disposeRef = useRef<(() => void) | undefined>(undefined);
  const nodes = runtime?.getNodes() ?? [];
  const edges = runtime?.getEdges() ?? [];
  const hostNode = blockId ? nodes.find((node) => node.id === blockId) : undefined;
  const nodeData = (hostNode?.data ?? {}) as Record<string, unknown>;
  const upstreamDeskId = useMemo(
    () => blockId ? resolveUpstreamChainDesk(blockId, nodes, edges) : null,
    [blockId, edges, nodes],
  );
  const chain = useMemo(
    () => blockId ? readUpstreamChainStoryboard(blockId, nodes, edges) : undefined,
    [blockId, edges, nodes],
  );
  const episodeId = (nodeData.lastHandoff as { episodeId?: string } | undefined)?.episodeId ?? chain?.activeEpisodeId;
  const episodeConfirmed = Boolean(
    (nodeData.lastHandoff as { confirmed?: boolean; confirmedEpisodeIds?: string[] } | undefined)?.confirmed ||
      (episodeId && (nodeData.lastHandoff as { confirmedEpisodeIds?: string[] } | undefined)?.confirmedEpisodeIds?.includes(episodeId)) ||
      (episodeId && chain?.confirmedEpisodeIds?.includes(episodeId)),
  );
  const shots = useMemo(() => {
    if (!chain) return [];
    return activeChainEpisodeShots({ ...chain, activeEpisodeId: episodeId ?? chain.activeEpisodeId });
  }, [chain, episodeId]);
  const lineArtByShotId = useMemo(() => {
    const map: Record<string, string> = {};
    const handoff = nodeData.lastHandoff as { lineArtFrames?: Array<{ shotId?: string; sourceShotId?: string; imageUrl?: string }> } | undefined;
    for (const frame of handoff?.lineArtFrames ?? []) {
      const id = frame.shotId ?? frame.sourceShotId;
      if (id && frame.imageUrl) map[id] = frame.imageUrl;
    }
    const upstream = upstreamDeskId ? nodes.find((node) => node.id === upstreamDeskId) : undefined;
    const preview = (upstream?.data as Record<string, unknown> | undefined)?.storyboardPreview as
      { frames?: Array<{ sourceShotId?: string; imageUrl?: string; lineArtUrl?: string }> } | undefined;
    for (const frame of preview?.frames ?? []) {
      const id = frame.sourceShotId;
      const url = frame.lineArtUrl ?? frame.imageUrl;
      if (id && url && !map[id]) map[id] = url;
    }
    return map;
  }, [nodeData.lastHandoff, nodes, upstreamDeskId]);
  const shotId = linkedShotId ?? undefined;
  const storedState = shotId ? sceneByShotFromNodeData(nodeData)[shotId] : undefined;
  const state = useMemo(
    () => {
      const normalized = normalizeShotState(storedState, shotId ?? '__standalone__', normalizeDirectorProject(baseProject ?? emptyDirectorProject()));
      const shot = shots.find((item) => item.id === shotId);
      if (!shot || storedState) return normalized;
      const shotCharacters = resolveBlockCharacters(nodeData, shot, characters);
      const shotCharacterIds = shot.characterIds?.length
        ? shot.characterIds
        : shotCharacters.map((character) => character.id);
      const shotCharacterNames = shot.characterNames?.length
        ? shot.characterNames
        : shotCharacters.map((character) => character.name);
      const prepared = prepareDirectorProjectForShot(
        projectFromShotState(normalized, normalizeDirectorProject(baseProject ?? emptyDirectorProject())),
        shotCharacterIds,
        characters,
        shot.director3dGuide?.characterPlacements,
        shotCharacterNames,
      );
      return { ...normalized, episodeId, sourceChainDeskId: upstreamDeskId ?? undefined, objects: prepared.objects };
    },
    [baseProject, characters, episodeId, nodeData, shotId, shots, upstreamDeskId, storedState],
  );
  const project = useMemo(
    () => projectFromShotState(state, normalizeDirectorProject(baseProject ?? emptyDirectorProject())),
    [baseProject, state],
  );

  useEffect(() => {
    if (!blockId || !runtime || !shotId || storedState) return;
    runtime.updateNodeData(blockId, { sceneByShot: { ...sceneByShotFromNodeData(nodeData), [shotId]: state } });
  }, [blockId, nodeData, runtime, sceneByShotFromNodeData, shotId, state, storedState]);

  const persistState = useCallback((next: typeof state) => {
    if (!blockId || !runtime) return;
    const current = sceneByShotFromNodeData((runtime.getNodes().find((node) => node.id === blockId)?.data ?? {}) as Record<string, unknown>);
    runtime.updateNodeData(blockId, { sceneByShot: { ...current, [next.shotId]: next } });
  }, [blockId, runtime]);

  const commit = useMemo(() => createDirector3dCommitAdapter({
    blockId: blockId ?? '__standalone__',
    nodes,
    edges,
    updateNodeData: (id, patch) => runtime?.updateNodeData(id, patch),
    currentSourceShotRevision: state.sourceShotRevision,
    onCommitted: (payload) => appendLog(`3D 构图已提交，可进入彩色关键帧批出 · 镜 ${payload.shotId}`),
  }), [appendLog, blockId, edges, nodes, runtime, state.sourceShotRevision]);

  const handleCommit = useCallback((payload: Director3dCommitPayload) => {
    const result = commit(payload);
    if (!result.ok) throw new Error(result.error ?? '3D 构图提交失败');
  }, [commit]);

  const handleCandidate = useCallback(async (payload: { dataUrl: string; shotId: string }) => {
    if (payload.shotId !== (shotId ?? '__standalone__')) throw new Error('镜头已切换，请重新记录候选帧');
    const blob = await (await fetch(payload.dataUrl)).blob();
    const file = new File([blob], `director3d-${payload.shotId}-${Date.now()}.png`, { type: 'image/png' });
    const uploaded = await api.uploadAsset(file);
    return { imageUrl: uploaded.url };
  }, [shotId]);

  const handleTemplate = useCallback((template: Director3dSceneTemplate) => {
    if (!blockId || !runtime) return;
    const item = {
      id: `scene-${Date.now().toString(36)}`,
      kind: 'scene',
      label: template.name,
      promptEn: `NX9 scene template with ${template.objects.length} reusable objects`,
      stageDeckScene: template,
    };
    runtime.updateNodeData(blockId, {
      sceneTemplates: { ...((nodeData.sceneTemplates as Record<string, unknown> | undefined) ?? {}), [template.id]: template },
    });
    runtime.updateNodeData(blockId, { lastSceneTemplateId: template.id });
    useAssetLibraryModalUi.getState().openAt({ tab: 'scene', itemId: item.id, scope: 'private' });
    appendLog(`已保存场景模板「${template.name}」`);
  }, [appendLog, blockId, nodeData.sceneTemplates, runtime]);

  const handleRendererReady = useCallback((renderer: { dispose: () => void }) => {
    disposeRef.current = renderer.dispose;
  }, []);

  useEffect(() => () => {
    disposeRef.current?.();
    disposeDirectorWebGLLifecycle();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-[#fafaf8] text-ink/50 text-sm">加载 3D 导演台…</div>}>
        <Director3dShell
          options={{
            project,
            shotState: state,
            shotContext: {
              shotId,
              episodeId,
              sourceChainDeskId: upstreamDeskId ?? undefined,
              sourceShotRevision: state.sourceShotRevision,
              sourceLabel: upstreamDeskId ? '分镜台链镜表' : undefined,
              episodeLabel: episodeId ? `第 ${chain?.episodes?.find((episode) => episode.id === episodeId)?.index ?? '?'} 集` : undefined,
              lineArtUrl: shotId ? lineArtByShotId[shotId] : undefined,
              confirmed: episodeConfirmed,
              upstreamConnected: Boolean(upstreamDeskId && shotId),
              shots: shots.map((shot) => ({
                id: shot.id,
                index: shot.index,
                label: shot.descriptionZh,
                episodeId: shot.episodeId,
                status: shot.status,
                has3dGuide: Boolean(shot.director3dGuide?.captureUrl),
                lineArtUrl: lineArtByShotId[shot.id],
              })),
            },
            performanceMode: runtime?.intensive ? 'low' : 'normal',
            nodeCount: nodes.length,
            onShotStateChange: persistState,
            onSelectShot: selectShot,
            onCandidateCreated: handleCandidate,
            onCommit: handleCommit,
            onUploadFile: async (file) => {
              const uploaded = await api.uploadAsset(file);
              return { url: uploaded.url, filename: uploaded.filename };
            },
            onSaveSceneTemplate: handleTemplate,
            onClose: close,
            onRendererReady: handleRendererReady,
          }}
        />
      </Suspense>
    </div>
  );
}
