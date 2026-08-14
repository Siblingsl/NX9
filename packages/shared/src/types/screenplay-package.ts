import type { ScriptBreakdownPayload, ScriptDirectorControls } from './script-breakdown';

export type ScreenplayPackageStatus = 'empty' | 'drafting' | 'confirmed';

export interface ScreenplayBrief {
  title?: string;
  logline?: string;
  topic?: string;
  targetPlatforms?: string[];
  pacing?: 'slow' | 'balanced' | 'fast';
  targetEpisodeDurationSec?: number;
  episodeCount?: number;
  /** 单集字数目标（约数）；生成/续写/重写注入 prompt */
  episodeWordTarget?: number;
  plotOutline?: string;
  hooks?: string[];
  notes?: string;
  /** 原导演控制芯片的降维：创作偏好，非拆镜锁 */
  creativePrefs?: Partial<ScriptDirectorControls>;
}

export interface ScreenplayEpisode {
  id: string;
  index: number;
  title: string;
  bodyMd: string;
  updatedAt: string;
}

export interface ScreenplayCharacterDraft {
  id: string;
  name: string;
  aliases?: string[];
  identity?: string;
  appearance?: string;
  personality?: string;
  relationships?: string;
  /** 背景故事（抽取 bible.background） */
  background?: string;
  goal?: string;
  voiceNotes?: string;
  fixedVisualKeywords?: string;
  libraryStatus?: 'draft' | 'in_library' | 'missing';
  libraryCharacterId?: string;
}

export interface ScreenplaySceneDraft {
  id: string;
  name: string;
  code?: string;
  summary?: string;
  era?: string;
  location?: string;
  dramaticFunction?: string;
  sensoryNotes?: string;
  libraryStatus?: 'draft' | 'in_library' | 'missing';
  libraryEnvironmentId?: string;
}

export interface ScreenplayWorldDraft {
  era?: string;
  location?: string;
  worldview?: string;
  visualStyleNotes?: string;
  rules?: string[];
}

export interface ScreenplayBible {
  world?: ScreenplayWorldDraft;
  characters: ScreenplayCharacterDraft[];
  scenes: ScreenplaySceneDraft[];
}

export interface ScreenplayDiagnostic {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  episodeId?: string;
  entityId?: string;
}

export interface ScreenplayPackage {
  schema: 'nx9-screenplay-package';
  version: 1;
  status: ScreenplayPackageStatus;
  brief: ScreenplayBrief;
  bible: ScreenplayBible;
  screenplay: {
    episodes: ScreenplayEpisode[];
    sourceType?: 'generated' | 'uploaded' | 'pasted' | 'mixed';
  };
  diagnostics?: ScreenplayDiagnostic[];
  confirmedAt?: string;
  updatedAt: string;
}

export type ScriptDeskSkillId =
  | 'topic'
  | 'world'
  | 'character'
  | 'plot'
  | 'pacing'
  | 'dialogue'
  | 'hooks'
  | 'consistency'
  | 'generate'
  | 'ingest';

export interface ScriptDeskAgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  skillId?: ScriptDeskSkillId;
  createdAt: string;
  /** 待应用的结构化补丁（JSON 字符串或对象） */
  pendingPatch?: Partial<ScreenplayPackage> | Record<string, unknown>;
  applied?: boolean;
  /** C-02: 标记为已丢弃 */
  discarded?: boolean;
  /** Q-04: 结构化错误码（rate_limit / timeout / content_filter 等） */
  errorCode?: string;
}

export interface ScriptDeskAgentSession {
  messages: ScriptDeskAgentMessage[];
  activeSkillIds?: ScriptDeskSkillId[];
  updatedAt: string;
}

export interface ScriptDeskNodeData {
  status?: 'idle' | 'running' | 'success' | 'error';
  content?: string;
  error?: string;
  /** Q-04: 结构化错误码（rate_limit / timeout / content_filter 等） */
  errorCode?: string;
  entryMode?: 'agent' | 'ingest';
  package?: ScreenplayPackage;
  agentSession?: ScriptDeskAgentSession;
  /** 迁移期只读：旧拆镜结果，本台不再生成 */
  legacyScriptBreakdown?: ScriptBreakdownPayload;
  directorBrief?: string;
  meta?: {
    type?: 'screenplay-package';
    packageId?: string;
    status?: ScreenplayPackageStatus;
    title?: string;
    episodeCount?: number;
    characterDraftCount?: number;
    sceneDraftCount?: number;
  };
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyScreenplayPackage(): ScreenplayPackage {
  return {
    schema: 'nx9-screenplay-package',
    version: 1,
    status: 'empty',
    brief: {},
    bible: { world: {}, characters: [], scenes: [] },
    screenplay: { episodes: [] },
    diagnostics: [],
    updatedAt: nowIso(),
  };
}

export function isScreenplayPackage(value: unknown): value is ScreenplayPackage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ScreenplayPackage>;
  return v.schema === 'nx9-screenplay-package' && v.version === 1 && Boolean(v.bible) && Boolean(v.screenplay);
}

export function screenplayFullText(pkg: ScreenplayPackage | undefined | null): string {
  if (!pkg) return '';
  return pkg.screenplay.episodes
    .map((ep) => {
      const title = ep.title.trim() || `第${ep.index}集`;
      const body = ep.bodyMd.trim();
      if (!body) return '';
      if (/^第[一二三四五六七八九十百千\d]+集/.test(body)) return body;
      return `${title}\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function screenplayWordCount(pkg: ScreenplayPackage | undefined | null): number {
  return screenplayFullText(pkg).replace(/\s+/g, '').length;
}

export function resolveScreenplayStatus(pkg: ScreenplayPackage): ScreenplayPackageStatus {
  if (pkg.status === 'confirmed' && pkg.confirmedAt) return 'confirmed';
  const hasBody = pkg.screenplay.episodes.some((ep) => ep.bodyMd.trim().length > 0);
  const hasBible =
    pkg.bible.characters.length > 0
    || pkg.bible.scenes.length > 0
    || Boolean(pkg.bible.world?.worldview || pkg.bible.world?.era);
  if (hasBody || hasBible || Boolean(pkg.brief.title || pkg.brief.logline || pkg.brief.topic)) {
    return 'drafting';
  }
  return 'empty';
}

export function touchScreenplayPackage(
  pkg: ScreenplayPackage,
  patch: Partial<ScreenplayPackage> = {},
): ScreenplayPackage {
  const next: ScreenplayPackage = {
    ...pkg,
    ...patch,
    brief: { ...pkg.brief, ...(patch.brief ?? {}) },
    bible: {
      world: patch.bible?.world ?? pkg.bible.world,
      characters: patch.bible?.characters ?? pkg.bible.characters,
      scenes: patch.bible?.scenes ?? pkg.bible.scenes,
    },
    screenplay: {
      ...pkg.screenplay,
      ...(patch.screenplay ?? {}),
      episodes: patch.screenplay?.episodes ?? pkg.screenplay.episodes,
    },
    diagnostics: patch.diagnostics ?? pkg.diagnostics,
    updatedAt: nowIso(),
  };
  const status = patch.status ?? resolveScreenplayStatus(next);
  next.status = status;
  if (status !== 'confirmed') {
    next.confirmedAt = undefined;
  }
  return next;
}

export function confirmScreenplayPackage(pkg: ScreenplayPackage): ScreenplayPackage {
  const text = screenplayFullText(pkg).trim();
  if (!text) {
    return touchScreenplayPackage(pkg, {
      status: 'drafting',
      diagnostics: [
        ...(pkg.diagnostics ?? []).filter((d) => d.code !== 'empty-screenplay'),
        {
          level: 'error',
          code: 'empty-screenplay',
          message: '成稿正文为空，无法确认',
        },
      ],
    });
  }
  return {
    ...pkg,
    status: 'confirmed',
    confirmedAt: nowIso(),
    updatedAt: nowIso(),
    diagnostics: (pkg.diagnostics ?? []).filter((d) => d.code !== 'empty-screenplay'),
  };
}

/** 确认后编辑正文：自动回退 drafting */
export function unconfirmIfEdited(pkg: ScreenplayPackage): ScreenplayPackage {
  if (pkg.status !== 'confirmed') return pkg;
  return {
    ...pkg,
    status: 'drafting',
    confirmedAt: undefined,
    updatedAt: nowIso(),
  };
}

export function buildScreenplayMeta(blockId: string, pkg: ScreenplayPackage) {
  return {
    type: 'screenplay-package' as const,
    packageId: blockId,
    status: pkg.status,
    title: pkg.brief.title || pkg.screenplay.episodes[0]?.title || '',
    episodeCount: pkg.screenplay.episodes.length,
    characterDraftCount: pkg.bible.characters.length,
    sceneDraftCount: pkg.bible.scenes.length,
  };
}

/** 去掉模型 JSON 泄漏进标题的尾巴：`第1集",` / `第3集 xx","bodyMd":"...` */
export function cleanEpisodeTitle(raw: string, index: number): string {
  let t = String(raw ?? '').trim();
  if (!t) return `第${index}集`;
  const bodyLeak = t.search(/"\s*,\s*"bodyMd"\s*:/i);
  if (bodyLeak >= 0) t = t.slice(0, bodyLeak);
  t = t.replace(/^["'“”]+/, '').replace(/["'“”,，\s]+$/g, '').trim();
  // 标题里误带整段正文时，只保留首行短标题
  const firstLine = t.split(/\r?\n/)[0]?.trim() ?? t;
  if (firstLine.length > 80 && /【场景|场景：|"bodyMd"/i.test(firstLine)) {
    const m = firstLine.match(/^第\s*[一二三四五六七八九十百千\d]+\s*集\s*[·\-—:]?\s*(.*)$/);
    if (m) {
      const rest = m[1].replace(/["'“”,，].*$/, '').trim();
      return rest ? `第${index}集 ${rest}`.trim() : `第${index}集`;
    }
    return `第${index}集`;
  }
  return firstLine || `第${index}集`;
}

function unescapeJsonString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/** 修复已被 JSON 泄漏污染的分集 title/bodyMd（兼容旧错误数据） */
export function normalizeScreenplayEpisode(ep: ScreenplayEpisode): ScreenplayEpisode {
  let title = String(ep.title ?? '');
  let bodyMd = String(ep.bodyMd ?? '');

  const leakAt = title.search(/"\s*,\s*"bodyMd"\s*:/i);
  if (leakAt >= 0) {
    const after = title.slice(leakAt).match(/"\s*,\s*"bodyMd"\s*:\s*"((?:[^"\\]|\\.)*)"/i)
      ?? title.slice(leakAt).match(/"\s*,\s*"bodyMd"\s*:\s*"([\s\S]*)$/i);
    if (after?.[1]) {
      let extracted = unescapeJsonString(after[1]);
      extracted = extracted.replace(/"\s*\}\s*,?\s*$/, '').replace(/"\s*$/, '').trim();
      if (extracted && extracted.length >= bodyMd.trim().length) bodyMd = extracted;
    }
    title = title.slice(0, leakAt);
  }

  // 正文里夹着 "bodyMd":"..."（整段 JSON 或切片残留）
  if (/"bodyMd"\s*:/i.test(bodyMd)) {
    const trimmedBody = bodyMd.trim();
    if (/^\s*\{/.test(trimmedBody)) {
      try {
        const start = trimmedBody.indexOf('{');
        const end = trimmedBody.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const parsed = JSON.parse(trimmedBody.slice(start, end + 1)) as Record<string, unknown>;
          const fromJson = String(parsed.bodyMd ?? parsed.body ?? parsed.text ?? '').trim();
          if (fromJson) {
            bodyMd = fromJson;
            if (!title.trim() || /"bodyMd"|^\s*\{|"\s*,/.test(title)) {
              title = String(parsed.title ?? title);
            }
          }
        }
      } catch {
        /* fall through to regex */
      }
    }
    if (/"bodyMd"\s*:/i.test(bodyMd)) {
      const m = bodyMd.match(/"bodyMd"\s*:\s*"((?:[^"\\]|\\.)*)"/i)
        ?? bodyMd.match(/"bodyMd"\s*:\s*"([\s\S]*)$/i);
      if (m?.[1]) {
        let extracted = unescapeJsonString(m[1]);
        extracted = extracted.replace(/"\s*\}\s*,?\s*$/, '').replace(/"\s*$/, '').trim();
        if (extracted.length > 0) bodyMd = extracted;
      }
      const tm = String(ep.bodyMd ?? '').match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
      if (tm?.[1] && (!title.trim() || /"|,/.test(title))) {
        title = unescapeJsonString(tm[1]);
      }
    }
  }

  title = cleanEpisodeTitle(title, ep.index);
  // 正文仍以「第N集…」开头时去掉标题行，避免与 summary 重复
  const headerRe = new RegExp(
    `^第\\s*${ep.index}\\s*集[^\\n]*\\n+`,
  );
  bodyMd = bodyMd.replace(headerRe, '').trim();
  if (bodyMd.startsWith(title) && bodyMd.length > title.length) {
    const rest = bodyMd.slice(title.length).replace(/^[\s"“”',，]+/, '');
    if (rest.length > 20) bodyMd = rest;
  }

  return {
    ...ep,
    title,
    bodyMd,
  };
}

export function normalizeScreenplayEpisodes(episodes: ScreenplayEpisode[]): ScreenplayEpisode[] {
  return episodes.map((ep) => normalizeScreenplayEpisode(ep));
}

function tryParseJsonValue(source: string): unknown | null {
  const trimmed = source.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* continue */
    }
  }
  const a0 = trimmed.indexOf('[');
  const a1 = trimmed.lastIndexOf(']');
  if (a0 >= 0 && a1 > a0) {
    try {
      return JSON.parse(trimmed.slice(a0, a1 + 1));
    } catch {
      /* continue */
    }
  }
  return null;
}

function episodesFromJsonPayload(payload: unknown, stamp: string): ScreenplayEpisode[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const screenplay = root.screenplay as Record<string, unknown> | undefined;
  const list = (
    Array.isArray(screenplay?.episodes)
      ? screenplay.episodes
      : Array.isArray(root.episodes)
        ? root.episodes
        : Array.isArray(payload)
          ? payload
          : null
  ) as unknown[] | null;
  if (!list?.length) return null;

  const episodes: ScreenplayEpisode[] = [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const bodyMd = String(r.bodyMd ?? r.body ?? r.text ?? r.content ?? '').trim();
    const titleRaw = String(r.title ?? r.name ?? '').trim();
    if (!bodyMd && !titleRaw) continue;
    const index = Number(r.index) > 0 ? Number(r.index) : episodes.length + 1;
    episodes.push({
      id: String(r.id ?? '').trim() || makeId(`ep-${index}`),
      index,
      title: cleanEpisodeTitle(titleRaw || `第${index}集`, index),
      bodyMd: bodyMd || titleRaw,
      updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : stamp,
    });
  }
  if (!episodes.length) return null;
  return episodes
    .sort((a, b) => a.index - b.index)
    .map((ep, i) => ({ ...ep, index: i + 1 }));
}

export function episodesFromIngestText(
  sourceText: string,
  opts?: { episodeCount?: number; sourceType?: ScreenplayPackage['screenplay']['sourceType'] },
): ScreenplayEpisode[] {
  const source = sourceText.trim();
  if (!source) return [];
  const stamp = nowIso();

  // 模型常无视「纯文本」要求，直接回 JSON patch —— 优先按分集字段解析
  if (/^\s*[{\[]/.test(source) || /```json|"bodyMd"\s*:|"episodes"\s*:/i.test(source)) {
    const parsed = tryParseJsonValue(source);
    const fromJson = episodesFromJsonPayload(parsed, stamp);
    if (fromJson?.length) return normalizeScreenplayEpisodes(fromJson);
  }

  const marker = /第\s*([一二三四五六七八九十百千\d]+)\s*集[^\n]*/g;
  const matches = [...source.matchAll(marker)];
  if (matches.length > 0) {
    return normalizeScreenplayEpisodes(matches.map((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? source.length;
      const chunk = source.slice(start, end).trim();
      const header = match[0].trim();
      const title = cleanEpisodeTitle(header, index + 1);
      let bodyMd = chunk;
      if (bodyMd.startsWith(header)) {
        bodyMd = bodyMd.slice(header.length).trim();
      } else {
        bodyMd = bodyMd.replace(/^[^\n]*\n+/, '').trim() || bodyMd;
      }
      return {
        id: makeId(`ep-${index + 1}`),
        index: index + 1,
        title,
        bodyMd: bodyMd || chunk,
        updatedAt: stamp,
      };
    }));
  }
  const count = Math.max(1, Math.min(50, opts?.episodeCount ?? 1));
  if (count === 1) {
    return [{
      id: makeId('ep-1'),
      index: 1,
      title: '第1集',
      bodyMd: source,
      updatedAt: stamp,
    }];
  }
  const size = Math.ceil(source.length / count);
  const episodes: ScreenplayEpisode[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * size;
    const body = source.slice(start, start + size).trim();
    if (!body) continue;
    episodes.push({
      id: makeId(`ep-${i + 1}`),
      index: episodes.length + 1,
      title: `第${episodes.length + 1}集`,
      bodyMd: body,
      updatedAt: stamp,
    });
  }
  return episodes.length ? episodes : [{
    id: makeId('ep-1'),
    index: 1,
    title: '第1集',
    bodyMd: source,
    updatedAt: stamp,
  }];
}

export function ingestTextToPackage(
  pkg: ScreenplayPackage,
  sourceText: string,
  opts?: {
    sourceType?: ScreenplayPackage['screenplay']['sourceType'];
    title?: string;
    episodeCount?: number;
  },
): ScreenplayPackage {
  const episodes = episodesFromIngestText(sourceText, {
    episodeCount: opts?.episodeCount ?? pkg.brief.episodeCount,
    sourceType: opts?.sourceType,
  });
  return touchScreenplayPackage(pkg, {
    status: 'drafting',
    brief: {
      ...pkg.brief,
      title: opts?.title ?? pkg.brief.title,
      episodeCount: episodes.length || pkg.brief.episodeCount,
    },
    screenplay: {
      episodes,
      sourceType: opts?.sourceType ?? 'pasted',
    },
  });
}

const CHAR_LEAD_IDENTITY_RE =
  /主角|女主|男主|主人公|主视角|protagonist|heroine|leading|\bmain\b|\bhero\b/i;
const CHAR_SUPPORT_IDENTITY_RE = /配角|supporting|\bsupport\b/i;

/** 角色身份键：canonical name + 括号拆出的别名 + aliases 字段（小写） */
function characterDraftKeys(draft: ScreenplayCharacterDraft): string[] {
  const split = splitCharacterDisplayName(draft.name);
  const keys = [
    draft.name,
    split.name,
    ...(draft.aliases ?? []),
    ...split.aliases,
  ]
    .map((k) => k?.trim().toLowerCase())
    .filter((k): k is string => Boolean(k));
  return [...new Set(keys)];
}

function preferCharacterIdentity(a?: string, b?: string): string | undefined {
  const aLead = CHAR_LEAD_IDENTITY_RE.test(a ?? '');
  const bLead = CHAR_LEAD_IDENTITY_RE.test(b ?? '');
  if (aLead && !bLead) return (a || b) || undefined;
  if (bLead && !aLead) return (b || a) || undefined;
  return (a || b) || undefined;
}

/**
 * 合并两条同人 draft 时选 canonical 名：
 * - 若一方姓名落在另一方 aliases 中，保留非别名方
 * - 否则优先 identity 标主角的一方；再否则保留先出现的（prev）
 */
function preferCanonicalCharacterName(
  prev: ScreenplayCharacterDraft,
  item: ScreenplayCharacterDraft,
): { name: string; extraAliases: string[] } {
  const a = prev.name.trim();
  const b = item.name.trim();
  if (!b || a === b) return { name: a || b, extraAliases: [] };
  if (!a) return { name: b, extraAliases: [] };

  const aAliases = new Set((prev.aliases ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean));
  const bAliases = new Set((item.aliases ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean));

  if (aAliases.has(b.toLowerCase())) return { name: a, extraAliases: [b] };
  if (bAliases.has(a.toLowerCase())) return { name: b, extraAliases: [a] };

  const aLead = CHAR_LEAD_IDENTITY_RE.test(prev.identity ?? '');
  const bLead = CHAR_LEAD_IDENTITY_RE.test(item.identity ?? '');
  if (bLead && !aLead) return { name: b, extraAliases: [a] };
  return { name: a, extraAliases: [b] };
}

function mergeTwoCharacterDrafts(
  prev: ScreenplayCharacterDraft,
  item: ScreenplayCharacterDraft,
): ScreenplayCharacterDraft {
  const { name, extraAliases } = preferCanonicalCharacterName(prev, item);
  return {
    ...item,
    ...prev,
    id: prev.id || item.id,
    name,
    aliases: uniqAliases(prev.aliases, item.aliases, extraAliases),
    identity: preferCharacterIdentity(prev.identity, item.identity),
    appearance: prev.appearance || item.appearance,
    personality: prev.personality || item.personality,
    relationships: prev.relationships || item.relationships,
    background: prev.background || item.background,
    goal: prev.goal || item.goal,
    voiceNotes: prev.voiceNotes || item.voiceNotes,
    fixedVisualKeywords: prev.fixedVisualKeywords || item.fixedVisualKeywords,
    libraryStatus: prev.libraryStatus || item.libraryStatus,
    libraryCharacterId: prev.libraryCharacterId || item.libraryCharacterId,
  };
}

/**
 * 合并角色 draft：按「真名 + 别名」身份去重，而非仅精确姓名。
 * 例：`李稳` 与 `李稳 (化名陈默)` / 独立条目 `陈默` 会合成一条。
 * existing 在前，已有非空字段优先保留。
 */
export function mergeCharacterDrafts(
  existing: ScreenplayCharacterDraft[],
  incoming: ScreenplayCharacterDraft[],
): ScreenplayCharacterDraft[] {
  const result: ScreenplayCharacterDraft[] = [];

  const findMatchIndex = (draft: ScreenplayCharacterDraft): number => {
    const keys = new Set(characterDraftKeys(draft));
    return result.findIndex((r) => characterDraftKeys(r).some((k) => keys.has(k)));
  };

  for (const raw of [...existing, ...incoming]) {
    const item = characterDraftFromPartial(raw);
    if (!item.name.trim()) continue;
    const idx = findMatchIndex(item);
    if (idx < 0) {
      result.push(item);
      continue;
    }
    result[idx] = mergeTwoCharacterDrafts(result[idx], item);
  }
  return result;
}

/** 单列表内按身份去重（抽取结果清洗 / 修复历史脏 Bible） */
export function dedupeCharacterDrafts(
  drafts: ScreenplayCharacterDraft[],
): ScreenplayCharacterDraft[] {
  return mergeCharacterDrafts([], drafts);
}

/** 清洗 Bible 角色：拆括号别名并合并同人重复项；无变化时返回原 pkg */
export function normalizeScreenplayBibleCharacters(
  pkg: ScreenplayPackage,
): ScreenplayPackage {
  const characters = dedupeCharacterDrafts(pkg.bible.characters);
  if (
    characters.length === pkg.bible.characters.length
    && characters.every((c, i) => {
      const prev = pkg.bible.characters[i];
      return (
        c.id === prev.id
        && c.name === prev.name
        && JSON.stringify(c.aliases ?? []) === JSON.stringify(prev.aliases ?? [])
        && (c.identity ?? '') === (prev.identity ?? '')
      );
    })
  ) {
    return pkg;
  }
  return touchScreenplayPackage(pkg, {
    bible: { ...pkg.bible, characters },
  });
}

export function mergeSceneDrafts(
  existing: ScreenplaySceneDraft[],
  incoming: ScreenplaySceneDraft[],
): ScreenplaySceneDraft[] {
  const byName = new Map<string, ScreenplaySceneDraft>();
  for (const item of existing) {
    byName.set(item.name.trim(), item);
  }
  for (const item of incoming) {
    const key = item.name.trim();
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, item);
      continue;
    }
    byName.set(key, {
      ...item,
      ...prev,
      id: prev.id || item.id,
      name: prev.name || item.name,
      code: prev.code || item.code,
      summary: prev.summary || item.summary,
      era: prev.era || item.era,
      location: prev.location || item.location,
      dramaticFunction: prev.dramaticFunction || item.dramaticFunction,
      sensoryNotes: prev.sensoryNotes || item.sensoryNotes,
      libraryStatus: prev.libraryStatus || item.libraryStatus,
      libraryEnvironmentId: prev.libraryEnvironmentId || item.libraryEnvironmentId,
    });
  }
  return [...byName.values()];
}

/**
 * 从展示名拆出 canonical name + 括号别名。
 * 例：`苏黛 (化名苏曼)` → { name: '苏黛', aliases: ['苏曼'] }
 *     `李稳（首集作陈默）` → { name: '李稳', aliases: ['陈默'] }
 */
export function splitCharacterDisplayName(raw: string): { name: string; aliases: string[] } {
  const text = String(raw ?? '').trim();
  if (!text) return { name: '', aliases: [] };
  const m = text.match(
    /^(.+?)\s*[（(]\s*(?:化名|又名|别名|曾用名|首集作|首现作|饰)?\s*([^）)]+?)\s*[）)]\s*$/,
  );
  if (!m) return { name: text, aliases: [] };
  const name = m[1].trim();
  const aliases = String(m[2] ?? '')
    .split(/[,，、;/|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((a) => a !== name);
  return { name: name || text, aliases };
}

function uniqAliases(...lists: Array<string[] | undefined>): string[] | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list ?? []) {
      const v = item.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }
  return out.length ? out : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRoleIdentity(identity: string | undefined, role: 'main' | 'support'): string {
  const roleLabel = role === 'main' ? '主角' : '配角';
  const source = String(identity ?? '').trim();
  if (!source) return roleLabel;
  const stripped = source
    .replace(
      /主角|女主|男主|主人公|主视角|protagonist|heroine|leading|\bmain\b|\bhero\b|配角|supporting|\bsupport\b/gi,
      '',
    )
    .replace(/[·•|,，;；]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped ? `${roleLabel} · ${stripped}` : roleLabel;
}

function countRegexHits(source: string, re: RegExp): number {
  let total = 0;
  for (const _m of source.matchAll(re)) total++;
  return total;
}

/**
 * 依据正文证据校准角色主/配角标注，减少模型抽取波动。
 * 规则：
 * - 明确「配角」优先级最高（不会被提到次数抬成主角）
 * - 明确「主角」直接保留主角
 * - 其余按对白行命中 + 文本命中打分，主角数量收敛到少量（通常 1~3）
 */
export function calibrateCharacterRolesByScreenplay(
  drafts: ScreenplayCharacterDraft[],
  screenplayText: string,
): ScreenplayCharacterDraft[] {
  const text = String(screenplayText ?? '');
  if (!drafts.length) return drafts;

  const scored = drafts.map((draft, index) => {
    const keys = [draft.name, ...(draft.aliases ?? [])]
      .map((k) => k.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    let mentionHits = 0;
    let dialogueHits = 0;
    for (const key of keys) {
      const esc = escapeRegExp(key);
      mentionHits += countRegexHits(text, new RegExp(esc, 'g'));
      dialogueHits += countRegexHits(text, new RegExp(`^\\s*${esc}(?:（[^）]{0,20}）)?\\s*[:：]`, 'gm'));
    }

    const identity = draft.identity ?? '';
    const explicitSupport = CHAR_SUPPORT_IDENTITY_RE.test(identity);
    const explicitLead = CHAR_LEAD_IDENTITY_RE.test(identity);
    const score =
      (explicitLead ? 120 : 0) -
      (explicitSupport ? 120 : 0) +
      Math.min(mentionHits, 30) * 2 +
      Math.min(dialogueHits, 20) * 8;

    return { draft, index, mentionHits, dialogueHits, explicitLead, explicitSupport, score };
  });

  const explicitMain = scored.filter((x) => x.explicitLead && !x.explicitSupport);
  const explicitSupportIds = new Set(
    scored.filter((x) => x.explicitSupport).map((x) => x.draft.id),
  );
  // 主角人数收敛：小体量至少允许双主（常见双核），总体不超过 3。
  const maxMain = Math.min(3, Math.max(1, Math.ceil(drafts.length * 0.35)));

  const winners = new Set<string>(explicitMain.map((x) => x.draft.id));
  const room = Math.max(0, maxMain - winners.size);
  if (room > 0) {
    const candidates = scored
      .filter((x) => !explicitSupportIds.has(x.draft.id) && !winners.has(x.draft.id))
      .filter((x) => x.dialogueHits >= 2 || x.mentionHits >= 4)
      .sort((a, b) => b.score - a.score || b.dialogueHits - a.dialogueHits || a.index - b.index);
    for (const item of candidates.slice(0, room)) winners.add(item.draft.id);
  }
  if (winners.size === 0) {
    const best = scored
      .filter((x) => !explicitSupportIds.has(x.draft.id))
      .sort((a, b) => b.score - a.score || b.dialogueHits - a.dialogueHits || a.index - b.index)[0];
    if (best && (best.dialogueHits >= 2 || best.mentionHits >= 4)) winners.add(best.draft.id);
  }

  return scored.map(({ draft }) => {
    const role: 'main' | 'support' =
      explicitSupportIds.has(draft.id) ? 'support' : (winners.has(draft.id) ? 'main' : 'support');
    return {
      ...draft,
      identity: normalizeRoleIdentity(draft.identity, role),
    };
  });
}

export function characterDraftFromPartial(
  input: Partial<ScreenplayCharacterDraft> & { name: string },
  ): ScreenplayCharacterDraft {
  const split = splitCharacterDisplayName(input.name);
  return {
    id: input.id || makeId('char'),
    name: split.name,
    aliases: uniqAliases(input.aliases, split.aliases),
    identity: input.identity,
    appearance: input.appearance,
    personality: input.personality,
    relationships: input.relationships,
    background: input.background,
    goal: input.goal,
    voiceNotes: input.voiceNotes,
    fixedVisualKeywords: input.fixedVisualKeywords,
    libraryStatus: input.libraryStatus ?? 'draft',
    libraryCharacterId: input.libraryCharacterId,
  };
}

export function sceneDraftFromPartial(
  input: Partial<ScreenplaySceneDraft> & { name: string },
): ScreenplaySceneDraft {
  return {
    id: input.id || makeId('scene'),
    name: input.name.trim(),
    code: input.code,
    summary: input.summary,
    era: input.era,
    location: input.location,
    dramaticFunction: input.dramaticFunction,
    sensoryNotes: input.sensoryNotes,
    libraryStatus: input.libraryStatus ?? 'draft',
    libraryEnvironmentId: input.libraryEnvironmentId,
  };
}

/** 从 extractAssets / 旧 breakdown 规范化为 Bible draft */
export function bibleDraftsFromExtract(input: {
  characters?: Array<Record<string, unknown>>;
  locations?: string[];
  /** 兼容 extract-assets skill 的 environments 字段（string 或 {name/location}） */
  environments?: Array<string | Record<string, unknown>>;
  scenes?: Array<Record<string, unknown>>;
}): Pick<ScreenplayBible, 'characters' | 'scenes'> {
  const characters = (input.characters ?? [])
    .map((raw) => {
      const name = String(raw.name ?? '').trim();
      if (!name) return null;
      const bible = (raw.bible && typeof raw.bible === 'object')
        ? raw.bible as Record<string, unknown>
        : {};
      // LLM 可能输出别名字段的不同命名（aliases / alias；以及是否在 bible 下）
      const aliasesRaw = raw.aliases ?? raw.alias ?? bible.aliases ?? bible.alias;
      const aliases = Array.isArray(aliasesRaw)
        ? aliasesRaw.map((a) => String(a).trim()).filter(Boolean)
        : typeof aliasesRaw === 'string'
          ? aliasesRaw
              .split(/[,，、;/|]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : String(aliasesRaw ?? '')
              .split(/[,，、;/|]/)
              .map((s) => s.trim())
              .filter(Boolean);
      return characterDraftFromPartial({
        name,
        aliases: aliases.length ? aliases : undefined,
        identity: String(raw.identity ?? bible.identity ?? raw.archetype ?? '').trim() || undefined,
        appearance: String(raw.appearance ?? bible.appearance ?? raw.description ?? '').trim() || undefined,
        personality: String(raw.personality ?? bible.personality ?? raw.traits ?? '').trim() || undefined,
        relationships: String(raw.relationships ?? bible.relationships ?? '').trim() || undefined,
        background: String(raw.background ?? bible.background ?? '').trim() || undefined,
        goal: String(raw.goal ?? '').trim() || undefined,
        voiceNotes: String(raw.voiceNotes ?? bible.voice ?? '').trim() || undefined,
        fixedVisualKeywords: String(raw.fixedVisualKeywords ?? '').trim() || undefined,
      });
    })
    .filter((item): item is ScreenplayCharacterDraft => Boolean(item));

  const envNames = (input.environments ?? [])
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        return String((item as Record<string, unknown>).name
          ?? (item as Record<string, unknown>).location
          ?? (item as Record<string, unknown>).title
          ?? '').trim();
      }
      return '';
    })
    .filter(Boolean);

  const sceneFromLocations = [...(input.locations ?? []), ...envNames]
    .map((name) => String(name).trim())
    .filter(Boolean)
    .map((name) => sceneDraftFromPartial({ name, location: name }));

  const sceneFromObjects = (input.scenes ?? [])
    .map((raw) => {
      const name = String(raw.name ?? raw.location ?? '').trim();
      if (!name) return null;
      return sceneDraftFromPartial({
        name,
        code: String(raw.code ?? raw.sceneCode ?? '').trim() || undefined,
        summary: String(raw.summary ?? raw.description ?? '').trim() || undefined,
        location: String(raw.location ?? name).trim() || undefined,
        era: String(raw.era ?? '').trim() || undefined,
        dramaticFunction: String(raw.dramaticFunction ?? '').trim() || undefined,
        sensoryNotes: String(raw.sensoryNotes ?? '').trim() || undefined,
      });
    })
    .filter((item): item is ScreenplaySceneDraft => Boolean(item));

  return {
    // 抽取常把同人拆成「李稳」+「李稳 (化名陈默)」或独立「陈默」——按身份合并
    characters: dedupeCharacterDrafts(characters),
    scenes: mergeSceneDrafts(sceneFromLocations, sceneFromObjects),
  };
}

/**
 * 从成稿正文解析场景 draft（不依赖 LLM）。
 * 支持标准场头 `## S01 | 内景 · 地点 | 时间`，以及遗留 `【场景：…】`。
 */
export function sceneDraftsFromScreenplayText(sourceText: string): ScreenplaySceneDraft[] {
  const text = String(sourceText ?? '');
  if (!text.trim()) return [];
  const byName = new Map<string, ScreenplaySceneDraft>();

  const standard = /##\s*(S\d+)\s*\|\s*(内景|外景)\s*[·•.\-—]?\s*([^|\n]+?)\s*\|\s*([^\n]+)/gi;
  for (const m of text.matchAll(standard)) {
    const code = String(m[1] ?? '').toUpperCase();
    const interior = String(m[2] ?? '').trim();
    const location = String(m[3] ?? '').trim();
    const time = String(m[4] ?? '').trim();
    const name = location || `${interior}${time ? `·${time}` : ''}`;
    if (!name) continue;
    const prev = byName.get(name);
    if (prev) {
      byName.set(name, {
        ...prev,
        code: prev.code || code,
        summary: prev.summary || [interior, time].filter(Boolean).join(' · '),
        location: prev.location || location,
      });
      continue;
    }
    byName.set(name, sceneDraftFromPartial({
      name,
      code,
      location,
      summary: [interior, time].filter(Boolean).join(' · '),
    }));
  }

  const bracket = /【\s*场景\s*[:：]\s*([^】]+)】/g;
  for (const m of text.matchAll(bracket)) {
    const raw = String(m[1] ?? '').trim();
    if (!raw) continue;
    const parts = raw.split(/[，,·|]/).map((s) => s.trim()).filter(Boolean);
    const name = parts[0] || raw;
    if (!name || byName.has(name)) continue;
    byName.set(name, sceneDraftFromPartial({
      name,
      location: name,
      summary: parts.slice(1).join(' · ') || undefined,
    }));
  }

  // 遗留体例：独立成行的「咖啡厅。白天。」
  const legacyLine = /^(?:场景[:：]?\s*)?([\u4e00-\u9fffA-Za-z0-9「」《》\-—]{2,16})[。．]\s*(白天|傍晚|夜晚|深夜|清晨|上午|下午|雨夜)[。．]?\s*$/gm;
  for (const m of text.matchAll(legacyLine)) {
    const name = String(m[1] ?? '').trim();
    const time = String(m[2] ?? '').trim();
    if (!name || byName.has(name)) continue;
    if (/^(第[一二三四五六七八九十百千\d]+集|旁白|内景|外景)$/.test(name)) continue;
    byName.set(name, sceneDraftFromPartial({
      name,
      location: name,
      summary: time || undefined,
    }));
  }

  return [...byName.values()];
}

/** 用成稿场头回填 bible.scenes（保留已有 draft，只合并增量） */
export function enrichBibleScenesFromPackage(pkg: ScreenplayPackage): ScreenplayPackage {
  const fromText = sceneDraftsFromScreenplayText(screenplayFullText(pkg));
  if (fromText.length === 0) return pkg;
  return touchScreenplayPackage(pkg, {
    bible: {
      world: pkg.bible.world,
      characters: pkg.bible.characters,
      scenes: mergeSceneDrafts(pkg.bible.scenes, fromText),
    },
  });
}

export function bibleDraftsFromBreakdown(
  payload: ScriptBreakdownPayload | undefined,
): Pick<ScreenplayBible, 'characters' | 'scenes' | 'world'> {
  if (!payload) return { characters: [], scenes: [] };
  const characters = (payload.characters ?? []).map((c) => characterDraftFromPartial({
    name: c.name,
    identity: c.identity,
    appearance: c.appearance,
    personality: c.personality,
    relationships: c.relationships,
    goal: c.goal,
    fixedVisualKeywords: c.fixedVisualKeywords,
  }));
  const sceneNames = new Map<string, ScreenplaySceneDraft>();
  for (const ep of payload.episodes) {
    for (const scene of ep.scenes ?? []) {
      const name = (scene.location || scene.code || '').trim();
      if (!name || sceneNames.has(name)) continue;
      sceneNames.set(name, sceneDraftFromPartial({
        name,
        code: scene.code,
        location: scene.location,
        summary: scene.summary,
      }));
    }
    for (const shot of ep.shots) {
      const name = (shot.scene || '').trim();
      if (!name || sceneNames.has(name)) continue;
      sceneNames.set(name, sceneDraftFromPartial({ name, location: name }));
    }
  }
  const world = payload.storyAnalysis?.background
    ? {
        era: payload.storyAnalysis.background.era,
        location: payload.storyAnalysis.background.location,
        worldview: payload.storyAnalysis.background.worldview,
        visualStyleNotes: payload.storyAnalysis.visualStyle,
      }
    : undefined;
  return {
    characters,
    scenes: [...sceneNames.values()],
    world,
  };
}

/** 旧 dialogue-sheet 节点 data → ScreenplayPackage */
export function migrateDialogueSheetDataToPackage(
  data: Record<string, unknown> | undefined | null,
): ScreenplayPackage {
  if (isScreenplayPackage(data?.package)) {
    return data.package as ScreenplayPackage;
  }

  let pkg = emptyScreenplayPackage();
  const directorBrief = String(data?.directorBrief ?? '').trim();
  if (directorBrief) {
    pkg = touchScreenplayPackage(pkg, {
      brief: { ...pkg.brief, notes: directorBrief },
    });
  }

  const sourceEpisodes = Array.isArray(data?.sourceEpisodes) ? data!.sourceEpisodes as Array<Record<string, unknown>> : [];
  if (sourceEpisodes.length > 0) {
    const episodes: ScreenplayEpisode[] = sourceEpisodes
      .map((row, i) => {
        const text = String(row.text ?? '').trim();
        if (!text) return null;
        return {
          id: String(row.id || makeId(`ep-${i + 1}`)),
          index: i + 1,
          title: String(row.title || `第${i + 1}集`).trim() || `第${i + 1}集`,
          bodyMd: text,
          updatedAt: String(row.updatedAt || nowIso()),
        } satisfies ScreenplayEpisode;
      })
      .filter((item): item is ScreenplayEpisode => Boolean(item));
    if (episodes.length) {
      pkg = touchScreenplayPackage(pkg, {
        screenplay: { episodes, sourceType: 'pasted' },
        brief: { ...pkg.brief, episodeCount: episodes.length },
      });
    }
  } else {
    const legacy = String(data?.sourceText ?? data?.content ?? '').trim();
    if (legacy) {
      pkg = ingestTextToPackage(pkg, legacy, { sourceType: 'pasted' });
    }
  }

  const breakdown = data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
  if (breakdown?.version === 1) {
    const fromBd = bibleDraftsFromBreakdown(breakdown);
    pkg = touchScreenplayPackage(pkg, {
      brief: {
        ...pkg.brief,
        title: pkg.brief.title || breakdown.title || breakdown.storyAnalysis?.title,
        logline: pkg.brief.logline || breakdown.storyAnalysis?.coreTheme,
      },
      bible: {
        world: fromBd.world ?? pkg.bible.world,
        characters: mergeCharacterDrafts(pkg.bible.characters, fromBd.characters),
        scenes: mergeSceneDrafts(pkg.bible.scenes, fromBd.scenes),
      },
    });
    if (pkg.screenplay.episodes.length === 0 && breakdown.episodes?.length) {
      pkg = touchScreenplayPackage(pkg, {
        screenplay: {
          sourceType: 'mixed',
          episodes: breakdown.episodes.map((ep, i) => ({
            id: ep.id || makeId(`ep-${i + 1}`),
            index: ep.index || i + 1,
            title: ep.title || `第${i + 1}集`,
            bodyMd: ep.shots.map((s) => s.scriptText || s.action || s.visual || '').filter(Boolean).join('\n\n'),
            updatedAt: nowIso(),
          })),
        },
      });
    }
  }

  return touchScreenplayPackage(pkg);
}

export function applyPackagePatch(
  pkg: ScreenplayPackage,
  patch: Partial<ScreenplayPackage> | Record<string, unknown>,
): ScreenplayPackage {
  const p = patch as Partial<ScreenplayPackage>;
  const nextBrief = p.brief ? { ...pkg.brief, ...p.brief } : pkg.brief;
  const nextBible = p.bible
    ? {
        world: p.bible.world ? { ...pkg.bible.world, ...p.bible.world } : pkg.bible.world,
        characters: p.bible.characters
          ? mergeCharacterDrafts(pkg.bible.characters, p.bible.characters)
          : pkg.bible.characters,
        scenes: p.bible.scenes
          ? mergeSceneDrafts(pkg.bible.scenes, p.bible.scenes)
          : pkg.bible.scenes,
      }
    : pkg.bible;
  const rawPatch = patch as Record<string, unknown>;
  const nextScreenplay = p.screenplay
    ? {
        sourceType: p.screenplay.sourceType ?? pkg.screenplay.sourceType,
        episodes: p.screenplay.episodes == null
          ? pkg.screenplay.episodes
          : rawPatch.episodesMergeMode === 'upsert'
            ? upsertScreenplayEpisodes(pkg.screenplay.episodes, p.screenplay.episodes)
            : p.screenplay.episodes,
      }
    : pkg.screenplay;
  let next = touchScreenplayPackage(pkg, {
    brief: nextBrief,
    bible: nextBible,
    screenplay: nextScreenplay,
    diagnostics: p.diagnostics ?? pkg.diagnostics,
  });
  if (pkg.status === 'confirmed') {
    next = unconfirmIfEdited(next);
  }
  return next;
}

/** 1.1: 按 id/index upsert 单集增量，避免整表覆盖擦掉并发编辑 */
function upsertScreenplayEpisodes(
  base: ScreenplayEpisode[],
  incoming: ScreenplayEpisode[],
): ScreenplayEpisode[] {
  const result = [...base];
  for (const patchEp of incoming) {
    const baseIdx = result.findIndex(
      (ep) => ep.id === patchEp.id || ep.index === patchEp.index,
    );
    if (baseIdx >= 0) {
      result[baseIdx] = {
        ...result[baseIdx],
        ...patchEp,
        id: result[baseIdx].id,
        index: result[baseIdx].index,
        updatedAt: patchEp.updatedAt ?? result[baseIdx].updatedAt,
      };
    } else {
      result.push({ ...patchEp });
    }
  }
  return result.sort((a, b) => a.index - b.index);
}

/** F-03: 对比 package 与 patch，生成供用户确认的变更摘要列表 */

/** E-01: 删除指定集并重排 index（1 起始） */
export function removeScreenplayEpisode(
  pkg: ScreenplayPackage,
  episodeId: string,
): ScreenplayPackage {
  const episodes = pkg.screenplay.episodes
    .filter((ep) => ep.id !== episodeId)
    .sort((a, b) => a.index - b.index)
    .map((ep, i) => ({ ...ep, index: i + 1 }));
  return touchScreenplayPackage(pkg, {
    screenplay: { ...pkg.screenplay, episodes },
  });
}

/** E-02: 在指定集后插入空集并重排 index（1 起始） */
export function insertEmptyEpisodeAfter(
  pkg: ScreenplayPackage,
  afterEpisodeId: string | null,
): ScreenplayPackage {
  const stamp = nowIso();
  const episodes: ScreenplayEpisode[] = [];
  let idx = 0;
  for (const ep of pkg.screenplay.episodes) {
    episodes.push({ ...ep, index: ++idx });
    if (ep.id === afterEpisodeId) {
      episodes.push({
        id: makeId('ep'),
        index: ++idx,
        title: '',
        bodyMd: '',
        updatedAt: stamp,
      });
    }
  }
  if (afterEpisodeId === null && pkg.screenplay.episodes.length === 0) {
    episodes.push({
      id: makeId('ep'),
      index: 1,
      title: '',
      bodyMd: '',
      updatedAt: stamp,
    });
  }
  return touchScreenplayPackage(pkg, {
    screenplay: { ...pkg.screenplay, episodes },
  });
}

/** D-04: 格式体例 linter —— 纯函数，返回诊断列表 */
export function lintScreenplayFormat(pkg: ScreenplayPackage): ScreenplayDiagnostic[] {
  const diag: ScreenplayDiagnostic[] = [];
  const eps = pkg.screenplay.episodes;
  for (const ep of eps) {
    const body = ep.bodyMd;
    if (!body.trim()) continue;
    if (/【场景/.test(body)) {
      diag.push({
        level: 'warning',
        code: 'legacy-scene-bracket',
        message: `第${ep.index}集出现遗留【场景：】标记，建议替换为标准场头`,
        episodeId: ep.id,
      });
    }
    const dialogueQuote = /[「「""][\u4e00-\u9fff]{1,32}[：:]\s*/gu;
    let dqCount = 0;
    for (const _m of body.matchAll(dialogueQuote)) dqCount++;
    if (dqCount > 0) {
      diag.push({
        level: 'info',
        code: 'quoted-dialogue',
        message: `第${ep.index}集出现 ${dqCount} 处引号对白「"角色：」，建议改为「角色名：台词」无引号格式`,
        episodeId: ep.id,
      });
    }
    if (ep.index < eps.length && /（完）/.test(body)) {
      diag.push({
        level: 'warning',
        code: 'premature-end-marker',
        message: `第${ep.index}集未到末集出现「（完）」结束标记`,
        episodeId: ep.id,
      });
    }
  }
  return diag;
}

/** X-02: 在一集正文中查找并替换文本（返回新 bodyMd） */
export function findReplaceInEpisode(
  bodyMd: string,
  find: string,
  replace: string,
): { bodyMd: string; count: number } {
  if (!find) return { bodyMd, count: 0 };
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'g');
  let count = 0;
  const result = bodyMd.replace(re, () => { count++; return replace; });
  return { bodyMd: result, count };
}

/** B-08: 全局角色改名（整词优先）——更新所有集正文 + Bible character drafts */
export function renameCharacterInPackage(
  pkg: ScreenplayPackage,
  oldName: string,
  newName: string,
): ScreenplayPackage {
  if (!oldName.trim() || !newName.trim() || oldName.trim() === newName.trim()) return pkg;
  const old = oldName.trim();
  const nw = newName.trim();
  const escaped = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'g');
  const episodes = pkg.screenplay.episodes.map((ep) => ({
    ...ep,
    bodyMd: ep.bodyMd.replace(re, nw),
    title: ep.title.replace(re, nw),
  }));
  const characters = pkg.bible.characters.map((c) => {
    if (c.name.trim() !== old) return c;
    return {
      ...c,
      name: nw,
      identity: c.identity?.replace(re, nw),
      personality: c.personality?.replace(re, nw),
      appearance: c.appearance?.replace(re, nw),
      relationships: c.relationships?.replace(re, nw),
    };
  });
  return touchScreenplayPackage(pkg, {
    screenplay: { ...pkg.screenplay, episodes },
    bible: { ...pkg.bible, characters },
  });
}

export function summarizePackagePatch(
  pkg: ScreenplayPackage,
  patch: Partial<ScreenplayPackage> | Record<string, unknown>,
): string[] {
  const lines: string[] = [];

  const brief = (patch as ScreenplayPackage).brief;
  if (brief) {
    if (brief.title !== undefined && (brief.title || '') !== (pkg.brief.title || '')) {
      lines.push(`brief.title ← 「${String(brief.title || '').slice(0, 40)}」`);
    }
    if (brief.logline !== undefined && (brief.logline || '') !== (pkg.brief.logline || '')) {
      lines.push(`brief.logline ← 已更新`);
    }
    if (brief.episodeCount !== undefined && brief.episodeCount !== pkg.brief.episodeCount) {
      lines.push(`brief.episodeCount ← ${brief.episodeCount}`);
    }
    if (brief.plotOutline !== undefined && brief.plotOutline !== pkg.brief.plotOutline) {
      lines.push('brief.plotOutline ← 已更新');
    }
    if (brief.hooks && Array.isArray(brief.hooks) && brief.hooks.length !== (pkg.brief.hooks ?? []).length) {
      lines.push(`brief.hooks: ${brief.hooks.length} 条`);
    }
  }

  const bible = (patch as ScreenplayPackage).bible;
  if (bible) {
    const newChars = bible.characters ?? [];
    const oldChars = pkg.bible.characters;
    if (newChars.length > oldChars.length) {
      lines.push(`bible.characters: +${newChars.length - oldChars.length}（共 ${newChars.length}）`);
    } else if (newChars.length < oldChars.length) {
      lines.push(`bible.characters: -${oldChars.length - newChars.length}（共 ${newChars.length}）`);
    } else if (newChars.length > 0) {
      const changed = newChars.filter((c) => {
        const old = oldChars.find((o) => o.id === c.id);
        return old && JSON.stringify(c) !== JSON.stringify(old);
      });
      if (changed.length > 0) lines.push(`bible.characters: ${changed.length} 个已修改`);
    }
    const newScenes = bible.scenes ?? [];
    const oldScenes = pkg.bible.scenes;
    if (newScenes.length > oldScenes.length) {
      lines.push(`bible.scenes: +${newScenes.length - oldScenes.length}（共 ${newScenes.length}）`);
    } else if (newScenes.length < oldScenes.length) {
      lines.push(`bible.scenes: -${oldScenes.length - newScenes.length}（共 ${newScenes.length}）`);
    } else if (newScenes.length > 0) {
      const changed = newScenes.filter((s) => {
        const old = oldScenes.find((o) => o.id === s.id);
        return old && JSON.stringify(s) !== JSON.stringify(old);
      });
      if (changed.length > 0) lines.push(`bible.scenes: ${changed.length} 个已修改`);
    }
    if (bible.world && JSON.stringify(bible.world) !== JSON.stringify(pkg.bible.world)) {
      lines.push('bible.world ← 已更新');
    }
  }

  const screenplay = (patch as ScreenplayPackage).screenplay;
  if (screenplay?.episodes) {
    const oldLen = pkg.screenplay.episodes.length;
    const newLen = screenplay.episodes.length;
    if (newLen > oldLen) {
      lines.push(`episodes: +${newLen - oldLen} 集（共 ${newLen} 集）`);
    } else if (newLen < oldLen) {
      lines.push(`episodes: -${oldLen - newLen} 集（共 ${newLen} 集）`);
    } else {
      lines.push(`episodes: ${newLen} 集（已修改）`);
    }
  }

  const diagnostics = (patch as ScreenplayPackage).diagnostics;
  if (diagnostics && Array.isArray(diagnostics)) {
    lines.push(`diagnostics: ${diagnostics.length} 条`);
  }

  if (lines.length === 0) {
    lines.push('无可见变更');
  }
  return lines;
}

/** 成稿中检索角色/场景摘录（素材库剧本支撑） */
export function extractScreenplayExcerpts(
  pkg: ScreenplayPackage | undefined | null,
  name: string,
  aliases: string[] = [],
  max = 3,
  maxLen = 180,
): string[] {
  if (!pkg || !name.trim()) return [];
  const keys = [name, ...aliases].map((s) => s.trim()).filter(Boolean);
  if (!keys.length) return [];
  const hits: string[] = [];
  for (const ep of pkg.screenplay.episodes) {
    const body = ep.bodyMd;
    if (!body) continue;
    for (const key of keys) {
      let from = 0;
      while (from < body.length && hits.length < max) {
        const idx = body.indexOf(key, from);
        if (idx < 0) break;
        const start = Math.max(0, idx - 40);
        const end = Math.min(body.length, idx + key.length + maxLen);
        const slice = body.slice(start, end).replace(/\s+/g, ' ').trim();
        if (slice && !hits.includes(slice)) hits.push(slice.length > maxLen ? `${slice.slice(0, maxLen)}…` : slice);
        from = idx + key.length;
      }
    }
    if (hits.length >= max) break;
  }
  return hits.slice(0, max);
}

export function buildNarrativeConsistencyDiagnostics(pkg: ScreenplayPackage): ScreenplayDiagnostic[] {
  const diagnostics: ScreenplayDiagnostic[] = [];
  const text = screenplayFullText(pkg);
  const bibleNames = new Set(pkg.bible.characters.map((c) => c.name.trim()).filter(Boolean));
  const mentioned = new Set<string>();
  for (const name of bibleNames) {
    if (text.includes(name)) mentioned.add(name);
  }
  if (pkg.bible.characters.length === 0 && text.replace(/\s+/g, '').length > 200) {
    diagnostics.push({
      level: 'warning',
      code: 'bible-empty-characters',
      message: '成稿较长但 Bible 尚无人物 draft，建议抽取或补全人物',
    });
  }
  if (pkg.bible.scenes.length === 0 && text.replace(/\s+/g, '').length > 200) {
    diagnostics.push({
      level: 'warning',
      code: 'bible-empty-scenes',
      message: '成稿较长但 Bible 尚无场景 draft，建议抽取或补全场景',
    });
  }
  for (const char of pkg.bible.characters) {
    if (!text.includes(char.name)) {
      diagnostics.push({
        level: 'info',
        code: 'character-not-in-screenplay',
        message: `Bible 人物「${char.name}」未在成稿正文中出现`,
        entityId: char.id,
      });
    }
  }
  for (const hook of pkg.brief.hooks ?? []) {
    const h = hook.trim();
    if (h && !text.includes(h.slice(0, Math.min(12, h.length)))) {
      diagnostics.push({
        level: 'info',
        code: 'hook-not-landed',
        message: `爆点「${h.slice(0, 24)}${h.length > 24 ? '…' : ''}」可能未在成稿中落点`,
      });
    }
  }
  if (pkg.bible.world?.era && text && !text.includes(pkg.bible.world.era)) {
    diagnostics.push({
      level: 'info',
      code: 'world-era-unmentioned',
      message: `世界观时代「${pkg.bible.world.era}」未在成稿中直接出现`,
    });
  }
  void mentioned;
  return diagnostics;
}

export interface ScriptDeskSkillPromptPack {
  version: 1;
  skills: Partial<Record<ScriptDeskSkillId, string>>;
}

export function normalizeScriptDeskPrompts(
  input?: Partial<ScriptDeskSkillPromptPack> | null,
): ScriptDeskSkillPromptPack {
  if (!input || typeof input !== 'object' || input.version !== 1) {
    return { version: 1, skills: {} };
  }
  const skills: Partial<Record<ScriptDeskSkillId, string>> = {};
  const allSkills: ScriptDeskSkillId[] = [
    'topic', 'world', 'character', 'plot', 'pacing',
    'dialogue', 'hooks', 'consistency', 'generate', 'ingest',
  ];
  for (const id of allSkills) {
    const val = (input.skills as Record<string, string> | undefined)?.[id]?.trim();
    if (val) skills[id] = val;
  }
  return { version: 1, skills };
}

export const DEFAULT_SCRIPT_DESK_SKILL_PROMPTS: Record<ScriptDeskSkillId, string> = {
  topic: '你是选题策划。输出 JSON patch：{"brief":{"topic":"","logline":"","targetPlatforms":[]}}。不要输出镜头表。',
  world: '你是世界观构建者。输出 JSON patch：{"bible":{"world":{"era":"","location":"","worldview":"","visualStyleNotes":"","rules":[]}}}。不要输出镜头表。',
  character: '你是人物构建者。输出 JSON patch：{"bible":{"characters":[{"name":"","identity":"","appearance":"","personality":"","relationships":"","goal":"","voiceNotes":"","fixedVisualKeywords":""}]}}。叙事层 draft only。不要输出镜头表。',
  plot: '你是剧情构建者。输出 JSON patch：{"brief":{"plotOutline":"","episodeCount":1}}。不要输出镜头表。',
  pacing: '你是节奏构建者。输出 JSON patch：{"brief":{"pacing":"balanced|slow|fast","targetEpisodeDurationSec":90}}。不要输出镜头表。',
  dialogue: '你是对白构建者。改写成稿对白层，输出 JSON：{"patch":{"screenplay":{"episodes":[{"id":"保留或新id","index":1,"title":"","bodyMd":"..."}],"sourceType":"generated"}}}。bodyMd 保持场景头「## S01 | 内景/外景 · 地点 | 时间」；对白「角色名：台词」或「角色名（情绪）：台词」，禁止引号与镜头表。',
  hooks: '你是爆点构建者。输出 JSON patch：{"brief":{"hooks":["钩子1"]}}。不要输出镜头表。',
  consistency: '你是叙事一致性审稿。输出 JSON：{"diagnostics":[{"level":"warning|error|info","code":"","message":""}]}。不要改成稿正文。不要输出镜头表。',
  generate: '你是编剧。根据 brief/bible 生成分集成稿。只输出 JSON：{"patch":{"brief":{"title":""},"screenplay":{"sourceType":"generated","episodes":[{"index":1,"title":"第1集 短标题","bodyMd":"..."}]}},"explanation":""}。bodyMd 体例锁死：场景头必须为「## S01 | 内景/外景 · 地点 | 时间」；对白必须为「角色名：台词」或「角色名（状态）：台词」，禁止引号与【场景：】；禁止镜头表/imagePrompt/非终章（完）；多集体例必须一致并衔接。',
  ingest: '你是成稿解析器。将用户粘贴文本整理为分集正文，输出 JSON patch：{"screenplay":{"sourceType":"pasted","episodes":[{"index":1,"title":"第1集","bodyMd":"..."}]}}。不要输出镜头表。',
};
