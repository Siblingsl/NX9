import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { resolveBlockCharacters, type CharacterProfile } from '@nx9/shared';
import {
  Director3dShell,
  normalizeDirectorProject,
  normalizeShotState,
  projectFromShotState,
  type Director3dCommitPayload,
  type Director3dSceneTemplate,
  type Director3dShotState,
  type DirectorProject,
} from '@nx9/director3d';
import type { Node } from '@xyflow/react';
import { prepareDirectorProjectForShot } from '../../../engine/director3d-character-sync';
import { createDirector3dCommitAdapter, sceneByShotFromNodeData } from '../../../engine/director3d-commit-adapter';
import { api } from '../../../api/client';
import { disposeDirectorWebGLLifecycle } from '../../../engine/director-webgl-lifecycle';
import { applyPoseTransaction } from '../../../engine/agent-director3d-bridge';
import AgentPoseInput from './agent-pose-input';
import { askConfirm } from '../../../stores/confirm-dialog';

export function Director3dStageEmbed({
  blockId,
  project: rawProject,
  linkedShotId,
  shots,
  characters,
  data,
  updateNodeData,
  appendLog,
  focusShot,
  nodes,
  edges,
  sourceChainDeskId,
  episodeLabel,
  episodeConfirmed = false,
  lineArtByShotId,
}: {
  blockId: string;
  project: DirectorProject;
  linkedShotId: string | null | undefined;
  shots: Array<Record<string, unknown>>;
  characters: CharacterProfile[];
  data: Record<string, unknown>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  appendLog: (msg: string) => void;
  focusShot: (shotId: string) => void;
  nodes: Node[];
  edges: Array<{ source: string; target: string }>;
  sourceChainDeskId?: string;
  episodeLabel?: string;
  episodeConfirmed?: boolean;
  lineArtByShotId: Record<string, string>;
}) {
  const baseProject = useMemo(() => normalizeDirectorProject(rawProject), [rawProject]);
  const sceneByShot = useMemo(() => sceneByShotFromNodeData(data), [data]);
  const firstShotId = (shots[0]?.id as string | undefined) ?? null;
  const [currentShotId, setCurrentShotId] = useState<string | null>(linkedShotId ?? firstShotId);
  const [state, setState] = useState<Director3dShotState | null>(null);
  const disposeRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (linkedShotId) setCurrentShotId(linkedShotId);
  }, [linkedShotId]);

  const loadState = useCallback((shotId: string | null) => {
    const id = shotId ?? '__standalone__';
    const stored = sceneByShot[id];
    const shot = shots.find((item) => item.id === id) as Record<string, unknown> | undefined;
    const episodeId = shot?.episodeId as string | null | undefined;
    const next = normalizeShotState(stored, id, baseProject);
    if (!stored && shot) {
      const shotCharacters = resolveBlockCharacters(data, shot as never, characters);
      const shotCharacterIds = Array.isArray(shot.characterIds)
        ? shot.characterIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : shotCharacters.map((character) => character.id);
      const shotCharacterNames = Array.isArray(shot.characterNames)
        ? shot.characterNames.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
        : shotCharacters.map((character) => character.name);
      const prepared = prepareDirectorProjectForShot(
        projectFromShotState(next, baseProject),
        shotCharacterIds,
        characters,
        (shot.director3dGuide as { characterPlacements?: never[] } | undefined)?.characterPlacements,
        shotCharacterNames,
      );
      const migrated = {
        ...next,
        episodeId,
        sourceChainDeskId,
        sourceShotRevision: (data.lastHandoff as { chainRevision?: number } | undefined)?.chainRevision,
        objects: prepared.objects,
      };
      setState(migrated);
      updateNodeData(blockId, { sceneByShot: { ...sceneByShot, [id]: migrated } });
      return;
    }
    setState({ ...next, episodeId, sourceChainDeskId });
  }, [baseProject, blockId, characters, data, sceneByShot, shots, sourceChainDeskId, updateNodeData]);

  useEffect(() => { loadState(currentShotId); }, [currentShotId, loadState]);

  const currentState = state ?? normalizeShotState(undefined, currentShotId ?? '__standalone__', baseProject);
  const currentProject = useMemo(() => projectFromShotState(currentState, baseProject), [baseProject, currentState]);

  const persistState = useCallback((next: Director3dShotState) => {
    setState(next);
    const previous = sceneByShotFromNodeData(data);
    updateNodeData(blockId, {
      sceneByShot: { ...previous, [next.shotId]: next },
    });
  }, [blockId, data, updateNodeData]);

  const commit = useMemo(() => createDirector3dCommitAdapter({
    blockId,
    nodes,
    edges,
    updateNodeData,
    currentSourceShotRevision: currentState.sourceShotRevision,
    onCommitted: (payload) => appendLog(`3D 构图已提交，可进入彩色关键帧批出 · 镜 ${payload.shotId}`),
  }), [blockId, currentState.sourceShotRevision, edges, nodes, updateNodeData, appendLog]);

  const handleCommit = useCallback((payload: Director3dCommitPayload) => {
    const result = commit(payload);
    if (!result.ok) throw new Error(result.error ?? '3D 构图提交失败');
  }, [commit]);

  const handleCandidate = useCallback(async (payload: { dataUrl: string; shotId: string; stateVersion: number }) => {
    if (!currentShotId || payload.shotId !== currentShotId) throw new Error('镜头已切换，请重新记录候选帧');
    const blob = await (await fetch(payload.dataUrl)).blob();
    const file = new File([blob], `director3d-${payload.shotId}-${Date.now()}.png`, { type: 'image/png' });
    const uploaded = await api.uploadAsset(file);
    return { imageUrl: uploaded.url };
  }, [currentShotId]);

  const handleTemplate = useCallback((template: Director3dSceneTemplate) => {
    const templates = (data.sceneTemplates as Record<string, Director3dSceneTemplate> | undefined) ?? {};
    updateNodeData(blockId, { sceneTemplates: { ...templates, [template.id]: template } });
    appendLog(`已保存场景模板「${template.name}」，角色不会固化到模板`);
  }, [appendLog, blockId, data.sceneTemplates, updateNodeData]);

  const handleAgentPose = useCallback(async (command: Parameters<typeof applyPoseTransaction>[1]['command'] | null) => {
    if (!command) return;
    const confirmed = await askConfirm({
      title: '确认应用 Agent 3D 摆位',
      description: '将把预览中的角色和相机变化应用到当前镜头，可使用撤销恢复。',
      confirmLabel: '应用摆位',
    });
    const result = applyPoseTransaction(
      currentState,
      { shotId: currentState.shotId, baseStateVersion: currentState.stateVersion, command },
      confirmed,
    );
    if (!result.ok || !result.nextState) throw new Error(result.error ?? 'Agent 摆位应用失败');
    persistState(result.nextState);
    appendLog(`Agent 3D 摆位已应用 · ${result.summary ?? ''}`);
  }, [appendLog, currentState, persistState]);

  const handleRendererReady = useCallback((renderer: { dispose: () => void }) => {
    disposeRef.current = renderer.dispose;
  }, []);

  useEffect(() => () => {
    disposeRef.current?.();
    disposeDirectorWebGLLifecycle();
  }, []);

  const shotItems = shots.map((shot) => ({
    id: shot.id as string,
    index: Number(shot.index ?? 0),
    label: (shot.descriptionZh ?? shot.promptEn) as string | undefined,
    episodeId: shot.episodeId as string | null | undefined,
    status: shot.status as string | undefined,
    has3dGuide: Boolean((shot.director3dGuide as { captureUrl?: string } | undefined)?.captureUrl),
    lineArtUrl: lineArtByShotId[shot.id as string],
  }));

  return (
    <div className="flex flex-col h-full" style={{ height: '100%' }}>
      <AgentPoseInput onPose={handleAgentPose} />
      <Director3dShell
        options={{
          project: currentProject,
          shotState: currentState,
          shotContext: {
            shotId: currentShotId ?? undefined,
            episodeId: currentState.episodeId,
            sourceChainDeskId,
            sourceShotRevision: currentState.sourceShotRevision,
            sourceLabel: sourceChainDeskId ? '分镜台链镜表' : undefined,
            episodeLabel,
            lineArtUrl: currentShotId ? lineArtByShotId[currentShotId] : undefined,
            confirmed: episodeConfirmed,
            upstreamConnected: Boolean(sourceChainDeskId && currentShotId),
            shots: shotItems,
          },
          performanceMode: 'normal',
          crowdMax: 20,
          onShotStateChange: persistState,
          onSelectShot: (shotId) => { setCurrentShotId(shotId); focusShot(shotId); },
          onCandidateCreated: handleCandidate,
          onCommit: handleCommit,
          onUploadFile: async (file) => {
            const uploaded = await api.uploadAsset(file);
            return { url: uploaded.url, filename: uploaded.filename };
          },
          onSaveSceneTemplate: handleTemplate,
          onRendererReady: handleRendererReady,
        }}
      />
      <div className="sr-only">
        <select value={currentShotId ?? ''} onChange={(event) => { setCurrentShotId(event.target.value || null); if (event.target.value) focusShot(event.target.value); }}>
          <option value="">独立场景模式</option>
          {shotItems.map((shot) => <option key={shot.id} value={shot.id}>{shot.index} {shot.label}</option>)}
        </select>
        <span>{currentShotId ?? 'standalone'}</span>
      </div>
    </div>
  );
}
