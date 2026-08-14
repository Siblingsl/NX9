import { useCallback } from 'react';
import { type NodeProps, type Node as FlowNode } from '@xyflow/react';
import {
  type ChainStoryboardPayload,
  type CharacterProfile,
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
  type StoryboardPreviewPayload,
  readChainStoryboard,
} from '@nx9/shared';
import {
  buildDirectorHandoff,
  type CompositionStats,
  applyDeskBreakdown,
  buildEpisodeReadyMeta,
  computeCompositionStats,
  deskLineArtUrl,
  isShotBound,
  isShotComposed,
  packageSourceHash,
  stripEpisodeConfirmation,
  type ShotListFilter,
} from '../../../engine/storyboard-desk-runner';
import { resolveDownstreamDirectorDeskId } from '../../../engine/chain-storyboard-utils';
import { askConfirm } from '../../../stores/confirm-dialog';
import { useToast } from '../../../stores/toast';
import { useFlowCommands } from '../../../stores/flow-commands';
import {
  createShotEditDraft,
  findUpstreamScriptDeskId,
  patchShotInPayload,
  stripMentionToken,
  type ShotEditDraft,
  type StudioTab,
} from './helpers';

type StoryboardHandoffDeps = {
  props: NodeProps;
  updateNodeData: (id: string, dataUpdate: Partial<Record<string, unknown>> | ((node: FlowNode) => Partial<Record<string, unknown>>), options?: { replace: boolean }) => void;
  getNodes: () => Array<{ id: string; data?: unknown }>;
  getEdges: () => Array<{ source: string; target: string }>;
  getAllNodes: (() => Array<{ id: string; type?: string; data?: unknown }>) | undefined;
  focusBlock: ((id: string) => void) | undefined;
  appendLog: (line: string) => void;
  payload: ScriptBreakdownPayload | undefined;
  currentEpisodeShotIds: Set<string>;
  currentEpisodeId: string | null;
  currentEpisodeConfirmed: boolean;
  confirmedEpisodeIds: string[];
  visibleEpisodes: Array<{ id: string; title?: string }>;
  visibleShots: ScriptBreakdownShot[];
  compositionStats: CompositionStats;
  upstreamPackage: import('@nx9/shared').ScreenplayPackage | undefined;
  canBreakdownFromPackage: boolean;
  breakdownBlocked: boolean;
  deskBusy: boolean;
  packageStale: boolean;
  ready: boolean;
  confirmHardThreshold: boolean;
  characters: CharacterProfile[];
  scenePresets: Array<{ id: string; label: string; description?: string; source: '场景设定' | '场景库' }>;
  characterNameSet: Set<string>;
  environments: Array<{ id: string; name: string; descriptionZh?: string }>;
  workspaceScenes: Array<{ id: string; label: string; promptZh?: string; promptEn?: string; descriptionZh?: string }>;
  setShotFilter: (filter: ShotListFilter) => void;
  setStudioTab: (tab: StudioTab) => void;
  setUnconfirmBannerEpisodeId: (id: string | null) => void;
  editingShot: ScriptBreakdownShot | null;
  editDraft: ShotEditDraft | null;
  setEditDraft: React.Dispatch<React.SetStateAction<ShotEditDraft | null>>;
  pushUndo: (currentPayload: ScriptBreakdownPayload | undefined) => void;
  studioBreakdownDefault: 'breakdown' | undefined;
  setStudioOpen: (open: boolean) => void;
  setSelectedId: (id: string | null) => void;
  setEditingShotId: (id: string | null) => void;
};

export function useStoryboardHandoffOps(deps: StoryboardHandoffDeps) {
  const {
    props,
    updateNodeData,
    getNodes,
    getEdges,
    getAllNodes,
    focusBlock,
    appendLog,
    payload,
    currentEpisodeShotIds,
    currentEpisodeId,
    currentEpisodeConfirmed,
    confirmedEpisodeIds,
    visibleEpisodes,
    visibleShots,
    compositionStats,
    upstreamPackage,
    canBreakdownFromPackage,
    breakdownBlocked,
    deskBusy,
    packageStale,
    ready,
    confirmHardThreshold,
    characters,
    scenePresets,
    characterNameSet,
    environments,
    workspaceScenes,
    setShotFilter,
    setStudioTab,
    setUnconfirmBannerEpisodeId,
    editingShot,
    editDraft,
    setEditDraft,
    pushUndo,
    studioBreakdownDefault,
    setStudioOpen,
    setSelectedId,
    setEditingShotId,
  } = deps;
  /** SB-D-04: 交接数据统一构建；确认自动推送与「打开导演台」共用，避免字段漂移 */
  type DirectorHandoffOverrides = {
    confirmed?: boolean;
    confirmedEpisodeIds?: string[];
    confirmedAt?: string | null;
    chain?: ChainStoryboardPayload | null;
    focus?: boolean;
  };

  const buildDirectorHandoffForNode = useCallback(
    (handoffVersion: number, overrides?: DirectorHandoffOverrides) => {
      const liveData = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined) ?? props.data;
      return buildDirectorHandoff({
        sourceStoryboardBlockId: props.id,
        preview: (liveData?.storyboardPreview as StoryboardPreviewPayload | undefined) ?? (props.data?.storyboardPreview as StoryboardPreviewPayload | undefined),
        currentEpisodeShotIds,
        chain: overrides?.chain ?? readChainStoryboard(liveData),
        scriptHash: upstreamPackage ? packageSourceHash(upstreamPackage) : '',
        episodeId: currentEpisodeId,
        episodeTitle: visibleEpisodes[0]?.title ?? undefined,
        shotCount: visibleShots.length,
        shotIds: visibleShots.map((s) => s.id),
        compositionCoverage: compositionStats.coverage,
        confirmed: overrides?.confirmed ?? currentEpisodeConfirmed,
        confirmedEpisodeIds: overrides?.confirmedEpisodeIds ?? confirmedEpisodeIds,
        handoffVersion,
        confirmedAt: overrides?.confirmedAt ?? (props.data?.confirmedAt as string | undefined),
      });
    },
    [
      compositionStats.coverage,
      confirmedEpisodeIds,
      currentEpisodeConfirmed,
      currentEpisodeId,
      currentEpisodeShotIds,
      getNodes,
      props.data,
      props.id,
      upstreamPackage,
      visibleEpisodes,
      visibleShots,
    ],
  );
  const pushDirectorHandoff = useCallback(
    (deskId: string, handoffVersion: number, overrides?: DirectorHandoffOverrides) => {
      const handoff = buildDirectorHandoffForNode(handoffVersion, overrides);
      updateNodeData(deskId, {
        lastHandoff: {
          from: 'storyboard-desk',
          to: 'director-desk',
          fromId: props.id,
          ...handoff,
        },
        lastHandoffStatus: 'ready',
        lastHandoffInvalidReason: null,
      });
      if (overrides?.focus && focusBlock) focusBlock(deskId);
      return handoff;
    },
    [buildDirectorHandoffForNode, focusBlock, props.id, updateNodeData],
  );

  const confirmCurrentEpisode = useCallback(async () => {
    if (!currentEpisodeId || visibleShots.length === 0) return;
    if (deskBusy) return;

    if (packageStale) {
      const ok = await askConfirm({
        title: '上游成稿已更新',
        description: '当前镜表与上游成稿不同步。建议先重拆本集，再确认交接。仍要按现状确认？',
        confirmLabel: '仍要确认',
        cancelLabel: '取消',
      });
      if (!ok) return;
    }

    const preview = props.data?.storyboardPreview as StoryboardPreviewPayload | undefined;
    const urlMap = new Map<string, string | undefined>();
    // Q-04 优先级 1: 本节点 storyboardPreview 帧（SSOT）
    for (const frame of preview?.frames ?? []) {
      if (frame.sourceShotId && frame.imageUrl) {
        urlMap.set(frame.sourceShotId, frame.imageUrl);
      }
    }
    // Q-04 优先级 2: 本节点 chain 线稿（不含导演关键帧，避免覆盖率把彩图当线稿）
    // SB-OL-16: 不再 getAllChainShots 扫全画布 —— 多分镜台并存时会吃他台镜图，覆盖率虚高
    const ownChain = readChainStoryboard(props.data as Record<string, unknown>);
    for (const s of ownChain?.shots ?? []) {
      const url = deskLineArtUrl(s);
      if (url && !urlMap.get(s.id)) urlMap.set(s.id, url);
    }
    const sceneNameSet = new Set([
      ...environments.map((e) => e.name.trim()),
      ...workspaceScenes.map((i) => i.label.trim()),
    ].filter(Boolean));
    const stats = computeCompositionStats(
      visibleShots,
      preview,
      urlMap,
      characterNameSet,
      sceneNameSet,
    );
    const unboundShots = visibleShots.filter(
      (s) => !isShotBound(s, characterNameSet, sceneNameSet),
    );
    if (unboundShots.length > 0) {
      const unboundList = unboundShots
        .slice(0, 12)
        .map((s) => s.sceneCode || `#${s.index}`)
        .join(', ');
      const more = unboundShots.length > 12 ? ` 等 ${unboundShots.length} 镜` : '';
      const ok = await askConfirm({
        title: '仍有未绑定镜头',
        description: !ready
          ? `上游设定未就绪，${unboundShots.length} 镜的角色/场景无法匹配素材库（${unboundList}${more}）。建议先在编剧台标记设定就绪，或在编辑里修正 @角色/@场景。仍要确认？`
          : `${unboundShots.length} 镜未绑定角色或场景：${unboundList}${more}\n建议先在镜表编辑里补齐。仍要确认？`,
        confirmLabel: '仍要确认',
        cancelLabel: '去处理',
      });
      if (!ok) {
        setShotFilter('unbound');
        setStudioTab('grid');
        return;
      }
    }
    const missingShots = visibleShots.filter(
      (s) => !isShotComposed(s, preview, urlMap.get(s.id)),
    );
    if (stats.coverage < 0.6 && missingShots.length > 0) {
      if (confirmHardThreshold) {
        const missingList = missingShots.map((s) => s.sceneCode || `#${s.index}`).join(', ');
        useToast.getState().push({
          message: `硬阈值：构图覆盖 ${Math.round(stats.coverage * 100)}% 未达标（≥60%）· 缺图: ${missingList}`,
          variant: 'error',
        });
        return;
      }
      const missingList = missingShots.map((s) => s.sceneCode || `#${s.index}`).join(', ');
      const ok = await askConfirm({
        title: '确认检查',
        description: `镜头数: ${visibleShots.length}\n构图覆盖: ${Math.round(stats.coverage * 100)}%（建议 ≥ 60%）\n缺图: ${missingList}\n\n仍要确认本集？`,
        confirmLabel: '仍要确认',
        cancelLabel: '取消',
      });
      if (!ok) return;
    }
    const readyMeta = buildEpisodeReadyMeta({
      deskId: props.id,
      episodeId: currentEpisodeId,
      shotCount: visibleShots.length,
      compositionCoverage: stats.coverage,
    });
    const nextConfirmedEpisodeIds = [...new Set([...confirmedEpisodeIds, currentEpisodeId])];
    const confirmedAt = new Date().toISOString();
    const currentChain = readChainStoryboard(props.data as Record<string, unknown>);
    const nextChain = currentChain
      ? { ...currentChain, gridConfirmed: true, confirmedEpisodeIds: nextConfirmedEpisodeIds }
      : undefined;
    updateNodeData(props.id, {
      status: 'success',
      gridConfirmed: true,
      confirmedEpisodeIds: nextConfirmedEpisodeIds,
      ...(nextChain ? { chainStoryboard: nextChain } : {}),
      confirmedAt,
      meta: readyMeta,
      episodeReadyMeta: readyMeta,
    });
    // SB-D-04: 已连下游导演台时，确认后自动同步交接（版本递增，含新确认位）
    const nodes = getAllNodes?.() ?? getNodes();
    const edges = getEdges();
    const downstreamDeskId = resolveDownstreamDirectorDeskId(props.id, nodes as any, edges as any);
    if (downstreamDeskId) {
      const nextHandoffVersion = Number(props.data?.handoffVersion ?? 0) + 1;
      updateNodeData(props.id, { handoffVersion: nextHandoffVersion });
      pushDirectorHandoff(downstreamDeskId, nextHandoffVersion, {
        confirmed: true,
        confirmedEpisodeIds: nextConfirmedEpisodeIds,
        confirmedAt,
        chain: nextChain,
      });
      appendLog('本集确认已自动同步至下游导演台 · 交接数据已更新');
    }
    setUnconfirmBannerEpisodeId(null);
    appendLog(
      `本集已确认可交导演台 · ${visibleEpisodes[0]?.title ?? currentEpisodeId} / ${visibleShots.length} 镜 · 构图 ${Math.round(stats.coverage * 100)}%`,
    );
    setStudioTab('handoff');
  }, [
    appendLog,
    characterNameSet,
    confirmHardThreshold,
    confirmedEpisodeIds,
    currentEpisodeId,
    deskBusy,
    environments,
    packageStale,
    props.data,
    props.id,
    ready,
    updateNodeData,
    visibleEpisodes,
    visibleShots,
    workspaceScenes,
    getNodes,
    getAllNodes,
    getEdges,
    pushDirectorHandoff,
    resolveDownstreamDirectorDeskId,
  ]);

  const openDirectorDesk = useCallback(() => {
    const nodes = getAllNodes?.() ?? getNodes();
    const edges = getEdges();
    // SB-D-01: 多链并存时只找本台下游导演台，禁止全画布 find 第一个
    const deskId = resolveDownstreamDirectorDeskId(props.id, nodes as any, edges as any);
    const desk = deskId ? nodes.find((n) => n.id === deskId) : undefined;
    const handoffVersion = Number(props.data?.handoffVersion ?? 0) + 1;
    updateNodeData(props.id, { handoffVersion });
    if (desk && focusBlock) {
      pushDirectorHandoff(desk.id, handoffVersion, { focus: true });
      appendLog('已聚焦导演台 · 交接数据已同步');
      return;
    }
    const handoff = buildDirectorHandoffForNode(handoffVersion);
    useFlowCommands.getState().requestSpawn('director-desk', undefined, {
      connectToSource: props.id,
      lastHandoff: {
        from: 'storyboard-desk',
        to: 'director-desk',
        fromId: props.id,
        ...handoff,
      },
      lastHandoffStatus: 'ready',
    });
    appendLog('已创建导演台并连线 · 交接数据已推送');
  }, [appendLog, buildDirectorHandoffForNode, focusBlock, getAllNodes, getEdges, getNodes, props.data, props.id, pushDirectorHandoff, updateNodeData]);

  const saveShotEdit = useCallback(() => {
    if (!payload || !editingShot || !editDraft) return;
    const dialogueText = editDraft.dialogueText.trim();
    const dialogueSpeaker = editDraft.dialogueSpeaker.trim();
    const dialogue = dialogueText
      ? [{
          speaker: dialogueSpeaker || editingShot.dialogue?.[0]?.speaker || editDraft.characters[0] || '旁白',
          text: dialogueText,
          emotion: editingShot.dialogue?.[0]?.emotion,
        }]
      : editingShot.dialogue;
    const notesRaw = Array.isArray(editDraft.continuityNotes)
      ? editDraft.continuityNotes
      : String(editDraft.continuityNotes ?? '')
          .split(/[；;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
    /** P0：写入正式库名；chain 侧由 applyDeskBreakdown → bindStoryboardShotAssets 填 id */
    const resolveCharacterName = (raw: string): string => {
      const token = stripMentionToken(raw);
      const hit = characters.find((c) => {
        const keys = [c.name, c.creative?.nickname, ...(c.creative?.aliases ?? [])]
          .map((x) => x?.trim().toLowerCase())
          .filter(Boolean);
        return keys.includes(token.trim().toLowerCase());
      });
      return hit?.name.trim() || token.trim();
    };
    const nextCharacters = editDraft.characters
      .map(resolveCharacterName)
      .filter(Boolean);
    const nextScene = stripMentionToken(editDraft.scene);
    const sceneHit =
      scenePresets.find((s) => s.label.trim().toLowerCase() === nextScene.trim().toLowerCase())
      ?? null;
    const next = patchShotInPayload(payload, editingShot.id, {
      title: editDraft.title,
      durationSec: Math.max(1, Math.round(Number(editDraft.durationSec) || editingShot.durationSec || 5)),
      scene: sceneHit?.label ?? nextScene,
      characters: nextCharacters,
      purpose: editDraft.purpose,
      scriptText: editDraft.scriptText,
      imagePrompt: editDraft.imagePrompt,
      videoPrompt: editDraft.videoPrompt,
      sketchPrompt: editDraft.sketchPrompt?.trim() || undefined,
      shotSize: editDraft.shotSize,
      cameraMove: editDraft.cameraMove,
      cameraAngle: editDraft.cameraAngle,
      cameraLens: editDraft.cameraLens,
      visual: editDraft.visual,
      action: editDraft.action,
      narration: editDraft.narration,
      sound: editDraft.sound,
      audiovisualLanguage: editDraft.audiovisualLanguage,
      negativePrompt: editDraft.negativePrompt,
      compositionTemplateId: editDraft.compositionTemplateId ?? null,
      continuityNotes: notesRaw,
      dialogue,
      costumeOverrides: (editDraft.costumeOverrides ?? [])
        .filter((o) => o.characterName?.trim() && o.costumeId?.trim())
        .map((o) => ({
          characterName: resolveCharacterName(o.characterName),
          costumeId: o.costumeId,
          costumeLabel: o.costumeLabel,
        })),
      propIds: [...(editDraft.propIds ?? [])],
      shotAssetId: editDraft.shotAssetId?.trim() || null,
    });
    pushUndo(payload);
    applyDeskBreakdown(props.id, next, updateNodeData, {
      ...stripEpisodeConfirmation(props.data, currentEpisodeId),
      chainStoryboard: (props.data as Record<string, unknown>)?.chainStoryboard,
    });
    setEditingShotId(null);
    appendLog(
      `已修改分镜 · ${editingShot.sceneCode} ${editDraft.title}`
      + (sceneHit ? ` · 场景已绑 ${sceneHit.id.slice(0, 8)}` : '')
      + (nextCharacters.length ? ` · 角色 ${nextCharacters.length}` : ''),
    );
  }, [appendLog, characters, editDraft, editingShot, payload, props.data, props.id, pushUndo, scenePresets, updateNodeData, currentEpisodeId]);

  const toggleDraftCharacter = useCallback((name: string) => {
    setEditDraft((current) => {
      if (!current) return current;
      const exists = current.characters.some((item) => item.trim() === name);
      return {
        ...current,
        characters: exists
          ? current.characters.filter((item) => item.trim() !== name)
          : [...current.characters, name],
      };
    });
  }, []);

  const openStudio = useCallback((tab: StudioTab = 'grid') => {
    // 无镜表时默认进拆镜 Tab；H-04：handoff 指定时优先
    const next = studioBreakdownDefault
      ? 'breakdown'
      : !payload && (tab === 'grid' || tab === 'compose') ? 'breakdown' : tab;
    setStudioTab(next);
    setStudioOpen(true);
  }, [payload, studioBreakdownDefault]);

  /** 打开连线上游编剧台并请求展开（确认成稿后再回分镜同步） */
  const openUpstreamScriptDeskForConfirm = useCallback(() => {
    const nodes = getAllNodes?.() ?? getNodes();
    const edges = getEdges();
    const scriptDeskId = findUpstreamScriptDeskId(props.id, nodes, edges);
    if (!scriptDeskId) {
      appendLog('分镜台：未找到连线上游编剧台');
      return;
    }
    const title = upstreamPackage?.brief?.title?.trim() || '上游成稿';
    updateNodeData(scriptDeskId, {
      openStudioRequest: {
        at: new Date().toISOString(),
        reason: 'confirm-for-breakdown',
        fromId: props.id,
        title,
      },
    });
    setStudioOpen(false);
    focusBlock?.(scriptDeskId);
    appendLog(`已打开上游编剧台 · ${title} · 请确认成稿后回分镜台同步`);
  }, [appendLog, focusBlock, getAllNodes, getEdges, getNodes, props.id, updateNodeData, upstreamPackage?.brief?.title]);
  const openEdit = useCallback((shotId: string) => {
    setSelectedId(shotId);
    setEditingShotId(shotId);
  }, []);

  return {
    buildDirectorHandoffForNode,
    pushDirectorHandoff,
    confirmCurrentEpisode,
    openDirectorDesk,
    saveShotEdit,
    toggleDraftCharacter,
    openStudio,
    openUpstreamScriptDeskForConfirm,
    openEdit,
  };
}
