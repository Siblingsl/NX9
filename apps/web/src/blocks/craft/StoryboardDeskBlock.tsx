import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, ImagePlus, Loader2, Pencil, Sparkles } from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  type AssetLibraryKind,
  type BacklotWorkspaceItem,
  type CharacterProfile,
  type EnvironmentProfile,
  buildLineArtShotPrompt,
  emptyStoryboardPreview,
  flattenScriptBreakdownShots,
  resolveConnectedPictureGenId,
  resolveStoryboardPreviewPictureSettings,
  storyboardShotsFromScriptBreakdown,
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
import { applyScriptBreakdownPayload } from '../../engine/script-breakdown-runner';
import { AssetMentionInput } from '../../engine/stage-deck/chrome/asset-mention/AssetMentionInput';
import { StoryboardPreviewWorkspace } from '../../engine/stage-deck/chrome/attached-workspace/storyboard-preview/StoryboardPreviewWorkspace';
import { generateStoryboardFrameImage } from '../../engine/storyboard-preview-runner';
import { api } from '../../api/client';
import { toastSuccess } from '../../stores/toast';
import './storyboard-desk.css';

/** CSS 前缀：desk 复用 story-grid 的 sg-* 变量（同文件拷贝） */
const cx = {
  root: 'sg',
  card: 'sg-card',
};

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
      const payload = data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
      if (payload?.version === 1) return payload;
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

/** 主台：分镜表 | 分集 | 关键帧预览 */
type StudioTab = 'grid' | 'episodes' | 'preview';

function StoryboardDeskBlock(props: NodeProps) {
  const { updateNodeData, getEdges, getNodes } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = useUpstreamBreakdown(props.id);
  const local = props.data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const payload = local ?? upstream;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  /** 正在生成画面的 shot id */
  const [generatingShotId, setGeneratingShotId] = useState<string | null>(null);
  /** 批量任务：线稿 / 关键帧互斥 */
  const [batchMode, setBatchMode] = useState<'line-art' | 'keyframe' | null>(null);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
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

  const sceneCount = payload
    ? payload.episodes.reduce((sum, episode) => sum + (episode.scenes?.length ?? 0), 0)
    : 0;

  const confirmedCount = confirmedEpisodeIds.length;
  const episodeCount = payload?.episodes.length ?? 0;

  const cardStatusText = !payload
    ? '待接拆分'
    : currentEpisodeConfirmed
      ? '本集已确认'
      : upstream && !local
        ? '可同步'
        : `${visibleShots.length} 镜`;
  const cardStatusClass = !payload
    ? ''
    : currentEpisodeConfirmed
      ? 'is-ready'
      : visibleShots.length
        ? 'is-run'
        : 'is-warn';

  const miniPreview = useMemo(
    () => visibleShots.slice(0, 4).map((shot) => ({
      id: shot.id,
      code: shot.sceneCode || `S${shot.index}`,
      scene: shot.scene || shot.title || '—',
      line: compact(
        shot.dialogue?.[0]?.text || shot.scriptText || shot.action || shot.title || '',
        28,
      ) || '—',
    })),
    [visibleShots],
  );

  const sync = useCallback(() => {
    if (!upstream) return;
    const flat = flattenScriptBreakdownShots(upstream);
    const doc = useWorkspaceDocument.getState();
    const previousById = new Map(doc.storyboard.shots.map((shot) => [shot.id, shot]));
    const rawStoryboardShots = storyboardShotsFromScriptBreakdown(upstream).map((base) => ({
      ...base,
      ...(previousById.get(base.id) ?? {}),
      episodeId: base.episodeId,
      episodeIndex: base.episodeIndex,
      episodeTitle: base.episodeTitle,
      index: base.index,
      durationSec: base.durationSec,
      descriptionZh: base.descriptionZh,
      promptEn: base.promptEn,
      videoPromptEn: base.videoPromptEn,
      characterNames: base.characterNames,
      sceneName: base.sceneName,
    }));
    const storyboardShots = bindStoryboardShotAssets(
      rawStoryboardShots,
      doc.characters.characters,
      doc.environments?.environments ?? [],
    );
    const episodeIds = new Set(storyboardShots.map((shot) => shot.episodeId).filter(Boolean));
    const nextActive =
      doc.storyboard.activeEpisodeId && episodeIds.has(doc.storyboard.activeEpisodeId)
        ? doc.storyboard.activeEpisodeId
        : storyboardShots.find((shot) => shot.episodeId)?.episodeId ?? null;
    doc.setStoryboard({
      ...doc.storyboard,
      version: 3,
      title: upstream.title,
      activeEpisodeId: nextActive,
      shots: storyboardShots,
    });
    updateNodeData(props.id, {
      status: 'success',
      scriptBreakdown: upstream,
      gridConfirmed: false,
      confirmedEpisodeIds: [],
      content: `${upstream.title} · ${upstream.episodes.length} 集 · ${flat.length} 个分镜`,
      output: flat.map((shot) => shot.imagePrompt).join('\n\n'),
      meta: { episodeCount: upstream.episodes.length, shotCount: flat.length },
    });
    appendLog(`分镜网格已同步 · ${upstream.episodes.length} 集 / ${flat.length} 个分镜`);
  }, [appendLog, props.id, updateNodeData, upstream]);

  const confirmCurrentEpisode = useCallback(() => {
    if (!currentEpisodeId || visibleShots.length === 0) return;
    updateNodeData(props.id, {
      status: 'success',
      gridConfirmed: true,
      confirmedEpisodeIds: [...new Set([...confirmedEpisodeIds, currentEpisodeId])],
      confirmedAt: new Date().toISOString(),
    });
    appendLog(
      `分镜网格已确认 · ${visibleEpisodes[0]?.title ?? currentEpisodeId} / ${visibleShots.length} 镜`,
    );
  }, [
    appendLog,
    confirmedEpisodeIds,
    currentEpisodeId,
    props.id,
    updateNodeData,
    visibleEpisodes,
    visibleShots.length,
  ]);

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
    applyScriptBreakdownPayload(props.id, next);
    setEditingShotId(null);
    appendLog(`已修改分镜 · ${editingShot.sceneCode} ${editDraft.title}`);
  }, [appendLog, editDraft, editingShot, payload, props.id]);

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
    setStudioTab(tab);
    setStudioOpen(true);
  }, []);

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

  const resolveSketchPrompt = useCallback((shot: ScriptBreakdownShot) => {
    const raw = shot.sketchPrompt?.trim();
    if (raw) return raw;
    return buildLineArtShotPrompt(
      [
        shot.scriptText || shot.visual || shot.title,
        shot.scene ? `location: ${shot.scene}` : '',
        shot.shotSize ? `${shot.shotSize} shot` : '',
        shot.cameraMove ? `camera: ${shot.cameraMove}` : '',
        shot.cameraAngle ? `angle: ${shot.cameraAngle}` : '',
        (shot.characters?.length ? `characters: ${shot.characters.join(', ')}` : ''),
      ].filter(Boolean).join('\n'),
      shot.shotSize,
    );
  }, []);

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
    | { frames?: Array<{ imageUrl?: string | null; suggestRegenerate?: boolean; consistencyScore?: number | null }> }
    | undefined;
  const previewFrames = previewPayload?.frames ?? [];
  const previewOk = previewFrames.filter((f) => f.imageUrl).length;
  const previewLow = previewFrames.filter((f) => f.suggestRegenerate).length;

  // 默认打开顶部能力口，便于连接图像生成 / 3D 导演台
  useEffect(() => {
    const data = props.data as { showExecPorts?: boolean };
    if (data.showExecPorts === undefined) {
      updateNodeData(props.id, { showExecPorts: true });
    }
  }, [props.data, props.id, updateNodeData]);

  return (
    <div className="relative">
      <BlockShell {...props}>
        <div className={`${cx.root} ${cx.card} nodrag nopan`}>
          <div className="sg-card__toolbar">
            <span className={`sg-card__status ${cardStatusClass}`}>{cardStatusText}</span>
            <span className="sg-card__counts">
              {payload ? (
                <>
                  镜 <b>{shots.length}</b>
                  {' · '}
                  图 <b>{previewOk}</b>
                  {previewLow > 0 ? (
                    <>
                      {' · '}
                      低分 <b>{previewLow}</b>
                    </>
                  ) : null}
                </>
              ) : (
                <>待接入</>
              )}
            </span>
          </div>

          <button
            type="button"
            className="sg-summary-card"
            onClick={() => openStudio('grid')}
            title="打开分镜台 · 表编辑 + 关键帧预览"
          >
            {payload && visibleShots.length > 0 ? (
              <>
                <div className="sg-summary-card__hero">
                  <div>
                    <span className="sg-summary-card__eyebrow">
                      {currentEpisodeConfirmed ? '本集已确认' : '分镜台'}
                    </span>
                    <strong>
                      {compact(
                        visibleEpisodes[0]?.title
                          || payload.title
                          || `第 ${(visibleEpisodes[0]?.index ?? 0) + 1 || 1} 集`,
                        18,
                      )}
                    </strong>
                    <p>
                      {miniPreview[0]
                        ? `${miniPreview[0].code} · ${compact(miniPreview[0].scene, 10)} · ${compact(miniPreview[0].line, 28)}`
                        : '打开后编辑分镜表、线稿与关键帧'}
                    </p>
                  </div>
                  <span className="sg-summary-card__metric">
                    {visibleShots.length}
                    <small>镜</small>
                  </span>
                </div>
                <div className="sg-summary-card__stats" aria-label="分镜摘要">
                  <span><b>{episodeCount}</b> 集</span>
                  <span><b>{previewOk}</b> 关键帧</span>
                  <span><b>{sceneCount}</b> 场</span>
                </div>
                <div className="sg-summary-card__chips">
                  {(miniPreview.length
                    ? miniPreview.map((r) => r.code)
                    : ['分镜表', '线稿', '关键帧']
                  ).map((label) => (
                    <span key={label}>{compact(label, 10)}</span>
                  ))}
                </div>
                <div className="sg-summary-card__trail">
                  {previewLow > 0
                    ? `${previewLow} 张关键帧评分偏低 · 建议重生成`
                    : confirmedCount < episodeCount
                      ? `已确认 ${confirmedCount}/${episodeCount} 集 · 点击开台`
                      : '点击开台编辑分镜 / 预览关键帧'}
                </div>
              </>
            ) : (
              <>
                <div className="sg-summary-card__hero is-empty">
                  <div>
                    <span className="sg-summary-card__eyebrow">
                      {upstream && !local ? '可同步' : '等待拆分'}
                    </span>
                    <strong>
                      {upstream && !local ? '同步上游分镜' : '连接剧本拆分'}
                    </strong>
                    <p>
                      {upstream && !local
                        ? '上游已有拆分结果，点同步载入分镜表后即可开台。'
                        : '连接剧本拆分（或设定检查）后同步分镜表、线稿与关键帧。'}
                    </p>
                  </div>
                  <span className="sg-summary-card__metric">
                    {upstream ? (upstream.episodes?.length ?? 0) : 0}
                    <small>集</small>
                  </span>
                </div>
                <div className="sg-summary-card__stats" aria-label="等待状态">
                  <span><b>0</b> 镜</span>
                  <span><b>0</b> 图</span>
                  <span><b>{upstream ? '待同步' : '待接'}</b></span>
                </div>
                <div className="sg-summary-card__chips">
                  <span>分镜表</span>
                  <span>线稿</span>
                  <span>关键帧</span>
                </div>
                <div className="sg-summary-card__trail">
                  {upstream && !local ? '点「同步」或卡片载入' : '等待剧本拆分结果'}
                </div>
              </>
            )}
          </button>

          {payload && confirmedCount < episodeCount ? (
            <p className="sg-card__hint is-warn">
              已确认 {confirmedCount}/{episodeCount} 集
              {currentEpisodeConfirmed ? ' · 本集已确认' : ' · 本集未确认'}
            </p>
          ) : null}
          {previewLow > 0 ? (
            <p className="sg-card__hint is-warn">
              {previewLow} 张关键帧评分 &lt; 80 · 建议在关键帧 Tab 重生成
            </p>
          ) : null}

          <div className="sg-card__actions">
            {upstream ? (
              <button
                type="button"
                className="sg-btn sg-btn--ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  sync();
                }}
              >
                同步
              </button>
            ) : null}
            <button
              type="button"
              className="sg-btn sg-btn--ghost"
              disabled={!payload}
              onClick={(e) => {
                e.stopPropagation();
                openStudio('preview');
              }}
            >
              关键帧
            </button>
            <button
              type="button"
              className="sg-btn sg-btn--primary"
              disabled={!payload && !upstream}
              onClick={(e) => {
                e.stopPropagation();
                if (!payload && upstream) {
                  sync();
                  openStudio('grid');
                  return;
                }
                openStudio('grid');
              }}
            >
              {payload ? '开台' : upstream ? '同步开台' : '等待拆分'}
            </button>
          </div>
        </div>
      </BlockShell>

      {/* 主台：分镜表 + 分集 + 关键帧预览 */}
      <ScreenModal
        open={studioOpen && Boolean(payload)}
        onClose={() => setStudioOpen(false)}
        title="分镜台"
        subtitle={
          payload
            ? `${payload.title || '本剧'} · 分镜表 / 关键帧 / 评分 · 顶口连接图像生成与 3D`
            : undefined
        }
        width={980}
        variant="default"
        className="sg-modal"
      >
        {payload && (
          <div className="sg sg-studio">
            <div className="sg-studio__tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className={`sg-studio__tab ${studioTab === 'grid' ? 'is-on' : ''}`}
                onClick={() => setStudioTab('grid')}
              >
                分镜表 · {visibleShots.length}
              </button>
              <button
                type="button"
                role="tab"
                className={`sg-studio__tab ${studioTab === 'episodes' ? 'is-on' : ''}`}
                onClick={() => setStudioTab('episodes')}
              >
                分集 · {episodeCount}
              </button>
              <button
                type="button"
                role="tab"
                className={`sg-studio__tab ${studioTab === 'preview' ? 'is-on' : ''}`}
                onClick={() => setStudioTab('preview')}
              >
                关键帧 · {previewOk}/{previewFrames.length || visibleShots.length}
                {previewLow > 0 ? ` · 低${previewLow}` : ''}
              </button>
            </div>

            <div className="sg-studio__body">
              <div className="sg-batch-bar">
                <div className="sg-batch-bar__meta">
                  {batchMode === 'line-art'
                    ? `批量线稿进行中 ${batchProgress || ''}`.trim()
                    : batchMode === 'keyframe'
                      ? `批量关键帧进行中 ${batchProgress || ''}`.trim()
                      : '先线稿确认构图，再批量出关键帧'}
                </div>
                <div className="sg-batch-bar__acts">
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    disabled={!payload || batchRunning || visibleShots.length === 0}
                    onClick={() => void generateBatchLineArt('visible')}
                    title="对当前表内可见镜头批量生成线稿"
                  >
                    {batchMode === 'line-art' ? `线稿 ${batchProgress}` : `可见线稿 · ${visibleShots.length}`}
                  </button>
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    disabled={!payload || batchRunning || shots.length === 0}
                    onClick={() => void generateBatchLineArt('all')}
                    title="对本拆分结果全部镜头批量生成线稿"
                  >
                    全部线稿 · {shots.length}
                  </button>
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    disabled={!payload || batchRunning || visibleShots.length === 0}
                    onClick={() => void generateBatchKeyframes('visible')}
                    title="对当前表内可见镜头批量生成关键帧成图"
                  >
                    {batchMode === 'keyframe' ? `关键帧 ${batchProgress}` : `可见关键帧 · ${visibleShots.length}`}
                  </button>
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    disabled={!payload || batchRunning || visibleShots.length === 0}
                    onClick={() => void generateBatchKeyframes('missing')}
                    title="仅补当前可见、尚无画面的镜头关键帧"
                  >
                    缺图补关键帧
                  </button>
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    disabled={!payload || batchRunning || shots.length === 0}
                    onClick={() => void generateBatchKeyframes('all')}
                    title="对本拆分结果全部镜头批量生成关键帧成图"
                  >
                    全部关键帧 · {shots.length}
                  </button>
                </div>
              </div>
              <div className="sg-stats">
                <div className="sg-stats__cell">
                  <span className="sg-stats__val">{episodeCount}</span>
                  <span className="sg-stats__lab">集数</span>
                </div>
                <div className="sg-stats__cell">
                  <span className="sg-stats__val">{sceneCount}</span>
                  <span className="sg-stats__lab">场景</span>
                </div>
                <div className="sg-stats__cell">
                  <span className="sg-stats__val">{shots.length}</span>
                  <span className="sg-stats__lab">全剧镜头</span>
                </div>
                <div className="sg-stats__cell">
                  <span className="sg-stats__val">{confirmedCount}/{episodeCount || 0}</span>
                  <span className="sg-stats__lab">已确认集</span>
                </div>
              </div>

              <div className="sg-toolbar">
                <label className="sg-field" style={{ margin: 0, flex: '1 1 200px' }}>
                  <span className="sg-label">当前分集</span>
                  <select
                    className="sg-select"
                    value={activeEpisodeId ?? payload.episodes[0]?.id ?? ''}
                    onChange={(event) => {
                      setActiveEpisodeId(event.target.value || null);
                      setSelectedId(null);
                    }}
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
                </label>
                <span className={`sg-mini__badge is-${currentEpisodeConfirmed ? 'ok' : 'warn'}`}>
                  {currentEpisodeConfirmed ? '本集已确认' : '本集未确认'}
                </span>
              </div>

              {studioTab === 'grid' && (
                <>
                  {visibleShots.length === 0 ? (
                    <div className="sg-empty">本集暂无镜头 · 请从剧本拆分同步</div>
                  ) : (
                    <div className="sg-story-scroll">
                      <p className="sg-story-hint">
                        点画面可上传 · 底栏线稿 / 关键帧 / 编辑 · 详细字段点「编辑」
                      </p>
                      <div className="sg-story-grid">
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
                    </div>
                  )}
                </>
              )}

              {studioTab === 'episodes' && (
                <>
                  <div className="sg-panel__head" style={{ marginBottom: 10 }}>
                    <h3 className="sg-panel__title">分集一览</h3>
                    <span className="sg-panel__meta">点选切换当前集</span>
                  </div>
                  <ul className="sg-lib-list">
                    {payload.episodes.map((episode) => {
                      const done = confirmedEpisodeIds.includes(episode.id);
                      const active = (activeEpisodeId ?? payload.episodes[0]?.id) === episode.id;
                      return (
                        <li key={episode.id}>
                          <button
                            type="button"
                            className={`sg-lib-item ${active ? 'is-on' : ''}`}
                            onClick={() => {
                              setActiveEpisodeId(episode.id);
                              setStudioTab('grid');
                            }}
                          >
                            <span className="sg-lib-body">
                              <span className="sg-lib-name">{episode.title}</span>
                              <span className="sg-lib-meta">
                                {episode.shots.length} 镜
                                {episode.logline ? ` · ${compact(episode.logline, 36)}` : ''}
                              </span>
                            </span>
                            <span className={`sg-mini__badge is-${done ? 'ok' : 'todo'}`}>
                              {done ? '已确认' : '未确认'}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {studioTab === 'preview' && (
                <div className="sg-panel" style={{ padding: 8, marginBottom: 0 }}>
                  <p className="sg-warn" style={{ marginBottom: 8 }}>
                    顶部能力口请连接「图像生成」与/或「3D 导演台」。出图后点「关键帧评分」：
                    角色一致性 · 场景一致性 · 其它一致性，综合分 &lt; 80 建议重生成。
                  </p>
                  <StoryboardPreviewWorkspace
                    blockId={props.id}
                    kind={props.type ?? 'storyboard-desk'}
                    embedded
                  />
                </div>
              )}
            </div>

            {studioTab !== 'preview' ? (
              <div className="sg-studio__foot">
                <p className="sg-studio__foot-hint">
                  {visibleEpisodes[0]?.title ?? '本集'}
                  {' · '}
                  {visibleShots.length} 镜
                  {currentEpisodeConfirmed ? ' · 已确认可下游生产' : ' · 确认后标记本集就绪'}
                </p>
                <div className="sg-studio__foot-actions">
                  {upstream ? (
                    <button type="button" className="sg-btn sg-btn--ghost" onClick={sync}>
                      同步上游
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    disabled={!payload || batchRunning || visibleShots.length === 0}
                    onClick={() => void generateBatchLineArt('visible')}
                    data-testid="foot-batch-lineart"
                  >
                    {batchMode === 'line-art' ? `线稿 ${batchProgress}` : '批量线稿'}
                  </button>
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    disabled={!payload || batchRunning || visibleShots.length === 0}
                    onClick={() => void generateBatchKeyframes('visible')}
                    data-testid="foot-batch-keyframe"
                  >
                    {batchMode === 'keyframe' ? `关键帧 ${batchProgress}` : '批量关键帧'}
                  </button>
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    onClick={() => setStudioTab('preview')}
                  >
                    去关键帧
                  </button>
                  <button
                    type="button"
                    className="sg-btn sg-btn--primary"
                    disabled={currentEpisodeConfirmed || visibleShots.length === 0}
                    onClick={confirmCurrentEpisode}
                  >
                    {currentEpisodeConfirmed ? '本集已确认' : '确认本集'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="sg-studio__foot">
                <p className="sg-studio__foot-hint">
                  {batchMode === 'keyframe'
                    ? `批量关键帧进行中 ${batchProgress || ''}`.trim()
                    : '关键帧出图 · 评分门槛 80 · 可批量补图 / 全量重出'}
                </p>
                <div className="sg-studio__foot-actions">
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    onClick={() => setStudioTab('grid')}
                  >
                    回分镜表
                  </button>
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    disabled={!payload || batchRunning || visibleShots.length === 0}
                    onClick={() => void generateBatchKeyframes('missing')}
                    title="仅补当前可见、尚无画面的镜头"
                  >
                    缺图补关键帧
                  </button>
                  <button
                    type="button"
                    className="sg-btn sg-btn--primary"
                    disabled={!payload || batchRunning || visibleShots.length === 0}
                    onClick={() => void generateBatchKeyframes('visible')}
                    data-testid="preview-batch-keyframe"
                  >
                    {batchMode === 'keyframe' ? `关键帧 ${batchProgress}` : `批量关键帧 · ${visibleShots.length}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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
        className="sg-modal"
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

export default memo(StoryboardDeskBlock);
