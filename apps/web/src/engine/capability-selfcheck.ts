/**
 * 能力自检 · 取数壳层（浏览器侧）。
 *
 * 为什么不用 `@nx9/shared`：barrel（`packages/shared/src/index.ts`）当前 re-export 了 8 个不存在的
 * `data/*` 模块，整包在 Vite 里**解析失败**（既有缺陷，本次不改）。因此：
 *   - 纯函数按**相对路径**直取源码（`../../../../packages/shared/src/utils/capability-selfcheck`）；
 *   - 接线事实用 `import.meta.glob` 以 `?raw` 读**源码文本**再解析，绝不 import 这些模块本体
 *     （否则又会踩到 barrel / 副作用）。
 *
 * 取舍说明（哪些能查、哪些只能声明）：
 *   - **能查**（真实读取源码）：目录 kind、前端 loader、socket 定义、跟随工作区条目、模板引用的 kind。
 *   - **只能声明**（浏览器侧无法枚举文件系统）：「本会话能力 → 对应测试文件」这张映射，以及
 *     「内部 / 别名节点」白名单。二者是**人工维护的声明**，单测会用 node:fs 逐个核验文件确实存在。
 */

import {
  buildCapabilitySelfcheckReport,
  type CapabilityKindFact,
  type CapabilitySelfcheckReport,
  type CapabilitySourceFact,
  type CapabilityTemplateFact,
  type CapabilityWiringFacts,
} from '../../../../packages/shared/src/utils/capability-selfcheck';

export type { CapabilitySelfcheckReport };
export { formatCapabilitySelfcheckReport } from '@nx9/shared';

/** 真实读取的数据源（仓库相对路径）。 */
export const CAPABILITY_SOURCE_PATHS = {
  catalog: 'packages/shared/src/catalog/block-catalog.ts',
  sockets: 'packages/shared/src/catalog/socket-registry.ts',
  attachedWorkspace: 'packages/shared/src/catalog/attached-workspace.ts',
  templates: 'packages/shared/src/data/workflow-templates.ts',
  loaders: 'apps/web/src/blocks/registry.tsx',
} as const;

export type CapabilitySourceId = keyof typeof CAPABILITY_SOURCE_PATHS;

/** 源码文本集合（缺项 = 未取到，自检会如实报 error）。 */
export type CapabilityRawSources = Partial<Record<CapabilitySourceId, string | undefined>>;

/**
 * 内部 / 别名节点白名单：不进 `BLOCK_CATALOG`，但注册了前端 loader，
 * 因此模板里出现它们是**合法**的（不属孤儿渲染器）。
 * 只跟着「登记在目录里的节点」走可见性判定。
 */
export const INTERNAL_KINDS = [
  /** 内部钉板：不进 BLOCK_CATALOG，仅拖出 / 本地投放；模板用作「结果预览位」 */
  'media-pin',
  /** 编剧台别名（与 script-desk 共用渲染器） */
  'dialogue-sheet',
] as const;

/**
 * 「本会话新增 / 改动的能力节点 → 对应测试文件」声明映射。
 * 只包含本会话确实有增量的节点；`sessionTouched` 由本表推导。
 */
export const SESSION_KIND_TEST_FILES: Readonly<Record<string, readonly string[]>> = {
  'multi-grid': [
    'apps/web/src/engine/__tests__/multi-grid-plan.test.ts',
    'apps/web/src/engine/__tests__/multi-grid-block-map.test.ts',
    'apps/web/src/engine/__tests__/multi-grid-closure.test.ts',
    'apps/web/src/engine/__tests__/multi-grid-concurrency.test.ts',
    'apps/web/src/engine/__tests__/multi-grid-to-shots.test.ts',
  ],
  'character-sheet-desk': [
    'apps/web/src/engine/__tests__/character-sheet-plan.test.ts',
    'apps/web/src/engine/__tests__/character-sheet-block-map.test.ts',
    'apps/web/src/engine/__tests__/character-sheet-closure.test.ts',
  ],
  'director-3d': [
    'apps/web/src/engine/__tests__/director3d-lighting.test.ts',
    'apps/web/src/engine/__tests__/director3d-builtin-assets.test.ts',
    'apps/web/src/engine/__tests__/director3d-camera-move-motion.test.ts',
    'apps/web/src/engine/__tests__/director3d-move-timeline-keys.test.ts',
    'apps/web/src/engine/__tests__/director3d-multi-camera-persist.test.ts',
    'apps/web/src/engine/__tests__/director3d-camera-move-library-panel.test.tsx',
  ],
  'picture-gen': [
    'apps/web/src/engine/__tests__/camera-move-library.test.ts',
    'apps/web/src/engine/__tests__/camera-move-timeline.test.ts',
    'apps/web/src/engine/__tests__/preset-entrypoints.test.ts',
  ],
  'clip-gen': [
    'apps/web/src/engine/__tests__/builtin-video-models.test.ts',
    'apps/web/src/engine/__tests__/camera-move-parse.test.ts',
  ],
  'clip-editor': ['apps/web/src/engine/__tests__/beat-grid.test.ts'],
  'storyboard-desk': [
    'apps/web/src/engine/__tests__/workflow-templates-links.test.ts',
    'apps/web/src/blocks/craft/__tests__/CameraMoveTimelineEditor.test.tsx',
  ],
  'sound-gen': ['apps/web/src/engine/__tests__/builtin-llm-audio-models.test.ts'],
};

// ───────────────────────────── 源码解析（无依赖、无副作用） ─────────────────────────────

/** 找 `anchor` 之后第一个「下一个非空白字符是 open 的 `=`」，返回该 open 的下标。 */
function findLiteralStart(src: string, anchor: string, open: string): number {
  const from = src.indexOf(anchor);
  if (from < 0) return -1;
  let eq = src.indexOf('=', from);
  while (eq >= 0) {
    let i = eq + 1;
    while (i < src.length && /\s/.test(src[i])) i += 1;
    if (src[i] === open) return i;
    eq = src.indexOf('=', eq + 1);
  }
  return -1;
}

/** 取 `anchor` 所指字面量的内部文本（跳过字符串与注释，按括号配平）。 */
export function sliceLiteralBody(
  src: string,
  anchor: string,
  open: string,
  close: string,
): string | null {
  const start = findLiteralStart(src, anchor, open);
  if (start < 0) return null;
  let depth = 0;
  let i = start;
  for (; i < src.length; i += 1) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i += 1;
        i += 1;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return src.slice(start + 1);
}

function skipStringOrComment(body: string, i: number): number {
  const c = body[i];
  if (c === "'" || c === '"' || c === '`') {
    const quote = c;
    i += 1;
    while (i < body.length && body[i] !== quote) {
      if (body[i] === '\\') i += 1;
      i += 1;
    }
    return i + 1;
  }
  if (c === '/' && body[i + 1] === '/') {
    const nl = body.indexOf('\n', i);
    return nl < 0 ? body.length : nl;
  }
  if (c === '/' && body[i + 1] === '*') {
    const end = body.indexOf('*/', i);
    return end < 0 ? body.length : end + 2;
  }
  return i;
}

/** record 字面量的一级 key（含带引号的 key；跳过嵌套对象的值）。 */
export function readTopLevelKeys(body: string | null): string[] {
  if (!body) return [];
  const keys: string[] = [];
  let depth = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (depth === 0) {
      const m = /^(?:'([^']*)'|"([^"]*)"|([A-Za-z_$][\w$]*))\s*:/.exec(body.slice(i));
      if (m) {
        const key = (m[1] ?? m[2] ?? m[3] ?? '').trim();
        if (key) keys.push(key);
        i += m[0].length;
        continue;
      }
    }
    const skipped = skipStringOrComment(body, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') depth += 1;
    else if (c === '}' || c === ']' || c === ')') depth -= 1;
    i += 1;
  }
  return keys;
}

/** 数组字面量的一级对象切片（用于目录项 / 模板项）。 */
export function readTopLevelObjects(body: string | null): string[] {
  if (!body) return [];
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    const skipped = skipStringOrComment(body, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    if (c === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push(body.slice(start, i + 1));
        start = -1;
      }
    }
    i += 1;
  }
  return out;
}

function firstGroup(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  return m && typeof m[1] === 'string' && m[1].trim() ? m[1].trim() : null;
}

/** 目录项：kind / label / concealed / deprecated。 */
export function readCatalogEntries(src: string | undefined): {
  kind: string;
  label: string | null;
  concealed: boolean;
  deprecated: boolean;
}[] {
  if (!src) return [];
  const body = sliceLiteralBody(src, 'export const BLOCK_CATALOG', '[', ']');
  return readTopLevelObjects(body)
    .map((entry) => ({
      kind: firstGroup(entry, /\bkind:\s*'([^']+)'/),
      label: firstGroup(entry, /\blabel:\s*'([^']*)'/),
      concealed: /\bconcealed:\s*true\b/.test(entry),
      deprecated: /\bdeprecated:\s*true\b/.test(entry),
    }))
    .filter((entry): entry is { kind: string; label: string | null; concealed: boolean; deprecated: boolean } =>
      Boolean(entry.kind),
    );
}

/** 前端 loader：`blocks/registry.tsx` 的 blockLoaders 的一级 key。 */
export function readLoaderKinds(src: string | undefined): string[] {
  if (!src) return [];
  return readTopLevelKeys(sliceLiteralBody(src, 'const blockLoaders', '{', '}'));
}

/** socket 定义：SOCKET_REGISTRY ∪ VERTICAL_SOCKETS 的一级 key。 */
export function readSocketKinds(src: string | undefined): string[] {
  if (!src) return [];
  return [
    ...readTopLevelKeys(sliceLiteralBody(src, 'export const SOCKET_REGISTRY', '{', '}')),
    ...readTopLevelKeys(sliceLiteralBody(src, 'export const VERTICAL_SOCKETS', '{', '}')),
  ];
}

/** 跟随工作区：ATTACHED_WORKSPACE_REGISTRY 的一级 key。 */
export function readAttachedWorkspaceKinds(src: string | undefined): string[] {
  if (!src) return [];
  return readTopLevelKeys(sliceLiteralBody(src, 'export const ATTACHED_WORKSPACE_REGISTRY', '{', '}'));
}

/** 模板：id / label / status / build() 里直接写出的节点 kind。 */
export function readTemplates(src: string | undefined): CapabilityTemplateFact[] {
  if (!src) return [];
  const body = sliceLiteralBody(src, 'export const WORKFLOW_TEMPLATES', '[', ']');
  const out: CapabilityTemplateFact[] = [];
  for (const entry of readTopLevelObjects(body)) {
    const id = firstGroup(entry, /\bid:\s*'([^']+)'/);
    if (!id) continue;
    const kinds: string[] = [];
    const re = /\bnode\(\s*'([^']+)'/g;
    let m = re.exec(entry);
    while (m) {
      kinds.push(m[1]);
      m = re.exec(entry);
    }
    out.push({
      id,
      label: firstGroup(entry, /\blabel:\s*'([^']*)'/),
      status: firstGroup(entry, /\bstatus:\s*'([^']+)'/),
      kinds: Array.from(new Set(kinds)),
    });
  }
  return out;
}

// ───────────────────────────── 事实组装 ─────────────────────────────

/**
 * 每个数据源「至少要解析出几条」才算解析成功。
 * 解析失效（文件结构变了）时数量会掉到 0，自检就会把该源标成 error，
 * 而不是假装「这份表本来就是空的」。
 */
const PARSED_ITEM_COUNTS: Record<CapabilitySourceId, (sources: CapabilityRawSources) => number> = {
  catalog: (s) => readCatalogEntries(s.catalog).length,
  loaders: (s) => readLoaderKinds(s.loaders).length,
  sockets: (s) => readSocketKinds(s.sockets).length,
  attachedWorkspace: (s) => readAttachedWorkspaceKinds(s.attachedWorkspace).length,
  templates: (s) => readTemplates(s.templates).length,
};

/** 把源码文本组装成自检输入（纯计算，便于单测注入）。 */
export function buildCapabilityWiringFacts(
  sources: CapabilityRawSources,
  collectedAt: string | null = null,
): CapabilityWiringFacts {
  const catalogEntries = readCatalogEntries(sources.catalog);
  const loaderKinds = readLoaderKinds(sources.loaders);
  const socketKinds = new Set(readSocketKinds(sources.sockets));
  const attachedKinds = new Set(readAttachedWorkspaceKinds(sources.attachedWorkspace));
  const templates = readTemplates(sources.templates);

  const factsByKind = new Map<string, CapabilityKindFact>();
  const ensure = (kind: string): CapabilityKindFact => {
    const existing = factsByKind.get(kind);
    if (existing) return existing;
    const created: CapabilityKindFact = {
      kind,
      inCatalog: false,
      label: null,
      concealed: false,
      deprecated: false,
      hasLoader: false,
      hasSocketProfile: false,
      hasAttachedWorkspace: false,
      templateRefs: [],
      testFiles: [],
      sessionTouched: false,
    };
    factsByKind.set(kind, created);
    return created;
  };

  // 顺序有意义：目录 → loader → socket → 工作区 → 模板引用（保证 kind 列表稳定）
  for (const entry of catalogEntries) {
    const fact = ensure(entry.kind);
    fact.inCatalog = true;
    fact.label = entry.label;
    fact.concealed = entry.concealed;
    fact.deprecated = entry.deprecated;
  }
  for (const kind of loaderKinds) ensure(kind).hasLoader = true;
  for (const kind of socketKinds) ensure(kind).hasSocketProfile = true;
  for (const kind of attachedKinds) ensure(kind).hasAttachedWorkspace = true;
  for (const tpl of templates) {
    for (const kind of tpl.kinds ?? []) ensure(kind).templateRefs!.push(tpl.id);
  }
  for (const [kind, files] of Object.entries(SESSION_KIND_TEST_FILES)) {
    const fact = ensure(kind);
    fact.sessionTouched = true;
    fact.testFiles = [...files];
  }

  const sourceFacts: CapabilitySourceFact[] = (
    Object.keys(CAPABILITY_SOURCE_PATHS) as CapabilitySourceId[]
  ).map((id) => {
    const path = CAPABILITY_SOURCE_PATHS[id];
    if (!sources[id]) {
      return { path, ok: false, detailZh: '源码文本未取到（glob 未命中或读取失败）' };
    }
    // 文本取到了却没解析出任何条目 = 解析口径失效（或文件结构变了），必须如实报，
    // 不能静默当成「这份表里什么都没有」——否则解析一坏，报告会假装全绿。
    const parsed = PARSED_ITEM_COUNTS[id](sources);
    if (parsed === 0) {
      return {
        path,
        ok: false,
        detailZh: '源码已取到但未解析出任何条目（文件结构变更或解析口径失效）',
      };
    }
    return { path, ok: true };
  });
  sourceFacts.push({
    path: '(声明) 本会话能力 → 测试文件映射',
    ok: Object.keys(SESSION_KIND_TEST_FILES).length > 0,
    declaredOnly: true,
    detailZh:
      '浏览器侧无法枚举文件系统，测试文件清单为人工维护的声明；单测用 node:fs 逐个核验其存在性。',
  });

  return {
    kinds: Array.from(factsByKind.values()),
    templates,
    sources: sourceFacts,
    internalKinds: [...INTERNAL_KINDS],
    collectedAt,
  };
}

/** 注入源码文本 → 自检报告（单测入口；不依赖浏览器）。 */
export function collectCapabilitySelfcheckReport(
  sources: CapabilityRawSources,
  collectedAt: string | null = null,
): CapabilitySelfcheckReport {
  return buildCapabilitySelfcheckReport(buildCapabilityWiringFacts(sources, collectedAt));
}

// ───────────────────────────── 浏览器取数 ─────────────────────────────

/**
 * 源码文本加载器：`import.meta.glob(..., { query: '?raw', import: 'default' })` 是**惰性**的，
 * 只在真正运行自检时按需读取这 5 个文件，不进首屏包。
 * 注意：只读文本、不 import 模块本体，因此不受 barrel 缺陷影响。
 */
const RAW_SOURCE_LOADERS: Record<CapabilitySourceId, Record<string, () => Promise<unknown>>> = {
  catalog: import.meta.glob('../../../../packages/shared/src/catalog/block-catalog.ts', {
    query: '?raw',
    import: 'default',
  }),
  sockets: import.meta.glob('../../../../packages/shared/src/catalog/socket-registry.ts', {
    query: '?raw',
    import: 'default',
  }),
  attachedWorkspace: import.meta.glob('../../../../packages/shared/src/catalog/attached-workspace.ts', {
    query: '?raw',
    import: 'default',
  }),
  templates: import.meta.glob('../../../../packages/shared/src/data/workflow-templates.ts', {
    query: '?raw',
    import: 'default',
  }),
  loaders: import.meta.glob('../blocks/registry.tsx', {
    query: '?raw',
    import: 'default',
  }),
};

async function loadRawSource(
  loaders: Record<string, () => Promise<unknown>>,
): Promise<string | undefined> {
  for (const load of Object.values(loaders)) {
    try {
      const text = await load();
      if (typeof text === 'string' && text.length > 0) return text;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * 浏览器侧运行能力自检：读取真实源码 → 组装事实 → 出报告。
 * 不抛异常（读取失败会体现为报告里的 error / warn）。
 */
export async function runCapabilitySelfcheck(): Promise<CapabilitySelfcheckReport> {
  const ids = Object.keys(CAPABILITY_SOURCE_PATHS) as CapabilitySourceId[];
  const sources: CapabilityRawSources = {};
  await Promise.all(
    ids.map(async (id) => {
      sources[id] = await loadRawSource(RAW_SOURCE_LOADERS[id]);
    }),
  );
  return collectCapabilitySelfcheckReport(sources, new Date().toISOString());
}
