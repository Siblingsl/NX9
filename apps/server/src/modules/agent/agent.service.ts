import { Injectable, StreamableFile } from '@nestjs/common';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { GatewayService } from '../gateway/gateway.service';
import type { StorySkeleton, AdaptationStrategy, StoryboardTableRow, ScriptPlanPayload, StoryboardShot, CharacterProfile, SceneSplitRecord } from '@nx9/shared';
import { scenesToStoryboardShots, parseChineseScript } from '@nx9/shared';

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

@Injectable()
export class AgentService {
  constructor(private readonly gateway: GatewayService) {}

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
      '每行一个镜头，时长 3-8 秒。',
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
      '格式: [{"id":"唯一ID","group":"S01","shotSize":"CU|MS|FS|WS","cameraMove":"推|拉|摇|移|固定","durationSec":3-8,"descriptionZh":"画面描述","dialogue":"对白","sfx":"音效","videoDesc":"视频动态描述","associateAssetIds":[]}]',
      '每个镜头 durationSec 3-8 秒，单组 ≤15 秒。',
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
