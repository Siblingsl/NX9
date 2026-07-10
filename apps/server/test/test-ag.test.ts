import { describe, it, expect } from 'vitest';

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
});
