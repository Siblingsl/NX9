import { Injectable, StreamableFile } from '@nestjs/common';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';
import type {
  StorySkeleton,
  AdaptationStrategy,
  StoryboardTableRow,
  ScriptPlanPayload,
  StoryboardShot,
  CharacterProfile,
  SceneSplitRecord,
  ScriptBreakdownConfig,
  ScriptBreakdownPromptTemplates,
  ScriptBreakdownEpisode,
  ScriptBreakdownScene,
  ScriptBreakdownShot,
  ScriptBreakdownDiagnostic,
  ScriptBreakdownStoryAnalysis,
  ScriptBreakdownCharacterProfile,
  ScriptBreakdownAct,
} from '@nx9/shared';
import {
  scenesToStoryboardShots,
  parseChineseScript,
  buildEpisodePlannerUserPrompt,
  buildEpisodeBreakdownUserPrompt,
  buildScriptBreakdownFromText,
  normalizeScriptBreakdownConfig,
  normalizeScriptBreakdownPrompts,
  splitLongEpisodeText,
  splitSourceIntoEpisodeChunks,
  validateScriptBreakdownPayload,
} from '@nx9/shared';

export interface AgentShotScriptRow {
  durationSec: number;
  shotType: string;
  dialogue: string;
  action: string;
}

const SHOT_TYPES = new Set(['ECU', 'CU', 'MS', 'FS', 'WS', 'OTS']);

function clampDuration(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 4;
  return Math.min(30, Math.max(2, n));
}

function normalizeShotType(value: unknown): string {
  const v = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return SHOT_TYPES.has(v) ? v : 'MS';
}

function extractJsonArray(text: string): unknown[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through */
    }
  }
  try {
    const obj = JSON.parse(text);
    if (Array.isArray(obj)) return obj;
    if (Array.isArray(obj.rows)) return obj.rows;
  } catch {
    /* fall through */
  }
  return [];
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* fall through */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch { /* fall through */ }
  }
  return null;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[、,，/｜|]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeDialogue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      speaker: String(row.speaker ?? '').trim(),
      text: String(row.text ?? row.dialogue ?? '').trim(),
      emotion: String(row.emotion ?? '').trim() || undefined,
    };
  }).filter((item) => item.speaker && item.text).slice(0, 8);
}

/** 是否像「景别 CU / 运镜 推」标签清单，而非成段视听叙述 */
function looksLikeAvTagList(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/[。！？]/.test(t) && t.length >= 20) return false;
  const tagHits = (t.match(/(景别|运镜|机位|镜头|声效|旁白|特写|全景|中景|推|拉|摇|移|跟|手持)/g) ?? []).length;
  const sentenceEnds = (t.match(/[。！？]/g) ?? []).length;
  return tagHits >= 2 && sentenceEnds === 0 && t.length < 80;
}

function normalizeAudiovisualLanguage(
  row: Record<string, unknown>,
  fallback: {
    scriptText: string;
    visual?: string;
    action?: string;
    sound?: string;
    shotSize?: string;
    cameraMove?: string;
    cameraAngle?: string;
  },
): string {
  const direct = String(
    row.audiovisualLanguage
    ?? row.audioVisualLanguage
    ?? row.avLanguage
    ?? row['视听语言']
    ?? '',
  ).trim();
  if (direct.length >= 12 && !looksLikeAvTagList(direct)) return direct;

  const subject = (fallback.visual || fallback.action || fallback.scriptText || '这一戏剧瞬间')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  const move = fallback.cameraMove && fallback.cameraMove !== '固定'
    ? `${fallback.cameraMove}镜跟随情境`
    : '镜头贴近情境';
  const sizeHint = fallback.shotSize === 'CU' || fallback.shotSize === 'ECU'
    ? '特写钉住表情与细节'
    : fallback.shotSize === 'WS' || fallback.shotSize === 'FS'
      ? '全景交代空间与关系'
      : '中景稳住人物状态';
  const angle = fallback.cameraAngle ? `，${fallback.cameraAngle}强化压迫或疏离感` : '';
  const sound = fallback.sound ? `声画上，${fallback.sound.replace(/[。！？]+$/, '')}与画面同步加压。` : '光色与材质对比把这一拍的情绪推到前景。';
  return `${move}，${sizeHint}${angle}，交代${subject}。${sound}`;
}

function normalizeStoryAnalysis(plan: Record<string, unknown> | null): ScriptBreakdownStoryAnalysis | undefined {
  const raw = (plan?.storyAnalysis ?? plan?.analysis) as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return undefined;
  const background = (raw.background ?? {}) as Record<string, unknown>;
  return {
    title: String(raw.title ?? plan?.title ?? '').trim() || undefined,
    genre: String(raw.genre ?? raw.type ?? '').trim() || undefined,
    coreTheme: String(raw.coreTheme ?? raw.theme ?? '').trim() || undefined,
    background: {
      era: String(background.era ?? raw.era ?? '').trim() || undefined,
      location: String(background.location ?? raw.location ?? '').trim() || undefined,
      worldview: String(background.worldview ?? raw.worldview ?? '').trim() || undefined,
    },
    visualStyle: String(raw.visualStyle ?? '').trim() || undefined,
  };
}

function normalizePlanCharacters(plan: Record<string, unknown> | null): ScriptBreakdownCharacterProfile[] | undefined {
  const raw = Array.isArray(plan?.characters) ? plan!.characters : [];
  const characters = raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      name: String(row.name ?? row['角色名称'] ?? '').trim(),
      identity: String(row.identity ?? row.role ?? row['身份'] ?? '').trim() || undefined,
      age: String(row.age ?? row['年龄'] ?? '').trim() || undefined,
      appearance: String(row.appearance ?? row.description ?? row['外貌特征'] ?? '').trim() || undefined,
      height: String(row.height ?? row['身高'] ?? '').trim() || undefined,
      bodyType: String(row.bodyType ?? row['体型'] ?? '').trim() || undefined,
      hairstyle: String(row.hairstyle ?? row['发型'] ?? '').trim() || undefined,
      costume: String(row.costume ?? row.clothing ?? row['服装'] ?? '').trim() || undefined,
      signatureElements: String(row.signatureElements ?? row['标志性元素'] ?? '').trim() || undefined,
      personality: String(row.personality ?? row['性格'] ?? '').trim() || undefined,
      relationships: String(row.relationships ?? row['人物关系'] ?? '').trim() || undefined,
      goal: String(row.goal ?? row['人物目标'] ?? '').trim() || undefined,
      currentEmotion: String(row.currentEmotion ?? row['人物当前情绪'] ?? '').trim() || undefined,
      fixedVisualKeywords: String(row.fixedVisualKeywords ?? row.consistencyPrompt ?? row['固定视觉关键词'] ?? '').trim() || undefined,
    };
  }).filter((item) => item.name).slice(0, 40);
  return characters.length ? characters : undefined;
}

function normalizePlanActs(plan: Record<string, unknown> | null): ScriptBreakdownAct[] | undefined {
  const raw = Array.isArray(plan?.acts) ? plan!.acts : [];
  const acts = raw.map((item, index) => {
    const row = item as Record<string, unknown>;
    return {
      name: String(row.name ?? `第 ${index + 1} 幕`).trim(),
      title: String(row.title ?? row['章节标题'] ?? '').trim() || undefined,
      storyGoal: String(row.storyGoal ?? row.goal ?? row['剧情目标'] ?? '').trim() || undefined,
      conflict: String(row.conflict ?? row['冲突'] ?? '').trim() || undefined,
      emotionalShift: String(row.emotionalShift ?? row['情绪变化'] ?? '').trim() || undefined,
      keyEvents: stringArray(row.keyEvents ?? row['关键事件']),
      characterChange: String(row.characterChange ?? row['角色变化'] ?? '').trim() || undefined,
    };
  }).filter((item) => item.name).slice(0, 20);
  return acts.length ? acts : undefined;
}

export function normalizeProductionEpisode(args: {
  raw: Record<string, unknown>;
  episodeIndex: number;
  title: string;
  logline?: string;
  sourceText: string;
  config: ScriptBreakdownConfig;
  sceneOffset?: number;
  shotOffset?: number;
}): { scenes: ScriptBreakdownScene[]; shots: ScriptBreakdownShot[] } {
  const episodeId = `ep-${args.episodeIndex}`;
  const rawScenes = Array.isArray(args.raw.scenes) ? args.raw.scenes : [];
  let globalShotIndex = args.shotOffset ?? 0;
  const scenes: ScriptBreakdownScene[] = [];
  for (let scenePosition = 0; scenePosition < rawScenes.length; scenePosition++) {
    const sceneRow = rawScenes[scenePosition] as Record<string, unknown>;
    const sceneIndex = (args.sceneOffset ?? 0) + scenePosition + 1;
    const sceneId = `${episodeId}-scene-${sceneIndex}`;
    const sceneCode = `${args.episodeIndex}-${sceneIndex}`;
    const rawShots = Array.isArray(sceneRow.shots) ? sceneRow.shots : [];
    const shots = rawShots.map((item) => {
      const row = item as Record<string, unknown>;
      globalShotIndex += 1;
      const dialogue = normalizeDialogue(row.dialogue);
      const durationSec = Math.max(
        args.config.minShotDurationSec,
        Math.min(args.config.maxShotDurationSec, Math.round(Number(row.durationSec) || 3)),
      );
      const scriptText = String(row.scriptText ?? row.action ?? row.descriptionZh ?? row.visual ?? row.title ?? '').trim();
      const characters = stringArray(row.characters ?? row.characterNames);
      for (const line of dialogue) if (!characters.includes(line.speaker)) characters.push(line.speaker);
      const visual = String(row.imagePrompt ?? row.image_prompt ?? '').trim() || `${args.config.visualStyle}，${scriptText}`;
      const motion = String(row.videoPrompt ?? row.video_prompt ?? row.videoDesc ?? '').trim() || `根据关键帧生成 ${durationSec} 秒视频：${scriptText}，动作自然，镜头连续`;
      const sketchPrompt = String(row.sketchPrompt ?? row.sketch_prompt ?? '').trim() || [
        scriptText || visual,
        'black and white storyboard sketch, clean pencil line art, clear silhouettes,',
        'foreground midground background composition guide, camera angle blocking, no color, no shading',
      ].filter(Boolean).join(' ');
      const shotSize = ['ECU', 'CU', 'MS', 'FS', 'WS', 'OTS'].includes(String(row.shotSize).toUpperCase())
        ? String(row.shotSize).toUpperCase() as ScriptBreakdownShot['shotSize']
        : 'MS';
      const cameraMove = ['固定', '推', '拉', '摇', '移', '跟', '手持'].includes(String(row.cameraMove))
        ? String(row.cameraMove) as ScriptBreakdownShot['cameraMove']
        : '固定';
      const cameraAngle = String(row.cameraAngle ?? '').trim() || undefined;
      const visualDesc = String(row.visual ?? '').trim() || undefined;
      const actionDesc = String(row.action ?? '').trim() || undefined;
      const soundDesc = String(row.sound ?? '').trim() || undefined;
      return {
        id: `${episodeId}-shot-${globalShotIndex}`,
        episodeId,
        episodeIndex: args.episodeIndex,
        index: globalShotIndex,
        sceneId,
        sceneCode,
        title: String(row.title ?? scriptText.slice(0, 28) ?? `镜头 ${globalShotIndex}`).trim(),
        purpose: String(row.purpose ?? row.shotPurpose ?? '').trim() || undefined,
        durationSec,
        shotSize,
        cameraMove,
        cameraAngle,
        cameraLens: String(row.cameraLens ?? '').trim() || undefined,
        characters: characters.slice(0, 12),
        scene: String(sceneRow.location ?? sceneRow.title ?? '未指定场景').trim(),
        scriptText,
        visual: visualDesc,
        action: actionDesc,
        dialogue,
        narration: String(row.narration ?? '').trim() || undefined,
        sound: soundDesc,
        audiovisualLanguage: normalizeAudiovisualLanguage(row, {
          scriptText,
          visual: visualDesc,
          action: actionDesc,
          sound: soundDesc,
          shotSize,
          cameraMove,
          cameraAngle,
        }),
        imagePrompt: visual,
        videoPrompt: motion,
        sketchPrompt,
        negativePrompt: String(row.negativePrompt ?? '').trim() || undefined,
        continuityNotes: stringArray(row.continuityNotes),
        referenceImageUrl: null,
        previewImageUrl: null,
        status: 'draft' as const,
      } satisfies ScriptBreakdownShot;
    });
    if (shots.length === 0) continue;
    scenes.push({
      id: sceneId,
      episodeId,
      index: sceneIndex,
      code: sceneCode,
      title: String(sceneRow.title ?? `场景 ${sceneIndex}`).trim(),
      location: String(sceneRow.location ?? sceneRow.title ?? '未指定场景').trim(),
      timeOfDay: String(sceneRow.timeOfDay ?? '未指定').trim(),
      interiorExterior: ['INT', 'EXT', 'INT/EXT'].includes(String(sceneRow.interiorExterior).toUpperCase())
        ? String(sceneRow.interiorExterior).toUpperCase() as ScriptBreakdownScene['interiorExterior']
        : 'INT',
      summary: String(sceneRow.summary ?? '').trim() || undefined,
      shots,
    });
  }
  const shots = scenes.flatMap((scene) => scene.shots).slice(0, args.config.maxShotsPerEpisode);
  const allowed = new Set(shots.map((shot) => shot.id));
  return {
    shots,
    scenes: scenes.map((scene) => ({ ...scene, shots: scene.shots.filter((shot) => allowed.has(shot.id)) }))
      .filter((scene) => scene.shots.length > 0),
  };
}

@Injectable()
export class AgentService {
  constructor(private readonly gateway: GatewayService) {}

  private async llmJsonObject(system: string, user: string, userId?: string) {
    const res = (await this.gateway.proxyLlm({
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }, userId)) as { choices?: { message?: { content?: string } }[] };
    const content = res.choices?.[0]?.message?.content ?? '';
    const parsed = extractJsonObject(content);
    if (!parsed) throw new ServiceUnavailableException('LLM 返回的 JSON 对象无法解析');
    return parsed;
  }

  async dialogueFromText(
    text: string,
    userId?: string,
  ): Promise<{ ok: true; lines: { speaker: string; text: string; emotion?: string }[] }> {
    const source = (text ?? '').trim();
    if (source.length < 20) {
      throw new BadRequestException('请输入至少 20 字的剧本/对白文本');
    }

    const system = [
      '你是剧本对白提取器。将用户提供的剧本/小说文本中所有对白行提取出来，标注说话人。',
      '输出 JSON 数组：[{"speaker":"角色名","text":"对白内容","emotion":" optional情感标签"}]',
      'speaker 和 text 字段必须非空。不包含旁白/叙述。至少提取 3 行。',
      '只输出 JSON，不要 markdown。',
    ].join('\n');

    const res = (await this.gateway.proxyLlm(
      {
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: source },
        ],
      },
      userId,
    )) as { choices?: { message?: { content?: string } }[] };

    const content = res.choices?.[0]?.message?.content ?? '';
    if (!content) throw new ServiceUnavailableException('LLM 未返回内容');

    const start = content.indexOf('[');
    const end = content.lastIndexOf(']');
    let raw: unknown[] = [];
    if (start >= 0 && end > start) {
      try { raw = JSON.parse(content.slice(start, end + 1)); } catch { /* fall */ }
    }
    if (raw.length === 0 && content.includes('"lines"')) {
      try {
        const obj = JSON.parse(content) as { lines?: unknown[] };
        raw = obj.lines ?? [];
      } catch { /* fall */ }
    }
    if (raw.length === 0) throw new ServiceUnavailableException('LLM 返回格式无法解析');

    const lines = raw
      .map((item: unknown) => {
        const r = item as Record<string, unknown>;
        return {
          speaker: String(r.speaker ?? '').trim(),
          text: String(r.text ?? r.dialogue ?? '').trim(),
          emotion: String(r.emotion ?? '').trim() || undefined,
        };
      })
      .filter((l) => l.speaker && l.text);

    if (lines.length === 0) throw new ServiceUnavailableException('LLM 未提取到有效对白');

    return { ok: true, lines: lines.slice(0, 100) };
  }

  async shotScriptFromText(
    text: string,
    userId?: string,
  ): Promise<{ ok: true; rows: AgentShotScriptRow[] }> {
    const source = (text ?? '').trim();
    if (source.length < 20) {
      throw new BadRequestException('请输入至少 20 字的小说/章节文本');
    }

    const system = [
      '你是短剧分镜编剧。将用户提供的小说/章节改写为分镜脚本行。',
      '遵循：保留核心情节与角色关系；将叙述转为可视化画面描写；用对白推动情节；不写镜头语言（景别/运镜由系统决定）。',
      '每行一个镜头，时长优先 2-3 秒，一般不超过 4 秒。',
      '仅输出 JSON 对象：{"rows":[{"action":"画面/动作描述","dialogue":"对白，无则空串","durationSec":数字(2-30),"shotType":"ECU|CU|MS|FS|WS|OTS"}]}。',
      '至少生成 3 行。不要输出任何解释文字。',
    ].join('\n');

    const res = (await this.gateway.proxyLlm(
      {
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: source },
        ],
      },
      userId,
    )) as { choices?: { message?: { content?: string } }[] };

    const content = res.choices?.[0]?.message?.content ?? '';
    if (!content) {
      throw new ServiceUnavailableException('LLM 未返回内容');
    }

    const raw = extractJsonArray(content);
    const rows: AgentShotScriptRow[] = raw
      .map((item) => {
        const r = item as Record<string, unknown>;
        return {
          action: String(r.action ?? r.description ?? '').trim(),
          dialogue: String(r.dialogue ?? '').trim(),
          durationSec: clampDuration(r.durationSec),
          shotType: normalizeShotType(r.shotType),
        };
      })
      .filter((r) => r.action.length > 0)
      .slice(0, 50);

    if (rows.length === 0) {
      throw new ServiceUnavailableException('LLM 返回的分镜无法解析，请重试');
    }

    return { ok: true, rows };
  }

  async scriptSkeleton(
    sourceText: string,
    userId?: string,
  ): Promise<{ ok: true; skeleton: StorySkeleton }> {
    const system = [
      '你是故事结构分析师。分析用户提供的文本，输出 JSON 格式的故事骨架。',
      'JSON 格式: {"title":"故事标题","logline":"一句话梗概","acts":[{"name":"第一幕","beats":["情节点1","情节点2"]}],"episodeCount":数字,"hookPoints":["卡点1","卡点2"]}',
      'episodeCount 根据内容长度推断，短篇≤3，中篇 6-12，长篇 12-24。',
      '每幕 2-5 个节拍。只输出 JSON。',
    ].join('\n');

    const res = (await this.gateway.proxyLlm(
      {
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: sourceText },
        ],
      },
      userId,
    )) as { choices?: { message?: { content?: string } }[] };

    const content = res.choices?.[0]?.message?.content ?? '';
    if (!content) throw new ServiceUnavailableException('LLM 未返回内容');

    try {
      const skeleton = JSON.parse(content) as StorySkeleton;
      if (!skeleton.title || !skeleton.acts) throw new Error('缺少必填字段');
      return { ok: true, skeleton };
    } catch (e) {
      throw new ServiceUnavailableException(`骨架解析失败: ${String(e)}`);
    }
  }

  async storyboardTable(
    sourceText: string,
    userId?: string,
  ): Promise<{ ok: true; table: StoryboardTableRow[] }> {
    const system = [
      '你是分镜表生成器。将用户提供的文本转换为分镜表。',
      '输出 JSON 数组，每行一个镜头。',
      '格式: [{"id":"唯一ID","group":"S01","shotSize":"CU|MS|FS|WS","cameraMove":"推|拉|摇|移|固定","durationSec":2-4,"descriptionZh":"画面描述","dialogue":"对白","sfx":"音效","videoDesc":"视频动态描述","associateAssetIds":[]}]',
      '每个镜头 durationSec 优先 2-3 秒（默认 3），一般不超过 4 秒；单组 ≤12 秒。',
      '至少生成 5 个镜头。只输出 JSON 数组。',
    ].join('\n');

    const res = (await this.gateway.proxyLlm(
      {
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: sourceText },
        ],
      },
      userId,
    )) as { choices?: { message?: { content?: string } }[] };

    const content = res.choices?.[0]?.message?.content ?? '';
    if (!content) throw new ServiceUnavailableException('LLM 未返回内容');

    const raw = extractJsonArray(content);
    const rows: StoryboardTableRow[] = raw
      .map((item, i) => {
        const r = item as Record<string, unknown>;
        return {
          id: String(r.id ?? `row-${i + 1}`),
          group: String(r.group ?? 'S01'),
          shotSize: String(r.shotSize ?? 'MS'),
          cameraMove: String(r.cameraMove ?? '固定'),
          durationSec: clampDuration(r.durationSec),
          descriptionZh: String(r.descriptionZh ?? r.description ?? '').trim(),
          dialogue: String(r.dialogue ?? '').trim(),
          sfx: String(r.sfx ?? '').trim(),
          videoDesc: String(r.videoDesc ?? '').trim(),
          associateAssetIds: Array.isArray(r.associateAssetIds) ? r.associateAssetIds.map(String) : [],
        };
      })
      .filter((r) => r.descriptionZh.length > 0)
      .slice(0, 100);

    if (rows.length === 0) throw new ServiceUnavailableException('LLM 未生成有效分镜表');
    return { ok: true, table: rows };
  }

  /** 生产级两阶段拆分：稳定本地预分集 → AI 分集规划 → 逐集/逐窗口拆场景与镜头。 */
  async productionScriptBreakdown(
    body: {
      sourceText?: string;
      config?: Partial<ScriptBreakdownConfig>;
      prompts?: Partial<ScriptBreakdownPromptTemplates>;
    },
    userId?: string,
  ) {
    const sourceText = String(body.sourceText ?? '').trim();
    if (sourceText.length < 20) throw new BadRequestException('请输入至少 20 字的小说、剧本或大纲');
    const config = normalizeScriptBreakdownConfig(body.config);
    const prompts = normalizeScriptBreakdownPrompts(body.prompts);
    const chunks = splitSourceIntoEpisodeChunks(sourceText, config);
    if (chunks.length === 0) throw new BadRequestException('无法从原文规划分集');
    const diagnostics: ScriptBreakdownDiagnostic[] = [];

    let plan: Record<string, unknown> | null = null;
    try {
      plan = await this.llmJsonObject(
        prompts.episodePlannerSystem,
        buildEpisodePlannerUserPrompt(chunks, config),
        userId,
      );
    } catch (error) {
      if (!config.allowRuleFallback) throw error;
      diagnostics.push({
        level: 'warning',
        code: 'planner_fallback',
        message: `AI 分集规划不可用，保留本地分集边界：${String(error)}`,
      });
    }

    const rawPlans = Array.isArray(plan?.episodes) ? plan!.episodes as Record<string, unknown>[] : [];
    const planByChunk = new Map(rawPlans.map((item) => [String(item.chunkId ?? ''), item]));
    const episodes: ScriptBreakdownEpisode[] = [];

    for (let position = 0; position < chunks.length; position++) {
      const chunk = chunks[position];
      const episodeIndex = position + 1;
      const planned = planByChunk.get(chunk.id) ?? rawPlans[position];
      const title = String(planned?.title ?? chunk.explicitTitle ?? `第 ${episodeIndex} 集`).trim();
      const logline = String(planned?.logline ?? '').trim() || undefined;
      const episodeId = `ep-${episodeIndex}`;
      let scenes: ScriptBreakdownScene[] = [];
      let shots: ScriptBreakdownShot[] = [];

      try {
        const windows = splitLongEpisodeText(chunk.text);
        for (const window of windows) {
          const raw = await this.llmJsonObject(
            prompts.episodeBreakdownSystem,
            buildEpisodeBreakdownUserPrompt({
              episodeIndex,
              title,
              logline,
              sourceText: window.text,
              contextBefore: window.contextBefore,
              config,
            }),
            userId,
          );
          const normalized = normalizeProductionEpisode({
            raw,
            episodeIndex,
            title,
            logline,
            sourceText: chunk.text,
            config,
            sceneOffset: scenes.length,
            shotOffset: shots.length,
          });
          scenes.push(...normalized.scenes);
          shots.push(...normalized.shots);
        }
        shots = shots.slice(0, config.maxShotsPerEpisode);
        const allowed = new Set(shots.map((shot) => shot.id));
        scenes = scenes.map((scene) => ({ ...scene, shots: scene.shots.filter((shot) => allowed.has(shot.id)) }))
          .filter((scene) => scene.shots.length > 0);
        if (shots.length === 0) throw new Error('AI 未生成有效镜头');
      } catch (error) {
        if (!config.allowRuleFallback) throw error;
        const local = buildScriptBreakdownFromText(chunk.text).episodes[0];
        const localScenes = (local?.shots ?? []).map((shot, index) => ({
          code: `${episodeIndex}-${index + 1}`,
          title: shot.scene || `场景 ${index + 1}`,
          location: shot.scene || '未指定场景',
          timeOfDay: '未指定',
          interiorExterior: 'INT',
          summary: shot.title,
          shots: [{
            title: shot.title,
            durationSec: shot.durationSec,
            shotSize: 'MS',
            cameraMove: '固定',
            characters: shot.characters,
            scriptText: shot.scriptText,
            dialogue: shot.dialogue,
            audiovisualLanguage: shot.audiovisualLanguage,
            imagePrompt: shot.imagePrompt,
            videoPrompt: shot.videoPrompt,
            sketchPrompt: [
              shot.scriptText || shot.imagePrompt,
              'black and white storyboard sketch, clean pencil line art, clear silhouettes, composition guide, no color, no shading',
            ].filter(Boolean).join(' '),
            continuityNotes: [],
          }],
        }));
        const normalized = normalizeProductionEpisode({
          raw: { scenes: localScenes },
          episodeIndex,
          title,
          logline,
          sourceText: chunk.text,
          config,
        });
        scenes = normalized.scenes;
        shots = normalized.shots;
        diagnostics.push({
          level: 'warning',
          code: 'episode_rule_fallback',
          episodeId,
          message: `${title} 的 AI 镜头拆分失败，已使用本地规则保底：${String(error)}`,
        });
      }

      const totalDuration = shots.reduce((sum, shot) => sum + shot.durationSec, 0);
      if (Math.abs(totalDuration - config.targetEpisodeDurationSec) > config.targetEpisodeDurationSec * 0.5) {
        diagnostics.push({
          level: 'warning',
          code: 'duration_deviation',
          episodeId,
          message: `${title} 当前约 ${totalDuration} 秒，与目标 ${config.targetEpisodeDurationSec} 秒偏差较大，建议在分镜网格复核。`,
        });
      }
      episodes.push({
        id: episodeId,
        index: episodeIndex,
        title,
        logline,
        sourceText: chunk.text,
        scenes,
        shots,
      });
    }

    const payload = {
      version: 1 as const,
      title: String(plan?.title ?? '').trim() || '剧本拆分',
      sourceText,
      storyAnalysis: normalizeStoryAnalysis(plan),
      characters: normalizePlanCharacters(plan),
      acts: normalizePlanActs(plan),
      episodes,
      config,
      diagnostics,
      promptVersion: 'production-director-v3-av-language',
      generatedAt: new Date().toISOString(),
    };
    diagnostics.push(...validateScriptBreakdownPayload(payload).filter((item) =>
      !diagnostics.some((existing) => existing.code === item.code && existing.episodeId === item.episodeId && existing.message === item.message),
    ));
    return {
      ok: true as const,
      payload,
      stats: {
        episodeCount: episodes.length,
        sceneCount: episodes.reduce((sum, episode) => sum + (episode.scenes?.length ?? 0), 0),
        shotCount: episodes.reduce((sum, episode) => sum + episode.shots.length, 0),
        warningCount: diagnostics.filter((item) => item.level === 'warning').length,
      },
    };
  }

  async adaptation(
    sourceText: string,
    userId?: string,
  ): Promise<{ ok: true; adaptation: AdaptationStrategy }> {
    const system = [
      '你是改编策略师。分析用户提供的小说/大纲文本，输出改编策略。',
      'JSON 格式: {"sourceType":"novel|outline|script","tone":"保留/轻松/悬疑/热血","pacing":"fast|medium|slow","omitRules":["可省略的支线"],"emphasis":["需要强化的情节"]}',
      '只输出 JSON。',
    ].join('\n');
    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: sourceText },
      ],
    }, userId)) as { choices?: { message?: { content?: string } }[] };
    const content = res.choices?.[0]?.message?.content ?? '';
    if (!content) throw new ServiceUnavailableException('LLM 未返回内容');
    const adaptation = JSON.parse(content) as AdaptationStrategy;
    return { ok: true, adaptation };
  }

  async screenplay(
    sourceText: string,
    userId?: string,
  ): Promise<{ ok: true; script: string }> {
    const system = [
      '你是编剧。根据改编策略和原文，写出分集剧本。',
      '格式：每集标注 "第 X 集"，每场标注场景标题和内容。包含对白和动作描写。',
      '输出纯文本，不要 JSON。',
    ].join('\n');
    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: sourceText },
      ],
    }, userId)) as { choices?: { message?: { content?: string } }[] };
    const content = res.choices?.[0]?.message?.content ?? '';
    if (!content) throw new ServiceUnavailableException('LLM 未返回内容');
    return { ok: true, script: content };
  }

  async directorPlan(
    sourceText: string,
    userId?: string,
  ): Promise<{ ok: true; plan: string }> {
    const system = [
      '你是导演。根据剧本制定导演规划。',
      '包含：场景安排、镜头风格、角色走位、关键视觉元素。',
      '输出纯文本 markdown。',
    ].join('\n');
    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: sourceText },
      ],
    }, userId)) as { choices?: { message?: { content?: string } }[] };
    const content = res.choices?.[0]?.message?.content ?? '';
    if (!content) throw new ServiceUnavailableException('LLM 未返回内容');
    return { ok: true, plan: content };
  }

  async extractAssets(
    sourceText: string,
    userId?: string,
  ): Promise<{ ok: true; assets: { characters: (Partial<CharacterProfile> & { bible?: import('@nx9/shared').CharacterBible })[]; locations: string[] } }> {
    const system = [
      '你是剧本资产抽取器。从剧本/小说文本中提取角色和场景，并为每个角色填写六层设定。',
      'JSON 格式: {"characters":[{"name":"角色名","archetype":"主角/配角/反派","traits":"性格特征","description":"外观描述","bible":{"identity":"身份","appearance":"外貌","personality":"性格","background":"背景","voice":"声音","relationships":"关系"}}],"locations":["场景1","场景2"]}',
      'bible 六层字段必须填写。只输出 JSON。',
    ].join('\n');
    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: sourceText },
      ],
    }, userId)) as { choices?: { message?: { content?: string } }[] };
    const content = res.choices?.[0]?.message?.content ?? '';
    if (!content) throw new ServiceUnavailableException('LLM 未返回内容');
    const assets = JSON.parse(content) as { characters: Partial<CharacterProfile>[]; locations: string[] };
    return { ok: true, assets };
  }

  async novelEvents(
    sourceText: string,
    userId?: string,
  ): Promise<{ ok: true; events: { chapter: number; title: string; summary: string; characters: string[] }[] }> {
    const system = [
      '你是章节事件提取器。分析长篇小说文本，提取每章关键事件。',
      'JSON 格式: [{"chapter":1,"title":"章节标题","summary":"事件摘要","characters":["出场角色"]}]',
      '只输出 JSON 数组。每章不超过 100 字摘要。',
    ].join('\n');
    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: sourceText },
      ],
    }, userId)) as { choices?: { message?: { content?: string } }[] };
    const content = res.choices?.[0]?.message?.content ?? '';
    if (!content) throw new ServiceUnavailableException('LLM 未返回内容');
    const raw = extractJsonArray(content);
    const events = raw.map((item: unknown) => {
      const r = item as Record<string, unknown>;
      return { chapter: Number(r.chapter) || 0, title: String(r.title ?? ''), summary: String(r.summary ?? ''), characters: Array.isArray(r.characters) ? r.characters.map(String) : [] };
    }).filter((e: { chapter: number }) => e.chapter > 0).slice(0, 200);
    if (events.length === 0) throw new ServiceUnavailableException('LLM 未生成有效事件');
    return { ok: true, events };
  }

  async sceneSplit(
    sourceText: string,
    mode: 'llm' | 'rule' = 'llm',
    userId?: string,
  ): Promise<{ ok: true; scenes: SceneSplitRecord[] }> {
    if (mode === 'rule') {
      const { scenes } = parseChineseScript(sourceText);
      const records: SceneSplitRecord[] = scenes.map((s, i) => ({
        id: `sc-rule-${i + 1}`,
        sceneCode: `${s.episode}-${i + 1}`,
        episode: s.episode,
        location: s.location,
        interior: (s.interior === '内' ? '内' : '外') as '内' | '外',
        timeOfDay: s.timeOfDay || '日',
        characters: s.characters,
        summary: s.content.slice(0, 100),
      }));
      return { ok: true, scenes: records };
    }

    const system = [
      '你是剧本场次拆分器。将用户提供的剧本/小说文本按场次拆分输出。',
      '输出 JSON 数组，每个元素对应一场。',
      '格式: [{"id":"唯一ID","sceneCode":"1-1","episode":1,"location":"地点","interior":"内|外","timeOfDay":"日|夜","characters":["角色名"],"summary":"本场摘要","beatCount":3}]',
      '至少输出 2 场。只输出 JSON 数组。',
    ].join('\n');

    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: sourceText },
      ],
    }, userId)) as { choices?: { message?: { content?: string } }[] };

    const content = res.choices?.[0]?.message?.content ?? '';
    if (!content) throw new ServiceUnavailableException('LLM 未返回内容');

    const raw = extractJsonArray(content);
    const scenes: SceneSplitRecord[] = raw
      .map((item: unknown, i: number) => {
        const r = item as Record<string, unknown>;
        return {
          id: String(r.id ?? `sc-llm-${i + 1}`),
          sceneCode: String(r.sceneCode ?? `${r.episode ?? 1}-${i + 1}`),
          episode: Number(r.episode) || 1,
          location: String(r.location ?? r.place ?? '').trim(),
          interior: (String(r.interior ?? '外').includes('内') ? '内' : '外') as '内' | '外',
          timeOfDay: String(r.timeOfDay ?? '日'),
          characters: Array.isArray(r.characters) ? r.characters.map(String) : [],
          summary: String(r.summary ?? '').trim().slice(0, 200),
          beatCount: Number(r.beatCount) || undefined,
        };
      })
      .filter((s: SceneSplitRecord) => s.location.length > 0)
      .slice(0, 50);

    if (scenes.length === 0) throw new ServiceUnavailableException('LLM 未生成有效场次');
    return { ok: true, scenes };
  }

  async extractEnvironments(
    input: { sourceText?: string; scenes?: SceneSplitRecord[] },
    userId?: string,
  ): Promise<{ ok: true; environments: import('@nx9/shared').EnvironmentProfile[] }> {
    const context = input.scenes
      ? input.scenes.map((s) => `[${s.sceneCode}] ${s.location}（${s.interior} ${s.timeOfDay}）- ${s.summary}`).join('\n')
      : input.sourceText ?? '';

    const system = [
      '你是场景环境设定师。为每个场次生成环境卡。',
      '输出 JSON 数组，每个元素: {"id":"唯一ID","sceneCode":"1-1","name":"场景名","descriptionZh":"中文描述","lighting":"光线描述","props":["道具1","道具2"],"era":"时代"}',
      '至少生成 1 条。只输出 JSON 数组。',
    ].join('\n');

    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: context },
      ],
    }, userId)) as { choices?: { message?: { content?: string } }[] };

    const content = res.choices?.[0]?.message?.content ?? '';
    if (!content) throw new ServiceUnavailableException('LLM 未返回内容');

    const raw = extractJsonArray(content);
    const environments = raw
      .map((item: unknown) => {
        const r = item as Record<string, unknown>;
        return {
          id: String(r.id ?? `env-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
          sceneCode: String(r.sceneCode ?? ''),
          name: String(r.name ?? '').trim(),
          descriptionZh: String(r.descriptionZh ?? r.description ?? '').trim(),
          lighting: String(r.lighting ?? '').trim(),
          props: Array.isArray(r.props) ? r.props.map(String) : [],
          era: String(r.era ?? '').trim(),
          referenceImageUrl: null,
          referenceUrls: [],
        };
      })
      .filter((e: { name: string }) => e.name.length > 0);

    return { ok: true, environments };
  }

  async materializeShots(table: StoryboardTableRow[]): Promise<{ ok: true; shots: StoryboardShot[] }> {
    const shots: StoryboardShot[] = table.map((row, i) => ({
      id: `shot-mat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
      index: i + 1,
      durationSec: row.durationSec,
      shotType: row.shotSize.toLowerCase().includes('cu') ? 'close' as const
        : row.shotSize === 'MS' ? 'medium' as const
        : row.shotSize === 'FS' || row.shotSize === 'WS' ? 'wide' as const
        : 'medium' as const,
      descriptionZh: row.descriptionZh,
      promptEn: `${row.videoDesc}, ${row.shotSize} shot, ${row.cameraMove}`,
      videoDesc: row.videoDesc,
      associateAssetIds: row.associateAssetIds,
      status: 'draft' as const,
      characterIds: [],
      linkedBlockId: null,
      tableRowId: row.id,
      sceneId: null,
      sceneCode: row.group || null,
      keyframeStatus: 'draft',
      videoStatus: 'draft',
    }));
    return { ok: true, shots };
  }
}
