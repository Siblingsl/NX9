import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, ImagePlus, Loader2, Pencil, Sparkles } from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  type AssetLibraryKind,
  type BacklotWorkspaceItem,
  type CharacterProfile,
  type EnvironmentProfile,
  buildLineArtShotPrompt,
  createScriptBreakdownPromptPack,
  parseScriptBreakdownPromptPack,
  DEFAULT_SCRIPT_BREAKDOWN_PROMPTS,
  normalizeScriptBreakdownPrompts,
  screenplayFullText,
  type ScriptBreakdownPromptPack,
  type ScriptBreakdownPromptTemplates,
  emptyStoryboardPreview,
  flattenScriptBreakdownShots,
  resolveConnectedPictureGenId,
  resolveStoryboardPreviewPictureSettings,
  bindStoryboardShotAssets,
  writeBackBreakdownPreviewImage,
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
  type StoryboardPreviewFrame,
  type StoryboardPreviewPayload,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { isDevPromptEnabled, useDevPromptOverrides } from '../../stores/dev-prompt-overrides';
import { applyScriptBreakdownPayload, runProductionScriptBreakdownForEpisodes } from '../../engine/script-breakdown-runner';
import {
  addShotToBreakdown,
  applyDeskBreakdown,
  buildBreakdownDiagnostics,
  buildEpisodeReadyMeta,
  computeCompositionStats,
  filterShots,
  isShotComposed,
  mergeIncrementalBreakdown,
  mergeShotsInBreakdown,
  packageSourceHash,
  runBreakdownFromPackage,
  splitShotInBreakdown,
  suggestedTrialCap,
  type ShotListFilter,
  type StoryboardDeskMode,
} from '../../engine/storyboard-desk-runner';
import { checkAssetGateInEdges } from '../../engine/asset-gate-runner';
import { AssetMentionInput } from '../../engine/stage-deck/chrome/asset-mention/AssetMentionInput';
import { StoryboardPreviewWorkspace } from '../../engine/stage-deck/chrome/attached-workspace/storyboard-preview/StoryboardPreviewWorkspace';
import { generateStoryboardFrameImage } from '../../engine/storyboard-preview-runner';
import {
  buildDeskContactSheetSignature,
  composeStoryboardSheetPng,
  deskSheetCellsFromBreakdownShots,
} from '../../engine/storyboard-sheet-compose';
import { api } from '../../api/client';
import { toastSuccess } from '../../stores/toast';
import { useFlowRuntime } from '../../stores/flow-runtime';
import './storyboard-desk.css';
import './storyboard-desk.v2.css';

function compact(text: string, max = 68) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function useUpstreamBreakdown(blockId: string): ScriptBreakdownPayload | undefined {
  const { getEdges, getNodes } = useReactFlow();
  return useMemo(() => {
    const nodes = getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const incoming = getEdges().filter((e) => e.target === blockId);
    for (const edge of incoming) {
      const data = byId.get(edge.source)?.data as Record<string, unknown> | undefined;
      const payload = (
        data?.scriptBreakdown
        ?? data?.legacyScriptBreakdown
      ) as ScriptBreakdownPayload | undefined;
      if (payload?.version === 1) return payload;
    }
    return undefined;
  }, [blockId, getEdges, getNodes]);
}

function useUpstreamScreenplay(blockId: string): import('@nx9/shared').ScreenplayPackage | undefined {
  const { getEdges, getNodes } = useReactFlow();
  return useMemo(() => {
    const nodes = getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const incoming = getEdges().filter((e) => e.target === blockId);
    for (const edge of incoming) {
      const data = byId.get(edge.source)?.data as Record<string, unknown> | undefined;
      const pkg = data?.package;
      if (
        pkg
        && typeof pkg === 'object'
        && (pkg as { schema?: string }).schema === 'nx9-screenplay-package'
        && (pkg as { version?: number }).version === 1
      ) {
        return pkg as import('@nx9/shared').ScreenplayPackage;
      }
    }
    return undefined;
  }, [blockId, getEdges, getNodes]);
}

function clonePayload(payload: ScriptBreakdownPayload): ScriptBreakdownPayload {
  return JSON.parse(JSON.stringify(payload)) as ScriptBreakdownPayload;
}

function namesToText(names: string[]): string {
  return names.join('、');
}

function textToNames(value: string): string[] {
  return value
    .split(/[、,，\s]+/)
    .map((item) => item.trim().replace(/^@角色:/, ''))
    .filter(Boolean)
    .slice(0, 20);
}

function stripMentionToken(value: string): string {
  return value.trim().replace(/^@(角色|场景|镜头|情绪|钩子|声音):/, '');
}

function scenePresetName(item: EnvironmentProfile | BacklotWorkspaceItem): string {
  if ('name' in item) return item.name;
  return item.label;
}

function characterMeta(character: CharacterProfile): string {
  return [character.bible?.identity, character.descriptionZh, character.creative?.nickname]
    .filter(Boolean)
    .join(' · ');
}

const GLOBAL_MENTION_KINDS: AssetLibraryKind[] = ['character', 'scene', 'shot', 'emotion', 'hook', 'sound'];
const CHARACTER_MENTION_KINDS: AssetLibraryKind[] = ['character'];
const SCENE_MENTION_KINDS: AssetLibraryKind[] = ['scene'];

function patchShotInPayload(
  payload: ScriptBreakdownPayload,
  shotId: string,
  patch: Partial<ScriptBreakdownShot>,
): ScriptBreakdownPayload {
  const next = clonePayload(payload);
  for (const episode of next.episodes) {
    episode.shots = episode.shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot));
    episode.scenes = episode.scenes?.map((scene) => ({
      ...scene,
      shots: scene.shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)),
    }));
  }
  return next;
}

/** 与剧本拆分正式表对齐的可编辑字段 */
type ShotEditDraft = Pick<
  ScriptBreakdownShot,
  | 'title'
  | 'durationSec'
  | 'scene'
  | 'characters'
  | 'purpose'
  | 'scriptText'
  | 'imagePrompt'
  | 'videoPrompt'
  | 'sketchPrompt'
  | 'shotSize'
  | 'cameraMove'
  | 'cameraAngle'
  | 'cameraLens'
  | 'visual'
  | 'action'
  | 'narration'
  | 'sound'
  | 'audiovisualLanguage'
  | 'negativePrompt'
  | 'continuityNotes'
> & {
  /** 对白文本（首条），保存时写回 dialogue[0] */
  dialogueText: string;
  dialogueSpeaker: string;
};

function createShotEditDraft(shot: ScriptBreakdownShot): ShotEditDraft {
  return {
    title: shot.title,
    durationSec: shot.durationSec,
    scene: shot.scene,
    characters: [...(shot.characters ?? [])],
    purpose: shot.purpose,
    scriptText: shot.scriptText,
    imagePrompt: shot.imagePrompt,
    videoPrompt: shot.videoPrompt,
    sketchPrompt: shot.sketchPrompt ?? '',
    shotSize: shot.shotSize,
    cameraMove: shot.cameraMove,
    cameraAngle: shot.cameraAngle,
    cameraLens: shot.cameraLens,
    visual: shot.visual,
    action: shot.action,
    narration: shot.narration,
    sound: shot.sound,
    audiovisualLanguage: shot.audiovisualLanguage,
    negativePrompt: shot.negativePrompt,
    continuityNotes: shot.continuityNotes ? [...shot.continuityNotes] : [],
    dialogueText: shot.dialogue?.[0]?.text ?? '',
    dialogueSpeaker: shot.dialogue?.[0]?.speaker ?? '',
  };
}

function shotDialogueLine(shot: ScriptBreakdownShot): string {
  return (
    shot.dialogue?.[0]?.text
    || shot.scriptText
    || shot.action
    || shot.visual
    || shot.title
    || '—'
  );
}

const SHOT_SIZES = ['ECU', 'CU', 'MS', 'FS', 'WS', 'OTS'] as const;
const CAMERA_MOVES = ['固定', '推', '拉', '摇', '移', '跟', '手持'] as const;

/** 分镜表主视图：故事板宫格卡片 */
function ShotStoryCell({
  shot,
  selected,
  storyboardUrl,
  generating,
  onSelect,
  onUpload,
  onGenerate,
  onGenerateLineArt,
  onEdit,
}: {
  shot: ScriptBreakdownShot;
  selected?: boolean;
  storyboardUrl?: string | null;
  generating?: boolean;
  onSelect: () => void;
  onUpload: (url: string) => void;
  onGenerate: () => void;
  onGenerateLineArt: () => void;
  onEdit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const url = shot.previewImageUrl || shot.referenceImageUrl || storyboardUrl || null;
  const busy = uploading || generating;
  const line = shotDialogueLine(shot);
  const tech = [shot.shotSize, shot.cameraMove, shot.cameraAngle, shot.cameraLens]
    .filter(Boolean)
    .join(' · ');
  const sub = [
    shot.scene?.trim(),
    shot.characters?.length ? shot.characters.join('、') : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const badge = busy
    ? { cls: 'is-run', text: uploading ? '上传中' : '生成中' }
    : url
      ? { cls: 'is-ok', text: '已出图' }
      : { cls: 'is-miss', text: '缺图' };

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const res = await api.uploadAsset(file);
        onUpload(res.url);
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [onUpload],
  );

  return (
    <article
      className={`sg-story-cell${selected ? ' is-on' : ''}${busy ? ' is-run' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <button type="button" className="sg-story-cell__hit" onClick={onSelect}>
        <div
          className="sg-story-cell__media"
          onClick={(e) => {
            e.stopPropagation();
            if (!busy) inputRef.current?.click();
          }}
        >
          {busy ? (
            <span className="sg-story-cell__empty">
              <Loader2 size={16} className="animate-spin" />
              <span>{uploading ? '上传中' : '生成中'}</span>
            </span>
          ) : url ? (
            <img src={url} alt="" />
          ) : (
            <span className="sg-story-cell__empty">
              <ImagePlus size={16} />
              <span>点击上传</span>
            </span>
          )}
          <span className={`sg-story-badge ${badge.cls}`}>{badge.text}</span>
        </div>
        <div className="sg-story-cell__meta">
          <strong>
            <span>{shot.title?.trim() || shot.sceneCode || `镜 ${shot.index}`}</span>
            <em>{shot.sceneCode || `S${shot.index}`}</em>
          </strong>
          {tech ? <span className="sg-story-cell__tech">{tech}</span> : null}
          <p title={line}>{line}</p>
          {sub ? <span className="sg-story-cell__sub" title={sub}>{sub}</span> : null}
        </div>
      </button>
      <div className="sg-story-cell__acts">
        <button
          type="button"
          className="sg-story-cell__act"
          title="生成线稿构图"
          disabled={busy}
          onClick={onGenerateLineArt}
        >
          <Pencil size={11} />
          线稿
        </button>
        <button
          type="button"
          className="sg-story-cell__act"
          title="生成关键帧成图"
          disabled={busy}
          onClick={onGenerate}
        >
          <Sparkles size={11} />
          关键帧
        </button>
        <button
          type="button"
          className="sg-story-cell__act"
          title="编辑镜头字段"
          onClick={onEdit}
        >
          <Pencil size={11} />
          编辑
        </button>
      </div>
    </article>
  );
}

/** 主台：拆镜 | 镜表 | 构图 | 交接（取消独立分集 Tab） */
type StudioTab = StoryboardDeskMode;

function StoryboardDeskBlock(props: NodeProps) {
  const { updateNodeData, getEdges, getNodes } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const focusBlock = useFlowRuntime((s) => s.runtime?.focusBlock);
  const getAllNodes = useFlowRuntime((s) => s.runtime?.getNodes);
  const upstream = useUpstreamBreakdown(props.id);
  const upstreamPackage = useUpstreamScreenplay(props.id);
  const local = props.data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const payload = local ?? undefined;
  const [breakingDown, setBreakingDown] = useState(false);
  const [shotFilter, setShotFilter] = useState<ShotListFilter>('all');
  const [incrementalText, setIncrementalText] = useState('');
  const [incrementalBusy, setIncrementalBusy] = useState(false);
  const shots = useMemo(() => flattenScriptBreakdownShots(payload), [payload]);
  const activeEpisodeId = useWorkspaceDocument((state) => state.storyboard.activeEpisodeId);
  const setActiveEpisodeId = useWorkspaceDocument((state) => state.setActiveEpisodeId);
  const characters = useWorkspaceDocument((state) => state.characters.characters);
  const environmentLibrary = useWorkspaceDocument((state) => state.environments);
  const workspaceItems = useWorkspaceDocument((state) => state.backlotWorkspace.items);
  const environments = useMemo(() => environmentLibrary?.environments ?? [], [environmentLibrary]);
  const workspaceScenes = useMemo(
    () => workspaceItems.filter((item) => item.kind === 'scene'),
    [workspaceItems],
  );
  const currentEpisodeId = activeEpisodeId ?? payload?.episodes[0]?.id ?? null;
  const confirmedEpisodeIds = Array.isArray(props.data?.confirmedEpisodeIds)
    ? (props.data.confirmedEpisodeIds as string[])
    : [];
  const currentEpisodeConfirmed = Boolean(
    currentEpisodeId && confirmedEpisodeIds.includes(currentEpisodeId),
  );
  const visibleEpisodes = useMemo(() => {
    if (!payload) return [];
    const active = activeEpisodeId
      ? payload.episodes.find((episode) => episode.id === activeEpisodeId)
      : payload.episodes[0];
    return active ? [active] : payload.episodes;
  }, [activeEpisodeId, payload]);
  const visibleShots = useMemo(
    () => visibleEpisodes.flatMap((episode) => episode.shots),
    [visibleEpisodes],
  );
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTab>('grid');
  const breakdownJob = props.data?.breakdownJob as {
    phase?: string;
    sourcePackageHash?: string;
    error?: string;
  } | undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  /** 正在生成画面的 shot id */
  const [generatingShotId, setGeneratingShotId] = useState<string | null>(null);
  /** 批量任务：线稿 / 关键帧互斥 */
  const [batchMode, setBatchMode] = useState<'line-art' | 'keyframe' | null>(null);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [sheetComposing, setSheetComposing] = useState(false);
  const batchRunning = batchMode !== null;
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const storyboardShots = useWorkspaceDocument((s) => s.storyboard.shots);
  const editingShot = visibleShots.find((shot) => shot.id === editingShotId) ?? null;
  const [editDraft, setEditDraft] = useState<ShotEditDraft | null>(null);
  const scenePresets = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ id: string; label: string; description?: string; source: '场景设定' | '场景库' }> = [];
    for (const env of environments) {
      const label = scenePresetName(env).trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      result.push({ id: env.id, label, description: env.descriptionZh, source: '场景设定' });
    }
    for (const item of workspaceScenes) {
      const label = scenePresetName(item).trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      result.push({ id: item.id, label, description: item.promptZh || item.promptEn, source: '场景库' });
    }
    return result;
  }, [environments, workspaceScenes]);
  const characterNameSet = useMemo(
    () => new Set(characters.map((character) => character.name.trim()).filter(Boolean)),
    [characters],
  );

  useEffect(() => {
    setEditDraft(editingShot ? createShotEditDraft(editingShot) : null);
  }, [editingShot]);

  const canBreakdownFromPackage =
    Boolean(upstreamPackage)
    && upstreamPackage!.status === 'confirmed'
    && Boolean(upstreamPackage!.screenplay.episodes.some((ep) => ep.bodyMd.trim()));
  const packageStale = Boolean(
    payload
    && upstreamPackage
    && breakdownJob?.sourcePackageHash
    && packageSourceHash(upstreamPackage) !== breakdownJob.sourcePackageHash,
  );
  const sceneNameSet = useMemo(
    () => new Set([
      ...environments.map((e) => e.name.trim()),
      ...workspaceScenes.map((i) => i.label.trim()),
    ].filter(Boolean)),
    [environments, workspaceScenes],
  );

  const previewPayloadEarly = props.data?.storyboardPreview as StoryboardPreviewPayload | undefined;
  const storyboardUrlMapEarly = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const s of storyboardShots) {
      if (s.firstFrameAssetId) map.set(s.id, s.firstFrameAssetId);
    }
    return map;
  }, [storyboardShots]);

  const compositionStats = useMemo(
    () => computeCompositionStats(
      visibleShots,
      previewPayloadEarly,
      storyboardUrlMapEarly,
      characterNameSet,
      sceneNameSet,
    ),
    [characterNameSet, previewPayloadEarly, sceneNameSet, storyboardUrlMapEarly, visibleShots],
  );

  const diagnostics = useMemo(
    () => buildBreakdownDiagnostics(payload, characterNameSet, sceneNameSet),
    [characterNameSet, payload, sceneNameSet],
  );

  const filteredShots = useMemo(
    () => filterShots(
      visibleShots,
      shotFilter,
      previewPayloadEarly,
      storyboardUrlMapEarly,
      characterNameSet,
      sceneNameSet,
    ),
    [characterNameSet, previewPayloadEarly, sceneNameSet, shotFilter, storyboardUrlMapEarly, visibleShots],
  );

  const trialCap = suggestedTrialCap(visibleShots.length || shots.length);

  const gateInfo = useMemo(() => {
    try {
      return checkAssetGateInEdges(props.id, getNodes(), getEdges());
    } catch { return { passed: false }; }
  }, [props.id, getNodes, getEdges]);
  const gatePassed = gateInfo.passed || false;
  const hasSource = Boolean(canBreakdownFromPackage || upstreamPackage || payload);

  const applyBreakdownPayload = useCallback((source: ScriptBreakdownPayload, logLabel: string, clearConfirm = true) => {
    applyDeskBreakdown(props.id, source, updateNodeData, clearConfirm
      ? { gridConfirmed: false, confirmedEpisodeIds: [] }
      : {});
    const flat = flattenScriptBreakdownShots(source);
    appendLog(`${logLabel} · ${source.episodes.length} 集 / ${flat.length} 镜`);
  }, [appendLog, props.id, updateNodeData]);

  /** 迁移：导入旧镜表（不再作为主路径 CTA） */
  const importLegacyBreakdown = useCallback(() => {
    if (!upstream) return;
    if (local && flattenScriptBreakdownShots(local).length > 0) {
      const ok = window.confirm('导入旧镜表将覆盖本地镜表。建议改为从编剧台成稿重拆。是否继续？');
      if (!ok) return;
    }
    applyBreakdownPayload(upstream, '已导入旧镜表（迁移路径）');
    setStudioTab('grid');
    setStudioOpen(true);
  }, [applyBreakdownPayload, local, upstream]);

  /** 主路径：从编剧台 confirmed package 拆镜 */
  const breakdownFromPackage = useCallback(async (_episodeIndex?: number, multiEpisode?: boolean) => {
    if (!upstreamPackage) {
      appendLog('分镜台：上游无编剧台成稿包');
      return;
    }
    if (local && flattenScriptBreakdownShots(local).length > 0) {
      const hasConfirmed = confirmedEpisodeIds.length > 0;
      const ok = window.confirm(
        hasConfirmed
          ? '本地已有镜表且含已确认集。重拆将清空确认状态并覆盖镜表。是否继续？'
          : '本地已有镜表，从成稿重拆将覆盖。是否继续？',
      );
      if (!ok) return;
    }
    setBreakingDown(true);
    try {
      if (multiEpisode && upstreamPackage.screenplay.episodes.length > 1) {
        const episodes = upstreamPackage.screenplay.episodes;
        let epIdx = 0;
        for (const ep of episodes) {
          epIdx++;
          appendLog(`分镜台 · 拆镜第 ${epIdx}/${episodes.length} 集：${ep.title || `第${ep.index}集`}`);
          updateNodeData(props.id, { content: `拆镜中 ${epIdx}/${episodes.length}…` });
          const singleEpPkg = { ...upstreamPackage, screenplay: { ...upstreamPackage.screenplay, episodes: [ep] } };
          try {
            await runBreakdownFromPackage({
              blockId: props.id,
              pkg: singleEpPkg,
              updateNodeData,
              getLiveBreakdown: () => (
                getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined
              )?.scriptBreakdown as ScriptBreakdownPayload | undefined,
            });
          } catch (e) {
            appendLog(`分镜台 · 第 ${epIdx} 集拆镜失败：${String(e)}`);
          }
        }
        appendLog(`分镜台 · 全 ${episodes.length} 集拆镜完成`);
      } else {
        await runBreakdownFromPackage({
          blockId: props.id,
          pkg: upstreamPackage,
          updateNodeData,
          getLiveBreakdown: () => (
            getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined
          )?.scriptBreakdown as ScriptBreakdownPayload | undefined,
        });
        appendLog('从成稿拆镜完成');
      }
      setStudioTab('grid');
      setStudioOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendLog(`从成稿拆镜失败：${msg}`);
    } finally {
      setBreakingDown(false);
    }
  }, [appendLog, confirmedEpisodeIds.length, getNodes, local, props.id, updateNodeData, upstreamPackage]);

  /** 增量补拆：按用户指定的文本补拆镜并合并进现有镜表 */
  const runIncrementalBreakdown = useCallback(async () => {
    const text = incrementalText.trim();
    if (!text) { appendLog('分镜台：请输入待补拆的文本'); return; }
    if (!upstreamPackage) { appendLog('分镜台：上游无编剧台成稿包'); return; }
    setIncrementalBusy(true);
    try {
      const fullSourceText = screenplayFullText(upstreamPackage);
      await runProductionScriptBreakdownForEpisodes({
        blockId: props.id,
        episodes: [{
          id: `incremental-${Date.now()}`,
          title: '增量补拆',
          text,
          listIndex: (payload?.episodes.length ?? 0),
        }],
        fullSourceText,
        existingPayload: payload,
      });
      setIncrementalText('');
      appendLog('增量补拆完成，已合并入镜表');
      setStudioTab('grid');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appendLog(`增量补拆失败：${msg}`);
    } finally {
      setIncrementalBusy(false);
    }
  }, [appendLog, incrementalText, payload, props.id, upstreamPackage]);

  const confirmCurrentEpisode = useCallback(() => {
    if (!currentEpisodeId || visibleShots.length === 0) return;
    const preview = props.data?.storyboardPreview as StoryboardPreviewPayload | undefined;
    const urlMap = new Map<string, string | undefined>();
    for (const s of useWorkspaceDocument.getState().storyboard.shots) {
      if (s.firstFrameAssetId) urlMap.set(s.id, s.firstFrameAssetId);
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
    const readyMeta = buildEpisodeReadyMeta({
      deskId: props.id,
      episodeId: currentEpisodeId,
      shotCount: visibleShots.length,
      compositionCoverage: stats.coverage,
    });
    updateNodeData(props.id, {
      status: 'success',
      gridConfirmed: true,
      confirmedEpisodeIds: [...new Set([...confirmedEpisodeIds, currentEpisodeId])],
      confirmedAt: new Date().toISOString(),
      meta: readyMeta,
      episodeReadyMeta: readyMeta,
    });
    appendLog(
      `本集已确认可交导演台 · ${visibleEpisodes[0]?.title ?? currentEpisodeId} / ${visibleShots.length} 镜 · 构图 ${Math.round(stats.coverage * 100)}%`,
    );
    setStudioTab('handoff');
  }, [
    appendLog,
    characterNameSet,
    confirmedEpisodeIds,
    currentEpisodeId,
    environments,
    props.data?.storyboardPreview,
    props.id,
    updateNodeData,
    visibleEpisodes,
    visibleShots,
    workspaceScenes,
  ]);

  const openDirectorDesk = useCallback(() => {
    const nodes = getAllNodes?.() ?? getNodes();
    const desk = nodes.find((n) => (n.type ?? '') === 'director-desk');
    if (desk && focusBlock) {
      focusBlock(desk.id);
      appendLog('已聚焦导演台 · 请开台批出关键帧');
      return;
    }
    appendLog('画布上暂无导演台节点，请从 Dock 放置「导演台」');
  }, [appendLog, focusBlock, getAllNodes, getNodes]);

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
    const next = patchShotInPayload(payload, editingShot.id, {
      title: editDraft.title,
      durationSec: Math.max(1, Math.round(Number(editDraft.durationSec) || editingShot.durationSec || 5)),
      scene: stripMentionToken(editDraft.scene),
      characters: editDraft.characters,
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
      continuityNotes: notesRaw,
      dialogue,
    });
    applyDeskBreakdown(props.id, next, updateNodeData, {
      gridConfirmed: false,
    });
    setEditingShotId(null);
    appendLog(`已修改分镜 · ${editingShot.sceneCode} ${editDraft.title}`);
  }, [appendLog, editDraft, editingShot, payload, props.id, updateNodeData]);

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
    // 无镜表时默认进拆镜 Tab
    const next = !payload && (tab === 'grid' || tab === 'compose') ? 'breakdown' : tab;
    setStudioTab(next);
    setStudioOpen(true);
  }, [payload]);

  const openEdit = useCallback((shotId: string) => {
    setSelectedId(shotId);
    setEditingShotId(shotId);
  }, []);

  const storyboardUrlByShotId = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of storyboardShots) {
      if (s.firstFrameAssetId) map.set(s.id, s.firstFrameAssetId);
    }
    return map;
  }, [storyboardShots]);

  /** 写入画面 URL：拆分结构 + 故事板 + 预览帧（优先读节点最新 payload，避免批量写回被旧闭包覆盖） */
  const setShotFrameUrl = useCallback(
    (shotId: string, imageUrl: string) => {
      const livePayload = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)?.scriptBreakdown as ScriptBreakdownPayload | undefined;
      const base = livePayload ?? payload;
      if (!base) return;
      const nextBreakdown = writeBackBreakdownPreviewImage(base, shotId, imageUrl)
        ?? patchShotInPayload(base, shotId, {
          previewImageUrl: imageUrl,
          referenceImageUrl: imageUrl,
          status: 'previewing',
        });
      applyScriptBreakdownPayload(props.id, nextBreakdown);

      updateShot(shotId, {
        firstFrameAssetId: imageUrl,
        keyframeStatus: 'review',
        status: 'review',
      });

      // 同步 storyboardPreview.frames
      updateNodeData(props.id, (node) => {
        const data = (node.data ?? {}) as Record<string, unknown>;
        // 节点 data 可能仍滞后于刚 apply 的拆分；以 nextBreakdown 为准
        const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
        const current = raw?.version === 1 && Array.isArray(raw.frames)
          ? { ...emptyStoryboardPreview(), ...raw, pictureSettings: resolveStoryboardPreviewPictureSettings(raw) }
          : emptyStoryboardPreview();
        let frames = current.frames;
        const idx = frames.findIndex(
          (f) =>
            f.sourceShotId === shotId
            || f.id === shotId
            || f.id === `frame-${shotId}`
            || f.id === `spf-${shotId}`,
        );
        const shot = flattenScriptBreakdownShots(nextBreakdown).find((s) => s.id === shotId);
        const framePatch = {
          imageUrl,
          status: 'success' as const,
          errorMessage: null as string | null,
          promptSummary: shot?.imagePrompt || shot?.scriptText || shot?.title || '',
          stylePreset: null as string | null,
        };
        if (idx >= 0) {
          frames = frames.map((f, i) =>
            i === idx
              ? { ...f, ...framePatch }
              : f,
          );
        } else if (shot) {
          const frame: StoryboardPreviewFrame = {
            id: `spf-${shotId}`,
            order: frames.length + 1,
            label: shot.sceneCode || `Shot${shot.index}`,
            startSec: 0,
            endSec: Math.max(1, shot.durationSec || 5),
            sourceShotId: shotId,
            promptSummary: framePatch.promptSummary,
            characterNames: shot.characters,
            sceneAssetRef: shot.scene,
            imageUrl,
            status: 'success',
            locked: false,
            stylePreset: null,
          };
          frames = [...frames, frame];
        }
        return {
            ...data,
            scriptBreakdown: nextBreakdown,
            storyboardPreview: {
              ...current,
              frames,
              confirmed: false,
            },
            previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
          };
      });
    },
    [getNodes, payload, props.id, updateNodeData, updateShot],
  );

  const generateShotFrame = useCallback(
    async (shot: ScriptBreakdownShot) => {
      if (batchRunning) {
        appendLog('分镜台：批量任务进行中，请稍候再单镜生成');
        return;
      }
      const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
      if (!pictureId) {
        appendLog('分镜台：请先用顶部能力口连接「图像生成」节点');
        return;
      }
      const pictureNode = getNodes().find((n) => n.id === pictureId);
      if (!pictureNode) return;

      setGeneratingShotId(shot.id);
      const frame: StoryboardPreviewFrame = {
        id: `spf-${shot.id}`,
        order: 1,
        label: shot.sceneCode || `Shot${shot.index}`,
        startSec: 0,
        endSec: Math.max(1, shot.durationSec || 5),
        sourceShotId: shot.id,
        promptSummary: shot.imagePrompt || shot.scriptText || shot.title,
        characterNames: shot.characters,
        sceneAssetRef: shot.scene,
        referenceImageUrl: shot.referenceImageUrl ?? shot.previewImageUrl ?? null,
        status: 'generating',
        locked: false,
      };
      try {
        const nodeData = (getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>;
        const previewRaw = nodeData.storyboardPreview as StoryboardPreviewPayload | undefined;
        const pictureSettings = resolveStoryboardPreviewPictureSettings(previewRaw);
        const imageUrl = await generateStoryboardFrameImage(
          frame,
          (pictureNode.data ?? {}) as Record<string, unknown>,
          pictureSettings,
        );
        setShotFrameUrl(shot.id, imageUrl);
        appendLog(`分镜画面已生成 · ${shot.sceneCode || shot.id}`);
        toastSuccess(`已生成 ${shot.sceneCode || '分镜'} 画面`);
      } catch (e) {
        appendLog(`分镜画面生成失败: ${String(e)}`);
      } finally {
        setGeneratingShotId(null);
      }
    },
    [appendLog, batchRunning, getEdges, getNodes, props.id, setShotFrameUrl],
  );

  const referenceBoardData = useMemo(() => {
    // Find connected reference-board nodes
    const boardNodes = getNodes().filter((n) => n.type === 'reference-board');
    const incoming = getEdges().filter((e) => e.target === props.id);
    const relevant: Array<{ styleNotes?: string; palette?: string[] }> = [];
    for (const edge of incoming) {
      const src = boardNodes.find((n) => n.id === edge.source);
      if (!src) continue;
      const d = src.data as Record<string, unknown> | undefined;
      relevant.push({
        styleNotes: d?.styleNotes as string | undefined,
        palette: d?.palette as string[] | undefined,
      });
    }
    return relevant;
  }, [getNodes, getEdges, props.id]);

  const resolveSketchPrompt = useCallback((shot: ScriptBreakdownShot) => {
    const raw = shot.sketchPrompt?.trim();
    if (raw) return raw;
    const refParts: string[] = [];
    for (const rb of referenceBoardData) {
      if (rb.styleNotes?.trim()) refParts.push(`style: ${rb.styleNotes.trim()}`);
      if (rb.palette?.length) refParts.push(`palette: ${rb.palette.join(', ')}`);
    }
    return buildLineArtShotPrompt(
      [
        shot.scriptText || shot.visual || shot.title,
        shot.scene ? `location: ${shot.scene}` : '',
        shot.shotSize ? `${shot.shotSize} shot` : '',
        shot.cameraMove ? `camera: ${shot.cameraMove}` : '',
        shot.cameraAngle ? `angle: ${shot.cameraAngle}` : '',
        (shot.characters?.length ? `characters: ${shot.characters.join(', ')}` : ''),
        ...refParts,
      ].filter(Boolean).join('\n'),
      shot.shotSize,
    );
  }, [referenceBoardData]);

  const generateShotLineArt = useCallback(
    async (shot: ScriptBreakdownShot) => {
      if (batchRunning) {
        appendLog('分镜台：批量任务进行中，请稍候再单镜生成线稿');
        return;
      }
      const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
      if (!pictureId) {
        appendLog('分镜台：请先用顶部能力口连接「图像生成」节点后再生成线稿');
        return;
      }
      const pictureNode = getNodes().find((n) => n.id === pictureId);
      if (!pictureNode) return;

      setGeneratingShotId(shot.id);
      const sketchPrompt = resolveSketchPrompt(shot);
      const frame: StoryboardPreviewFrame = {
        id: `frame-line-${shot.id}`,
        order: 1,
        label: `${shot.sceneCode || `Shot${shot.index}`} · 线稿`,
        startSec: 0,
        endSec: Math.max(1, shot.durationSec || 5),
        sourceShotId: shot.id,
        promptSummary: sketchPrompt,
        characterNames: shot.characters,
        sceneAssetRef: shot.scene,
        referenceImageUrl: null,
        status: 'generating',
        locked: false,
        stylePreset: 'line-art',
      };
      try {
        const nodeData = (getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>;
        const previewRaw = nodeData.storyboardPreview as StoryboardPreviewPayload | undefined;
        const pictureSettings = resolveStoryboardPreviewPictureSettings(previewRaw);
        const imageUrl = await generateStoryboardFrameImage(
          frame,
          (pictureNode.data ?? {}) as Record<string, unknown>,
          pictureSettings,
        );
        if (!payload) {
          setShotFrameUrl(shot.id, imageUrl);
        } else {
          const withSketch = patchShotInPayload(payload, shot.id, {
            sketchPrompt,
            previewImageUrl: imageUrl,
            referenceImageUrl: imageUrl,
            status: 'previewing',
          });
          const nextBreakdown = writeBackBreakdownPreviewImage(withSketch, shot.id, imageUrl) ?? withSketch;
          applyScriptBreakdownPayload(props.id, nextBreakdown);
          updateShot(shot.id, {
            firstFrameAssetId: imageUrl,
            keyframeStatus: 'review',
            status: 'review',
            sketchPrompt,
          });
          updateNodeData(props.id, (node) => {
            const data = (node.data ?? {}) as Record<string, unknown>;
            const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
            const current = raw?.version === 1 && Array.isArray(raw.frames)
              ? { ...emptyStoryboardPreview(), ...raw, pictureSettings: resolveStoryboardPreviewPictureSettings(raw) }
              : emptyStoryboardPreview();
            let frames = [...current.frames];
            const idx = frames.findIndex((f) => f.sourceShotId === shot.id || f.id === `frame-line-${shot.id}` || f.id === shot.id);
            const framePatch = {
              imageUrl,
              status: 'success' as const,
              errorMessage: null,
              promptSummary: sketchPrompt,
              stylePreset: 'line-art',
            };
            if (idx >= 0) {
              frames = frames.map((f, i) => (i === idx ? { ...f, ...framePatch } : f));
            } else {
              frames = [
                ...frames,
                {
                  id: `frame-line-${shot.id}`,
                  order: frames.length + 1,
                  label: `${shot.sceneCode || `Shot${shot.index}`} · 线稿`,
                  startSec: 0,
                  endSec: Math.max(1, shot.durationSec || 5),
                  sourceShotId: shot.id,
                  promptSummary: sketchPrompt,
                  characterNames: shot.characters,
                  sceneAssetRef: shot.scene,
                  referenceImageUrl: null,
                  imageUrl,
                  status: 'success' as const,
                  locked: false,
                  stylePreset: 'line-art',
                },
              ];
            }
            return {
                ...data,
                scriptBreakdown: nextBreakdown,
                storyboardPreview: { ...current, frames, confirmed: false },
                previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
              };
          });
        }
        appendLog(`分镜线稿已生成 · ${shot.sceneCode || shot.id}`);
        toastSuccess(`已生成 ${shot.sceneCode || '分镜'} 线稿`);
      } catch (e) {
        appendLog(`分镜线稿生成失败: ${String(e)}`);
      } finally {
        setGeneratingShotId(null);
      }
    },
    [appendLog, batchRunning, getEdges, getNodes, payload, props.id, resolveSketchPrompt, setShotFrameUrl, updateNodeData, updateShot],
  );

  const generateBatchLineArt = useCallback(
    async (scope: 'visible' | 'all' = 'visible') => {
      const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
      if (!pictureId) {
        appendLog('分镜台：批量线稿前请先连接「图像生成」节点');
        return;
      }
      const pictureNode = getNodes().find((n) => n.id === pictureId);
      if (!pictureNode) return;

      const targetShots = (scope === 'visible' ? visibleShots : shots).filter(Boolean);
      if (targetShots.length === 0) {
        appendLog('分镜台：当前没有可生成线稿的镜头');
        return;
      }

      setBatchMode('line-art');
      setBatchProgress(`0/${targetShots.length}`);
      appendLog(`开始批量线稿 · ${targetShots.length} 镜（${scope === 'visible' ? '当前可见' : '全部'}）`);

      let ok = 0;
      let fail = 0;
      for (let i = 0; i < targetShots.length; i++) {
        const shot = targetShots[i];
        setBatchProgress(`${i + 1}/${targetShots.length}`);
        setGeneratingShotId(shot.id);
        try {
          const livePayload = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)?.scriptBreakdown as ScriptBreakdownPayload | undefined;
          const liveShot = flattenScriptBreakdownShots(livePayload).find((s) => s.id === shot.id) ?? shot;
          const sketchPrompt = resolveSketchPrompt(liveShot);
          const frame: StoryboardPreviewFrame = {
            id: `frame-line-${liveShot.id}`,
            order: i + 1,
            label: `${liveShot.sceneCode || `Shot${liveShot.index}`} · 线稿`,
            startSec: 0,
            endSec: Math.max(1, liveShot.durationSec || 5),
            sourceShotId: liveShot.id,
            promptSummary: sketchPrompt,
            characterNames: liveShot.characters,
            sceneAssetRef: liveShot.scene,
            referenceImageUrl: null,
            status: 'generating',
            locked: false,
            stylePreset: 'line-art',
          };
          const nodeData = (getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>;
          const previewRaw = nodeData.storyboardPreview as StoryboardPreviewPayload | undefined;
          const pictureSettings = resolveStoryboardPreviewPictureSettings(previewRaw);
          const imageUrl = await generateStoryboardFrameImage(
            frame,
            (pictureNode.data ?? {}) as Record<string, unknown>,
            pictureSettings,
          );

          const base = livePayload ?? payload;
          if (!base) {
            setShotFrameUrl(liveShot.id, imageUrl);
          } else {
            const withSketch = patchShotInPayload(base, liveShot.id, {
              sketchPrompt,
              previewImageUrl: imageUrl,
              referenceImageUrl: imageUrl,
              status: 'previewing',
            });
            const nextBreakdown = writeBackBreakdownPreviewImage(withSketch, liveShot.id, imageUrl) ?? withSketch;
            applyScriptBreakdownPayload(props.id, nextBreakdown);
            updateShot(liveShot.id, {
              firstFrameAssetId: imageUrl,
              keyframeStatus: 'review',
              status: 'review',
              sketchPrompt,
            });
            updateNodeData(props.id, (node) => {
              const data = (node.data ?? {}) as Record<string, unknown>;
              const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
              const current = raw?.version === 1 && Array.isArray(raw.frames)
                ? { ...emptyStoryboardPreview(), ...raw, pictureSettings: resolveStoryboardPreviewPictureSettings(raw) }
                : emptyStoryboardPreview();
              let frames = [...current.frames];
              const idx = frames.findIndex((f) => f.sourceShotId === liveShot.id || f.id === `frame-line-${liveShot.id}` || f.id === liveShot.id);
              const framePatch = {
                imageUrl,
                status: 'success' as const,
                errorMessage: null,
                promptSummary: sketchPrompt,
                stylePreset: 'line-art',
              };
              if (idx >= 0) {
                frames = frames.map((f, fi) => (fi === idx ? { ...f, ...framePatch } : f));
              } else {
                frames = [
                  ...frames,
                  {
                    id: `frame-line-${liveShot.id}`,
                    order: frames.length + 1,
                    label: `${liveShot.sceneCode || `Shot${liveShot.index}`} · 线稿`,
                    startSec: 0,
                    endSec: Math.max(1, liveShot.durationSec || 5),
                    sourceShotId: liveShot.id,
                    promptSummary: sketchPrompt,
                    characterNames: liveShot.characters,
                    sceneAssetRef: liveShot.scene,
                    referenceImageUrl: null,
                    imageUrl,
                    status: 'success' as const,
                    locked: false,
                    stylePreset: 'line-art',
                  },
                ];
              }
              return {
                  ...data,
                  scriptBreakdown: nextBreakdown,
                  storyboardPreview: { ...current, frames, confirmed: false },
                  previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
                };
            });
          }
          ok += 1;
        } catch (e) {
          fail += 1;
          appendLog(`批量线稿失败 · ${shot.sceneCode || shot.id}: ${String(e)}`);
        }
      }

      setGeneratingShotId(null);
      setBatchMode(null);
      setBatchProgress(null);
      appendLog(`批量线稿完成 · 成功 ${ok} · 失败 ${fail}`);
      if (ok > 0) toastSuccess(`批量线稿完成 ${ok}/${targetShots.length}`);
    },
    [
      appendLog,
      getEdges,
      getNodes,
      payload,
      props.id,
      resolveSketchPrompt,
      setShotFrameUrl,
      shots,
      updateNodeData,
      updateShot,
      visibleShots,
    ],
  );

  const generateBatchKeyframes = useCallback(
    async (scope: 'visible' | 'all' | 'missing' = 'visible') => {
      const pictureId = resolveConnectedPictureGenId(props.id, getNodes(), getEdges());
      if (!pictureId) {
        appendLog('分镜台：批量关键帧前请先连接「图像生成」节点');
        return;
      }
      const pictureNode = getNodes().find((n) => n.id === pictureId);
      if (!pictureNode) return;

      const pool = (scope === 'all' ? shots : visibleShots).filter(Boolean);
      const liveNow = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)?.scriptBreakdown as ScriptBreakdownPayload | undefined;
      const liveMap = new Map(flattenScriptBreakdownShots(liveNow).map((s) => [s.id, s]));
      const targetShots = scope === 'missing'
        ? pool.filter((shot) => {
            const live = liveMap.get(shot.id) ?? shot;
            return !live.previewImageUrl && !live.referenceImageUrl;
          })
        : pool;
      if (targetShots.length === 0) {
        appendLog(scope === 'missing' ? '分镜台：当前可见镜头均已有画面，无需补关键帧' : '分镜台：当前没有可生成关键帧的镜头');
        return;
      }

      setBatchMode('keyframe');
      setBatchProgress(`0/${targetShots.length}`);
      appendLog(`开始批量关键帧 · ${targetShots.length} 镜（${scope === 'all' ? '全部' : scope === 'missing' ? '仅缺图' : '当前可见'}）`);

      let ok = 0;
      let fail = 0;
      for (let i = 0; i < targetShots.length; i++) {
        const shot = targetShots[i];
        setBatchProgress(`${i + 1}/${targetShots.length}`);
        setGeneratingShotId(shot.id);
        try {
          const livePayload = (getNodes().find((n) => n.id === props.id)?.data as Record<string, unknown> | undefined)?.scriptBreakdown as ScriptBreakdownPayload | undefined;
          const liveShot = flattenScriptBreakdownShots(livePayload).find((s) => s.id === shot.id) ?? shot;
          const promptSummary = (liveShot.imagePrompt || liveShot.scriptText || liveShot.visual || liveShot.title || '').trim();
          if (!promptSummary) {
            fail += 1;
            appendLog(`批量关键帧跳过 · ${liveShot.sceneCode || liveShot.id}: 缺少 imagePrompt / 文案`);
            continue;
          }
          const frame: StoryboardPreviewFrame = {
            id: `spf-${liveShot.id}`,
            order: i + 1,
            label: liveShot.sceneCode || `Shot${liveShot.index}`,
            startSec: 0,
            endSec: Math.max(1, liveShot.durationSec || 5),
            sourceShotId: liveShot.id,
            promptSummary,
            characterNames: liveShot.characters,
            sceneAssetRef: liveShot.scene,
            referenceImageUrl: liveShot.referenceImageUrl ?? liveShot.previewImageUrl ?? null,
            status: 'generating',
            locked: false,
            stylePreset: null,
          };
          const nodeData = (getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>;
          const previewRaw = nodeData.storyboardPreview as StoryboardPreviewPayload | undefined;
          const pictureSettings = resolveStoryboardPreviewPictureSettings(previewRaw);
          const imageUrl = await generateStoryboardFrameImage(
            frame,
            (pictureNode.data ?? {}) as Record<string, unknown>,
            pictureSettings,
          );
          // setShotFrameUrl 会同步拆分结果 / 故事板 / 预览帧
          setShotFrameUrl(liveShot.id, imageUrl);
          ok += 1;
        } catch (e) {
          fail += 1;
          appendLog(`批量关键帧失败 · ${shot.sceneCode || shot.id}: ${String(e)}`);
        }
      }

      setGeneratingShotId(null);
      setBatchMode(null);
      setBatchProgress(null);
      appendLog(`批量关键帧完成 · 成功 ${ok} · 失败 ${fail}`);
      if (ok > 0) toastSuccess(`批量关键帧完成 ${ok}/${targetShots.length}`);
    },
    [
      appendLog,
      getEdges,
      getNodes,
      props.id,
      setShotFrameUrl,
      shots,
      visibleShots,
    ],
  );

  const previewPayload = (props.data as Record<string, unknown>)?.storyboardPreview as
    | StoryboardPreviewPayload
    | undefined;
  const previewFrames = previewPayload?.frames ?? [];
  const previewOk = previewFrames.filter((f) => f.imageUrl).length;
  const previewLow = previewFrames.filter((f) => f.suggestRegenerate).length;
  const contactSheetUrl = previewPayload?.contactSheetUrl?.trim() || null;

  const generateStoryboardSheet = useCallback(
    async (force = false) => {
      if (!payload || visibleShots.length === 0) {
        appendLog('分镜台：没有可合成的镜头');
        return;
      }
      if (sheetComposing || batchRunning) return;

      const livePreview = ((getNodes().find((n) => n.id === props.id)?.data ?? {}) as Record<string, unknown>)
        .storyboardPreview as StoryboardPreviewPayload | undefined;
      const wsById = new Map(storyboardShots.map((s) => [s.id, s]));
      const cells = deskSheetCellsFromBreakdownShots(visibleShots, {
        preview: livePreview ?? previewPayload,
        storyboardUrlByShotId,
        workspaceShotById: wsById,
      });
      const withImage = cells.filter((c) => c.imageUrl?.trim()).length;
      if (withImage === 0) {
        appendLog('分镜台：请先生成线稿或上传分镜图，再合成故事板大图');
        return;
      }

      const signature = buildDeskContactSheetSignature(cells);
      if (
        !force
        && livePreview?.contactSheetUrl
        && livePreview.contactSheetSignature === signature
      ) {
        toastSuccess('故事板大图已是最新');
        return;
      }

      setSheetComposing(true);
      try {
        const epTitle = visibleEpisodes[0]?.title || payload.title || '本集';
        const blob = await composeStoryboardSheetPng(cells, {
          title: `${epTitle} · 分镜故事板`,
          subtitle: `${cells.length} 镜 · 线稿构图 ${withImage}/${cells.length} · NX9 分镜台`,
        });
        const file = new File(
          [blob],
          `storyboard-sheet-${Date.now()}.png`,
          { type: 'image/png' },
        );
        const uploaded = await api.uploadAsset(file);
        updateNodeData(props.id, (node) => {
          const data = (node.data ?? {}) as Record<string, unknown>;
          const raw = data.storyboardPreview as StoryboardPreviewPayload | undefined;
          const current = raw?.version === 1 && Array.isArray(raw.frames)
            ? {
                ...emptyStoryboardPreview(),
                ...raw,
                pictureSettings: resolveStoryboardPreviewPictureSettings(raw),
              }
            : emptyStoryboardPreview();
          return {
            ...data,
            storyboardPreview: {
              ...current,
              contactSheetUrl: uploaded.url,
              contactSheetSignature: signature,
            },
          };
        });
        appendLog(`分镜故事板大图已生成 · ${withImage}/${cells.length} 格有图`);
        toastSuccess(`故事板大图已生成 · ${withImage} 格`);
      } catch (e) {
        appendLog(`分镜故事板大图失败: ${String(e)}`);
      } finally {
        setSheetComposing(false);
      }
    },
    [
      appendLog,
      batchRunning,
      getNodes,
      payload,
      previewPayload,
      props.id,
      sheetComposing,
      storyboardShots,
      storyboardUrlByShotId,
      updateNodeData,
      visibleEpisodes,
      visibleShots,
    ],
  );

  const downloadContactSheet = useCallback(() => {
    if (!contactSheetUrl) return;
    const a = document.createElement('a');
    a.href = contactSheetUrl;
    a.download = `storyboard-sheet-${Date.now()}.png`;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.click();
  }, [contactSheetUrl]);

  // 默认打开顶部能力口，便于连接图像生成 / 3D 导演台
  useEffect(() => {
    const data = props.data as { showExecPorts?: boolean };
    if (data.showExecPorts === undefined) {
      updateNodeData(props.id, { showExecPorts: true });
    }
  }, [props.data, props.id, updateNodeData]);

  const showShotNav = studioTab === 'grid' || studioTab === 'compose';

  return (
    <div className="relative">
      <BlockShell {...props}>
        <div className="sg3-card nodrag nopan">
          <button
            type="button"
            className="sg3-card__clickable"
            onClick={() => openStudio(payload ? 'grid' : 'breakdown')}
          >
            <div className="sg3-card__header">
              <span className="sg3-card__eyebrow">分镜台 · 拆镜</span>
              <span className={`sg3-card__badge ${currentEpisodeConfirmed ? 'is-ok' : ''}`}>
                {currentEpisodeConfirmed ? '已确认' : payload ? '未确认' : '待拆镜'}
              </span>
            </div>
            <div className="sg3-card__title">
              {payload
                ? compact(visibleEpisodes[0]?.title || payload.title || '本集', 22)
                : canBreakdownFromPackage
                  ? '从成稿拆镜'
                  : '分镜台'}
            </div>
            <div className="sg3-card__meta">
              {payload
                ? `${shots.length} 镜 · 构图 ${compositionStats.composed}/${compositionStats.total}`
                : canBreakdownFromPackage
                  ? '上游成稿已确认'
                  : '等待编剧台成稿'}
            </div>
            <div className="sg3-card__logline">
              {packageStale
                ? '成稿已更新，建议重拆'
                : hasSource && !gatePassed
                  ? '上游设定检查未放行'
                  : payload
                    ? '点击打开分镜台 · 镜表与构图'
                    : canBreakdownFromPackage
                      ? '点开台即可从成稿拆镜'
                      : '连接编剧台确认成稿后拆镜'}
            </div>
            <div className="sg3-card__actions">
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  openStudio(payload ? 'grid' : 'breakdown');
                }}
              >
                打开分镜台
              </button>
            </div>
          </button>
        </div>
      </BlockShell>

      <ScreenModal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        title="分镜台"
        subtitle="拆镜 → 镜表 → 构图确认 → 交导演台"
        width="min(1280px, 100vw - 24px)"
        variant="default"
        className="sg3-modal"
        headerRight={(
          <div className="sg3-header-right">
            {payload ? (
              <select
                className="sg3-episode-select"
                value={activeEpisodeId ?? payload.episodes[0]?.id ?? ''}
                onChange={(event) => {
                  setActiveEpisodeId(event.target.value || null);
                  setSelectedId(null);
                }}
                aria-label="选择集"
              >
                {payload.episodes.map((episode) => {
                  const done = confirmedEpisodeIds.includes(episode.id);
                  return (
                    <option key={episode.id} value={episode.id}>
                      {episode.title}
                      {done ? ' · 已确认' : ''}
                      {` · ${episode.shots.length} 镜`}
                    </option>
                  );
                })}
              </select>
            ) : null}
            <span className={`sg3-header-status ${currentEpisodeConfirmed ? 'is-ok' : ''}`}>
              {currentEpisodeConfirmed ? '本集已确认' : '本集未确认'}
            </span>
          </div>
        )}
      >
        <div className="sg3-studio">
          <div className="sg3-pipeline" aria-label="分镜流程">
            {([
              ['breakdown', '1', '拆镜'],
              ['grid', '2', '镜表'],
              ['compose', '3', '构图'],
              ['handoff', '4', '交接'],
            ] as const).map(([id, num, label], i) => (
              <span key={id} className="sg3-pipeline__item">
                {i > 0 ? <span className="sg3-pipeline__sep" aria-hidden /> : null}
                <button
                  type="button"
                  className={`sg3-pipeline__step ${studioTab === id ? 'is-on' : ''}`}
                  onClick={() => setStudioTab(id)}
                >
                  <b>{num}</b> {label}
                </button>
              </span>
            ))}
          </div>

          <div className={`sg3-body ${showShotNav ? 'has-nav' : 'is-wide'}`}>
            {showShotNav && (
              <aside className="sg3-nav" aria-label="镜头导航">
                <div className="sg3-filters">
                  {([
                    ['all', '全部'],
                    ['uncomposed', '未构图'],
                    ['unbound', '未绑定'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={shotFilter === id ? 'is-on' : ''}
                      onClick={() => setShotFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="sg3-nav__list">
                  {!payload || filteredShots.length === 0 ? (
                    <div className="sg3-empty">暂无镜头</div>
                  ) : (
                    filteredShots.map((shot) => {
                      const composed = isShotComposed(
                        shot,
                        previewPayloadEarly,
                        storyboardUrlMapEarly.get(shot.id),
                      );
                      const active = selectedId === shot.id || editingShotId === shot.id;
                      return (
                        <button
                          key={shot.id}
                          type="button"
                          className={`sg3-nav__row ${active ? 'is-on' : ''} ${composed ? 'is-composed' : ''}`}
                          onClick={() => {
                            setSelectedId(shot.id);
                          }}
                        >
                          <span className="sg3-nav__dot" />
                          <span className="sg3-nav__code">{shot.sceneCode || `#${shot.index}`}</span>
                          <span className="sg3-nav__title">
                            {compact(shot.title || shot.scene || shot.action || '—', 16)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>
            )}

            <main className="sg3-main">
              {studioTab === 'breakdown' && (
                <div className="sg3-pane sg3-pane--center">
                  <div className="sg3-hero">
                    <p className="sg3-hero__eyebrow">步骤 1 · 拆镜</p>
                    <h3 className="sg3-hero__title">从编剧台成稿生成镜表</h3>
                    <p className="sg3-hero__desc">
                      {upstreamPackage
                        ? `上游成稿：${upstreamPackage.brief.title || '未命名'} · ${upstreamPackage.status}${packageStale ? ' · 成稿已更新' : ''}`
                        : '未连接编剧台 confirmed package'}
                    </p>
                    <div className="sg3-hero__actions">
                      <button
                        type="button"
                        className="sg3-btn sg3-btn--primary"
                        disabled={!canBreakdownFromPackage || breakingDown}
                        onClick={() => void breakdownFromPackage()}
                      >
                        {breakingDown ? '拆镜中…' : '从成稿拆镜'}
                      </button>
                      {upstreamPackage && upstreamPackage.screenplay.episodes.length > 1 && (
                        <button
                          type="button"
                          className="sg3-btn sg3-btn--ghost"
                          disabled={!canBreakdownFromPackage || breakingDown}
                          onClick={() => void breakdownFromPackage(undefined, true)}
                        >
                          {breakingDown ? '拆镜中…' : `全 ${upstreamPackage.screenplay.episodes.length} 集拆镜`}
                        </button>
                      )}
                      {upstream ? (
                        <button
                          type="button"
                          className="sg3-btn sg3-btn--ghost"
                          onClick={importLegacyBreakdown}
                        >
                          导入旧镜表…
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {payload && (
                    <details className="sg3-details">
                      <summary>增量补拆</summary>
                      <p className="sg3-muted">粘贴部分剧本文本，只对这段补拆并合并进现有镜表（不覆盖）。</p>
                      <textarea
                        className="sg3-textarea"
                        value={incrementalText}
                        onChange={(e) => setIncrementalText(e.target.value)}
                        placeholder="粘贴需要补拆的剧本文本…"
                      />
                      <button
                        type="button"
                        className="sg3-btn sg3-btn--ghost"
                        disabled={!incrementalText.trim() || incrementalBusy || !upstreamPackage}
                        onClick={() => void runIncrementalBreakdown()}
                      >
                        {incrementalBusy ? '补拆中…' : '增量补拆'}
                      </button>
                    </details>
                  )}

                  {diagnostics.length > 0 ? (
                    <div className="sg3-diag-block">
                      <h4>诊断</h4>
                      <ul>
                        {diagnostics.slice(0, 12).map((d, i) => (
                          <li key={`${d.code}-${i}`}>[{d.level}] {d.message}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="sg3-muted sg3-muted--center">拆镜成功后进入镜表；结果不写回编剧台。</p>
                  )}
                </div>
              )}

              {studioTab === 'grid' && (
                <div className="sg3-pane">
                  {!payload || visibleShots.length === 0 ? (
                    <div className="sg3-empty-hero">
                      <h3>本集暂无镜头</h3>
                      <p>请先完成拆镜，或导入旧镜表。</p>
                      <button type="button" className="sg3-btn sg3-btn--primary" onClick={() => setStudioTab('breakdown')}>
                        去拆镜
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="sg3-toolbar">
                        <div className="sg3-toolbar__meta">
                          镜 {visibleShots.length}
                          {selectedId ? ` · 已选 #${visibleShots.find((s) => s.id === selectedId)?.index ?? ''}` : ''}
                        </div>
                        <div className="sg3-toolbar__acts">
                          <button
                            type="button"
                            className="sg3-btn sg3-btn--ghost"
                            disabled={!selectedId}
                            title="在当前镜后插入新镜"
                            onClick={() => {
                              if (!payload || !selectedId) return;
                              const next = addShotToBreakdown(payload, selectedId);
                              applyDeskBreakdown(props.id, next, updateNodeData);
                              appendLog('已新增镜');
                            }}
                          >
                            + 增镜
                          </button>
                          <button
                            type="button"
                            className="sg3-btn sg3-btn--ghost"
                            disabled={!selectedId}
                            title="将当前镜一分为二"
                            onClick={() => {
                              if (!payload || !selectedId) return;
                              const next = splitShotInBreakdown(payload, selectedId);
                              applyDeskBreakdown(props.id, next, updateNodeData);
                              appendLog('已拆分镜');
                            }}
                          >
                            拆镜
                          </button>
                          <button
                            type="button"
                            className="sg3-btn sg3-btn--ghost"
                            disabled={!selectedId || visibleShots.length < 2}
                            title="合并当前选中镜与前镜"
                            onClick={() => {
                              if (!payload || !selectedId) return;
                              const idx = visibleShots.findIndex((s) => s.id === selectedId);
                              if (idx < 1) { appendLog('请选择非首镜来合并'); return; }
                              const ids = [visibleShots[idx - 1].id, selectedId];
                              const next = mergeShotsInBreakdown(payload, ids);
                              applyDeskBreakdown(props.id, next, updateNodeData);
                              appendLog('已合并镜');
                            }}
                          >
                            合镜
                          </button>
                        </div>
                      </div>
                      <p className="sg3-hint">点画面可上传 · 卡片底栏：线稿 / 试出 / 编辑 · 整集关键帧请交导演台</p>
                      <div className="sg3-board sg-story-grid">
                        {visibleShots.map((shot) => (
                          <ShotStoryCell
                            key={shot.id}
                            shot={shot}
                            selected={selectedId === shot.id || editingShotId === shot.id}
                            storyboardUrl={storyboardUrlByShotId.get(shot.id)}
                            generating={
                              generatingShotId === shot.id
                              || (batchRunning && generatingShotId === shot.id)
                            }
                            onSelect={() => setSelectedId(shot.id)}
                            onUpload={(url) => {
                              setShotFrameUrl(shot.id, url);
                              appendLog(`分镜画面已上传 · ${shot.sceneCode || shot.id}`);
                            }}
                            onGenerate={() => void generateShotFrame(shot)}
                            onGenerateLineArt={() => void generateShotLineArt(shot)}
                            onEdit={() => openEdit(shot.id)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {studioTab === 'compose' && (
                <div className="sg3-pane">
                  <div className="sg3-toolbar">
                    <div className="sg3-toolbar__meta">
                      {sheetComposing
                        ? '正在合成故事板大图…'
                        : batchMode === 'line-art'
                          ? `批量线稿 ${batchProgress || ''}`.trim()
                          : batchMode === 'keyframe'
                            ? `试出图 ${batchProgress || ''}`.trim()
                            : `构图覆盖 ${Math.round(compositionStats.coverage * 100)}% · 试出建议 ≤ ${trialCap} 镜`}
                    </div>
                    <div className="sg3-toolbar__acts">
                      <button
                        type="button"
                        className="sg3-btn sg3-btn--primary"
                        disabled={!payload || batchRunning || sheetComposing || visibleShots.length === 0}
                        onClick={() => void generateBatchLineArt('visible')}
                      >
                        {batchMode === 'line-art' ? `线稿 ${batchProgress}` : `批量线稿 · ${visibleShots.length}`}
                      </button>
                      <button
                        type="button"
                        className="sg3-btn sg3-btn--ghost"
                        disabled={!payload || batchRunning || sheetComposing || visibleShots.length === 0}
                        onClick={() => void generateStoryboardSheet(true)}
                      >
                        {sheetComposing ? '合成中…' : contactSheetUrl ? '重出故事板' : '生成故事板大图'}
                      </button>
                      <button
                        type="button"
                        className="sg3-btn sg3-btn--ghost"
                        disabled={!payload || batchRunning || sheetComposing || visibleShots.length === 0}
                        onClick={() => {
                          if (compositionStats.trial >= trialCap) {
                            appendLog(`试出已达建议配额 ${trialCap}，完整批出去导演台`);
                          }
                          void generateBatchKeyframes('missing');
                        }}
                      >
                        缺图补试出
                      </button>
                      <button
                        type="button"
                        className="sg3-btn sg3-btn--ghost"
                        onClick={openDirectorDesk}
                      >
                        去导演台批出
                      </button>
                    </div>
                  </div>
                  <p className="sg3-hint">
                    线稿确认构图为主路径；「故事板大图」将本集线稿拼成专业分镜总览板（含镜号/运镜注/对白）。整集工业级关键帧在导演台批出。
                  </p>
                  {contactSheetUrl ? (
                    <div className="sg3-sheet">
                      <div className="sg3-sheet__head">
                        <span className="sg3-sheet__title">本集故事板大图</span>
                        <div className="sg3-sheet__acts">
                          <button
                            type="button"
                            className="sg3-btn sg3-btn--ghost"
                            disabled={sheetComposing}
                            onClick={downloadContactSheet}
                          >
                            下载 PNG
                          </button>
                          <button
                            type="button"
                            className="sg3-btn sg3-btn--ghost"
                            disabled={sheetComposing || batchRunning}
                            onClick={() => void generateStoryboardSheet(true)}
                          >
                            重新合成
                          </button>
                        </div>
                      </div>
                      <a
                        className="sg3-sheet__preview"
                        href={contactSheetUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="新窗口打开全图"
                      >
                        <img src={contactSheetUrl} alt="分镜故事板大图" />
                      </a>
                    </div>
                  ) : null}
                  <div className="sg3-compose-embed">
                    <StoryboardPreviewWorkspace
                      blockId={props.id}
                      kind={props.type ?? 'storyboard-desk'}
                      embedded
                    />
                  </div>
                </div>
              )}

              {studioTab === 'handoff' && (
                <div className="sg3-pane sg3-pane--center">
                  <div className="sg3-hero">
                    <p className="sg3-hero__eyebrow">步骤 4 · 交接</p>
                    <h3 className="sg3-hero__title">本集就绪检查</h3>
                    <p className="sg3-hero__desc">确认后导演台可按本集批出关键帧。</p>
                  </div>
                  <ul className="sg3-checklist">
                    <li>
                      <span>镜数 ≥ 1</span>
                      <em className={visibleShots.length > 0 ? 'is-ok' : 'is-warn'}>
                        {visibleShots.length > 0 ? '通过' : '阻断'}
                      </em>
                    </li>
                    <li>
                      <span>构图覆盖（软）≥ 60% · {Math.round(compositionStats.coverage * 100)}%</span>
                      <em className={compositionStats.coverage >= 0.6 ? 'is-ok' : 'is-warn'}>
                        {compositionStats.coverage >= 0.6 ? '通过' : '警告'}
                      </em>
                    </li>
                    <li>
                      <span>
                        角色/场绑定 · 角 {compositionStats.boundCharacters}/{compositionStats.total}
                        {' · '}
                        场 {compositionStats.boundScenes}/{compositionStats.total}
                      </span>
                      <em>提示</em>
                    </li>
                    <li>
                      <span>故事板大图（合并预览）</span>
                      <em className={contactSheetUrl ? 'is-ok' : 'is-warn'}>
                        {contactSheetUrl ? '已生成' : '未生成'}
                      </em>
                    </li>
                    <li>
                      <span>本集确认状态</span>
                      <em className={currentEpisodeConfirmed ? 'is-ok' : 'is-warn'}>
                        {currentEpisodeConfirmed ? '已确认' : '未确认'}
                      </em>
                    </li>
                  </ul>
                  {contactSheetUrl ? (
                    <div className="sg3-sheet sg3-sheet--handoff">
                      <a
                        className="sg3-sheet__preview"
                        href={contactSheetUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img src={contactSheetUrl} alt="分镜故事板大图" />
                      </a>
                      <div className="sg3-sheet__acts">
                        <button type="button" className="sg3-btn sg3-btn--ghost" onClick={downloadContactSheet}>
                          下载故事板
                        </button>
                        <button
                          type="button"
                          className="sg3-btn sg3-btn--ghost"
                          disabled={sheetComposing}
                          onClick={() => {
                            setStudioTab('compose');
                            void generateStoryboardSheet(true);
                          }}
                        >
                          重新合成
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="sg3-hero__actions" style={{ marginBottom: 12 }}>
                      <button
                        type="button"
                        className="sg3-btn sg3-btn--ghost"
                        disabled={sheetComposing || visibleShots.length === 0}
                        onClick={() => {
                          setStudioTab('compose');
                          void generateStoryboardSheet(true);
                        }}
                      >
                        {sheetComposing ? '合成中…' : '去构图生成故事板大图'}
                      </button>
                    </div>
                  )}
                  <div className="sg3-hero__actions">
                    <button
                      type="button"
                      className="sg3-btn sg3-btn--primary"
                      disabled={currentEpisodeConfirmed || visibleShots.length === 0}
                      onClick={confirmCurrentEpisode}
                    >
                      {currentEpisodeConfirmed ? '本集已确认' : '确认本集'}
                    </button>
                    <button
                      type="button"
                      className="sg3-btn sg3-btn--ghost"
                      disabled={!currentEpisodeConfirmed}
                      onClick={openDirectorDesk}
                    >
                      打开导演台
                    </button>
                  </div>
                </div>
              )}
            </main>
          </div>

          <div className="sg3-foot">
            <p className="sg3-foot__hint">
              {visibleEpisodes[0]?.title ?? '本集'}
              {' · '}
              {visibleShots.length} 镜
              {' · '}
              构图 {Math.round(compositionStats.coverage * 100)}%
              {currentEpisodeConfirmed ? ' · 已确认可交导演台' : ' · 确认后交导演台批出'}
            </p>
            <div className="sg3-foot__actions">
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={!payload || batchRunning || sheetComposing || visibleShots.length === 0}
                onClick={() => void generateBatchLineArt('visible')}
              >
                {batchMode === 'line-art' ? `线稿 ${batchProgress}` : '批量线稿'}
              </button>
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={!payload || batchRunning || sheetComposing || visibleShots.length === 0}
                onClick={() => {
                  setStudioTab('compose');
                  void generateStoryboardSheet(true);
                }}
              >
                {sheetComposing ? '合成中…' : '故事板大图'}
              </button>
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                onClick={openDirectorDesk}
              >
                去导演台批出
              </button>
              <button
                type="button"
                className="sg3-btn sg3-btn--primary"
                disabled={currentEpisodeConfirmed || visibleShots.length === 0}
                onClick={confirmCurrentEpisode}
              >
                {currentEpisodeConfirmed ? '本集已确认' : '确认本集'}
              </button>
            </div>
          </div>
        </div>
        {isDevPromptEnabled() && <StoryboardDeskDevPack blockId={props.id} />}
      </ScreenModal>
      {/* 编辑分镜 — 功能全保留 */}
      <ScreenModal
        open={Boolean(editingShot && editDraft)}
        onClose={() => setEditingShotId(null)}
        title="编辑分镜"
        subtitle={
          editingShot
            ? `${editingShot.sceneCode} · 文案 / Prompt · @人物 @场景`
            : undefined
        }
        width={860}
        variant="default"
        className="sg3-modal sg3-modal--edit"
        label="编辑分镜"
      >
        {editingShot && editDraft && (
          <div className="sg sg-studio" style={{ minHeight: 'auto', maxHeight: 'min(86vh, 760px)' }}>
            <div className="sg-studio__body">
              <div className="sg-grid-2">
                <label className="sg-field" style={{ gridColumn: 'span 1' }}>
                  <span className="sg-label">标题</span>
                  <input
                    className="sg-input"
                    value={editDraft.title}
                    onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                  />
                </label>
                <label className="sg-field">
                  <span className="sg-label">
                    时长 s
                    {' '}
                    <Clock size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
                  </span>
                  <input
                    className="sg-input"
                    type="number"
                    value={editDraft.durationSec}
                    onChange={(event) =>
                      setEditDraft({ ...editDraft, durationSec: Number(event.target.value) || 1 })
                    }
                  />
                </label>
              </div>

              <div className="sg-grid-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <label className="sg-field">
                  <span className="sg-label">景别</span>
                  <select
                    className="sg-select"
                    value={editDraft.shotSize ?? ''}
                    onChange={(e) => setEditDraft({
                      ...editDraft,
                      shotSize: (e.target.value || undefined) as ShotEditDraft['shotSize'],
                    })}
                  >
                    <option value="">—</option>
                    {SHOT_SIZES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="sg-field">
                  <span className="sg-label">运镜</span>
                  <select
                    className="sg-select"
                    value={editDraft.cameraMove ?? ''}
                    onChange={(e) => setEditDraft({
                      ...editDraft,
                      cameraMove: (e.target.value || undefined) as ShotEditDraft['cameraMove'],
                    })}
                  >
                    <option value="">—</option>
                    {CAMERA_MOVES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="sg-field">
                  <span className="sg-label">机位</span>
                  <input
                    className="sg-input"
                    value={editDraft.cameraAngle ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, cameraAngle: e.target.value })}
                    placeholder="平视 / 俯 / 仰…"
                  />
                </label>
                <label className="sg-field">
                  <span className="sg-label">镜头焦距</span>
                  <input
                    className="sg-input"
                    value={editDraft.cameraLens ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, cameraLens: e.target.value })}
                    placeholder="广角 / 标准 / 长焦"
                  />
                </label>
              </div>

              <label className="sg-field">
                <span className="sg-label">
                  场景
                  {editDraft.scene
                    && !scenePresets.some((scene) => scene.label === stripMentionToken(editDraft.scene)) && (
                      <span className="is-req">未入库</span>
                    )}
                </span>
                <select
                  className="sg-select"
                  value={
                    scenePresets.some((scene) => scene.label === stripMentionToken(editDraft.scene))
                      ? stripMentionToken(editDraft.scene)
                      : ''
                  }
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next) setEditDraft({ ...editDraft, scene: next });
                  }}
                >
                  <option value="">
                    {editDraft.scene ? `当前：${stripMentionToken(editDraft.scene)}` : '选择场景预设'}
                  </option>
                  {scenePresets.map((scene) => (
                    <option key={scene.id} value={scene.label}>
                      {scene.label} · {scene.source}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 6 }}>
                  <AssetMentionInput
                    value={editDraft.scene}
                    onChange={(next) => setEditDraft({ ...editDraft, scene: next })}
                    kinds={SCENE_MENTION_KINDS}
                    placeholder="@场景 或输入"
                    className="sg-input"
                  />
                </div>
              </label>

              <label className="sg-field">
                <span className="sg-label">
                  角色
                  {editDraft.characters.some((n) => !characterNameSet.has(stripMentionToken(n))) && (
                    <span className="is-req">含未入库</span>
                  )}
                </span>
                <AssetMentionInput
                  value={namesToText(editDraft.characters)}
                  onChange={(next) => setEditDraft({ ...editDraft, characters: textToNames(next) })}
                  kinds={CHARACTER_MENTION_KINDS}
                  placeholder="@角色 或输入"
                  className="sg-input"
                />
              </label>

              <div className="sg-grid-2">
                <label className="sg-field">
                  <span className="sg-label">对白说话人</span>
                  <input
                    className="sg-input"
                    value={editDraft.dialogueSpeaker}
                    onChange={(e) => setEditDraft({ ...editDraft, dialogueSpeaker: e.target.value })}
                    placeholder="角色名 / 旁白"
                  />
                </label>
                <label className="sg-field">
                  <span className="sg-label">对白文本</span>
                  <input
                    className="sg-input"
                    value={editDraft.dialogueText}
                    onChange={(e) => setEditDraft({ ...editDraft, dialogueText: e.target.value })}
                    placeholder="首条对白"
                  />
                </label>
              </div>

              <label className="sg-field">
                <span className="sg-label">镜头目的</span>
                <AssetMentionInput
                  value={editDraft.purpose ?? ''}
                  onChange={(next) => setEditDraft({ ...editDraft, purpose: next })}
                  kinds={GLOBAL_MENTION_KINDS}
                  placeholder="可 @情绪 @镜头"
                  className="sg-input"
                />
              </label>

              <div className="sg-grid-2">
                <label className="sg-field">
                  <span className="sg-label">画面描述 visual</span>
                  <textarea
                    className="sg-textarea"
                    rows={3}
                    value={editDraft.visual ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, visual: e.target.value })}
                    placeholder="关键帧：环境、人物位置、光线、情绪、构图"
                  />
                </label>
                <label className="sg-field">
                  <span className="sg-label">动作设计 action</span>
                  <textarea
                    className="sg-textarea"
                    rows={3}
                    value={editDraft.action ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, action: e.target.value })}
                    placeholder="开始动作 → 变化 → 结束"
                  />
                </label>
              </div>

              <label className="sg-field">
                <span className="sg-label">视听语言</span>
                <textarea
                  className="sg-textarea"
                  rows={3}
                  value={editDraft.audiovisualLanguage ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, audiovisualLanguage: e.target.value })}
                  placeholder="成段镜头叙事：运镜如何服务情绪、景别功能、光色对比、声画关系…"
                />
              </label>

              <div className="sg-grid-2">
                <label className="sg-field">
                  <span className="sg-label">旁白</span>
                  <input
                    className="sg-input"
                    value={editDraft.narration ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, narration: e.target.value })}
                  />
                </label>
                <label className="sg-field">
                  <span className="sg-label">声音 / 音效</span>
                  <input
                    className="sg-input"
                    value={editDraft.sound ?? ''}
                    onChange={(e) => setEditDraft({ ...editDraft, sound: e.target.value })}
                    placeholder="环境声、音乐设计"
                  />
                </label>
              </div>

              <label className="sg-field">
                <span className="sg-label">连贯备注（分号分隔）</span>
                <input
                  className="sg-input"
                  value={(editDraft.continuityNotes ?? []).join('；')}
                  onChange={(e) => setEditDraft({
                    ...editDraft,
                    continuityNotes: e.target.value
                      .split(/[；;\n]+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })}
                  placeholder="服装/道具/位置/朝向/光线延续"
                />
              </label>

              <div className="sg-edit-grid">
                <div className="sg-panel">
                  <div className="sg-panel__head">
                    <h3 className="sg-panel__title">角色预选</h3>
                    <span className="sg-panel__meta">{characters.length}</span>
                  </div>
                  {characters.length === 0 ? (
                    <p className="sg-warn" style={{ margin: 0 }}>暂无角色，先在角色设定补齐</p>
                  ) : (
                    <div className="sg-chip-wrap">
                      {characters.map((character) => {
                        const active = editDraft.characters.includes(character.name);
                        return (
                          <button
                            key={character.id}
                            type="button"
                            className={`sg-chip ${active ? 'is-on' : ''}`}
                            onClick={() => toggleDraftCharacter(character.name)}
                            title={characterMeta(character)}
                          >
                            {character.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="sg-panel">
                  <div className="sg-panel__head">
                    <h3 className="sg-panel__title">场景预选</h3>
                    <span className="sg-panel__meta">{scenePresets.length}</span>
                  </div>
                  {scenePresets.length === 0 ? (
                    <p className="sg-warn" style={{ margin: 0 }}>暂无场景，先在场景设定补齐</p>
                  ) : (
                    <div className="sg-chip-wrap">
                      {scenePresets.map((scene) => {
                        const active = stripMentionToken(editDraft.scene) === scene.label;
                        return (
                          <button
                            key={scene.id}
                            type="button"
                            className={`sg-chip ${active ? 'is-on' : ''}`}
                            onClick={() => setEditDraft({ ...editDraft, scene: scene.label })}
                            title={scene.description}
                          >
                            {scene.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <label className="sg-field">
                <span className="sg-label">分镜剧本 / 文案</span>
                <AssetMentionInput
                  as="textarea"
                  rows={3}
                  value={editDraft.scriptText}
                  onChange={(next) => setEditDraft({ ...editDraft, scriptText: next })}
                  kinds={GLOBAL_MENTION_KINDS}
                  placeholder="可 @ 角色、场景、镜头、情绪、声音"
                  className="sg-textarea"
                />
              </label>
              <label className="sg-field">
                <span className="sg-label">画面图片提示词 imagePrompt</span>
                <AssetMentionInput
                  as="textarea"
                  rows={4}
                  value={editDraft.imagePrompt}
                  onChange={(next) => setEditDraft({ ...editDraft, imagePrompt: next })}
                  kinds={GLOBAL_MENTION_KINDS}
                  className="sg-textarea"
                />
              </label>
              <label className="sg-field">
                <span className="sg-label">画面视频提示词 videoPrompt</span>
                <AssetMentionInput
                  as="textarea"
                  rows={4}
                  value={editDraft.videoPrompt}
                  onChange={(next) => setEditDraft({ ...editDraft, videoPrompt: next })}
                  kinds={GLOBAL_MENTION_KINDS}
                  className="sg-textarea"
                />
              </label>
              <label className="sg-field">
                <span className="sg-label">线稿构图提示词 sketchPrompt</span>
                <AssetMentionInput
                  as="textarea"
                  rows={3}
                  value={editDraft.sketchPrompt ?? ''}
                  onChange={(next) => setEditDraft({ ...editDraft, sketchPrompt: next })}
                  kinds={GLOBAL_MENTION_KINDS}
                  placeholder="黑白线稿构图：站位 / 前中后景 / 轮廓 / 机位；无色彩无材质"
                  className="sg-textarea"
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    onClick={() => {
                      const filled = buildLineArtShotPrompt(
                        [
                          editDraft.scriptText || editDraft.visual || editDraft.title,
                          editDraft.scene ? `location: ${editDraft.scene}` : '',
                          editDraft.shotSize ? `${editDraft.shotSize} shot` : '',
                          editDraft.cameraMove ? `camera: ${editDraft.cameraMove}` : '',
                          editDraft.cameraAngle ? `angle: ${editDraft.cameraAngle}` : '',
                          editDraft.characters?.length ? `characters: ${editDraft.characters.join(', ')}` : '',
                        ].filter(Boolean).join('\n'),
                        editDraft.shotSize,
                      );
                      setEditDraft({ ...editDraft, sketchPrompt: filled });
                    }}
                  >
                    用镜头信息填充线稿词
                  </button>
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    disabled={!editDraft.sketchPrompt?.trim()}
                    onClick={() => {
                      const v = (editDraft.sketchPrompt ?? '').trim();
                      if (!v) return;
                      void navigator.clipboard.writeText(v).then(
                        () => toastSuccess('已复制线稿提示词'),
                        () => toastSuccess('已复制线稿提示词'),
                      );
                    }}
                  >
                    复制线稿词
                  </button>
                </div>
              </label>
              <label className="sg-field">
                <span className="sg-label">排除项 negativePrompt</span>
                <textarea
                  className="sg-textarea"
                  rows={2}
                  value={editDraft.negativePrompt ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, negativePrompt: e.target.value })}
                  placeholder="不想出现的元素"
                />
              </label>
            </div>

            <div className="sg-studio__foot">
              <p className="sg-studio__foot-hint">
                {editingShot.sceneCode}
                {' · '}
                修改写回剧本拆分结构与故事板
              </p>
              <div className="sg-studio__foot-actions">
                <button
                  type="button"
                  className="sg-btn sg-btn--ghost"
                  onClick={() => setEditingShotId(null)}
                >
                  取消
                </button>
                <button type="button" className="sg-btn sg-btn--primary" onClick={saveShotEdit}>
                  保存修改
                </button>
              </div>
            </div>
          </div>
        )}
      </ScreenModal>
    </div>
  );
}

function StoryboardDeskDevPack({ blockId: _bid }: { blockId: string }) {
  const { values: gv, importJson: _gj } = useDevPromptOverrides();
  const [prompts, setPrompts] = useState<ScriptBreakdownPromptTemplates>(() => normalizeScriptBreakdownPrompts(undefined));
  const [tip, setTip] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const fullTemplates = useMemo(() => {
    const dft = DEFAULT_SCRIPT_BREAKDOWN_PROMPTS;
    return {
      episodePlannerSystem: prompts.episodePlannerSystem || dft.episodePlannerSystem,
      episodeBreakdownSystem: prompts.episodeBreakdownSystem || dft.episodeBreakdownSystem,
    };
  }, [prompts]);

  const nodeOverride = useMemo(() => {
    const result: Partial<Record<string, boolean>> = {};
    for (const key of ['episodePlannerSystem', 'episodeBreakdownSystem'] as const) {
      result[key] = Boolean(prompts[key as keyof ScriptBreakdownPromptTemplates]?.trim());
    }
    return result;
  }, [prompts]);

  const globalOverrides = useMemo(() => {
    const result: Partial<Record<string, boolean>> = {};
    for (const key of ['storyboard.episodeBreakdownSystem', 'storyboard.episodePlannerSystem'] as const) {
      result[key] = Boolean(gv[key]?.trim());
    }
    return result;
  }, [gv]);

  const sourceLabel = useCallback((key: 'episodePlannerSystem' | 'episodeBreakdownSystem'): string => {
    const globalKey = key === 'episodePlannerSystem' ? 'storyboard.episodePlannerSystem' : 'storyboard.episodeBreakdownSystem';
    if (nodeOverride[key]) return '来源：节点 Pack';
    if (globalOverrides[globalKey]) return '来源：全局 Override';
    return '来源：DEFAULT';
  }, [nodeOverride, globalOverrides]);

  const patch = useCallback((key: 'episodePlannerSystem' | 'episodeBreakdownSystem', value: string) => {
    setPrompts((prev) => ({ ...prev, [key]: value.trim() }));
  }, []);

  const reset = useCallback(() => { setPrompts(normalizeScriptBreakdownPrompts(undefined)); setTip('已恢复默认'); }, []);

  const exportPack = useCallback(() => {
    const pack = createScriptBreakdownPromptPack(undefined, prompts);
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'storyboard-prompt-pack.json'; a.click();
    URL.revokeObjectURL(url);
  }, [prompts]);

  const importPack = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ScriptBreakdownPromptPack;
      const result = parseScriptBreakdownPromptPack(parsed);
      if (result && result.prompts) {
        setPrompts(normalizeScriptBreakdownPrompts(result.prompts));
        setTip('导入成功');
      } else {
        setTip('非法 Pack 格式，拒绝导入');
      }
    } catch { setTip('JSON 解析失败'); }
  }, []);

  return (
    <details className="sg-warn" style={{ marginTop: 8, padding: 8, borderRadius: 10, border: '1px dashed var(--desk-warn)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 11, color: 'var(--desk-warn)' }}>
        ⚠ 开发 · 分镜台 Prompt Pack（仅开发）
      </summary>
      <div className="flex flex-col gap-2 mt-2 max-h-60 overflow-auto">
        {(['episodePlannerSystem', 'episodeBreakdownSystem'] as const).map((key) => (
          <div key={key}>
            <label className="text-[10px] font-bold opacity-60">{key}</label>
            <textarea
              className="w-full border border-line rounded text-[10px] p-1.5 mt-1 bg-surface resize-none font-mono"
              rows={4}
              value={fullTemplates[key]}
              onChange={(e) => patch(key, e.target.value)}
            />
            <div className="flex justify-between text-[8px] text-ink/40">
              <span>{sourceLabel(key)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-2" style={{ maxHeight: 60, overflow: 'visible' }}>
        <button type="button" className="sg-btn" onClick={reset}>恢复默认</button>
        <button type="button" className="sg-btn" onClick={exportPack}>导出</button>
        <button type="button" className="sg-btn" onClick={() => fileRef.current?.click()}>导入</button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importPack(f);
          e.target.value = '';
        }} />
      </div>
      {tip ? <p className="text-[10px] mt-1" style={{ color: 'var(--desk-ok)' }}>{tip}</p> : null}
    </details>
  );
}

export default memo(StoryboardDeskBlock);
