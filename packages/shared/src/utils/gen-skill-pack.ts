/**
 * Gen Template Skill 拼装包：拼装器读 templates/prompt-pack.md（或等价正文）得到可注入片段。
 * 与 Agent 的 system 注入不同——Gen 是模板/质量句/约束叠加，不是整段 LLM system。
 */

export interface GenPromptPack {
  skillId: string;
  /** 开场质量句 / 主声明 */
  quality?: string;
  /** 尾部约束句 */
  constraints?: string;
  /** 带 {placeholder} 的整段模板（bible / master sheet） */
  template?: string;
  /** 始终追加的叠加层（director batch） */
  overlay?: string;
  styleLockPrefix?: string;
  characterRefHint?: string;
  camera3dHint?: string;
  lineArtHint?: string;
  /** 原始包正文（调试） */
  raw?: string;
}

const SECTION_KEYS = [
  'quality',
  'constraints',
  'template',
  'overlay',
  'style_lock_prefix',
  'character_ref_hint',
  'camera_3d_hint',
  'line_art_hint',
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

const KEY_TO_FIELD: Record<SectionKey, keyof GenPromptPack> = {
  quality: 'quality',
  constraints: 'constraints',
  template: 'template',
  overlay: 'overlay',
  style_lock_prefix: 'styleLockPrefix',
  character_ref_hint: 'characterRefHint',
  camera_3d_hint: 'camera3dHint',
  line_art_hint: 'lineArtHint',
};

/** 解析 `## section_name` 分块的 prompt-pack 正文 */
export function parseGenPromptPack(skillId: string, raw: string): GenPromptPack {
  const text = (raw ?? '').replace(/^\uFEFF/, '').trim();
  const pack: GenPromptPack = { skillId, raw: text };
  if (!text) return pack;

  const re = /^##\s+([a-z0-9_]+)\s*$/gim;
  const matches: { key: string; index: number; headerLen: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({ key: m[1].toLowerCase(), index: m.index, headerLen: m[0].length });
  }
  if (matches.length === 0) {
    // 无分节时整段当作 template
    pack.template = text;
    return pack;
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(cur.index + cur.headerLen, end).trim();
    const field = KEY_TO_FIELD[cur.key as SectionKey];
    if (field && body) {
      (pack as unknown as Record<string, unknown>)[field] = body;
    }
  }
  return pack;
}

/** 简单 {key} 替换；缺省留空串 */
export function fillGenTemplate(template: string, vars: Record<string, string | undefined | null>): string {
  return (template ?? '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

export function isGenPromptPackEmpty(pack: GenPromptPack | null | undefined): boolean {
  if (!pack) return true;
  return !(
    pack.quality?.trim() ||
    pack.constraints?.trim() ||
    pack.template?.trim() ||
    pack.overlay?.trim() ||
    pack.styleLockPrefix?.trim() ||
    pack.characterRefHint?.trim() ||
    pack.camera3dHint?.trim()
  );
}
