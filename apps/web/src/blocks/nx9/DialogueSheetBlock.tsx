import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, MessageSquareText, Sparkles } from 'lucide-react';
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
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import {
  environmentsFromBreakdown,
  profilesFromBreakdown,
  runProductionScriptBreakdown,
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

function compact(text: string, max = 42) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}...` : t;
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
  const initialText = (props.data?.sourceText as string) ?? '';
  const payload = props.data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const [sourceText, setSourceText] = useState(initialText);
  const [parsing, setParsing] = useState(false);
  const [showDirectorControls, setShowDirectorControls] = useState(false);
  const [showAssetCandidates, setShowAssetCandidates] = useState(false);
  const [runTip, setRunTip] = useState('');
  const config = useMemo(
    () => normalizeScriptBreakdownConfig(props.data?.scriptBreakdownConfig as Partial<ScriptBreakdownConfig> | undefined),
    [props.data?.scriptBreakdownConfig],
  );
  const selectedDirectorControlCount = useMemo(
    () => Object.values(config.directorControls).reduce((sum, value) => sum + value.length, 0),
    [config.directorControls],
  );
  const canRun = sourceText.trim().length > 0 && selectedDirectorControlCount > 0 && !parsing;

  const shots = useMemo(() => flattenScriptBreakdownShots(payload), [payload]);
  const selectedShot = shots[0];
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
    setSourceText((props.data?.sourceText as string) ?? '');
  }, [props.data?.sourceText]);

  const parse = useCallback(async () => {
    if (parsing) return;
    const source = sourceText.trim();
    if (!source || selectedDirectorControlCount === 0) {
      setRunTip(!source ? '需要先填入剧本/文案/小说。' : '需要先选择导演控制项，或点击右侧弹出框的“全部自动匹配”按钮。');
      return;
    }
    setParsing(true);
    setRunTip('');
    try {
      await runProductionScriptBreakdown({
        blockId: props.id,
        sourceText: source,
        config,
        prompts: (props.data?.scriptBreakdownPrompts as typeof DEFAULT_SCRIPT_BREAKDOWN_PROMPTS | undefined)
          ?? DEFAULT_SCRIPT_BREAKDOWN_PROMPTS,
      });
    } catch (e) {
      appendLog(`拆分失败: ${String(e)}`);
    } finally {
      setParsing(false);
    }
  }, [appendLog, config, parsing, props.data?.scriptBreakdownPrompts, props.id, selectedDirectorControlCount, sourceText]);

  const patchDirectorControls = useCallback((patch: Partial<ScriptBreakdownConfig['directorControls']>) => {
    const nextConfig = normalizeScriptBreakdownConfig({
      ...config,
      directorControls: { ...config.directorControls, ...patch },
    });
    updateNodeData(props.id, { scriptBreakdownConfig: nextConfig });
  }, [config, props.id, updateNodeData]);

  const autoMatchDirectorControls = useCallback(() => {
    const source = sourceText.trim();
    if (!source) {
      setRunTip('需要先填入剧本/文案/小说，才能根据内容自动匹配导演控制项。');
      return;
    }
    const nextControls = inferDirectorControlsFromText(source);
    const nextConfig = normalizeScriptBreakdownConfig({
      ...config,
      directorControls: nextControls,
    });
    updateNodeData(props.id, { sourceText: source, scriptBreakdownConfig: nextConfig });
    setRunTip('');
    appendLog('导演控制项已根据当前文本自动匹配');
  }, [appendLog, config, props.id, sourceText, updateNodeData]);

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

  return (
    <div className="relative">
    <BlockShell {...props}>
      <div className="w-[340px] space-y-3 nodrag nopan text-xs">
        <div className="rounded-xl border border-line/60 bg-white p-2.5 space-y-2">
          <div className="flex items-center gap-2 text-ink">
            <FileText size={14} className="text-brand" />
            <span className="font-medium">剧本拆分</span>
            {payload && (
              <span className="ml-auto text-[10px] text-ink/45">
                {payload.episodes.length} 集 · {shots.length} 镜
              </span>
            )}
          </div>
          <textarea
            value={sourceText}
            onChange={(e) => {
              setSourceText(e.target.value);
              if (runTip) setRunTip('');
            }}
            placeholder="粘贴小说、文章或剧本文本..."
            rows={5}
            className="w-full rounded-lg border border-line/60 px-2.5 py-2 resize-y bg-surface/30 focus:bg-white focus:outline-none focus:border-brand/40"
          />
          <button
            type="button"
            onClick={() => setShowDirectorControls((open) => !open)}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
              showDirectorControls
                ? 'border-brand/40 bg-brand/10'
                : 'border-line/55 bg-surface/25 hover:border-brand/30 hover:bg-brand/[0.04]'
            }`}
          >
            <span>
              <span className="block text-[12px] font-semibold text-ink">导演控制</span>
              <span className="block text-[10px] text-ink/50">类型、风格、镜头、世界观、声音与生成控制</span>
            </span>
            <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${selectedDirectorControlCount > 0 ? 'bg-brand text-white' : 'bg-white text-ink/55 border border-line/50'}`}>
              {selectedDirectorControlCount > 0 ? `已选 ${selectedDirectorControlCount}` : '未配置'}
            </span>
          </button>
          {runTip && (
            <div className="rounded-lg border border-warn/30 bg-warn/8 px-2.5 py-1.5 text-[10px] leading-relaxed text-warn">
              {runTip}
            </div>
          )}
          <button
            type="button"
            onClick={() => void parse()}
            aria-disabled={!canRun}
            className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-medium transition-colors ${
              canRun
                ? 'bg-brand text-white hover:bg-brand/90'
                : 'cursor-not-allowed bg-ink/10 text-ink/35'
            }`}
          >
            {parsing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {parsing ? '拆分中...' : '拆分集数与分镜'}
          </button>
        </div>

        {payload && (
          <div className="rounded-xl border border-line/50 bg-surface/20 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line/30 bg-white px-2.5 py-1.5">
              <span className="text-[10px] font-semibold text-ink/60">设定候选</span>
              <span className="text-[9px] text-ink/35">角色 {characterCandidates.length} · 场景 {sceneCandidates.length}</span>
              <button
                type="button"
                onClick={() => setShowAssetCandidates((open) => !open)}
                className="ml-auto rounded-lg border border-line bg-white px-2 py-1 text-[9px] font-medium text-ink/55 hover:border-brand/35 hover:text-brand"
              >
                查看 Prompt
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto nx9-scroll">
              {payload.episodes.map((episode) => (
                <div key={episode.id} className="border-b border-line/30 last:border-b-0">
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-white/95 px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold text-ink">{episode.title}</span>
                    <span className="ml-auto text-[10px] text-ink/40">{episode.shots.length} 个分镜</span>
                  </div>
                  <div className="p-1.5 space-y-1">
                    {episode.shots.map((shot) => (
                      <div key={shot.id} className="rounded-lg bg-white border border-line/35 px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-6 text-[10px] text-brand font-medium">{shot.sceneCode}</span>
                          <span className="min-w-0 flex-1 text-[11px] text-ink truncate">{shot.title}</span>
                          <span className="text-[9px] text-ink/35">{shot.durationSec}s</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[9px] text-ink/45">
                          <MessageSquareText size={10} />
                          <span className="truncate">{shot.dialogue[0]?.text || compact(shot.scriptText)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedShot && (
          <div className="rounded-xl border border-line/45 bg-white px-2.5 py-2 space-y-1">
            <p className="text-[10px] text-ink/40">预览 Prompt</p>
            <p className="text-[11px] leading-relaxed text-ink/70 line-clamp-3">{selectedShot.imagePrompt}</p>
          </div>
        )}
      </div>
    </BlockShell>
    {showDirectorControls && (
      <div
        className="absolute left-[calc(100%+12px)] top-14 z-50 w-[420px] rounded-2xl border border-brand/25 bg-white p-3 text-xs shadow-[0_18px_48px_rgba(15,15,15,0.18)] nodrag nopan"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand">
            <Sparkles size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">导演控制项</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink/55">请先手动选择，或根据当前剧本文本自动匹配；选择后会优先影响剧本拆分、分镜、图片/视频 Prompt 与声音设计。</p>
          </div>
          <button type="button" onClick={() => setShowDirectorControls(false)} className="rounded-lg px-2 py-1 text-[11px] text-ink/45 hover:bg-surface">关闭</button>
        </div>
        <div className="mb-2 flex items-center justify-between rounded-xl bg-surface/45 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-ink/65">{selectedDirectorControlCount > 0 ? `当前已选择 ${selectedDirectorControlCount} 项` : '尚未配置导演控制项'}</span>
            {selectedDirectorControlCount > 0 && (
              <button
                type="button"
                onClick={() => updateNodeData(props.id, { scriptBreakdownConfig: { ...config, directorControls: DEFAULT_SCRIPT_BREAKDOWN_CONFIG.directorControls } })}
                className="rounded-lg border border-line bg-white px-2 py-1 text-[10px] font-medium text-ink/45 hover:border-warn/40 hover:text-warn"
              >
                清除全部
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={autoMatchDirectorControls}
            className="rounded-lg border border-line bg-white px-2 py-1 text-[10px] font-medium text-ink/55 hover:text-brand"
          >
            全部自动匹配
          </button>
        </div>
        <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1 nx9-scroll">
          {DIRECTOR_CONTROL_GROUPS.map((group) => (
            <details key={group.title} className="rounded-xl border border-line/45 bg-white p-2.5" open={group.title === '故事与情绪'}>
              <summary className="cursor-pointer select-none text-[12px] font-semibold text-ink/75">{group.title}</summary>
              <div className="mt-2 space-y-3">
                {group.fields.map((field) => (
                  <ChipMultiSelect
                    key={field.key}
                    label={field.label}
                    value={config.directorControls[field.key] ?? []}
                    options={field.options}
                    onChange={(next) => patchDirectorControls({ [field.key]: next })}
                  />
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    )}
    {showAssetCandidates && payload && (
      <div
        className="absolute left-[calc(100%+12px)] top-14 z-50 w-[460px] rounded-2xl border border-brand/25 bg-white p-3 text-xs shadow-[0_18px_48px_rgba(15,15,15,0.18)] nodrag nopan"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand">
            <Sparkles size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">角色 / 场景候选 Prompt</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink/55">这里展示剧本拆分后给角色设定、场景设定使用的候选提示词；生图仍交给图像生成节点。</p>
          </div>
          <button type="button" onClick={() => setShowAssetCandidates(false)} className="rounded-lg px-2 py-1 text-[11px] text-ink/45 hover:bg-surface">关闭</button>
        </div>
        <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1 nx9-scroll">
          <details className="rounded-xl border border-line/45 bg-white p-2.5" open>
            <summary className="cursor-pointer select-none text-[12px] font-semibold text-ink/75">角色候选 · {characterCandidates.length}</summary>
            <div className="mt-2 space-y-2">
              {characterCandidates.length === 0 ? (
                <p className="rounded-lg bg-surface/45 px-2 py-2 text-[10px] text-ink/40">暂无角色候选。请先完成剧本拆分。</p>
              ) : characterCandidates.map((character) => {
                const exists = scriptCandidateCharacterKeys(character).some((key) => existingCharacterKeys.has(key));
                const prompt = buildCharacterCandidatePrompt(character);
                return (
                  <div key={character.id} className="rounded-xl border border-line/45 bg-surface/25 p-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-ink/75">{character.name}</p>
                        <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white px-2 py-1.5 text-[9px] leading-relaxed text-ink/55 nx9-scroll">{prompt || '暂无 Prompt'}</pre>
                      </div>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] ${exists ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>{exists ? '已入库' : '新候选'}</span>
                    </div>
                    <div className="mt-2 flex gap-1">
                      <button type="button" onClick={() => void copyTextWithLog(prompt, appendLog)} className="rounded border border-line bg-white px-2 py-1 text-[9px] text-ink/55">复制 Prompt</button>
                      <button type="button" onClick={() => adoptCharacterCandidate(character)} className="rounded bg-brand/10 px-2 py-1 text-[9px] font-medium text-brand">{exists ? '更新角色' : '写入角色库'}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
          <details className="rounded-xl border border-line/45 bg-white p-2.5" open>
            <summary className="cursor-pointer select-none text-[12px] font-semibold text-ink/75">场景候选 · {sceneCandidates.length}</summary>
            <div className="mt-2 space-y-2">
              {sceneCandidates.length === 0 ? (
                <p className="rounded-lg bg-surface/45 px-2 py-2 text-[10px] text-ink/40">暂无场景候选。请先完成剧本拆分。</p>
              ) : sceneCandidates.map((scene) => {
                const exists = [scene.name.trim(), scene.sceneCode ?? ''].some((key) => key && existingSceneKeys.has(key));
                const prompt = buildSceneCandidatePrompt(scene);
                return (
                  <div key={scene.id} className="rounded-xl border border-line/45 bg-surface/25 p-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-ink/75">{scene.name}</p>
                        <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white px-2 py-1.5 text-[9px] leading-relaxed text-ink/55 nx9-scroll">{prompt || '暂无 Prompt'}</pre>
                      </div>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] ${exists ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>{exists ? '已入库' : '新候选'}</span>
                    </div>
                    <div className="mt-2 flex gap-1">
                      <button type="button" onClick={() => void copyTextWithLog(prompt, appendLog)} className="rounded border border-line bg-white px-2 py-1 text-[9px] text-ink/55">复制 Prompt</button>
                      <button type="button" onClick={() => adoptSceneCandidate(scene)} className="rounded bg-brand/10 px-2 py-1 text-[9px] font-medium text-brand">{exists ? '更新场景' : '写入场景库'}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      </div>
    )}
    </div>
  );
}

export default memo(DialogueSheetBlock);
