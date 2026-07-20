import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, Pencil, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  type CharacterProfile,
  type EnvironmentProfile,
  flattenScriptBreakdownShots,
  DEFAULT_SCRIPT_BREAKDOWN_CONFIG,
  DEFAULT_SCRIPT_BREAKDOWN_PROMPTS,
  normalizeScriptBreakdownConfig,
  type ScriptBreakdownConfig,
  type ScriptBreakdownPayload,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { ScreenModal } from '../../components/ui/ScreenModal';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import {
  environmentsFromBreakdown,
  profilesFromBreakdown,
  runProductionScriptBreakdownForEpisodes,
  stableSourceResultEpisodeId,
} from '../../engine/script-breakdown-runner';
import {
  ChipMultiSelect,
  DIRECTOR_CONTROL_GROUPS,
} from '../../engine/stage-deck/chrome/attached-workspace/table/ScriptBreakdownWorkspace';
import {
  buildCharacterCandidatePrompt,
  buildSceneCandidatePrompt,
  copyTextWithLog,
  sceneCandidateToWorkspaceItem,
  scriptCandidateCharacterKeys,
} from '../../engine/script-asset-candidates';
import './dialogue-sheet.css';

/** 流程：导演（先锁定）→ 文本 → 分镜表；锁定后不再回头改导演 */
type StudioTab = 'style' | 'text' | 'result';

/** 分镜表内子 Tab */
type ResultSubTab = 'shots' | 'characters' | 'scenes';

/** 文本 Tab 已保存的分集条目（可多集追加，不必覆盖第一集） */
type SourceEpisodeItem = {
  id: string;
  title: string;
  text: string;
  updatedAt: string;
  /** 最近一次成功生成分镜的时间；有值即视为「已生成过」 */
  generatedAt?: string | null;
};

function isEpisodeGenerated(ep: SourceEpisodeItem): boolean {
  return Boolean(ep.generatedAt);
}

function compact(text: string, max = 42) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

function makeEpisodeId() {
  return `ep-src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultEpisodeTitle(index: number) {
  return `第${index}集`;
}

/** 把分集列表拼成拆分引擎可识别的整本文本 */
function composeSourceText(episodes: SourceEpisodeItem[]): string {
  return episodes
    .map((ep, i) => {
      const title = ep.title.trim() || defaultEpisodeTitle(i + 1);
      const body = ep.text.trim();
      if (!body) return '';
      if (/^第[一二三四五六七八九十百千\d]+集/.test(body)) return body;
      return `${title}\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function loadSourceEpisodes(data: Record<string, unknown> | undefined): SourceEpisodeItem[] {
  const raw = data?.sourceEpisodes;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((rawItem, i) => {
        const row = rawItem as Partial<SourceEpisodeItem>;
        const text = String(row.text ?? '').trim();
        if (!text) return null;
        const episode: SourceEpisodeItem = {
          id: String(row.id || makeEpisodeId()),
          title: String(row.title || defaultEpisodeTitle(i + 1)).trim() || defaultEpisodeTitle(i + 1),
          text,
          updatedAt: String(row.updatedAt || new Date().toISOString()),
          generatedAt: row.generatedAt ? String(row.generatedAt) : null,
        };
        return episode;
      })
      .filter((episode): episode is SourceEpisodeItem => Boolean(episode));
  }
  const legacy = String(data?.sourceText ?? '').trim();
  if (legacy) {
    return [{
      id: 'legacy-src-1',
      title: '第1集',
      text: legacy,
      updatedAt: new Date().toISOString(),
    }];
  }
  return [];
}

function joinParts(parts: Array<string | undefined | null>, sep = ' · ') {
  return parts.map((p) => (p ?? '').trim()).filter(Boolean).join(sep);
}

/** 镜头分析：目的 + 画面/动作要点 */
function shotAnalysis(shot: {
  purpose?: string;
  visual?: string;
  action?: string;
  continuityNotes?: string[];
}): string {
  const notes = shot.continuityNotes?.filter(Boolean).join('；');
  return joinParts([
    shot.purpose ? `目的：${shot.purpose}` : '',
    shot.visual ? `画面：${shot.visual}` : '',
    shot.action ? `动作：${shot.action}` : '',
    notes ? `连贯：${notes}` : '',
  ], '\n') || '—';
}

/**
 * 视听语言：优先展示模型生成的成段镜头叙事；
 * 旧数据若无字段，再退回技术字段（不作为新生成目标）。
 */
function shotAudiovisual(shot: {
  audiovisualLanguage?: string;
  shotSize?: string;
  cameraMove?: string;
  cameraAngle?: string;
  cameraLens?: string;
  sound?: string;
  narration?: string;
  visual?: string;
  action?: string;
}): string {
  const narrative = shot.audiovisualLanguage?.trim();
  if (narrative && narrative.length >= 8) return narrative;
  // 兼容旧结果：拼成短句，避免纯标签墙
  const move = shot.cameraMove && shot.cameraMove !== '固定' ? `${shot.cameraMove}镜` : '镜头';
  const size = shot.shotSize ? `以${shot.shotSize}景别` : '';
  const angle = shot.cameraAngle ? `、${shot.cameraAngle}` : '';
  const body = shot.visual || shot.action || shot.sound || shot.narration;
  if (body) {
    return `${move}${size}${angle}贴近情境，${body.replace(/\s+/g, ' ').trim().slice(0, 120)}`;
  }
  return joinParts([
    shot.shotSize ? `景别 ${shot.shotSize}` : '',
    shot.cameraMove ? `运镜 ${shot.cameraMove}` : '',
    shot.cameraAngle ? `机位 ${shot.cameraAngle}` : '',
    shot.cameraLens ? `镜头 ${shot.cameraLens}` : '',
    shot.sound ? `声效 ${shot.sound}` : '',
  ], ' · ') || '—';
}

function shotDialogueLine(shot: {
  dialogue: Array<{ text?: string }>;
  scriptText?: string;
  action?: string;
  visual?: string;
}): string {
  return (
    shot.dialogue[0]?.text
    || shot.scriptText
    || shot.action
    || shot.visual
    || '—'
  );
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function matchAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word.toLowerCase()));
}

function inferDirectorControlsFromText(sourceText: string): ScriptBreakdownConfig['directorControls'] {
  const text = sourceText.toLowerCase();
  const controls: ScriptBreakdownConfig['directorControls'] = {
    ...DEFAULT_SCRIPT_BREAKDOWN_CONFIG.directorControls,
    storyGenres: [],
    narrativeStyles: [],
    emotionalTones: [],
    imageStyles: [],
    videoStyles: [],
    lightingStyles: [],
    colorStyles: [],
    cinematographyStyles: [],
    shotSizes: [],
    cameraMoves: [],
    shotFeelings: [],
    eraBackgrounds: [],
    sceneEnvironments: [],
    architectureStyles: [],
    costumeStyles: [],
    musicStyles: [],
    soundEffectStyles: [],
    imageQualities: [],
    characterPerformances: [],
    actionIntensities: [],
    continuityRequirements: [],
    targetPlatforms: [],
  };

  if (matchAny(text, ['爱', '喜欢', '心动', '重逢', '告白', '恋', '婚', '吻', '信封', '照片'])) controls.storyGenres.push('爱情');
  if (matchAny(text, ['城市', '都市', '街道', '咖啡馆', '办公', '地铁', '霓虹', '小区'])) controls.storyGenres.push('都市');
  if (matchAny(text, ['谜', '秘密', '线索', '案件', '凶手', '侦探', '推理'])) controls.storyGenres.push('悬疑', '推理');
  if (matchAny(text, ['恐惧', '鬼', '血', '尖叫', '惊悚', '尸', '怪物'])) controls.storyGenres.push('惊悚');
  if (matchAny(text, ['未来', '飞船', '太空', '机器人', '实验室', '科技', '芯片'])) controls.storyGenres.push('科幻');
  if (matchAny(text, ['魔法', '神', '妖', '灵', '修炼', '宗门', '玄', '剑气'])) controls.storyGenres.push('奇幻');
  if (matchAny(text, ['江湖', '武林', '侠', '刀', '剑', '门派'])) controls.storyGenres.push('武侠');
  if (matchAny(text, ['战争', '军队', '战场', '枪炮', '轰炸'])) controls.storyGenres.push('战争');
  if (matchAny(text, ['校园', '同学', '教室', '老师'])) controls.storyGenres.push('校园');
  if (matchAny(text, ['末日', '废土', '感染', '灾变'])) controls.storyGenres.push('末日');
  if (matchAny(text, ['赛博', '霓虹', '义体', '黑客'])) controls.storyGenres.push('赛博朋克');

  if (matchAny(text, ['突然', '冲', '追', '逃', '打', '杀', '爆炸'])) controls.narrativeStyles.push('悬念推进');
  if (matchAny(text, ['沉默', '眼眶', '泪', '怀念', '重逢', '错过', '孤独'])) controls.narrativeStyles.push('情绪驱动');
  controls.narrativeStyles.push('电影叙事');

  if (matchAny(text, ['温暖', '治愈', '笑', '阳光'])) controls.emotionalTones.push('温暖', '治愈');
  if (matchAny(text, ['雨', '夜', '沉默', '错过', '离开', '眼眶', '泛黄'])) controls.emotionalTones.push('孤独', '怀旧');
  if (matchAny(text, ['危险', '追', '逃', '枪', '爆炸', '凶手'])) controls.emotionalTones.push('紧张');
  if (matchAny(text, ['恐惧', '鬼', '尖叫', '黑暗'])) controls.emotionalTones.push('恐惧');
  if (matchAny(text, ['心动', '告白', '拥抱', '吻', '爱'])) controls.emotionalTones.push('浪漫');

  if (matchAny(text, ['雨', '夜', '街道', '咖啡馆', '霓虹', '玻璃'])) {
    controls.imageStyles.push('电影概念设计');
    controls.videoStyles.push('电影级真人短片');
    controls.lightingStyles.push('霓虹光', '电影柔光');
    controls.colorStyles.push('冷蓝色调', '复古胶片');
    controls.cinematographyStyles.push('日系电影摄影');
    controls.sceneEnvironments.push('城市街道', '咖啡馆');
    controls.architectureStyles.push('现代摩天楼');
    controls.soundEffectStyles.push('雨声', '城市环境声');
    controls.musicStyles.push('悲伤弦乐', '钢琴治愈');
  }
  if (matchAny(text, ['古代', '宫', '皇', '王朝', '寺', '道观'])) {
    controls.eraBackgrounds.push('架空世界');
    controls.architectureStyles.push('东方古建筑');
    controls.costumeStyles.push('古装');
    controls.musicStyles.push('古风音乐');
  }
  if (matchAny(text, ['未来', '赛博', '太空', '实验室'])) {
    controls.eraBackgrounds.push(matchAny(text, ['赛博']) ? '赛博朋克时代' : '近未来');
    controls.architectureStyles.push('未来科技建筑');
    controls.costumeStyles.push('未来科技服');
    controls.musicStyles.push('未来电子');
    controls.soundEffectStyles.push('科技音效');
  }
  if (matchAny(text, ['校园'])) {
    controls.sceneEnvironments.push('校园');
    controls.costumeStyles.push('校园制服');
  }

  controls.shotSizes.push('全景', '中景', '特写');
  controls.cameraMoves.push('推镜头', '跟拍');
  if (matchAny(text, ['孤独', '雨', '夜', '沉默'])) controls.shotFeelings.push('孤独', '亲密');
  if (matchAny(text, ['秘密', '信封', '线索', '谜'])) controls.shotFeelings.push('神秘');
  if (matchAny(text, ['战争', '爆炸', '神', '巨'])) controls.shotFeelings.push('震撼');

  controls.imageQualities.push('电影级画质', '细腻光影');
  controls.characterPerformances.push(matchAny(text, ['q版', '可爱']) ? 'Q版比例' : '真人比例');
  controls.actionIntensities.push(matchAny(text, ['战斗', '追逐', '逃跑', '爆炸']) ? '激烈动作' : '情绪动作');
  controls.continuityRequirements.push('角色一致', '脸部一致', '服装一致', '场景一致', '光线连续');
  controls.targetPlatforms.push(matchAny(text, ['短视频', '抖音', '竖屏']) ? '抖音竖屏9:16' : '影视短片16:9');

  for (const key of Object.keys(controls) as Array<keyof ScriptBreakdownConfig['directorControls']>) {
    controls[key] = unique(controls[key]).slice(0, 8);
  }
  return controls;
}

function DialogueSheetBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const characterLibrary = useWorkspaceDocument((s) => s.characters.characters);
  const environmentLibrary = useWorkspaceDocument((s) => s.environments);
  const workspaceItems = useWorkspaceDocument((s) => s.backlotWorkspace.items);
  const upsertCharacter = useWorkspaceDocument((s) => s.upsertCharacter);
  const setEnvironments = useWorkspaceDocument((s) => s.setEnvironments);
  const upsertBacklotWorkspace = useWorkspaceDocument((s) => s.upsertBacklotWorkspace);
  const nodeData = props.data as Record<string, unknown> | undefined;
  const payload = props.data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const [sourceEpisodes, setSourceEpisodes] = useState<SourceEpisodeItem[]>(() => loadSourceEpisodes(nodeData));
  const [draftTitle, setDraftTitle] = useState('');
  const [draftText, setDraftText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<string[]>([]);
  /** 分镜表折叠：用户手动覆盖默认展开/折叠 */
  const [episodeOpenOverride, setEpisodeOpenOverride] = useState<Record<string, boolean>>({});
  const [directorBrief, setDirectorBrief] = useState(() => String(nodeData?.directorBrief ?? ''));
  const [parsing, setParsing] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTab>('style');
  const [resultSubTab, setResultSubTab] = useState<ResultSubTab>('shots');
  const [runTip, setRunTip] = useState('');
  const config = useMemo(
    () => normalizeScriptBreakdownConfig(props.data?.scriptBreakdownConfig as Partial<ScriptBreakdownConfig> | undefined),
    [props.data?.scriptBreakdownConfig],
  );
  const directorLocked = Boolean(props.data?.directorControlsLocked);
  const selectedDirectorControlCount = useMemo(
    () => Object.values(config.directorControls).reduce((sum, value) => sum + value.length, 0),
    [config.directorControls],
  );
  const sourceText = useMemo(() => composeSourceText(sourceEpisodes), [sourceEpisodes]);
  const hasSavedEpisodes = sourceEpisodes.length > 0;
  const draftDirty = draftText.trim().length > 0;
  const multiSelected = selectedEpisodeIds.length >= 2;
  const canBatchGenerate = directorLocked
    && multiSelected
    && selectedDirectorControlCount > 0
    && !parsing
    && !draftDirty;

  const shots = useMemo(() => flattenScriptBreakdownShots(payload), [payload]);
  const environmentProfiles = useMemo(() => environmentLibrary?.environments ?? [], [environmentLibrary]);
  const characterCandidates = useMemo(
    () => payload ? profilesFromBreakdown(payload, characterLibrary) : [],
    [characterLibrary, payload],
  );
  const sceneCandidates = useMemo(
    () => payload ? environmentsFromBreakdown(payload, environmentProfiles) : [],
    [environmentProfiles, payload],
  );
  const existingCharacterKeys = useMemo(
    () => new Set(characterLibrary.flatMap(scriptCandidateCharacterKeys)),
    [characterLibrary],
  );
  const existingSceneKeys = useMemo(
    () => new Set([
      ...environmentProfiles.flatMap((scene) => [scene.name.trim(), scene.sceneCode ?? '']),
      ...workspaceItems.filter((item) => item.kind === 'scene').map((item) => item.label.trim()),
    ].filter(Boolean)),
    [environmentProfiles, workspaceItems],
  );

  useEffect(() => {
    setSourceEpisodes(loadSourceEpisodes(props.data as Record<string, unknown> | undefined));
  }, [props.data?.sourceEpisodes, props.data?.sourceText]);

  useEffect(() => {
    setDirectorBrief(String((props.data as Record<string, unknown> | undefined)?.directorBrief ?? ''));
  }, [props.data?.directorBrief]);

  const persistEpisodes = useCallback((next: SourceEpisodeItem[]) => {
    setSourceEpisodes(next);
    updateNodeData(props.id, {
      sourceEpisodes: next,
      sourceText: composeSourceText(next),
    });
  }, [props.id, updateNodeData]);

  const clearDraft = useCallback(() => {
    setDraftTitle('');
    setDraftText('');
    setEditingId(null);
  }, []);

  const saveDraftEpisode = useCallback(() => {
    if (!directorLocked) {
      setRunTip('请先锁定导演控制，再保存文本。');
      setStudioTab('style');
      return;
    }
    const text = draftText.trim();
    if (!text) {
      setRunTip('请先填写剧本正文，再点「保存」。');
      return;
    }
    const now = new Date().toISOString();
    if (editingId) {
      const next = sourceEpisodes.map((ep) => (
        ep.id === editingId
          ? {
            ...ep,
            title: draftTitle.trim() || ep.title,
            text,
            updatedAt: now,
          }
          : ep
      ));
      persistEpisodes(next);
      appendLog(`已更新剧本条目：${draftTitle.trim() || '本集'}`);
    } else {
      const title = draftTitle.trim() || defaultEpisodeTitle(sourceEpisodes.length + 1);
      const next = [
        ...sourceEpisodes,
        { id: makeEpisodeId(), title, text, updatedAt: now },
      ];
      persistEpisodes(next);
      appendLog(`已保存剧本条目：${title}`);
    }
    clearDraft();
    setRunTip('');
  }, [appendLog, clearDraft, directorLocked, draftText, draftTitle, editingId, persistEpisodes, sourceEpisodes]);

  const startEditEpisode = useCallback((ep: SourceEpisodeItem) => {
    setEditingId(ep.id);
    setDraftTitle(ep.title);
    setDraftText(ep.text);
    setRunTip('');
  }, []);

  const deleteEpisode = useCallback((id: string) => {
    const target = sourceEpisodes.find((ep) => ep.id === id);
    const next = sourceEpisodes.filter((ep) => ep.id !== id);
    persistEpisodes(next);
    setSelectedEpisodeIds((prev) => prev.filter((item) => item !== id));
    if (editingId === id) clearDraft();
    if (target) appendLog(`已删除剧本条目：${target.title}`);
  }, [appendLog, clearDraft, editingId, persistEpisodes, sourceEpisodes]);

  const toggleSelectEpisode = useCallback((id: string) => {
    setSelectedEpisodeIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  }, []);

  const resolveDefaultTab = useCallback((): StudioTab => {
    if (!directorLocked) return 'style';
    if (payload) return 'result';
    return 'text';
  }, [directorLocked, payload]);

  const openStudio = useCallback((tab?: StudioTab) => {
    setStudioTab(tab ?? resolveDefaultTab());
    setStudioOpen(true);
  }, [resolveDefaultTab]);

  const tryOpenTab = useCallback((tab: StudioTab) => {
    if ((tab === 'text' || tab === 'result') && !directorLocked) {
      setRunTip('请先设定并锁定导演控制项，再填写文本。');
      setStudioTab('style');
      return;
    }
    setRunTip('');
    setStudioTab(tab);
  }, [directorLocked]);

  const markEpisodesGenerated = useCallback((ids: string[]) => {
    const now = new Date().toISOString();
    const idSet = new Set(ids);
    const next = sourceEpisodes.map((ep) => (
      idSet.has(ep.id) ? { ...ep, generatedAt: now } : ep
    ));
    persistEpisodes(next);
  }, [persistEpisodes, sourceEpisodes]);

  const confirmOverwriteIfNeeded = useCallback((targets: SourceEpisodeItem[]) => {
    const already = targets.filter(isEpisodeGenerated);
    if (already.length === 0) return true;
    const names = already
      .map((ep) => ep.title.trim() || '未命名集')
      .join('、');
    return window.confirm(
      `以下分集已生成过分镜，继续将覆盖原结果：\n\n${names}\n\n是否继续生成？`,
    );
  }, []);

  const generateEpisodes = useCallback(async (ids: string[]) => {
    if (parsing) return;
    if (!directorLocked) {
      setRunTip('请先锁定导演控制项。');
      setStudioTab('style');
      return;
    }
    if (selectedDirectorControlCount === 0) {
      setRunTip('导演控制为空，请重新完成导演设定。');
      setStudioTab('style');
      return;
    }
    if (draftDirty) {
      setRunTip('输入框里还有未保存内容。请先保存或清空后再生成。');
      return;
    }
    const targets = sourceEpisodes
      .map((ep, listIndex) => ({ ep, listIndex }))
      .filter(({ ep }) => ids.includes(ep.id));
    if (targets.length === 0) {
      setRunTip('请选择要生成的分集。');
      return;
    }
    if (!confirmOverwriteIfNeeded(targets.map(({ ep }) => ep))) return;

    setParsing(true);
    setGeneratingId(targets.length === 1 ? targets[0]!.ep.id : '__batch__');
    setRunTip('');
    try {
      await runProductionScriptBreakdownForEpisodes({
        blockId: props.id,
        episodes: targets.map(({ ep, listIndex }) => ({
          id: ep.id,
          title: ep.title,
          text: ep.text,
          listIndex,
        })),
        fullSourceText: sourceText,
        existingPayload: payload,
        config,
        prompts:
          (props.data?.scriptBreakdownPrompts as typeof DEFAULT_SCRIPT_BREAKDOWN_PROMPTS | undefined) ??
          DEFAULT_SCRIPT_BREAKDOWN_PROMPTS,
      });
      markEpisodesGenerated(targets.map(({ ep }) => ep.id));
      setSelectedEpisodeIds([]);
      // 新生成后恢复默认：只展开本批，历史集折叠
      setEpisodeOpenOverride({});
      setResultSubTab('shots');
      setStudioTab('result');
      setStudioOpen(true);
    } catch (e) {
      appendLog(`拆分失败: ${String(e)}`);
      setRunTip(`生成失败：${String(e)}`);
    } finally {
      setParsing(false);
      setGeneratingId(null);
    }
  }, [
    appendLog,
    config,
    confirmOverwriteIfNeeded,
    directorLocked,
    draftDirty,
    markEpisodesGenerated,
    parsing,
    payload,
    props.data?.scriptBreakdownPrompts,
    props.id,
    selectedDirectorControlCount,
    sourceEpisodes,
    sourceText,
  ]);

  const generateOneEpisode = useCallback((id: string) => {
    void generateEpisodes([id]);
  }, [generateEpisodes]);

  const generateSelectedEpisodes = useCallback(() => {
    if (selectedEpisodeIds.length < 2) {
      setRunTip('批量生成请先勾选 2 集及以上；单集请用列表里的「去生成」。');
      return;
    }
    void generateEpisodes(selectedEpisodeIds);
  }, [generateEpisodes, selectedEpisodeIds]);

  /** 最近一次生成时间（同批多集共享同一时间戳） */
  const latestGeneratedAt = useMemo(() => {
    const times = sourceEpisodes
      .map((ep) => ep.generatedAt)
      .filter((t): t is string => Boolean(t));
    if (times.length === 0) return null;
    return times.reduce((a, b) => (a > b ? a : b));
  }, [sourceEpisodes]);

  const latestResultEpisodeIds = useMemo(() => {
    if (!latestGeneratedAt) return new Set<string>();
    return new Set(
      sourceEpisodes
        .filter((ep) => ep.generatedAt === latestGeneratedAt)
        .map((ep) => stableSourceResultEpisodeId(ep.id)),
    );
  }, [latestGeneratedAt, sourceEpisodes]);

  const isResultEpisodeDefaultOpen = useCallback((episodeId: string, episodeIndex: number, total: number) => {
    if (latestResultEpisodeIds.size > 0) {
      return latestResultEpisodeIds.has(episodeId);
    }
    // 无生成时间记录时：只展开最后一集
    return episodeIndex === total - 1;
  }, [latestResultEpisodeIds]);

  const isResultEpisodeOpen = useCallback((episodeId: string, defaultOpen: boolean) => {
    if (Object.prototype.hasOwnProperty.call(episodeOpenOverride, episodeId)) {
      return episodeOpenOverride[episodeId]!;
    }
    return defaultOpen;
  }, [episodeOpenOverride]);

  const toggleResultEpisode = useCallback((episodeId: string, defaultOpen: boolean) => {
    setEpisodeOpenOverride((prev) => {
      const current = Object.prototype.hasOwnProperty.call(prev, episodeId)
        ? prev[episodeId]!
        : defaultOpen;
      return { ...prev, [episodeId]: !current };
    });
  }, []);

  const patchDirectorControls = useCallback((patch: Partial<ScriptBreakdownConfig['directorControls']>) => {
    if (directorLocked) {
      setRunTip('导演控制已锁定，不可再改。');
      return;
    }
    const nextConfig = normalizeScriptBreakdownConfig({
      ...config,
      directorControls: { ...config.directorControls, ...patch },
    });
    updateNodeData(props.id, { scriptBreakdownConfig: nextConfig });
  }, [config, directorLocked, props.id, updateNodeData]);

  const clearDirectorControls = useCallback(() => {
    if (directorLocked) return;
    updateNodeData(props.id, {
      scriptBreakdownConfig: {
        ...config,
        directorControls: DEFAULT_SCRIPT_BREAKDOWN_CONFIG.directorControls,
      },
    });
  }, [config, directorLocked, props.id, updateNodeData]);

  const autoMatchDirectorControls = useCallback(() => {
    if (directorLocked) {
      setRunTip('导演控制已锁定，不可再改。');
      return;
    }
    const brief = directorBrief.trim();
    if (!brief) {
      setRunTip('请先填写作品简介 / 介绍，再让 AI 匹配导演控制项。');
      return;
    }
    const nextControls = inferDirectorControlsFromText(brief);
    const nextConfig = normalizeScriptBreakdownConfig({
      ...config,
      directorControls: nextControls,
    });
    updateNodeData(props.id, {
      directorBrief: brief,
      scriptBreakdownConfig: nextConfig,
    });
    setRunTip('');
    appendLog('导演控制项已根据作品简介自动匹配');
  }, [appendLog, config, directorBrief, directorLocked, props.id, updateNodeData]);

  const lockDirectorControls = useCallback(() => {
    if (directorLocked) {
      setStudioTab('text');
      return;
    }
    if (selectedDirectorControlCount === 0) {
      setRunTip('请先手动选择导演控制项，或填写简介后点「AI 匹配」。');
      return;
    }
    updateNodeData(props.id, {
      directorControlsLocked: true,
      directorBrief: directorBrief.trim(),
      scriptBreakdownConfig: config,
    });
    setRunTip('');
    appendLog(`导演控制已锁定（${selectedDirectorControlCount} 项），开始填写文本`);
    setStudioTab('text');
  }, [
    appendLog,
    config,
    directorBrief,
    directorLocked,
    props.id,
    selectedDirectorControlCount,
    updateNodeData,
  ]);

  const adoptCharacterCandidate = useCallback((character: CharacterProfile) => {
    upsertCharacter(character);
    appendLog(`已写入角色设定候选：${character.name}`);
  }, [appendLog, upsertCharacter]);

  const adoptSceneCandidate = useCallback((scene: EnvironmentProfile) => {
    const current = useWorkspaceDocument.getState().environments?.environments ?? [];
    setEnvironments({
      version: 1,
      environments: [...current.filter((item) => item.id !== scene.id), scene],
    });
    const existing = useWorkspaceDocument.getState().backlotWorkspace.items
      .find((item) => item.kind === 'scene' && (item.id === `scene-${scene.id}` || item.label === scene.name));
    upsertBacklotWorkspace(sceneCandidateToWorkspaceItem(scene, existing));
    appendLog(`已写入场景设定候选：${scene.name}`);
  }, [appendLog, setEnvironments, upsertBacklotWorkspace]);

  const hasResult = Boolean(payload);
  const totalSourceChars = useMemo(
    () => sourceEpisodes.reduce((sum, ep) => sum + ep.text.trim().length, 0),
    [sourceEpisodes],
  );
  const latestEpisode = payload?.episodes[payload.episodes.length - 1];
  const latestShot = shots[shots.length - 1];
  const topScenes = useMemo(
    () => unique(shots.map((shot) => shot.scene || shot.title).filter(Boolean)).slice(0, 3),
    [shots],
  );
  const topCharacters = useMemo(
    () => unique(shots.flatMap((shot) => shot.characters ?? []).filter(Boolean)).slice(0, 4),
    [shots],
  );
  const selectedStyleTags = useMemo(
    () => [
      ...config.directorControls.storyGenres,
      ...config.directorControls.emotionalTones,
      ...config.directorControls.imageStyles,
      ...config.directorControls.videoStyles,
    ].slice(0, 4),
    [config.directorControls],
  );
  const statusClass = parsing
    ? 'is-run'
    : hasResult
      ? 'is-ready'
      : runTip
        ? 'is-warn'
        : '';
  const statusText = parsing
    ? '拆分中'
    : hasResult
      ? '已出表'
      : !directorLocked
        ? '待导演'
        : hasSavedEpisodes
          ? '可拆分'
          : '待保存';

  const countsLabel = hasResult
    ? (
      <>
        <b>{payload!.episodes.length}</b> 集 · <b>{shots.length}</b> 镜 · <b>{characterCandidates.length}</b> 角
      </>
    )
    : (
      <>
        <b>{directorLocked ? '已锁' : '未锁'}</b>
        {' · '}
        <b>{selectedDirectorControlCount}</b> 风格
        {' · '}
        <b>{sourceEpisodes.length}</b> 集
      </>
    );

  return (
    <div className="relative">
      <BlockShell {...props}>
        <div className="ds ds-card nodrag nopan">
          <div className="ds-card__toolbar">
            <span className={`ds-card__status ${statusClass}`}>{statusText}</span>
            <span className="ds-card__counts">{countsLabel}</span>
          </div>

          <button
            type="button"
            className="ds-summary-card"
            onClick={() => openStudio()}
            title="打开剧本拆分工作台"
          >
            {hasResult ? (
              <>
                <div className="ds-summary-card__hero">
                  <div>
                    <span className="ds-summary-card__eyebrow">最近生成</span>
                    <strong>{latestEpisode?.title || payload?.title || '分镜剧本'}</strong>
                    <p>{latestShot ? compact(latestShot.scriptText || latestShot.visual || latestShot.title, 54) : '已生成专业分镜结果'}</p>
                  </div>
                  <span className="ds-summary-card__metric">
                    {shots.length}
                    <small>镜</small>
                  </span>
                </div>

                <div className="ds-summary-card__stats" aria-label="拆分结果摘要">
                  <span><b>{payload!.episodes.length}</b> 集</span>
                  <span><b>{characterCandidates.length}</b> 角色候选</span>
                  <span><b>{sceneCandidates.length}</b> 场景候选</span>
                </div>

                <div className="ds-summary-card__chips">
                  {(topScenes.length ? topScenes : ['待同步到分镜网格']).map((label) => (
                    <span key={label}>{compact(label, 10)}</span>
                  ))}
                </div>

                <div className="ds-summary-card__trail">
                  {topCharacters.length ? `角色：${topCharacters.join('、')}` : '打开后可查看分镜表、角色候选、场景候选'}
                </div>
              </>
            ) : (
              <>
                <div className="ds-summary-card__hero is-empty">
                  <div>
                    <span className="ds-summary-card__eyebrow">
                      {!directorLocked ? '第一步' : hasSavedEpisodes ? '下一步' : '准备中'}
                    </span>
                    <strong>
                      {!directorLocked
                        ? '锁定导演控制'
                        : hasSavedEpisodes
                          ? '按集生成分镜'
                          : '保存剧本文本'}
                    </strong>
                    <p>
                      {!directorLocked
                        ? '先选择风格、镜头语言与平台，或让 AI 根据故事自动匹配。'
                        : hasSavedEpisodes
                          ? '已保存分集，可单集生成，也可多选批量生成。'
                          : '导演已锁定，开始按集粘贴剧本/小说/文案。'}
                    </p>
                  </div>
                  <span className="ds-summary-card__metric">
                    {sourceEpisodes.length}
                    <small>集</small>
                  </span>
                </div>

                <div className="ds-summary-card__stats" aria-label="准备状态">
                  <span><b>{selectedDirectorControlCount}</b> 控制项</span>
                  <span><b>{totalSourceChars}</b> 字</span>
                  <span><b>{directorLocked ? '已锁' : '未锁'}</b> 导演</span>
                </div>

                <div className="ds-summary-card__chips">
                  {(selectedStyleTags.length ? selectedStyleTags : ['剧情类型', '画面风格', '镜头语言']).map((label) => (
                    <span key={label}>{compact(label, 10)}</span>
                  ))}
                </div>

                <div className="ds-summary-card__trail">
                  {runTip || '点击卡片进入导演控制、分集文本与生产级拆分。'}
                </div>
              </>
            )}
          </button>

          {runTip ? <p className="ds-card__hint is-warn">{runTip}</p> : null}

          <div className="ds-card__actions">
            <button
              type="button"
              className="ds-btn ds-btn--primary"
              onClick={(e) => {
                e.stopPropagation();
                openStudio();
              }}
            >
              {hasResult ? '开表' : directorLocked ? '打开' : '设定导演'}
            </button>
          </div>
        </div>
      </BlockShell>

      <ScreenModal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        title="剧本拆分 · 分镜表"
        subtitle="导演锁定 · 文本分集 · 分镜表"
        width={980}
        variant="default"
        className="ds-modal"
      >
        <div className="ds ds-studio">
          <div className="ds-studio__tabs" role="tablist">
            {(
              [
                { id: 'style' as const, label: '导演' },
                { id: 'text' as const, label: '文本' },
                { id: 'result' as const, label: '分镜表' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className={`ds-studio__tab ${studioTab === tab.id ? 'is-on' : ''} ${!directorLocked && tab.id !== 'style' ? 'is-dim' : ''}`}
                onClick={() => tryOpenTab(tab.id)}
              >
                {tab.label}
                {tab.id === 'style' && directorLocked ? ' · 锁' : ''}
              </button>
            ))}
          </div>

          <div className="ds-studio__body">
            {studioTab === 'text' && (
              <>
                {runTip && <p className="ds-warn">{runTip}</p>}

                <div className="ds-ep-panel">
                  <div className="ds-ep-panel__head">
                    <span>已保存分集</span>
                    <span className="ds-ep-panel__meta">
                      {sourceEpisodes.length > 0
                        ? `${sourceEpisodes.length} 条 · ${totalSourceChars} 字`
                        : '暂无 · 写完一集后点保存'}
                    </span>
                  </div>

                  {sourceEpisodes.length === 0 ? (
                    <div className="ds-ep-empty">
                      导演已锁定。每集写完点「保存」进列表；单集用「去生成」，多集勾选 2 集以上再用底部「生成」。
                    </div>
                  ) : (
                    <ul className="ds-ep-list">
                      {sourceEpisodes.map((ep, index) => {
                        const chars = ep.text.trim().length;
                        const isEditing = editingId === ep.id;
                        const generated = isEpisodeGenerated(ep);
                        const selected = selectedEpisodeIds.includes(ep.id);
                        const rowBusy = parsing && (generatingId === ep.id || generatingId === '__batch__');
                        return (
                          <li
                            key={ep.id}
                            className={`ds-ep-item ${isEditing ? 'is-editing' : ''} ${selected ? 'is-selected' : ''}`}
                          >
                            <label className="ds-ep-check" title="多选（2集以上）后底部可批量生成">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={parsing}
                                onChange={() => toggleSelectEpisode(ep.id)}
                              />
                            </label>
                            <div className="ds-ep-item__main">
                              <span className="ds-ep-item__idx">{index + 1}</span>
                              <div className="ds-ep-item__body">
                                <div className="ds-ep-item__title-row">
                                  <span className="ds-ep-item__title">
                                    {ep.title || defaultEpisodeTitle(index + 1)}
                                  </span>
                                  <span className={`ds-ep-flag ${generated ? 'is-done' : 'is-todo'}`}>
                                    {generated ? '已生成' : '未生成'}
                                  </span>
                                </div>
                                <div className="ds-ep-item__preview" title={ep.text}>
                                  {compact(ep.text, 72)}
                                </div>
                                <div className="ds-ep-item__meta">{chars} 字</div>
                              </div>
                            </div>
                            <div className="ds-ep-item__acts">
                              <button
                                type="button"
                                className="ds-btn ds-btn--soft"
                                title={generated ? '重新生成本集（将覆盖）' : '生成本集分镜'}
                                disabled={parsing || !directorLocked || draftDirty}
                                onClick={() => generateOneEpisode(ep.id)}
                              >
                                {rowBusy && generatingId === ep.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Sparkles size={12} />
                                )}
                                去生成
                              </button>
                              <button
                                type="button"
                                className="ds-btn ds-btn--ghost"
                                title="修改"
                                disabled={parsing}
                                onClick={() => startEditEpisode(ep)}
                              >
                                <Pencil size={12} /> 改
                              </button>
                              <button
                                type="button"
                                className="ds-btn ds-btn--ghost"
                                title="删除"
                                disabled={parsing}
                                onClick={() => deleteEpisode(ep.id)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="ds-ep-draft">
                  <div className="ds-ep-draft__head">
                    <span>{editingId ? '编辑本集' : '新写一集'}</span>
                    {editingId && (
                      <button type="button" className="ds-btn ds-btn--ghost" onClick={clearDraft}>
                        取消编辑
                      </button>
                    )}
                  </div>
                  <input
                    className="ds-input"
                    value={draftTitle}
                    onChange={(e) => {
                      setDraftTitle(e.target.value);
                      if (runTip) setRunTip('');
                    }}
                    placeholder={editingId ? '本集标题' : `标题（默认 ${defaultEpisodeTitle(sourceEpisodes.length + 1)}）`}
                  />
                  <textarea
                    className="ds-textarea ds-textarea--draft"
                    value={draftText}
                    onChange={(e) => {
                      setDraftText(e.target.value);
                      if (runTip) setRunTip('');
                    }}
                    placeholder={
                      editingId
                        ? '修改本集正文…'
                        : '粘贴 / 输入本集小说、剧本或大纲…\n写完后点底部「保存」收入列表，再继续写下一集。'
                    }
                    autoFocus
                  />
                </div>
              </>
            )}

            {studioTab === 'style' && (
              <>
                {runTip && <p className="ds-warn">{runTip}</p>}

                <div className={`ds-lock-banner ${directorLocked ? 'is-locked' : ''}`}>
                  {directorLocked
                    ? `导演控制已锁定（${selectedDirectorControlCount} 项）· 仅可查看，后续拆分均使用此设定`
                    : '请先完成导演设定并锁定。锁定后填写文本时不会再回到本页改风格。'}
                </div>

                <div className="ds-brief">
                  <div className="ds-brief__head">
                    <span>作品简介 / 介绍</span>
                    <span className="ds-brief__hint">供 AI 匹配用 · 不必贴全文</span>
                  </div>
                  <textarea
                    className="ds-textarea ds-textarea--brief"
                    value={directorBrief}
                    disabled={directorLocked}
                    onChange={(e) => {
                      setDirectorBrief(e.target.value);
                      updateNodeData(props.id, { directorBrief: e.target.value });
                      if (runTip) setRunTip('');
                    }}
                    placeholder={
                      '用几句话介绍小说 / 文章：类型、时代、主情绪、画面气质、平台等。\n例：都市爱情，雨夜重逢，偏电影感，暖冷交织，适合竖屏短剧。'
                    }
                  />
                </div>

                <div className="ds-style-head">
                  <p>
                    {selectedDirectorControlCount > 0
                      ? `导演控制 ${selectedDirectorControlCount} 项${directorLocked ? ' · 已锁定' : ''}`
                      : '手动点选，或根据简介 AI 匹配'}
                  </p>
                  {!directorLocked && (
                    <>
                      <button
                        type="button"
                        className="ds-btn ds-btn--soft"
                        onClick={autoMatchDirectorControls}
                      >
                        <Wand2 size={13} /> AI 匹配
                      </button>
                      {selectedDirectorControlCount > 0 && (
                        <button
                          type="button"
                          className="ds-btn ds-btn--ghost"
                          onClick={clearDirectorControls}
                        >
                          清空
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className={directorLocked ? 'ds-style-readonly' : undefined}>
                  {DIRECTOR_CONTROL_GROUPS.map((group) => (
                    <details
                      key={group.title}
                      className="ds-group"
                      open={group.title === '故事与情绪'}
                    >
                      <summary>{group.title}</summary>
                      <div className="ds-group__body">
                        {group.fields.map((field) => (
                          <ChipMultiSelect
                            key={field.key}
                            label={field.label}
                            value={config.directorControls[field.key] ?? []}
                            options={field.options}
                            disabled={directorLocked}
                            onChange={(next) => patchDirectorControls({ [field.key]: next })}
                          />
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </>
            )}

            {studioTab === 'result' && (
              <>
                {!payload ? (
                  <div className="ds-empty">
                    分镜表为空
                    <br />
                    导演锁定后保存分集，在「文本」列表按集点「去生成」
                  </div>
                ) : (
                  <>
                    <div className="ds-sheet-stats">
                      <div className="ds-sheet-stat">
                        <b>{payload.episodes.length}</b>
                        <span>集数</span>
                      </div>
                      <div className="ds-sheet-stat">
                        <b>{shots.length}</b>
                        <span>镜头</span>
                      </div>
                      <div className="ds-sheet-stat">
                        <b>{characterCandidates.length}</b>
                        <span>角色</span>
                      </div>
                      <div className="ds-sheet-stat">
                        <b>{sceneCandidates.length}</b>
                        <span>场景</span>
                      </div>
                    </div>

                    <div className="ds-result-tabs" role="tablist" aria-label="分镜表候选分类">
                      {(
                        [
                          { id: 'shots' as const, label: '分镜剧本候选', count: shots.length },
                          { id: 'characters' as const, label: '角色候选', count: characterCandidates.length },
                          { id: 'scenes' as const, label: '场景候选', count: sceneCandidates.length },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={resultSubTab === tab.id}
                          className={`ds-result-tab ${resultSubTab === tab.id ? 'is-on' : ''}`}
                          onClick={() => setResultSubTab(tab.id)}
                        >
                          {tab.label}
                          <span className="ds-result-tab__count">{tab.count}</span>
                        </button>
                      ))}
                    </div>

                    {resultSubTab === 'shots' && (
                      <div className="ds-result-pane">
                        {payload.episodes.length === 0 ? (
                          <div className="ds-empty" style={{ padding: 20 }}>暂无分镜剧本候选</div>
                        ) : (
                          payload.episodes.map((episode, epPos) => {
                            const defaultOpen = isResultEpisodeDefaultOpen(
                              episode.id,
                              epPos,
                              payload.episodes.length,
                            );
                            const open = isResultEpisodeOpen(episode.id, defaultOpen);
                            const isLatest = latestResultEpisodeIds.size > 0
                              ? latestResultEpisodeIds.has(episode.id)
                              : epPos === payload.episodes.length - 1;
                            return (
                              <div
                                key={episode.id}
                                className={`ds-episode-block ${open ? 'is-open' : 'is-collapsed'} ${isLatest ? 'is-latest' : ''}`}
                              >
                                <button
                                  type="button"
                                  className="ds-episode-block__head"
                                  onClick={() => toggleResultEpisode(episode.id, defaultOpen)}
                                  aria-expanded={open}
                                >
                                  <span className="ds-episode-block__chevron" aria-hidden>
                                    <ChevronDown size={14} />
                                  </span>
                                  <span className="ds-episode-block__title">{episode.title}</span>
                                  {isLatest ? (
                                    <span className="ds-episode-block__tag">最新</span>
                                  ) : (
                                    <span className="ds-episode-block__tag is-old">历史</span>
                                  )}
                                  <span className="ds-episode-block__meta">
                                    {episode.shots.length} 镜 · {open ? '收起' : '展开'}
                                  </span>
                                </button>
                                {open && (
                                  <div className="ds-sheet-scroll">
                                    <table className="ds-sheet">
                                      <thead>
                                        <tr>
                                          <th className="col-code">镜号</th>
                                          <th className="col-size">景别</th>
                                          <th className="col-move">运镜</th>
                                          <th className="col-scene">场景</th>
                                          <th className="col-cast">角色</th>
                                          <th className="col-line">内容 / 对白</th>
                                          <th className="col-analysis">分析</th>
                                          <th className="col-av">视听语言</th>
                                          <th className="col-img">画面图片提示词</th>
                                          <th className="col-vid">画面视频提示词</th>
                                          <th className="col-dur">秒</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {episode.shots.map((shot) => {
                                          const analysis = shotAnalysis(shot);
                                          const av = shotAudiovisual(shot);
                                          const line = shotDialogueLine(shot);
                                          const img = shot.imagePrompt?.trim() || '—';
                                          const vid = shot.videoPrompt?.trim() || '—';
                                          return (
                                            <tr key={shot.id}>
                                              <td className="col-code sticky-col">
                                                {shot.sceneCode || `S${shot.index}`}
                                              </td>
                                              <td className="col-size">{shot.shotSize || '—'}</td>
                                              <td className="col-move">{shot.cameraMove || '—'}</td>
                                              <td className="col-scene">{shot.scene || shot.title || '—'}</td>
                                              <td className="col-cast">
                                                {shot.characters?.length ? shot.characters.join('、') : '—'}
                                              </td>
                                              <td className="col-line">
                                                <div className="ds-cell" title={line}>{line}</div>
                                              </td>
                                              <td className="col-analysis">
                                                <div className="ds-cell" title={analysis}>{analysis}</div>
                                              </td>
                                              <td className="col-av">
                                                <div className="ds-cell" title={av}>{av}</div>
                                              </td>
                                              <td className="col-img">
                                                <div className="ds-cell ds-cell--prompt" title={img}>{img}</div>
                                              </td>
                                              <td className="col-vid">
                                                <div className="ds-cell ds-cell--prompt" title={vid}>{vid}</div>
                                              </td>
                                              <td className="col-dur">{shot.durationSec ?? '—'}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {resultSubTab === 'characters' && (
                      <div className="ds-result-pane">
                        {characterCandidates.length === 0 ? (
                          <div className="ds-empty" style={{ padding: 20 }}>暂无角色候选</div>
                        ) : (
                          <div className="ds-sheet-scroll ds-sheet-scroll--cand ds-sheet-scroll--pane">
                            <table className="ds-cand-table">
                              <thead>
                                <tr>
                                  <th>名称</th>
                                  <th>状态</th>
                                  <th>Prompt</th>
                                  <th>操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {characterCandidates.map((character) => {
                                  const exists = scriptCandidateCharacterKeys(character).some((key) =>
                                    existingCharacterKeys.has(key),
                                  );
                                  const prompt = buildCharacterCandidatePrompt(character);
                                  return (
                                    <tr key={character.id}>
                                      <td className="name">{character.name}</td>
                                      <td>
                                        <span className={`ds-badge ${exists ? 'is-in' : 'is-new'}`}>
                                          {exists ? '已入库' : '新'}
                                        </span>
                                      </td>
                                      <td className="prompt" title={prompt}>{prompt || '暂无 Prompt'}</td>
                                      <td className="acts">
                                        <button
                                          type="button"
                                          className="ds-btn ds-btn--ghost"
                                          onClick={() => void copyTextWithLog(prompt, appendLog)}
                                        >
                                          复制
                                        </button>
                                        <button
                                          type="button"
                                          className="ds-btn ds-btn--soft"
                                          onClick={() => adoptCharacterCandidate(character)}
                                        >
                                          {exists ? '更新' : '入库'}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {resultSubTab === 'scenes' && (
                      <div className="ds-result-pane">
                        {sceneCandidates.length === 0 ? (
                          <div className="ds-empty" style={{ padding: 20 }}>暂无场景候选</div>
                        ) : (
                          <div className="ds-sheet-scroll ds-sheet-scroll--cand ds-sheet-scroll--pane">
                            <table className="ds-cand-table">
                              <thead>
                                <tr>
                                  <th>名称</th>
                                  <th>状态</th>
                                  <th>Prompt</th>
                                  <th>操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sceneCandidates.map((scene) => {
                                  const exists = [scene.name.trim(), scene.sceneCode ?? ''].some(
                                    (key) => key && existingSceneKeys.has(key),
                                  );
                                  const prompt = buildSceneCandidatePrompt(scene);
                                  return (
                                    <tr key={scene.id}>
                                      <td className="name">{scene.name}</td>
                                      <td>
                                        <span className={`ds-badge ${exists ? 'is-in' : 'is-new'}`}>
                                          {exists ? '已入库' : '新'}
                                        </span>
                                      </td>
                                      <td className="prompt" title={prompt}>{prompt || '暂无 Prompt'}</td>
                                      <td className="acts">
                                        <button
                                          type="button"
                                          className="ds-btn ds-btn--ghost"
                                          onClick={() => void copyTextWithLog(prompt, appendLog)}
                                        >
                                          复制
                                        </button>
                                        <button
                                          type="button"
                                          className="ds-btn ds-btn--soft"
                                          onClick={() => adoptSceneCandidate(scene)}
                                        >
                                          {exists ? '更新' : '入库'}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div className="ds-studio__foot">
            <p className="ds-studio__foot-hint">
              {studioTab === 'style' && (
                directorLocked
                  ? '导演已锁定 · 可查看，不可再改'
                  : selectedDirectorControlCount
                    ? `${selectedDirectorControlCount} 项已选 · 确认后锁定并进入文本`
                    : '手动点选，或写简介后 AI 匹配'
              )}
              {studioTab === 'text' && (
                draftDirty
                  ? '输入框有未保存内容 · 先保存再生成'
                  : selectedEpisodeIds.length >= 2
                    ? `已选 ${selectedEpisodeIds.length} 集 · 可点「生成」批量`
                    : selectedEpisodeIds.length === 1
                      ? '已选 1 集 · 单集请用列表「去生成」；勾选 2 集以上才可批量'
                      : '单集用「去生成」· 勾选 2 集以上再用底部「生成」'
              )}
              {studioTab === 'result' && (
                payload
                  ? resultSubTab === 'shots'
                    ? '分镜剧本 · 最新集默认展开，历史集可手动展开'
                    : resultSubTab === 'characters'
                      ? '角色候选 · 可复制 Prompt 或入库'
                      : '场景候选 · 可复制 Prompt 或入库'
                  : '分镜表尚未生成 · 回文本 Tab 按集生成'
              )}
            </p>
            {studioTab === 'style' && (
              <button
                type="button"
                className="ds-btn ds-btn--primary"
                onClick={lockDirectorControls}
                disabled={!directorLocked && selectedDirectorControlCount === 0}
              >
                {directorLocked ? '进入文本' : '锁定并进入文本'}
              </button>
            )}
            {studioTab === 'text' && (
              <div className="ds-studio__foot-actions">
                <button
                  type="button"
                  className="ds-btn ds-btn--soft"
                  onClick={saveDraftEpisode}
                  disabled={!draftDirty || parsing}
                >
                  {editingId ? '更新' : (
                    <>
                      <Plus size={13} /> 保存
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn--primary"
                  onClick={generateSelectedEpisodes}
                  disabled={!canBatchGenerate}
                  title={
                    !directorLocked
                      ? '请先锁定导演控制'
                      : draftDirty
                        ? '请先保存或清空当前输入'
                        : selectedEpisodeIds.length < 2
                          ? '请勾选 2 集及以上；单集用列表「去生成」'
                          : '批量生成所选分集'
                  }
                >
                  {parsing && generatingId === '__batch__' ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> 生成中
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} /> 生成
                    </>
                  )}
                </button>
              </div>
            )}
            {studioTab === 'result' && (
              <button
                type="button"
                className="ds-btn ds-btn--primary"
                onClick={() => (payload ? setStudioOpen(false) : tryOpenTab('text'))}
              >
                {payload ? '完成' : '去文本按集生成'}
              </button>
            )}
          </div>
        </div>
      </ScreenModal>
    </div>
  );
}

export default memo(DialogueSheetBlock);
