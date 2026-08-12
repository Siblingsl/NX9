/**
 * 服装 / 道具实体名抽取（预检与一致性检查共用）。
 * 目标：少噪音、可对照库 label，禁止各模块各写一套正则。
 */

const COSTUME_PREFIX =
  /(?:穿着|身穿|着装|服饰|服装|衣装|戏服|战甲|校服|常服|礼服|外套|披风)[：:\s]*/g;

const COSTUME_INLINE =
  /(?:穿着|身穿|着装|身着|穿著|穿了|穿着了)\s*([^。；;\n，,]{1,24})/g;

const PROP_PREFIX = /(?:道具|物品|摆设|手持|陈设)[：:\s]*/g;

/** 常见道具关键词（与历史一致性检查对齐，集中维护） */
export const COMMON_PROP_KEYWORDS = [
  '手机', '剑', '刀', '枪', '包', '帽', '眼镜', '钥匙', '书', '笔', '箱', '灯', '杖',
  '伞', '扇', '杯', '壶', '戒', '玉佩', '项链', '耳机', '电脑', '平板', '相机',
] as const;

const NOISE_COSTUME = new Set([
  '着', '穿', '衣服', '服装', '一身', '一件', '一套', '同上', '如前', '不变',
]);

function uniqPreserve(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim().replace(/^的/, '').replace(/的$/, '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function splitEntityChunk(chunk: string): string[] {
  return chunk
    .split(/[,，、；;／/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isPlausibleCostumeName(name: string): boolean {
  if (name.length < 2 || name.length > 24) return false;
  if (NOISE_COSTUME.has(name)) return false;
  if (/^(他|她|它|其|该|这|那)/.test(name)) return false;
  return true;
}

function isPlausiblePropName(name: string): boolean {
  if (name.length < 1 || name.length > 24) return false;
  if (/^(有|是|在|和|与|的)$/.test(name)) return false;
  return true;
}

export type CostumeExtractCharacter = {
  appearance?: string;
  personality?: string;
  voiceNotes?: string;
  fixedVisualKeywords?: string;
  identity?: string;
  /** 拆镜/扩展字段若存在则优先 */
  costume?: string;
  /** 库已绑定服装名 */
  costumeLabel?: string;
};

export type PropExtractScene = {
  summary?: string;
  dramaticFunction?: string;
  sensoryNotes?: string;
  location?: string;
  era?: string;
  /** 场景上遗留的 props 字符串列表 */
  props?: string[];
};

export type PropExtractCharacter = {
  appearance?: string;
  fixedVisualKeywords?: string;
  identity?: string;
};

/** 从角色文本抽取服装实体名 */
export function extractCostumeEntityNames(
  characters: CostumeExtractCharacter[],
): string[] {
  const names: string[] = [];
  for (const char of characters) {
    if (char.costumeLabel?.trim()) names.push(char.costumeLabel.trim());
    if (char.costume?.trim()) {
      names.push(...splitEntityChunk(char.costume));
    }
    const blob = [char.appearance, char.personality, char.voiceNotes, char.fixedVisualKeywords]
      .filter(Boolean)
      .join('。');
    if (!blob) continue;

    // 「服装：青衫长袍」类前缀列表
    const prefixed = blob.match(/(?:穿着|身穿|着装|服饰|服装|衣装|戏服|战甲|校服|常服|礼服)[：:]\s*([^。；;\n]+)/g);
    if (prefixed) {
      for (const m of prefixed) {
        const body = m.replace(COSTUME_PREFIX, '').trim();
        names.push(...splitEntityChunk(body));
      }
    }

    // 「身穿青衫长袍」内联
    COSTUME_INLINE.lastIndex = 0;
    let inline: RegExpExecArray | null;
    while ((inline = COSTUME_INLINE.exec(blob))) {
      names.push(...splitEntityChunk(inline[1] ?? ''));
    }
  }
  return uniqPreserve(names).filter(isPlausibleCostumeName);
}

/** 从场景 / 角色文本抽取道具实体名 */
export function extractPropEntityNames(input: {
  scenes?: PropExtractScene[];
  characters?: PropExtractCharacter[];
}): string[] {
  const names: string[] = [];

  for (const scene of input.scenes ?? []) {
    if (scene.props?.length) {
      for (const p of scene.props) names.push(...splitEntityChunk(p));
    }
    const text = [scene.summary, scene.dramaticFunction, scene.sensoryNotes, scene.location, scene.era]
      .filter(Boolean)
      .join('。');
    if (!text) continue;

    const prefixed = text.match(/(?:道具|物品|摆设|手持|陈设)[：:]\s*([^。；;\n]+)/g);
    if (prefixed) {
      for (const m of prefixed) {
        const body = m.replace(PROP_PREFIX, '').trim();
        names.push(...splitEntityChunk(body));
      }
    }

    for (const kw of COMMON_PROP_KEYWORDS) {
      if (text.includes(kw)) names.push(kw);
    }
  }

  for (const char of input.characters ?? []) {
    const blob = [char.appearance, char.fixedVisualKeywords, char.identity]
      .filter(Boolean)
      .join('。');
    for (const kw of COMMON_PROP_KEYWORDS) {
      if (blob.includes(kw)) names.push(kw);
    }
  }

  return uniqPreserve(names).filter(isPlausiblePropName);
}
