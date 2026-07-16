import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CharacterProfile,
  createScriptBreakdownExportEnvelope,
  createScriptBreakdownPromptPack,
  DEFAULT_SCRIPT_BREAKDOWN_CONFIG,
  DEFAULT_SCRIPT_BREAKDOWN_PROMPTS,
  type EnvironmentProfile,
  flattenScriptBreakdownShots,
  normalizeScriptBreakdownConfig,
  normalizeScriptBreakdownPrompts,
  parseScriptBreakdownExportEnvelope,
  parseScriptBreakdownPromptPack,
  type ScriptBreakdownConfig,
  type ScriptBreakdownPayload,
  type ScriptBreakdownPromptTemplates,
} from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import { useDeckUi } from '../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { useActivityLog } from '../../../../../stores/activity-log';
import {
  applyScriptBreakdownPayload,
  environmentsFromBreakdown,
  profilesFromBreakdown,
  runProductionScriptBreakdown,
} from '../../../../script-breakdown-runner';
import {
  buildCharacterCandidatePrompt,
  buildSceneCandidatePrompt,
  copyTextWithLog,
  sceneCandidateToWorkspaceItem,
  scriptCandidateCharacterKeys,
} from '../../../../script-asset-candidates';

type Tab = 'source' | 'params' | 'prompts' | 'result';

export interface ScriptBreakdownWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

function downloadJson(fileName: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function readJson(file: File): Promise<unknown> {
  return JSON.parse(await file.text()) as unknown;
}

function NumberField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[9px] text-ink/45">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-line/50 bg-white px-2 py-1.5 text-[10px]"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[9px] text-ink/45">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-line/50 bg-white px-2 py-1.5 text-[10px]">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export const DIRECTOR_CONTROL_GROUPS: Array<{
  title: string;
  fields: Array<{ key: keyof ScriptBreakdownConfig['directorControls']; label: string; options: string[] }>;
}> = [
  {
    title: '故事与情绪',
    fields: [
      { key: 'storyGenres', label: '剧情类型', options: ['爱情', '都市', '悬疑', '推理', '惊悚', '恐怖', '科幻', '奇幻', '玄幻', '武侠', '历史', '战争', '冒险', '校园', '职场', '喜剧', '治愈', '成长', '末日', '赛博朋克'] },
      { key: 'narrativeStyles', label: '叙事风格', options: ['快节奏爽文', '慢节奏治愈', '电影叙事', '碎片化叙事', '多线叙事', '第一人称沉浸', '第三人称旁观', '悬念推进', '情绪驱动', '哲学思考', '黑色幽默'] },
      { key: 'emotionalTones', label: '情绪基调', options: ['温暖', '悲伤', '压抑', '紧张', '恐惧', '浪漫', '热血', '孤独', '怀旧', '梦幻', '治愈', '震撼'] },
    ],
  },
  {
    title: '视觉风格',
    fields: [
      { key: 'imageStyles', label: '图片风格', options: ['写实摄影', '电影概念设计', '国漫', '日漫', '欧美漫画', '厚涂插画', '水彩', '油画', '赛璐璐', '3D动画', '黏土风', '像素风', 'Q版', '手绘线稿'] },
      { key: 'videoStyles', label: '视频风格', options: ['电影级真人短片', '动画电影', '日式动画', '国漫动态漫画', '游戏CG', 'MV风格', '纪录片', 'vlog', '定格动画', '3D动画', '低多边形动画'] },
      { key: 'lightingStyles', label: '光影风格', options: ['电影柔光', '逆光', '轮廓光', '黄金时刻', '月光', '霓虹光', '烛光', '火光', '阴影强烈', '高对比度', '柔和漫射光', '丁达尔光', '体积光', '黑暗哥特光'] },
      { key: 'colorStyles', label: '色彩风格', options: ['暖黄色调', '冷蓝色调', '低饱和', '高饱和', '黑金色', '青橙电影色', '复古胶片', '莫兰迪色', '粉彩色', '暗黑色调', '梦幻渐变', '单色调'] },
      { key: 'cinematographyStyles', label: '摄影风格', options: ['好莱坞电影摄影', '日系电影摄影', '王家卫风格', '诺兰式宏大叙事', '纪录片摄影', '手持摄影', '稳定器摄影', '航拍摄影', '微距摄影', '长镜头'] },
    ],
  },
  {
    title: '镜头语言',
    fields: [
      { key: 'shotSizes', label: '景别', options: ['大远景', '全景', '中景', '半身', '特写', '极近特写'] },
      { key: 'cameraMoves', label: '运镜', options: ['推镜头', '拉镜头', '横移', '环绕', '跟拍', '摇镜', '升降镜头', '第一视角'] },
      { key: 'shotFeelings', label: '镜头感觉', options: ['震撼', '亲密', '压迫', '孤独', '神秘'] },
    ],
  },
  {
    title: '世界观设定',
    fields: [
      { key: 'eraBackgrounds', label: '时代背景', options: ['远古时代', '神话时代', '先秦', '汉朝', '唐朝', '宋朝', '明朝', '清朝', '民国', '近现代', '现代都市', '近未来', '未来世界', '太空时代', '赛博朋克时代', '末日废土', '架空世界'] },
      { key: 'sceneEnvironments', label: '场景环境', options: ['城市街道', '商业街区', '居民社区', '办公大楼', '校园', '医院', '咖啡馆', '小巷', '森林', '草原', '雪山', '沙漠', '海洋', '岛屿', '古代宫殿', '寺庙', '道观', '村庄', '地下遗迹', '实验室', '太空站', '外星星球', '废墟城市'] },
      { key: 'architectureStyles', label: '建筑风格', options: ['东方古建筑', '江南水乡建筑', '宫廷建筑', '寺庙建筑', '欧式城堡', '中世纪建筑', '现代摩天楼', '工业建筑', '赛博朋克城市', '未来科技建筑', '太空基地', '废土建筑', '地下城市'] },
      { key: 'costumeStyles', label: '服装风格', options: ['古装', '汉服', '唐装', '宋制服饰', '明制服饰', '清朝服饰', '民国服装', '现代休闲装', '商务制服', '校园制服', '街头潮流', '运动服', '未来科技服', '科幻装甲', '贵族礼服', '奇幻冒险装备'] },
    ],
  },
  {
    title: '声音与生成控制',
    fields: [
      { key: 'musicStyles', label: '音乐风格', options: ['钢琴治愈', '史诗交响', '悬疑电子', '古风音乐', '轻快爵士', '悲伤弦乐', '未来电子', '黑暗氛围音乐', '战争交响', '奇幻冒险音乐'] },
      { key: 'soundEffectStyles', label: '音效风格', options: ['自然环境声', '城市环境声', '战斗声', '风声', '雨声', '雷声', '海浪声', '森林虫鸣', '脚步声', '心跳声', '机械声', '武器碰撞声', '魔法音效', '科技音效'] },
      { key: 'imageQualities', label: '画面质量', options: ['高清', '4K', '8K', '超高清', '超细节', '电影级画质', '真实纹理', '细腻光影'] },
      { key: 'characterPerformances', label: '角色表现', options: ['真人比例', '写实比例', '漫画比例', 'Q版比例', '少年漫画风', '青年漫画风', '成人漫画风', '动物拟人', '人类拟兽', '机械生命体'] },
      { key: 'actionIntensities', label: '动作强度', options: ['静态展示', '微动作', '日常动作', '情绪动作', '剧情动作', '激烈动作', '战斗动作', '大规模动作场面'] },
      { key: 'continuityRequirements', label: '连贯性要求', options: ['角色一致', '脸部一致', '发型一致', '服装一致', '场景一致', '建筑一致', '时间连续', '季节连续', '天气连续', '光线连续', '色彩连续'] },
      { key: 'targetPlatforms', label: '目标平台适配', options: ['抖音竖屏9:16', '小红书3:4', '小红书竖屏9:16', 'B站横屏16:9', 'YouTube Shorts 9:16', '影视短片16:9', 'AI漫剧平台标准比例'] },
    ],
  },
];

export function ChipMultiSelect({ label, value, options, onChange, disabled = false }: {
  label: string;
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const selected = new Set(value);
  return (
    <div className={`space-y-1 ${disabled ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium text-ink/60">{label}</span>
        {!disabled && value.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-[9px] text-ink/40 hover:text-brand">清空</button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              onChange(selected.has(option) ? value.filter((item) => item !== option) : [...value, option]);
            }}
            className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${selected.has(option) ? 'border-brand/40 bg-brand/10 font-medium text-brand' : 'border-line/50 bg-white text-ink/60 hover:border-brand/25 hover:text-ink'} ${disabled ? 'cursor-default' : ''}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 生产级剧本入口：两阶段拆分、参数控制、提示词与结果导入导出。 */
export function ScriptBreakdownWorkspace({ blockId, kind, onCollapse }: ScriptBreakdownWorkspaceProps) {
  const data = useAttachedNodeData(blockId);
  const runtime = useFlowRuntime((state) => state.runtime);
  const activeEpisodeId = useWorkspaceDocument((state) => state.storyboard.activeEpisodeId);
  const setActiveEpisodeId = useWorkspaceDocument((state) => state.setActiveEpisodeId);
  const characterLibrary = useWorkspaceDocument((state) => state.characters.characters);
  const environmentLibrary = useWorkspaceDocument((state) => state.environments);
  const workspaceScenes = useWorkspaceDocument((state) => state.backlotWorkspace.items);
  const upsertCharacter = useWorkspaceDocument((state) => state.upsertCharacter);
  const setEnvironments = useWorkspaceDocument((state) => state.setEnvironments);
  const upsertBacklotWorkspace = useWorkspaceDocument((state) => state.upsertBacklotWorkspace);
  const collapsePromptBar = useDeckUi((state) => state.collapsePromptBar);
  const appendLog = useActivityLog((state) => state.append);
  const [tab, setTab] = useState<Tab>('source');
  const [sourceText, setSourceText] = useState((data.sourceText as string | undefined) ?? '');
  const [config, setConfig] = useState<ScriptBreakdownConfig>(() => normalizeScriptBreakdownConfig(
    data.scriptBreakdownConfig as Partial<ScriptBreakdownConfig> | undefined,
  ));
  const [prompts, setPrompts] = useState<ScriptBreakdownPromptTemplates>(() => normalizeScriptBreakdownPrompts(
    data.scriptBreakdownPrompts as Partial<ScriptBreakdownPromptTemplates> | undefined,
  ));
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const resultInputRef = useRef<HTMLInputElement>(null);
  const status = (data.status as string | undefined) ?? 'idle';
  const breakdown = data.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const progress = data.breakdownProgress as string | undefined;
  const shotCount = useMemo(() => flattenScriptBreakdownShots(breakdown).length, [breakdown]);
  const sceneCount = useMemo(() => breakdown?.episodes.reduce(
    (sum, episode) => sum + (episode.scenes?.length ?? new Set(episode.shots.map((shot) => shot.sceneId)).size), 0,
  ) ?? 0, [breakdown]);
  const environmentProfiles = useMemo(
    () => environmentLibrary?.environments ?? [],
    [environmentLibrary],
  );
  const characterCandidates = useMemo(
    () => breakdown ? profilesFromBreakdown(breakdown, characterLibrary) : [],
    [breakdown, characterLibrary],
  );
  const sceneCandidates = useMemo(
    () => breakdown ? environmentsFromBreakdown(breakdown, environmentProfiles) : [],
    [breakdown, environmentProfiles],
  );
  const existingCharacterKeys = useMemo(
    () => new Set(characterLibrary.flatMap(scriptCandidateCharacterKeys)),
    [characterLibrary],
  );
  const existingSceneKeys = useMemo(
    () => new Set([
      ...environmentProfiles.flatMap((scene) => [scene.name.trim(), scene.sceneCode ?? '']),
      ...workspaceScenes.filter((item) => item.kind === 'scene').map((item) => item.label.trim()),
    ].filter(Boolean)),
    [environmentProfiles, workspaceScenes],
  );

  useEffect(() => setSourceText((data.sourceText as string | undefined) ?? ''), [blockId, data.sourceText]);
  useEffect(() => setConfig(normalizeScriptBreakdownConfig(
    data.scriptBreakdownConfig as Partial<ScriptBreakdownConfig> | undefined,
  )), [blockId, data.scriptBreakdownConfig]);
  useEffect(() => setPrompts(normalizeScriptBreakdownPrompts(
    data.scriptBreakdownPrompts as Partial<ScriptBreakdownPromptTemplates> | undefined,
  )), [blockId, data.scriptBreakdownPrompts]);

  const patchConfig = useCallback((patch: Partial<ScriptBreakdownConfig>) => {
    setConfig((current) => {
      const next = normalizeScriptBreakdownConfig({ ...current, ...patch });
      runtime?.updateNodeData(blockId, { scriptBreakdownConfig: next });
      return next;
    });
  }, [blockId, runtime]);

  const patchPrompts = useCallback((patch: Partial<ScriptBreakdownPromptTemplates>) => {
    setPrompts((current) => {
      const next = { ...current, ...patch };
      runtime?.updateNodeData(blockId, { scriptBreakdownPrompts: next });
      return next;
    });
  }, [blockId, runtime]);

  const patchDirectorControls = useCallback((patch: Partial<ScriptBreakdownConfig['directorControls']>) => {
    patchConfig({ directorControls: { ...config.directorControls, ...patch } });
  }, [config.directorControls, patchConfig]);

  const run = useCallback(async () => {
    const source = sourceText.trim();
    if (!source) return;
    runtime?.updateNodeData(blockId, { sourceText: source, scriptBreakdownConfig: config, scriptBreakdownPrompts: prompts });
    try {
      await runProductionScriptBreakdown({ blockId, sourceText: source, config, prompts });
      setTab('result');
    } catch { /* runner 已写错误状态 */ }
  }, [blockId, config, prompts, runtime, sourceText]);

  const importSource = useCallback(async (file: File) => {
    const text = await file.text();
    setSourceText(text);
    runtime?.updateNodeData(blockId, { sourceText: text });
    appendLog(`已导入剧本原文 · ${file.name}`);
  }, [appendLog, blockId, runtime]);

  const importPromptPack = useCallback(async (file: File) => {
    const pack = parseScriptBreakdownPromptPack(await readJson(file));
    if (!pack) throw new Error('不是有效的 NX9 剧本拆分提示词包');
    setConfig(pack.config);
    setPrompts(pack.prompts);
    runtime?.updateNodeData(blockId, { scriptBreakdownConfig: pack.config, scriptBreakdownPrompts: pack.prompts });
    setTab('prompts');
    appendLog(`已导入拆分提示词 · ${file.name}`);
  }, [appendLog, blockId, runtime]);

  const importResult = useCallback(async (file: File) => {
    const payload = parseScriptBreakdownExportEnvelope(await readJson(file));
    if (!payload) throw new Error('不是有效的 NX9 拆分结果');
    applyScriptBreakdownPayload(blockId, payload);
    setSourceText(payload.sourceText);
    if (payload.config) setConfig(normalizeScriptBreakdownConfig(payload.config));
    setTab('result');
    appendLog(`已导入拆分结果 · ${payload.episodes.length} 集`);
  }, [appendLog, blockId]);

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

  const adoptAllCandidates = useCallback(() => {
    for (const character of characterCandidates) upsertCharacter(character);
    const current = useWorkspaceDocument.getState().environments?.environments ?? [];
    const merged = new Map(current.map((item) => [item.id, item]));
    for (const scene of sceneCandidates) {
      merged.set(scene.id, scene);
      const existing = useWorkspaceDocument.getState().backlotWorkspace.items
        .find((item) => item.kind === 'scene' && (item.id === `scene-${scene.id}` || item.label === scene.name));
      upsertBacklotWorkspace(sceneCandidateToWorkspaceItem(scene, existing));
    }
    setEnvironments({ version: 1, environments: [...merged.values()] });
    appendLog(`已批量写入设定候选 · 角色 ${characterCandidates.length} / 场景 ${sceneCandidates.length}`);
  }, [appendLog, characterCandidates, sceneCandidates, setEnvironments, upsertBacklotWorkspace, upsertCharacter]);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'source', label: '原文' }, { id: 'params', label: '生产参数' }, { id: 'prompts', label: '提示词' }, { id: 'result', label: '拆分结果' },
  ];

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={handleCollapse}
      onRun={() => void run()}
      running={status === 'running'}
      runLabel={breakdown ? '按当前参数重新拆分' : '开始生产级拆分'}
      runDisabled={!sourceText.trim() || status === 'running'}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      heightClass="h-[min(600px,68vh)] max-h-[640px]"
      bodyClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
      topSlot={
        <>
          <div className="flex items-center gap-1 border-b border-line/25 px-3 py-1.5">
            {tabs.map((item) => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`rounded-md px-2 py-1 text-[9px] ${tab === item.id ? 'bg-brand text-white' : 'text-ink/45 hover:bg-surface'}`}>{item.label}</button>
            ))}
            <span className="ml-auto text-[9px] text-ink/35">两阶段 · 分集→场景→镜头</span>
          </div>
          <div className="flex flex-wrap items-center gap-1 border-b border-line/20 px-3 py-1.5">
            <button type="button" onClick={() => sourceInputRef.current?.click()} className="rounded border border-line px-2 py-1 text-[8px] text-ink/55">导入原文</button>
            <button type="button" onClick={() => promptInputRef.current?.click()} className="rounded border border-line px-2 py-1 text-[8px] text-ink/55">导入提示词</button>
            <button type="button" onClick={() => downloadJson('nx9-script-breakdown-prompts.json', createScriptBreakdownPromptPack(config, prompts))} className="rounded border border-line px-2 py-1 text-[8px] text-ink/55">导出提示词</button>
            <button type="button" onClick={() => resultInputRef.current?.click()} className="rounded border border-line px-2 py-1 text-[8px] text-ink/55">导入拆分结果</button>
            <button type="button" disabled={!breakdown} onClick={() => breakdown && downloadJson(`${breakdown.title || 'script-breakdown'}.json`, createScriptBreakdownExportEnvelope(breakdown))} className="rounded border border-line px-2 py-1 text-[8px] text-ink/55 disabled:opacity-35">导出拆分结果</button>
            <input ref={sourceInputRef} type="file" accept=".txt,.md,.fountain,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSource(file).catch((error) => appendLog(String(error))); event.target.value = ''; }} />
            <input ref={promptInputRef} type="file" accept=".json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importPromptPack(file).catch((error) => appendLog(String(error))); event.target.value = ''; }} />
            <input ref={resultInputRef} type="file" accept=".json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importResult(file).catch((error) => appendLog(String(error))); event.target.value = ''; }} />
          </div>
        </>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 nx9-scroll">
        {progress && <div className="mb-2 rounded-lg bg-brand/5 px-2 py-1.5 text-[9px] text-brand">{progress}</div>}
        {tab === 'source' && (
          <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} onBlur={() => runtime?.updateNodeData(blockId, { sourceText })} placeholder="粘贴小说、文章、剧本或大纲。支持识别原文中的“第 X 集”，也可在生产参数中指定集数。" className="h-full min-h-72 w-full resize-none border-0 bg-transparent text-[12px] leading-relaxed text-ink/80 placeholder:text-ink/30 focus:outline-none" />
        )}
        {tab === 'params' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <SelectField label="原文类型" value={config.sourceType} onChange={(value) => patchConfig({ sourceType: value as ScriptBreakdownConfig['sourceType'] })} options={[{ value: 'auto', label: '自动识别' }, { value: 'novel', label: '小说' }, { value: 'screenplay', label: '剧本' }, { value: 'outline', label: '大纲' }]} />
              <SelectField label="分集方式" value={config.episodeMode} onChange={(value) => patchConfig({ episodeMode: value as ScriptBreakdownConfig['episodeMode'] })} options={[{ value: 'auto', label: '自动/尊重原分集' }, { value: 'fixed', label: '固定集数' }]} />
              <NumberField label="固定集数" value={config.episodeCount} min={1} max={50} onChange={(value) => patchConfig({ episodeCount: value })} />
              <NumberField label="单集目标时长（秒）" value={config.targetEpisodeDurationSec} min={15} max={1800} onChange={(value) => patchConfig({ targetEpisodeDurationSec: value })} />
              <NumberField label="最短镜头（秒）" value={config.minShotDurationSec} min={1} max={15} onChange={(value) => patchConfig({ minShotDurationSec: value })} />
              <NumberField label="最长镜头（秒）" value={config.maxShotDurationSec} min={1} max={30} onChange={(value) => patchConfig({ maxShotDurationSec: value })} />
              <NumberField label="单集最多镜头" value={config.maxShotsPerEpisode} min={3} max={100} onChange={(value) => patchConfig({ maxShotsPerEpisode: value })} />
              <SelectField label="节奏" value={config.pacing} onChange={(value) => patchConfig({ pacing: value as ScriptBreakdownConfig['pacing'] })} options={[{ value: 'slow', label: '舒缓' }, { value: 'balanced', label: '均衡' }, { value: 'fast', label: '快速' }]} />
              <SelectField label="改编忠实度" value={config.adaptationFidelity} onChange={(value) => patchConfig({ adaptationFidelity: value as ScriptBreakdownConfig['adaptationFidelity'] })} options={[{ value: 'strict', label: '严格忠于原文' }, { value: 'balanced', label: '平衡改编' }, { value: 'creative', label: '自由改编' }]} />
              <SelectField label="对白密度" value={config.dialogueDensity} onChange={(value) => patchConfig({ dialogueDensity: value as ScriptBreakdownConfig['dialogueDensity'] })} options={[{ value: 'low', label: '少对白' }, { value: 'medium', label: '中等' }, { value: 'high', label: '对白驱动' }]} />
              <SelectField label="目标形态" value={config.targetFormat} onChange={(value) => patchConfig({ targetFormat: value as ScriptBreakdownConfig['targetFormat'] })} options={[{ value: 'comic', label: 'AI 漫剧' }, { value: 'live-action', label: '真人短剧' }, { value: 'anime', label: '动漫' }]} />
              <SelectField label="画幅" value={config.aspectRatio} onChange={(value) => patchConfig({ aspectRatio: value as ScriptBreakdownConfig['aspectRatio'] })} options={[{ value: '16:9', label: '16:9 横屏' }, { value: '9:16', label: '9:16 竖屏' }, { value: '1:1', label: '1:1 方形' }]} />
              <SelectField label="Prompt 语言" value={config.promptLanguage} onChange={(value) => patchConfig({ promptLanguage: value as ScriptBreakdownConfig['promptLanguage'] })} options={[{ value: 'bilingual', label: '中英双语' }, { value: 'zh', label: '中文' }, { value: 'en', label: '英文' }]} />
              <SelectField label="连续性" value={config.continuityLevel} onChange={(value) => patchConfig({ continuityLevel: value as ScriptBreakdownConfig['continuityLevel'] })} options={[{ value: 'strict', label: '严格连续' }, { value: 'normal', label: '普通' }]} />
              <label className="flex items-end gap-2 pb-1.5 text-[9px] text-ink/55" title="关闭后，AI 调用失败会直接报错，避免把按标点切分的规则结果误当成专业拆分。">
                <input type="checkbox" checked={config.allowRuleFallback} onChange={(event) => patchConfig({ allowRuleFallback: event.target.checked })} />
                AI 失败时允许规则保底（测试用）
              </label>
            </div>
            <label className="block space-y-1"><span className="text-[9px] text-ink/45">统一视觉风格</span><textarea rows={3} value={config.visualStyle} onChange={(event) => patchConfig({ visualStyle: event.target.value })} className="w-full resize-none rounded-lg border border-line/50 px-2 py-1.5 text-[10px]" /></label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium text-ink/65">导演控制项</p>
                <button
                  type="button"
                  onClick={() => patchConfig({ directorControls: DEFAULT_SCRIPT_BREAKDOWN_CONFIG.directorControls })}
                  className="rounded border border-line px-2 py-1 text-[8px] text-ink/45"
                >
                  全部自动匹配
                </button>
              </div>
              {DIRECTOR_CONTROL_GROUPS.map((group) => (
                <details key={group.title} className="rounded-xl border border-line/40 bg-white/70 p-2" open={group.title === '故事与情绪'}>
                  <summary className="cursor-pointer text-[10px] font-medium text-ink/65">{group.title}</summary>
                  <div className="mt-2 space-y-2">
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
        {tab === 'prompts' && (
          <div className="space-y-3">
            <label className="block space-y-1"><span className="text-[10px] font-medium text-ink/65">阶段一：分集规划 System Prompt</span><textarea rows={8} value={prompts.episodePlannerSystem} onChange={(event) => patchPrompts({ episodePlannerSystem: event.target.value })} className="w-full resize-y rounded-lg border border-line/50 px-2 py-1.5 font-mono text-[9px] leading-relaxed" /></label>
            <label className="block space-y-1"><span className="text-[10px] font-medium text-ink/65">阶段二：场景与镜头拆分 System Prompt</span><textarea rows={12} value={prompts.episodeBreakdownSystem} onChange={(event) => patchPrompts({ episodeBreakdownSystem: event.target.value })} className="w-full resize-y rounded-lg border border-line/50 px-2 py-1.5 font-mono text-[9px] leading-relaxed" /></label>
            <button type="button" onClick={() => { setPrompts(DEFAULT_SCRIPT_BREAKDOWN_PROMPTS); runtime?.updateNodeData(blockId, { scriptBreakdownPrompts: DEFAULT_SCRIPT_BREAKDOWN_PROMPTS }); }} className="rounded border border-line px-2 py-1 text-[9px] text-ink/50">恢复默认提示词</button>
          </div>
        )}
        {tab === 'result' && (
          breakdown ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-surface p-2"><p className="text-sm font-medium">{breakdown.episodes.length}</p><p className="text-[8px] text-ink/35">分集</p></div><div className="rounded-lg bg-surface p-2"><p className="text-sm font-medium">{sceneCount}</p><p className="text-[8px] text-ink/35">场景</p></div><div className="rounded-lg bg-surface p-2"><p className="text-sm font-medium">{shotCount}</p><p className="text-[8px] text-ink/35">镜头</p></div></div>
              {breakdown.storyAnalysis && (
                <div className="rounded-lg border border-line/40 bg-white p-2">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-medium text-ink/70">故事整体分析</p>
                    <span className="ml-auto text-[8px] text-ink/35">{breakdown.storyAnalysis.genre || '类型待定'}</span>
                  </div>
                  <p className="mt-1 text-[9px] leading-relaxed text-ink/55">
                    {[breakdown.storyAnalysis.coreTheme, breakdown.storyAnalysis.visualStyle].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-1 text-[8px] leading-relaxed text-ink/40">
                    {[breakdown.storyAnalysis.background?.era, breakdown.storyAnalysis.background?.location, breakdown.storyAnalysis.background?.worldview].filter(Boolean).join(' / ')}
                  </p>
                </div>
              )}
              {(characterCandidates.length > 0 || sceneCandidates.length > 0) && (
                <div className="rounded-lg border border-brand/20 bg-brand/[0.03] p-2">
                  <div className="mb-2 flex items-center gap-2">
                    <div>
                      <p className="text-[10px] font-medium text-ink/75">设定候选 · 给角色设定 / 场景设定使用</p>
                      <p className="text-[8px] text-ink/40">拆分后生成可复制、一键入库的生产设定；图片仍由图像生成节点处理。</p>
                    </div>
                    <button
                      type="button"
                      onClick={adoptAllCandidates}
                      className="ml-auto rounded-lg bg-brand px-2 py-1 text-[9px] font-medium text-white"
                    >
                      全部写入设定库
                    </button>
                  </div>
                  {characterCandidates.length > 0 && (
                    <details className="rounded-lg border border-line/40 bg-white p-2" open>
                      <summary className="cursor-pointer text-[10px] font-medium text-ink/70">
                        角色候选 · {characterCandidates.length}
                      </summary>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {characterCandidates.map((character) => {
                          const exists = scriptCandidateCharacterKeys(character).some((key) => existingCharacterKeys.has(key));
                          const prompt = buildCharacterCandidatePrompt(character);
                          return (
                            <div key={character.id} className="rounded-lg border border-line/45 bg-surface/35 p-2">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[10px] font-semibold text-ink/75">{character.name}</p>
                                  <p className="mt-0.5 line-clamp-2 text-[8px] text-ink/45">
                                    {[character.bible?.identity, character.bible?.appearance, character.consistencyPrompt].filter(Boolean).join(' · ')}
                                  </p>
                                </div>
                                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] ${exists ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
                                  {exists ? '已入库' : '新候选'}
                                </span>
                              </div>
                              <div className="mt-1.5 flex gap-1">
                                <button type="button" onClick={() => void copyTextWithLog(prompt, appendLog, '已复制设定 Prompt')} className="rounded border border-line bg-white px-2 py-1 text-[8px] text-ink/55">复制 Prompt</button>
                                <button type="button" onClick={() => adoptCharacterCandidate(character)} className="rounded bg-brand/10 px-2 py-1 text-[8px] font-medium text-brand">{exists ? '更新角色' : '写入角色库'}</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                  {sceneCandidates.length > 0 && (
                    <details className="mt-2 rounded-lg border border-line/40 bg-white p-2" open>
                      <summary className="cursor-pointer text-[10px] font-medium text-ink/70">
                        场景候选 · {sceneCandidates.length}
                      </summary>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {sceneCandidates.map((scene) => {
                          const exists = [scene.name.trim(), scene.sceneCode ?? ''].some((key) => key && existingSceneKeys.has(key));
                          const prompt = buildSceneCandidatePrompt(scene);
                          return (
                            <div key={scene.id} className="rounded-lg border border-line/45 bg-surface/35 p-2">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[10px] font-semibold text-ink/75">{scene.name}</p>
                                  <p className="mt-0.5 line-clamp-2 text-[8px] text-ink/45">
                                    {[scene.sceneCode, scene.descriptionZh, scene.lighting].filter(Boolean).join(' · ')}
                                  </p>
                                </div>
                                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] ${exists ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
                                  {exists ? '已入库' : '新候选'}
                                </span>
                              </div>
                              <div className="mt-1.5 flex gap-1">
                                <button type="button" onClick={() => void copyTextWithLog(prompt, appendLog, '已复制设定 Prompt')} className="rounded border border-line bg-white px-2 py-1 text-[8px] text-ink/55">复制 Prompt</button>
                                <button type="button" onClick={() => adoptSceneCandidate(scene)} className="rounded bg-brand/10 px-2 py-1 text-[8px] font-medium text-brand">{exists ? '更新场景' : '写入场景库'}</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>
              )}
              {(breakdown.characters?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-line/40 bg-white p-2">
                  <p className="text-[10px] font-medium text-ink/70">主要人物设定 · {breakdown.characters!.length}</p>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {breakdown.characters!.slice(0, 6).map((character) => (
                      <div key={character.name} className="rounded-md bg-surface/60 px-2 py-1.5">
                        <p className="text-[9px] font-medium text-ink/70 truncate">{character.name}</p>
                        <p className="mt-0.5 text-[8px] text-ink/45 line-clamp-2">{[character.identity, character.personality, character.fixedVisualKeywords].filter(Boolean).join(' · ')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(breakdown.acts?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-line/40 bg-white p-2">
                  <p className="text-[10px] font-medium text-ink/70">剧情章节 / 幕结构 · {breakdown.acts!.length}</p>
                  <div className="mt-1 space-y-1">
                    {breakdown.acts!.slice(0, 5).map((act) => (
                      <div key={`${act.name}-${act.title ?? ''}`} className="rounded-md bg-surface/60 px-2 py-1.5">
                        <p className="text-[9px] font-medium text-ink/70">{act.name}{act.title ? ` · ${act.title}` : ''}</p>
                        <p className="mt-0.5 text-[8px] text-ink/45 line-clamp-2">{[act.storyGoal, act.conflict, act.emotionalShift].filter(Boolean).join(' · ')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(breakdown.diagnostics?.length ?? 0) > 0 && <div className="rounded-lg border border-warn/20 bg-warn/5 p-2 text-[9px] text-warn">{breakdown.diagnostics!.map((item) => <p key={`${item.code}-${item.episodeId ?? ''}`}>{item.message}</p>)}</div>}
              {breakdown.episodes.map((episode) => (
                <div key={episode.id} className="rounded-lg border border-line/40 bg-white p-2">
                  <div className="flex items-center gap-2"><p className="font-medium text-[10px] text-ink/70">{episode.title}</p><span className="ml-auto text-[8px] text-ink/35">{episode.scenes?.length ?? 0} 场 · {episode.shots.length} 镜 · {episode.shots.reduce((sum, shot) => sum + shot.durationSec, 0)}s</span></div>
                  {episode.logline && <p className="mt-1 text-[8px] text-ink/40">{episode.logline}</p>}
                </div>
              ))}
              <select value={activeEpisodeId ?? breakdown.episodes[0]?.id ?? ''} onChange={(event) => setActiveEpisodeId(event.target.value || null)} className="w-full rounded-lg border border-line/50 bg-white px-2 py-1.5 text-[10px]" aria-label="当前制作分集">{breakdown.episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.title} · {episode.shots.length} 镜</option>)}</select>
            </div>
          ) : <p className="py-10 text-center text-[10px] text-ink/35">尚未拆分。设置参数后开始生产级拆分，或导入已有拆分结果。</p>
        )}
      </div>
    </ComposerWorkspaceShell>
  );
}
