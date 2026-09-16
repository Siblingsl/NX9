/**
 * NX9 能力自检（纯函数）。
 *
 * 目的：把「本会话新增 / 既有节点能力的接线事实」一次性汇总成结构化报告，
 * 让用户一眼看到**有哪些能力、从哪里进入、接线是否自洽**。
 *
 * 硬约束（刻意为之，勿破坏）：
 * 1. **零 import**（连 type export 也不引外部模块）。原因：`packages/shared/src/index.ts`（barrel）
 *    当前 re-export 了 8~9 个不存在的 `data/*` 模块，`@nx9/shared` 整体不可解析；
 *    本文件必须能在**不依赖 barrel** 的前提下被单测直接相对路径引入。
 * 2. **纯函数**：不读文件、不碰 DOM、不依赖时间/随机数；同一输入必得同一输出。
 * 3. **可序列化**：返回值只含字符串 / 数字 / 布尔 / 数组 / 普通对象（`JSON.stringify` 无信息损失）。
 * 4. **不抛异常**：输入缺失、类型错、脏数据一律按「如实报 warn/error」处理，**不编造通过**。
 *
 * 取数不在本文件：见 `apps/web/src/engine/capability-selfcheck.ts`（浏览器侧壳层）。
 */

export type CapabilitySelfcheckSeverity = 'ok' | 'warn' | 'error';

/** 单个节点 kind 的接线事实（由取数壳层组装）。 */
export interface CapabilityKindFact {
  /** 节点 kind（必填；空串/非字符串条目会被忽略并计入脏数据） */
  kind: string;
  /** 是否登记在节点目录（`catalog/block-catalog.ts`） */
  inCatalog?: boolean;
  /** 目录中的中文标签 */
  label?: string | null;
  /** 目录项是否标记 concealed（高级/命令面板可搜，Dock 不默认展示） */
  concealed?: boolean;
  /** 目录项是否标记 deprecated（历史 kind，仅兼容旧数据） */
  deprecated?: boolean;
  /** 前端是否有专用渲染器（`blocks/registry.tsx` 的 blockLoaders） */
  hasLoader?: boolean;
  /** 是否在 socket 表中定义了口型（`SOCKET_REGISTRY` 或 `VERTICAL_SOCKETS`） */
  hasSocketProfile?: boolean;
  /** 是否在跟随工作区表中有条目（`ATTACHED_WORKSPACE_REGISTRY`） */
  hasAttachedWorkspace?: boolean;
  /** 引用该 kind 的模板 id（`WORKFLOW_TEMPLATES`） */
  templateRefs?: string[];
  /** 与本 kind 对应的测试文件（相对仓库根路径；取数层用声明式映射匹配得出） */
  testFiles?: string[];
  /** 本会话新增 / 改动过的能力节点（取数层按显式清单标记） */
  sessionTouched?: boolean;
}

/** 单条模板的引用事实。 */
export interface CapabilityTemplateFact {
  id: string;
  label?: string | null;
  /** 'ga' | 'beta' | 'deprecated'（未知值原样保留，不参与判定） */
  status?: string | null;
  /** 模板 build() 里直接写出的节点 kind */
  kinds?: string[];
}

/** 单个数据源的读取结果。 */
export interface CapabilitySourceFact {
  /** 仓库相对路径（或 glob 键） */
  path: string;
  ok: boolean;
  detailZh?: string;
  /** true = 该来源不是「读源码」得来的，而是人工维护的声明（报告会显式标注） */
  declaredOnly?: boolean;
}

/** 自检输入：一组「接线事实」。 */
export interface CapabilityWiringFacts {
  kinds?: CapabilityKindFact[] | null;
  templates?: CapabilityTemplateFact[] | null;
  sources?: CapabilitySourceFact[] | null;
  /** 声明为内部 / 别名节点：不进目录但注册了渲染器，模板可合法引用 */
  internalKinds?: string[] | null;
  /** 取数时间（ISO 字符串；仅供展示，不参与判定） */
  collectedAt?: string | null;
}

export interface CapabilitySelfcheckCheck {
  id: string;
  label: string;
  severity: CapabilitySelfcheckSeverity;
  detailZh: string;
  evidence: string[];
}

export interface CapabilitySelfcheckCounts {
  kinds: number;
  catalogKinds: number;
  templates: number;
  checks: number;
  ok: number;
  warn: number;
  error: number;
}

export interface CapabilitySelfcheckReport {
  checks: CapabilitySelfcheckCheck[];
  counts: CapabilitySelfcheckCounts;
  summaryZh: string;
  /** false = 本次自检未取得完整结论（缺数据源 / 事实为空） */
  complete: boolean;
  collectedAt: string | null;
}

/** 检查项固定顺序与名称（UI 按此顺序展示）。 */
export const CAPABILITY_SELFCHECK_CHECKS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'facts-integrity', label: '取数完整性' },
  { id: 'catalog-loader-parity', label: '目录 kind ↔ 前端 loader' },
  { id: 'loader-orphan', label: 'loader 孤儿（有渲染器、无目录项）' },
  { id: 'socket-definition', label: '目录 kind ↔ socket 定义' },
  { id: 'attached-workspace-entry', label: 'kind ↔ 跟随工作区条目' },
  { id: 'template-kind-exists', label: '模板引用的 kind 是否存在' },
  { id: 'node-test-coverage', label: '本会话能力的测试文件' },
  { id: 'visibility-self-consistency', label: 'concealed / deprecated 与可见性自洽' },
];

const EVIDENCE_LIMIT = 12;

const SEVERITY_RANK: Record<CapabilitySelfcheckSeverity, number> = { ok: 0, warn: 1, error: 2 };

function worstSeverity(a: CapabilitySelfcheckSeverity, b: CapabilitySelfcheckSeverity): CapabilitySelfcheckSeverity {
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function trimList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (isNonEmptyString(item)) out.push(item.trim());
  }
  return out;
}

function dedupeSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function capped(values: string[]): string[] {
  if (values.length <= EVIDENCE_LIMIT) return values;
  return [...values.slice(0, EVIDENCE_LIMIT), `…另有 ${values.length - EVIDENCE_LIMIT} 项`];
}

interface Issue {
  severity: CapabilitySelfcheckSeverity;
  text: string;
}

/** 归一化后的 kind 事实：可选字段全部落成确定值，供内部判定使用（对外仍是 CapabilityKindFact）。 */
interface NormalizedKindFact extends CapabilityKindFact {
  kind: string;
  testFiles: string[];
  templateRefs: string[];
}

interface CheckDraft {
  issues: Issue[];
  /** 参与判定的条目数；0 = 本次没取到可判定的数据 */
  evaluated: number;
  /** evaluated 为 0 时的中文说明 */
  emptyDetailZh: string;
  /** 无问题时的中文说明（可选，缺省为「全部通过」类文案） */
  okDetailZh?: string;
  evidence: string[];
}

function newDraft(emptyDetailZh: string): CheckDraft {
  return { issues: [], evaluated: 0, emptyDetailZh, evidence: [] };
}

/** 把草稿收敛成检查项：无数据 → warn（不编造通过）；有数据无问题 → ok。 */
function finalize(
  def: { id: string; label: string },
  draft: CheckDraft,
  issueDetailZh: (issues: Issue[]) => string,
  okDetailZh: string,
): CapabilitySelfcheckCheck {
  if (draft.evaluated === 0) {
    return {
      id: def.id,
      label: def.label,
      severity: 'warn',
      detailZh: draft.emptyDetailZh,
      evidence: capped(draft.evidence),
    };
  }
  let severity: CapabilitySelfcheckSeverity = 'ok';
  for (const issue of draft.issues) severity = worstSeverity(severity, issue.severity);
  return {
    id: def.id,
    label: def.label,
    severity,
    detailZh: severity === 'ok' ? draft.okDetailZh ?? okDetailZh : issueDetailZh(draft.issues),
    evidence: capped(draft.evidence),
  };
}

function checkDef(id: string): { id: string; label: string } {
  const found = CAPABILITY_SELFCHECK_CHECKS.find((c) => c.id === id);
  return found ?? { id, label: id };
}

/**
 * 组装能力自检报告。
 *
 * @param facts 接线事实；`null` / `undefined` / 缺字段 / 脏数据均安全（如实报 warn/error）。
 */
export function buildCapabilitySelfcheckReport(
  facts?: CapabilityWiringFacts | null,
): CapabilitySelfcheckReport {
  const safeFacts = facts && typeof facts === 'object' ? facts : {};
  const internalKinds = new Set(trimList(safeFacts.internalKinds));

  // ── 归一化 kind 事实：丢弃无 kind 的条目、按 kind 去重（首次出现优先） ──
  const rawKinds: unknown[] = Array.isArray(safeFacts.kinds) ? (safeFacts.kinds as unknown[]) : [];
  const kindFacts: NormalizedKindFact[] = [];
  const seenKinds = new Set<string>();
  const duplicateKinds: string[] = [];
  let droppedEntries = 0;

  for (const raw of rawKinds) {
    const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    if (!isNonEmptyString(entry.kind)) {
      droppedEntries += 1;
      continue;
    }
    const kind = entry.kind.trim();
    if (seenKinds.has(kind)) {
      duplicateKinds.push(kind);
      continue;
    }
    seenKinds.add(kind);
    kindFacts.push({
      kind,
      inCatalog: Boolean(entry.inCatalog),
      label: isNonEmptyString(entry.label) ? entry.label : null,
      concealed: Boolean(entry.concealed),
      deprecated: Boolean(entry.deprecated),
      hasLoader: Boolean(entry.hasLoader),
      hasSocketProfile: Boolean(entry.hasSocketProfile),
      hasAttachedWorkspace: Boolean(entry.hasAttachedWorkspace),
      templateRefs: trimList(entry.templateRefs),
      testFiles: trimList(entry.testFiles),
      sessionTouched: Boolean(entry.sessionTouched),
    });
  }

  const rawTemplates: unknown[] = Array.isArray(safeFacts.templates)
    ? (safeFacts.templates as unknown[])
    : [];
  const templateFacts: CapabilityTemplateFact[] = [];
  const seenTemplates = new Set<string>();
  let droppedTemplates = 0;
  for (const raw of rawTemplates) {
    const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    if (!isNonEmptyString(entry.id)) {
      droppedTemplates += 1;
      continue;
    }
    const id = entry.id.trim();
    if (seenTemplates.has(id)) continue;
    seenTemplates.add(id);
    templateFacts.push({
      id,
      label: isNonEmptyString(entry.label) ? entry.label : null,
      status: isNonEmptyString(entry.status) ? entry.status : null,
      kinds: trimList(entry.kinds),
    });
  }

  const sources: CapabilitySourceFact[] = Array.isArray(safeFacts.sources)
    ? (safeFacts.sources as unknown[])
        .map((raw) => {
          const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
          return {
            path: isNonEmptyString(entry.path) ? entry.path.trim() : '(未命名数据源)',
            ok: Boolean(entry.ok),
            detailZh: isNonEmptyString(entry.detailZh) ? entry.detailZh : undefined,
            declaredOnly: Boolean(entry.declaredOnly),
          };
        })
    : [];
  const failedSources = sources.filter((s) => !s.ok);
  const declaredSources = sources.filter((s) => s.declaredOnly);

  const catalogKinds = kindFacts.filter((k) => k.inCatalog);
  const loaderKinds = kindFacts.filter((k) => k.hasLoader);
  const sessionKinds = kindFacts.filter((k) => k.sessionTouched);

  const checks: CapabilitySelfcheckCheck[] = [];

  // ── 1. 取数完整性 ──
  const integrity = newDraft('未取到任何接线事实（kinds 为空），本次自检未取得结论。');
  integrity.evaluated = 1;
  if (kindFacts.length === 0) {
    integrity.issues.push({
      severity: 'error',
      text: '未取到任何 kind 接线事实（kinds 为空）：本次自检无法对目录 / loader / socket / 工作区 / 模板做任何判定。',
    });
  }
  if (templateFacts.length === 0) {
    integrity.issues.push({
      severity: 'warn',
      text: '未取到模板清单（templates 为空）：模板引用检查本次不生效。',
    });
  }
  if (sources.length === 0) {
    integrity.issues.push({
      severity: 'warn',
      text: '未提供数据源读取状态（sources 为空）：无法判断事实是否取全。',
    });
  }
  for (const failed of failedSources) {
    integrity.issues.push({
      severity: 'error',
      text: `数据源读取失败：${failed.path}${failed.detailZh ? `（${failed.detailZh}）` : ''}。`,
    });
  }
  if (duplicateKinds.length > 0) {
    integrity.issues.push({
      severity: 'warn',
      text: `存在重复 kind 事实（已按首次出现合并）：${duplicateKinds.join('、')}。`,
    });
  }
  if (droppedEntries > 0) {
    integrity.issues.push({
      severity: 'warn',
      text: `有 ${droppedEntries} 条事实缺少可用 kind，已忽略。`,
    });
  }
  if (droppedTemplates > 0) {
    integrity.issues.push({
      severity: 'warn',
      text: `有 ${droppedTemplates} 条模板事实缺少 id，已忽略。`,
    });
  }
  integrity.evidence = [
    `kind 事实 ${kindFacts.length} 个（目录 ${catalogKinds.length}）`,
    `模板事实 ${templateFacts.length} 条`,
    `数据源 ${sources.length} 个（成功 ${sources.length - failedSources.length}）`,
  ];
  for (const declared of declaredSources) {
    integrity.evidence.push(`声明式来源（非读源码）：${declared.path}`);
  }
  checks.push(
    finalize(
      checkDef('facts-integrity'),
      integrity,
      (issues) => issues.map((i) => i.text).join(' '),
      `接线事实完整：kind ${kindFacts.length} 个 · 模板 ${templateFacts.length} 条 · 数据源 ${
        sources.length
      } 个全部读取成功${
        declaredSources.length > 0 ? `（其中 ${declaredSources.length} 个为声明式来源，见证据）` : ''
      }。`,
    ),
  );

  // ── 2. 目录 kind ↔ 前端 loader ──
  const parity = newDraft('未取到目录 kind，无法核对前端 loader。');
  parity.evaluated = catalogKinds.length;
  for (const fact of catalogKinds) {
    if (fact.hasLoader) continue;
    if (fact.deprecated || fact.concealed) {
      parity.issues.push({
        severity: 'warn',
        text: `${fact.kind} 已 ${fact.deprecated ? 'deprecated' : ''}${fact.deprecated && fact.concealed ? ' + ' : ''}${
          fact.concealed ? 'concealed' : ''
        }，无专用前端 loader（属预期，加载旧数据时会落到通用兜底卡）。`,
      });
    } else {
      parity.issues.push({
        severity: 'error',
        text: `${fact.kind} 在目录中可见但没有前端 loader：节点会被渲染成通用兜底卡。`,
      });
    }
  }
  parity.evidence = [
    `目录 kind ${catalogKinds.length} 个 / 有 loader ${catalogKinds.filter((k) => k.hasLoader).length} 个`,
    ...catalogKinds.filter((k) => !k.hasLoader).map((k) => `缺 loader：${k.kind}`),
  ];
  checks.push(
    finalize(
      checkDef('catalog-loader-parity'),
      parity,
      (issues) => `${issues.length} 个目录 kind 的 loader 接线有问题：${issues.map((i) => i.text).join(' ')}`,
      `目录 ${catalogKinds.length} 个 kind 全部有前端 loader。`,
    ),
  );

  // ── 3. loader 孤儿 ──
  const orphan = newDraft('未取到前端 loader 清单，无法核对孤儿渲染器。');
  orphan.evaluated = loaderKinds.length;
  for (const fact of kindFacts) {
    if (!fact.hasLoader || fact.inCatalog) continue;
    if (internalKinds.has(fact.kind)) {
      orphan.evidence.push(`内部 / 别名节点：${fact.kind}`);
      continue;
    }
    orphan.issues.push({
      severity: 'warn',
      text: `${fact.kind} 注册了前端 loader 但不在节点目录中：若是内部 / 别名节点请加入 internalKinds 声明，否则属孤儿渲染器。`,
    });
  }
  checks.push(
    finalize(
      checkDef('loader-orphan'),
      orphan,
      (issues) => `${issues.length} 个 loader 未在目录登记：${issues.map((i) => i.text).join(' ')}`,
      `loader ${loaderKinds.length} 个全部与目录对齐（内部 / 别名节点已声明）。`,
    ),
  );

  // ── 4. 目录 kind ↔ socket 定义 ──
  const sockets = newDraft('未取到目录 kind，无法核对 socket 定义。');
  sockets.evaluated = catalogKinds.length;
  for (const fact of catalogKinds) {
    if (fact.hasSocketProfile) continue;
    if (fact.deprecated || fact.concealed) {
      sockets.issues.push({
        severity: 'warn',
        text: `${fact.kind} 已隐藏 / 废弃且无 socket 定义（属预期）。`,
      });
    } else {
      sockets.issues.push({
        severity: 'error',
        text: `${fact.kind} 可见但没有 socket 定义：它与其它节点连线时会静默失败。`,
      });
    }
  }
  sockets.evidence = [
    `目录 kind ${catalogKinds.length} 个 / 有 socket 定义 ${catalogKinds.filter((k) => k.hasSocketProfile).length} 个`,
    ...catalogKinds.filter((k) => !k.hasSocketProfile).map((k) => `缺 socket：${k.kind}`),
  ];
  checks.push(
    finalize(
      checkDef('socket-definition'),
      sockets,
      (issues) => `${issues.length} 个目录 kind 的 socket 定义有问题：${issues.map((i) => i.text).join(' ')}`,
      `目录 ${catalogKinds.length} 个 kind 全部有 socket 定义。`,
    ),
  );

  // ── 5. kind ↔ 跟随工作区条目 ──
  const workspaces = newDraft('未取到目录 kind，无法核对跟随工作区条目。');
  workspaces.evaluated = catalogKinds.length;
  const nonCatalogWorkspaceKinds = kindFacts.filter((k) => !k.inCatalog && k.hasAttachedWorkspace);
  for (const fact of catalogKinds) {
    if (fact.hasAttachedWorkspace) continue;
    if (fact.sessionTouched) {
      workspaces.issues.push({
        severity: 'error',
        text: `${fact.kind} 是本会话新增能力，但没有跟随工作区条目：能力没有落地面板入口。`,
      });
    } else if (fact.deprecated || fact.concealed) {
      workspaces.issues.push({
        severity: 'warn',
        text: `${fact.kind} 已隐藏 / 废弃且无跟随工作区条目（属预期）。`,
      });
    } else {
      workspaces.issues.push({
        severity: 'warn',
        text: `${fact.kind} 无跟随工作区条目：只能作为纯节点卡使用，请确认是否为设计如此。`,
      });
    }
  }
  workspaces.evidence = [
    `目录 kind ${catalogKinds.length} 个 / 有工作区 ${catalogKinds.filter((k) => k.hasAttachedWorkspace).length} 个`,
    ...catalogKinds.filter((k) => !k.hasAttachedWorkspace).map((k) => `缺工作区：${k.kind}`),
  ];
  if (nonCatalogWorkspaceKinds.length > 0) {
    workspaces.evidence.push(
      `另有 ${nonCatalogWorkspaceKinds.length} 个非目录 kind 保留工作区条目（历史数据兼容，按设计不参与判定）`,
    );
  }
  checks.push(
    finalize(
      checkDef('attached-workspace-entry'),
      workspaces,
      (issues) => `${issues.length} 个能力的工作区接线有问题：${issues.map((i) => i.text).join(' ')}`,
      `目录 ${catalogKinds.length} 个 kind 的工作区条目齐备（另有 ${
        nonCatalogWorkspaceKinds.length
      } 个非目录 kind 的历史条目，按设计不参与判定）。`,
    ),
  );

  // ── 6. 模板引用的 kind 是否存在 ──
  const templateRefs = newDraft('未取到模板引用（templates 全为空或无 kind），无法核对。');
  const kindByKind = new Map(kindFacts.map((k) => [k.kind, k] as const));
  let totalRefs = 0;
  for (const tpl of templateFacts) {
    const refs = Array.isArray(tpl.kinds) ? tpl.kinds : [];
    for (const ref of refs) {
      if (!isNonEmptyString(ref)) continue;
      totalRefs += 1;
      const kind = ref.trim();
      const fact = kindByKind.get(kind);
      if (!fact) {
        templateRefs.issues.push({
          severity: 'error',
          text: `模板 ${tpl.id} 引用了未知 kind「${kind}」：该 kind 既不在目录也没有渲染器，模板落画布会出现错误卡。`,
        });
        continue;
      }
      if (!fact.inCatalog && !fact.hasLoader) {
        templateRefs.issues.push({
          severity: 'error',
          text: `模板 ${tpl.id} 引用的 kind「${kind}」既不在目录也没有前端 loader。`,
        });
        continue;
      }
      if (fact.deprecated) {
        templateRefs.issues.push({
          severity: 'warn',
          text: `模板 ${tpl.id} 引用了已废弃 kind「${kind}」：加载后会被迁移改写。`,
        });
        continue;
      }
      if (!fact.inCatalog && !internalKinds.has(kind)) {
        templateRefs.issues.push({
          severity: 'warn',
          text: `模板 ${tpl.id} 引用了非目录 kind「${kind}」：请确认它是内部 / 别名节点，否则用户无法在 Dock 里拉到同一节点。`,
        });
      }
    }
  }
  templateRefs.evaluated = totalRefs;
  const refKinds = dedupeSorted(
    templateFacts.flatMap((t) => (Array.isArray(t.kinds) ? t.kinds.filter(isNonEmptyString) : [])),
  );
  templateRefs.evidence = [
    `模板 ${templateFacts.length} 条 / 引用 ${totalRefs} 处 / 去重 kind ${refKinds.length} 个`,
  ];
  checks.push(
    finalize(
      checkDef('template-kind-exists'),
      templateRefs,
      (issues) => `${issues.length} 处模板引用有问题：${issues.map((i) => i.text).join(' ')}`,
      `模板 ${templateFacts.length} 条共 ${totalRefs} 处引用，全部指向可渲染的 kind。`,
    ),
  );

  // ── 7. 本会话能力的测试文件 ──
  const coverage = newDraft(
    '未标记本会话新增 / 改动能力（sessionTouched 全为 false），本次未判定测试覆盖。',
  );
  coverage.evaluated = sessionKinds.length;
  for (const fact of sessionKinds) {
    if (!fact.inCatalog) {
      coverage.issues.push({
        severity: 'error',
        text: `「${fact.kind}」被标记为本会话能力，但不在节点目录中：声明写错或该节点已下线。`,
      });
      continue;
    }
    if (fact.testFiles.length > 0) continue;
    coverage.issues.push({
      severity: 'warn',
      text: `本会话能力「${fact.kind}」没有匹配到测试文件：接线没有回归网。`,
    });
  }
  coverage.evidence = sessionKinds.map(
    (k) => `${k.kind} → ${k.testFiles.length > 0 ? k.testFiles.join('、') : '（无）'}`,
  );
  checks.push(
    finalize(
      checkDef('node-test-coverage'),
      coverage,
      (issues) => `${issues.length} 个本会话能力缺测试：${issues.map((i) => i.text).join(' ')}`,
      `本会话能力 ${sessionKinds.length} 个全部匹配到测试文件。`,
    ),
  );

  // ── 8. concealed / deprecated 与可见性自洽 ──
  const visibility = newDraft('未取到任何带可见性语义的 kind（目录项 / concealed），无法核对。');
  // 参与判定：目录项（有可见性语义）+ 任何标记了 concealed 的 kind（要检查语义是否成立）
  const visibilityKinds = kindFacts.filter((k) => k.inCatalog || k.concealed);
  visibility.evaluated = visibilityKinds.length;
  for (const fact of visibilityKinds) {
    if (!fact.inCatalog) {
      if (fact.concealed) {
        visibility.issues.push({
          severity: 'error',
          text: `${fact.kind} 不在目录却标记了 concealed：concealed 只对目录项有意义。`,
        });
      }
      continue;
    }
    if (fact.deprecated && !fact.concealed) {
      visibility.issues.push({
        severity: 'warn',
        text: `${fact.kind} 已 deprecated 但未 concealed：它仍会出现在 Dock / 命令面板里。`,
      });
    }
    if (fact.deprecated && fact.templateRefs.length > 0) {
      visibility.issues.push({
        severity: 'warn',
        text: `${fact.kind} 已 deprecated 但被模板引用：${fact.templateRefs.join('、')}。`,
      });
    }
    if (fact.sessionTouched && (fact.deprecated || fact.concealed)) {
      visibility.issues.push({
        severity: 'warn',
        text: `${fact.kind} 是本会话新增能力却被标记为 ${
          fact.deprecated ? 'deprecated' : 'concealed'
        }：用户可能找不到入口。`,
      });
    }
  }
  visibility.evidence = [
    `目录 kind ${catalogKinds.length} 个 / deprecated ${catalogKinds.filter((k) => k.deprecated).length} 个 / concealed ${
      catalogKinds.filter((k) => k.concealed).length
    } 个`,
  ];
  checks.push(
    finalize(
      checkDef('visibility-self-consistency'),
      visibility,
      (issues) => `${issues.length} 处可见性不自洽：${issues.map((i) => i.text).join(' ')}`,
      `目录 ${catalogKinds.length} 个 kind 的 concealed / deprecated 与实际可见性自洽。`,
    ),
  );

  // ── 汇总 ──
  let ok = 0;
  let warn = 0;
  let error = 0;
  for (const check of checks) {
    if (check.severity === 'ok') ok += 1;
    else if (check.severity === 'warn') warn += 1;
    else error += 1;
  }

  const complete =
    kindFacts.length > 0 &&
    templateFacts.length > 0 &&
    failedSources.length === 0 &&
    !checks.some((c) => c.id === 'facts-integrity' && c.severity === 'error');

  const summaryZh = `${
    complete ? '能力自检' : '能力自检（结论不完整，见「取数完整性」）'
  }：kind ${kindFacts.length} 个（目录 ${catalogKinds.length}）· 模板 ${templateFacts.length} 条 · 检查 ${
    checks.length
  } 项 → ${error} 错误 / ${warn} 警告 / ${ok} 通过`;

  return {
    checks,
    counts: {
      kinds: kindFacts.length,
      catalogKinds: catalogKinds.length,
      templates: templateFacts.length,
      checks: checks.length,
      ok,
      warn,
      error,
    },
    summaryZh,
    complete,
    collectedAt: isNonEmptyString(safeFacts.collectedAt) ? safeFacts.collectedAt : null,
  };
}

/** 报告文本化（供 toast / 复制到剪贴板；纯字符串，不含 UI 依赖）。 */
export function formatCapabilitySelfcheckReport(report: CapabilitySelfcheckReport): string {
  const lines = [report.summaryZh];
  for (const check of report.checks) {
    const badge = check.severity === 'ok' ? '[通过]' : check.severity === 'warn' ? '[警告]' : '[错误]';
    lines.push(`${badge} ${check.label}：${check.detailZh}`);
    for (const item of check.evidence) lines.push(`      · ${item}`);
  }
  return lines.join('\n');
}
