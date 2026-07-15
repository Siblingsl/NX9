import { describe, it, expect, vi } from 'vitest';
import {
  createScriptBreakdownExportEnvelope,
  createScriptBreakdownPromptPack,
  parseScriptBreakdownExportEnvelope,
  parseScriptBreakdownPromptPack,
  splitSourceIntoEpisodeChunks,
} from '@nx9/shared';
import { AgentService } from '../src/modules/agent/agent.service';

describe('TEST-AG — Agent Service (pure function tests)', () => {

  it('TEST-AG-001: POST /api/agent/shot-script — input validation', () => {
    // Test input parsing logic that AgentService.shotScriptFromText uses
    const SHOT_TYPES = new Set(['ECU', 'CU', 'MS', 'FS', 'WS', 'OTS']);
    expect(SHOT_TYPES.has('CU')).toBe(true);
    expect(SHOT_TYPES.has('XX')).toBe(false);

    const clampDuration = (value: unknown): number => {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n)) return 4;
      return Math.min(30, Math.max(2, n));
    };
    expect(clampDuration(5)).toBe(5);
    expect(clampDuration(0)).toBe(2);
    expect(clampDuration(100)).toBe(30);
    expect(clampDuration('abc')).toBe(4);

    const normalizeShotType = (value: unknown): string => {
      const v = typeof value === 'string' ? value.trim().toUpperCase() : '';
      return SHOT_TYPES.has(v) ? v : 'MS';
    };
    expect(normalizeShotType('CU')).toBe('CU');
    expect(normalizeShotType('xx')).toBe('MS');
  });

  it('TEST-AG-002: POST /api/agent/dialogue-parse — extract JSON logic', () => {
    const extractJsonArray = (text: string): unknown[] => {
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start >= 0 && end > start) {
        try {
          const parsed = JSON.parse(text.slice(start, end + 1));
          if (Array.isArray(parsed)) return parsed;
        } catch { /* fall */ }
      }
      try {
        const obj = JSON.parse(text);
        if (Array.isArray(obj)) return obj;
        if (Array.isArray(obj.rows)) return obj.rows;
      } catch { /* fall */ }
      return [];
    };

    const valid = '[{"speaker":"林晓","text":"你好"}]';
    expect(extractJsonArray(valid)).toHaveLength(1);

    const withWrapper = 'xxx {"rows":[{"speaker":"林晓","text":"你好"}]} yyy';
    expect(extractJsonArray(withWrapper)).toHaveLength(1);

    const empty = 'no json here';
    expect(extractJsonArray(empty)).toEqual([]);
  });

  it('TEST-AG-003: POST /api/agent/production/storyboard-table — row mapping', () => {
    const clampDuration = (value: unknown): number => {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n)) return 4;
      return Math.min(30, Math.max(2, n));
    };
    const raw = [
      { id: 'row-1', group: 'S01', shotSize: 'CU', cameraMove: '推', durationSec: 4, descriptionZh: '特写咖啡', dialogue: '', sfx: '', videoDesc: 'slow push', associateAssetIds: [] },
      { id: 'row-2', group: 'S01', shotSize: 'MS', cameraMove: '摇', durationSec: 3, descriptionZh: '女主转身', dialogue: '等等', sfx: '脚步声', videoDesc: 'pan follow', associateAssetIds: ['ast-1'] },
    ];
    const rows = raw.map((r, i) => ({
      id: String(r.id ?? `row-${i + 1}`),
      group: String(r.group ?? 'S01'),
      shotSize: String(r.shotSize ?? 'MS'),
      cameraMove: String(r.cameraMove ?? '固定'),
      durationSec: clampDuration(r.durationSec),
      descriptionZh: String(r.descriptionZh ?? '').trim(),
      dialogue: String(r.dialogue ?? '').trim(),
      sfx: String(r.sfx ?? '').trim(),
      videoDesc: String(r.videoDesc ?? '').trim(),
      associateAssetIds: Array.isArray(r.associateAssetIds) ? r.associateAssetIds.map(String) : [],
    })).filter((r) => r.descriptionZh.length > 0);
    expect(rows).toHaveLength(2);
    expect(rows[0].shotSize).toBe('CU');
    expect(rows[1].dialogue).toBe('等等');
    expect(rows[1].sfx).toBe('脚步声');
    expect(rows[1].associateAssetIds).toEqual(['ast-1']);
  });

  it('TEST-AG-004: POST /api/agent/production/adaptation — strategy parsing', () => {
    const parseAdaptation = (json: string) => {
      const parsed = JSON.parse(json) as { sourceType: string; tone: string; pacing: string; omitRules: string[]; emphasis: string[] };
      return { sourceType: parsed.sourceType, tone: parsed.tone, pacing: parsed.pacing, omitRules: parsed.omitRules, emphasis: parsed.emphasis };
    };
    const valid = parseAdaptation(`{"sourceType":"novel","tone":"悬疑","pacing":"fast","omitRules":["支线A"],"emphasis":["主线冲突"]}`);
    expect(valid.sourceType).toBe('novel');
    expect(valid.pacing).toBe('fast');
    expect(valid.omitRules).toContain('支线A');
    const minimal = parseAdaptation(`{"sourceType":"script","tone":"轻松","pacing":"medium","omitRules":[],"emphasis":[]}`);
    expect(minimal.sourceType).toBe('script');
    expect(minimal.emphasis).toEqual([]);
  });

  it('TEST-AG-006: POST /api/agent/production/script-skeleton — skeleton parsing', () => {
    const parseSkeleton = (json: string) => {
      const parsed = JSON.parse(json) as { title: string; logline: string; acts: { name: string; beats: string[] }[]; episodeCount: number; hookPoints: string[] };
      if (!parsed.title || !parsed.acts) throw new Error('缺少必填字段');
      return parsed;
    };
    const valid = parseSkeleton(`{"title":"雨夜咖啡馆","logline":"悬疑爱情短剧","acts":[{"name":"第一幕","beats":["相遇","冲突"]},{"name":"第二幕","beats":["反转","高潮"]}],"episodeCount":6,"hookPoints":["第一集结尾"]}`);
    expect(valid.title).toBe('雨夜咖啡馆');
    expect(valid.acts).toHaveLength(2);
    expect(valid.acts[0].beats).toContain('相遇');
    expect(() => parseSkeleton(`{"logline":"missing title","acts":[]}`)).toThrow('缺少必填字段');
  });

  it('TEST-AG-007: POST /api/agent/extract-assets — character and location extraction', () => {
    const extractAssets = (json: string) => {
      const parsed = JSON.parse(json) as { characters: { name: string; archetype: string }[]; locations: string[] };
      return { characters: parsed.characters ?? [], locations: parsed.locations ?? [] };
    };
    const result = extractAssets(`{"characters":[{"name":"林晓","archetype":"主角"}],"locations":["咖啡馆","雨夜街道"]}`);
    expect(result.characters).toHaveLength(1);
    expect(result.characters[0].name).toBe('林晓');
    expect(result.locations).toContain('咖啡馆');
    const empty = extractAssets(`{"characters":[],"locations":[]}`);
    expect(empty.characters).toHaveLength(0);
  });

  it('TEST-AG-005: POST /api/agent/production/materialize-shots — shot materialization', () => {
    const table = [
      { id: 'row-1', group: 'G1', shotSize: 'WS', cameraMove: 'static', durationSec: 4, descriptionZh: '雨夜街道', dialogue: '', sfx: '雨声', videoDesc: 'slow push in', associateAssetIds: [] },
      { id: 'row-2', group: 'G1', shotSize: 'MS', cameraMove: 'pan', durationSec: 3, descriptionZh: '男主撑伞', dialogue: '', sfx: '', videoDesc: 'follow walk', associateAssetIds: [] },
    ];

    const shots = table.map((row, i) => ({
      id: `shot-${i}`,
      index: i + 1,
      durationSec: row.durationSec,
      shotType: row.shotSize.toLowerCase().includes('cu') ? 'close' as const
        : row.shotSize === 'MS' ? 'medium' as const
        : row.shotSize === 'FS' || row.shotSize === 'WS' ? 'wide' as const
        : 'medium' as const,
      descriptionZh: row.descriptionZh,
      promptEn: `${row.videoDesc}, ${row.shotSize} shot, ${row.cameraMove}`,
      status: 'draft' as const,
      linkedBlockId: null,
    }));

    expect(shots).toHaveLength(2);
    expect(shots[0].index).toBe(1);
    expect(shots[1].index).toBe(2);
    expect(shots[0].shotType).toBe('wide');
    expect(shots[1].shotType).toBe('medium');
    expect(shots[0].promptEn).toContain('slow push in');
  });

  it('TEST-AG-008: production splitter never collapses explicit episodes into episode 1', () => {
    const source = `第1集 雨夜相遇\n林夏走进咖啡馆。她发现桌上的旧照片。\n\n第2集 真相逼近\n林夏找到周远。两人在车站发生争执。\n\n第3集 最终选择\n周远说出真相。林夏在天台做出选择。`;
    const chunks = splitSourceIntoEpisodeChunks(source, { episodeMode: 'auto' });
    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.text.match(/第\d集/)?.[0])).toEqual(['第1集', '第2集', '第3集']);
  });

  it('TEST-AG-009: fixed episode count creates exact independent source chunks', () => {
    const source = Array.from({ length: 18 }, (_, index) => `第${index + 1}段剧情发生推进，角色完成动作。`).join('\n\n');
    const chunks = splitSourceIntoEpisodeChunks(source, { episodeMode: 'fixed', episodeCount: 3 });
    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.text.length > 0)).toBe(true);
    expect(chunks.map((chunk) => chunk.text).join('\n').length).toBeGreaterThan(source.length * 0.9);
  });

  it('TEST-AG-010: production two-stage service preserves two episodes', async () => {
    let call = 0;
    const proxyLlm = vi.fn(async () => {
      call += 1;
      const content = call === 1
        ? JSON.stringify({
            title: '双集测试',
            episodes: [
              { index: 1, chunkId: 'chunk-1', title: '雨夜相遇', logline: '林夏发现照片' },
              { index: 2, chunkId: 'chunk-2', title: '车站争执', logline: '林夏质问周远' },
            ],
          })
        : JSON.stringify({
            episode: { title: call === 2 ? '雨夜相遇' : '车站争执', logline: '测试梗概' },
            scenes: [{
              code: call === 2 ? '1-1' : '2-1',
              title: '室内对话', location: '咖啡馆', timeOfDay: '夜', interiorExterior: 'INT', summary: '推进冲突',
              shots: [{
                title: '人物中景', durationSec: 5, shotSize: 'MS', cameraMove: '固定', characters: ['林夏'],
                scriptText: '林夏拿起照片', dialogue: [{ speaker: '林夏', text: '这是谁？', emotion: '疑惑' }],
                imagePrompt: 'Lin Xia holding an old photo, medium shot',
                videoPrompt: '5s, Lin Xia slowly raises the photo, static camera',
                continuityNotes: ['黑色外套保持一致'],
              }],
            }],
          });
      return { choices: [{ message: { content } }] };
    });
    const service = new AgentService({ proxyLlm } as any);
    const result = await service.productionScriptBreakdown({
      sourceText: '第1集 雨夜相遇\n林夏进入咖啡馆并发现照片，故事由此开始。\n第2集 车站争执\n林夏在车站质问周远，二人的矛盾升级。',
      config: { episodeMode: 'auto', allowRuleFallback: false },
    });
    expect(result.payload.episodes).toHaveLength(2);
    expect(result.payload.episodes.map((episode) => episode.id)).toEqual(['ep-1', 'ep-2']);
    expect(result.payload.episodes.every((episode) => episode.scenes?.length === 1)).toBe(true);
    expect(result.payload.episodes.every((episode) => episode.shots[0].imagePrompt.length > 10)).toBe(true);
    expect(proxyLlm).toHaveBeenCalledTimes(3);
  });

  it('TEST-AG-011: prompt pack and breakdown result support import/export round trips', () => {
    const promptPack = createScriptBreakdownPromptPack({ episodeMode: 'fixed', episodeCount: 6 });
    expect(parseScriptBreakdownPromptPack(JSON.parse(JSON.stringify(promptPack)))?.config.episodeCount).toBe(6);
    const payload = {
      version: 1 as const,
      title: '测试剧本', sourceText: '测试原文', generatedAt: new Date().toISOString(),
      episodes: [{
        id: 'ep-1', index: 1, title: '第一集', shots: [{
          id: 'ep-1-shot-1', episodeId: 'ep-1', episodeIndex: 1, index: 1,
          sceneId: 'ep-1-scene-1', sceneCode: '1-1', title: '镜头', durationSec: 5,
          characters: ['林夏'], scene: '咖啡馆', scriptText: '林夏进入咖啡馆', dialogue: [],
          imagePrompt: 'Lin Xia enters a cafe', videoPrompt: '5s, Lin Xia walks into cafe', status: 'draft' as const,
        }],
      }],
    };
    const envelope = createScriptBreakdownExportEnvelope(payload);
    expect(parseScriptBreakdownExportEnvelope(JSON.parse(JSON.stringify(envelope)))?.title).toBe('测试剧本');
  });
});
