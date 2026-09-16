/**
 * consistency-report.ts — 跨格 / 跨镜一致性报告（**图像级**，纯函数）。
 *
 * 定位：与**文本级** `apps/web/src/engine/continuity-check-runner.ts`（多镜服装 / 光影 / 轴线
 * 语义报告，把多张图交给视觉模型自由作答）互补 —— 本模块只消费「人脸分析接口」返回的
 * **结构化字段**，做格与格之间的机械比对，并在每条问题里给出可核对的证据（哪两格、什么值）。
 *
 * 硬口径：
 * - 纯函数：无网络、无副作用、输入输出可 JSON 序列化、**不抛异常**（异常一律回落为明确说明）；
 * - **不编造**：`faces === null` 表示「该格没有可用分析」，**不等于无人脸**；只有 `faces` 是数组
 *   （含空数组 = 分析成功且确实无人脸）才参与比较与基线统计；
 * - 可比较格不足（< `CONSISTENCY_MIN_COMPARABLE_CELLS`）时返回 `unavailable` 说明，**不返回假报告**；
 * - 所有判定都是**启发式**（判据与置信边界见 `docs/NX9-CONSISTENCY-CHECK.md`），
 *   只用于提示与排序，**不自动改写任何提示词 / 节点数据**。
 * - 只使用人脸结果里的 `expression` / `confidence` / `description` 三个字段（本模块不需要人脸框几何）。
 */

/* ────────────────────────── 类型 ────────────────────────── */

export type CrossCellSeverity = 'info' | 'warn' | 'error';

export type CrossCellIssueCode =
  /** 有人脸的格与无人脸的格混在一起（最强的不一致信号） */
  | 'face-presence-mismatch'
  /** 每格都有人脸、但数量不同 */
  | 'face-count-mismatch'
  /** 主表情偏离多数基线 */
  | 'expression-outlier'
  /** 外观关键词类别偏离多数基线 */
  | 'appearance-conflict'
  /** 该格人脸分析不可用（体检未覆盖，不是内容问题） */
  | 'cell-unanalyzed'
  /** 有人脸但置信度过低（结论可靠性低） */
  | 'low-confidence-face';

/** 参与比较的人脸（只取判定需要的三个字段；缺字段按保守值回落） */
export interface CrossCellFace {
  /** 表情（已归一为小写去空）；空串 = 该格该脸没有可比表情 */
  expression: string;
  /** 0–1；非有限值 / 越界一律裁剪 */
  confidence: number;
  /** 外观描述原文（关键词抽取的唯一输入） */
  description: string;
}

export interface CrossCellInput {
  /** 格序号（0 起，由调用方定义口径；报告与「跳转到该格」都用它） */
  index: number;
  /** 格标签（角色名 / 机位名），仅用于文案 */
  label?: string;
  /** 该格图片地址；只在 `pickBestCell` 的「有图」判据里用到 */
  url?: string;
  /** `null` = 该格没有可用分析（未出图 / 未分析 / 分析失败），**不是**「无人脸」 */
  faces: CrossCellFace[] | null;
  /** `faces === null` 时的原因（如实展示，不编造） */
  unavailableReasonZh?: string;
}

export interface CrossCellEvidenceEntry {
  cellIndex: number;
  label?: string;
  value: string;
}

export interface CrossCellEvidence {
  /** 证据口径（与 issue.code 同源，可机读） */
  kind: CrossCellIssueCode;
  /** 一行人话证据（含格号与取值） */
  summaryZh: string;
  entries: CrossCellEvidenceEntry[];
}

export interface CrossCellIssue {
  /** 主责格序号（UI 跳转目标） */
  cellIndex: number;
  /** 对照格序号（基线 / 另一方） */
  relatedCellIndexes?: number[];
  severity: CrossCellSeverity;
  code: CrossCellIssueCode;
  messageZh: string;
  evidence: CrossCellEvidence;
}

export interface CrossCellReport {
  issues: CrossCellIssue[];
  summaryZh: string;
  /** 成功拿到人脸分析结果的格数（含「分析成功且无人脸」） */
  checkedCount: number;
  /** 非空 = **没有**给出跨格结论，字段内容即原因（调用方必须如实展示，不得当成「无问题」） */
  unavailable?: string;
}

export interface CrossCellPickResult {
  ok: boolean;
  index?: number;
  label?: string;
  reasonZh: string;
  /** 被排除的格与排除理由（如实列出，不静默丢弃） */
  excludedZh: string[];
  /** 按判据排序后的候选表（第一行即推荐格；判据透明可核对） */
  candidates: CrossCellPickCandidate[];
}

export interface CrossCellPickCandidate {
  cellIndex: number;
  label?: string;
  /** 该格名下的错误 / 警告 / 提示问题数 */
  errorCount: number;
  warnCount: number;
  infoCount: number;
  /** 该格人脸置信度均值（无人脸 = 0） */
  avgConfidence: number;
  /** 是否命中调用方给的优先格（如设定表正面视角） */
  preferred: boolean;
}

/* ────────────────────────── 常量（判据阈值，集中可审计） ────────────────────────── */

/** 少于该格数不做任何格间比较（无法构成「多数」） */
export const CONSISTENCY_MIN_COMPARABLE_CELLS = 2;
/** 人脸置信度低于该值 → info（该格「有人脸」结论可靠性低） */
export const CONSISTENCY_LOW_CONFIDENCE = 0.4;
/** 表情 / 外观基线的**最小可判格数**（少于该数不判「突变 / 冲突」） */
export const CONSISTENCY_BASELINE_MIN_SAMPLE = 3;
/** 多数基线的最低占比：取值在可判格中占比达到该值才作为基线 */
export const CONSISTENCY_BASELINE_MAJORITY_RATIO = 0.6;
/** 服装色判定：颜色词与服装名词的最大字符间隔（中英同口径） */
export const CONSISTENCY_OUTFIT_ADJACENCY = 6;

export const CROSS_CELL_SEVERITY_ORDER: readonly CrossCellSeverity[] = ['error', 'warn', 'info'];

export function crossCellSeverityRank(severity: CrossCellSeverity): number {
  const at = CROSS_CELL_SEVERITY_ORDER.indexOf(severity);
  return at < 0 ? CROSS_CELL_SEVERITY_ORDER.length : at;
}

/* ────────────────────────── 外观关键词词表（可比类别，可审计） ────────────────────────── */

export type CrossCellAppearanceCategory =
  | 'hairColor'
  | 'hairLength'
  | 'outfitColor'
  | 'ageBand'
  | 'accessory';

export const CROSS_CELL_APPEARANCE_CATEGORY_LABELS: Record<CrossCellAppearanceCategory, string> = {
  hairColor: '发色',
  hairLength: '发型长度',
  outfitColor: '服装颜色',
  ageBand: '年龄段',
  accessory: '配饰',
};

export interface CrossCellAppearanceTerm {
  category: CrossCellAppearanceCategory;
  /** 归一化取值（中英同义合并到同一取值） */
  value: string;
  /** 取值中文名（文案用） */
  labelZh: string;
  /** 匹配词（中文按子串匹配；拉丁词按词边界匹配、忽略大小写） */
  terms: readonly string[];
}

/**
 * 只收「在描述里出现即可稳定判定」的类别与取值：
 * 发色 / 发型长度 / 服装颜色（**须与服装名词同现**）/ 年龄段（只认显式年龄词）/ 配饰。
 * 不做体型、肤色、气质的语义推断 —— 那些在 LLM 描述里口径不稳定，容易误报。
 */
export const CROSS_CELL_APPEARANCE_TERMS: readonly CrossCellAppearanceTerm[] = [
  // 发色
  { category: 'hairColor', value: 'black', labelZh: '黑发', terms: ['黑发', '乌黑', '黑色头发', 'black hair', 'black-haired', 'dark hair'] },
  { category: 'hairColor', value: 'white', labelZh: '白发/银发', terms: ['白发', '银发', '银白色头发', 'white hair', 'silver hair', 'grey hair', 'gray hair'] },
  { category: 'hairColor', value: 'blonde', labelZh: '金发', terms: ['金发', '金色头发', 'blond', 'blonde', 'golden hair'] },
  { category: 'hairColor', value: 'brown', labelZh: '棕发', terms: ['棕发', '棕色头发', '栗色头发', 'brown hair', 'chestnut hair'] },
  { category: 'hairColor', value: 'red', labelZh: '红发', terms: ['红发', '赤发', 'red hair', 'ginger hair'] },
  { category: 'hairColor', value: 'blue', labelZh: '蓝发', terms: ['蓝发', '蓝色头发', 'blue hair'] },
  { category: 'hairColor', value: 'pink', labelZh: '粉发', terms: ['粉发', '粉色头发', 'pink hair'] },
  { category: 'hairColor', value: 'green', labelZh: '绿发', terms: ['绿发', '绿色头发', 'green hair'] },
  { category: 'hairColor', value: 'purple', labelZh: '紫发', terms: ['紫发', '紫色头发', 'purple hair'] },
  // 发型长度
  { category: 'hairLength', value: 'long', labelZh: '长发', terms: ['长发', '披肩发', '长直发', 'long hair', 'long-haired'] },
  { category: 'hairLength', value: 'short', labelZh: '短发', terms: ['短发', 'short hair', 'short-haired'] },
  { category: 'hairLength', value: 'ponytail', labelZh: '马尾', terms: ['马尾', 'ponytail'] },
  { category: 'hairLength', value: 'twintails', labelZh: '双马尾', terms: ['双马尾', 'twintails', 'twin tails'] },
  { category: 'hairLength', value: 'bun', labelZh: '丸子头/盘发', terms: ['丸子头', '盘发', '发髻', 'hair bun'] },
  { category: 'hairLength', value: 'bald', labelZh: '光头', terms: ['光头', '秃顶', 'bald'] },
  // 年龄段（只认显式年龄词，不从气质推断）
  { category: 'ageBand', value: 'child', labelZh: '儿童', terms: ['儿童', '孩童', '小孩', '幼童', 'child', 'kid'] },
  { category: 'ageBand', value: 'teen', labelZh: '少年/少女', terms: ['少年', '少女', '青少年', 'teen', 'teenager', 'adolescent'] },
  { category: 'ageBand', value: 'youngAdult', labelZh: '青年', terms: ['青年', '青年男子', '青年女性', 'young adult', 'young man', 'young woman'] },
  { category: 'ageBand', value: 'middleAged', labelZh: '中年', terms: ['中年', 'middle-aged', 'middle aged'] },
  { category: 'ageBand', value: 'elderly', labelZh: '老年', terms: ['老年', '老人', '老者', '年迈', 'elderly', 'old man', 'old woman'] },
  // 配饰
  { category: 'accessory', value: 'glasses', labelZh: '眼镜', terms: ['眼镜', '墨镜', '护目镜', 'glasses', 'spectacles', 'sunglasses', 'goggles'] },
  { category: 'accessory', value: 'hat', labelZh: '帽子', terms: ['帽子', '鸭舌帽', '棒球帽', '贝雷帽', 'hat', 'cap', 'beanie'] },
  { category: 'accessory', value: 'mask', labelZh: '口罩/面具', terms: ['口罩', '面罩', '面具', 'mask'] },
  { category: 'accessory', value: 'earring', labelZh: '耳饰', terms: ['耳环', '耳饰', 'earring'] },
  { category: 'accessory', value: 'necklace', labelZh: '项链', terms: ['项链', '颈饰', 'necklace', 'pendant'] },
  { category: 'accessory', value: 'scarf', labelZh: '围巾', terms: ['围巾', '丝巾', 'scarf'] },
  { category: 'accessory', value: 'gloves', labelZh: '手套', terms: ['手套', 'gloves'] },
  { category: 'accessory', value: 'helmet', labelZh: '头盔', terms: ['头盔', 'helmet'] },
  { category: 'accessory', value: 'headphones', labelZh: '耳机', terms: ['耳机', 'headphones', 'earphones'] },
  { category: 'accessory', value: 'eyepatch', labelZh: '眼罩/眼贴', terms: ['眼罩', 'eyepatch', 'eye patch'] },
  { category: 'accessory', value: 'headwear', labelZh: '头饰', terms: ['发带', '头饰', '蝴蝶结', '发箍', 'headband', 'tiara'] },
  { category: 'accessory', value: 'tie', labelZh: '领带', terms: ['领带', 'necktie', 'tie'] },
];

/**
 * 颜色词表（**两用**，中文只取两字色名以避免「白」误伤「白天」之类）：
 * - 与**服装名词**相邻同现 → `outfitColor`（用 `outfitLabelZh`）；
 * - 与**毛发名词**相邻同现 → `hairColor`（用 `hair.value / hair.labelZh`）。
 *   银 / 灰 / 银白统一归到取值 `white`（与显式词 `grey hair` 同取值），
 *   避免同一外观因措辞不同被拆成两个取值而误报；未给 `hair` 的颜色不参与发色判定。
 */
const COLOR_TERMS: readonly {
  value: string;
  outfitLabelZh: string;
  hair?: { value: string; labelZh: string };
  terms: readonly string[];
}[] = [
  { value: 'white', outfitLabelZh: '白色', hair: { value: 'white', labelZh: '白发/银发' }, terms: ['白色', 'white'] },
  { value: 'black', outfitLabelZh: '黑色', hair: { value: 'black', labelZh: '黑发' }, terms: ['黑色', 'black'] },
  { value: 'red', outfitLabelZh: '红色', hair: { value: 'red', labelZh: '红发' }, terms: ['红色', 'red'] },
  { value: 'blue', outfitLabelZh: '蓝色', hair: { value: 'blue', labelZh: '蓝发' }, terms: ['蓝色', 'blue'] },
  { value: 'green', outfitLabelZh: '绿色', hair: { value: 'green', labelZh: '绿发' }, terms: ['绿色', 'green'] },
  { value: 'yellow', outfitLabelZh: '黄色', terms: ['黄色', 'yellow'] },
  { value: 'purple', outfitLabelZh: '紫色', hair: { value: 'purple', labelZh: '紫发' }, terms: ['紫色', 'purple'] },
  { value: 'pink', outfitLabelZh: '粉色', hair: { value: 'pink', labelZh: '粉发' }, terms: ['粉色', 'pink'] },
  { value: 'grey', outfitLabelZh: '灰色', hair: { value: 'white', labelZh: '白发/银发' }, terms: ['灰色', 'grey', 'gray'] },
  { value: 'brown', outfitLabelZh: '棕色', hair: { value: 'brown', labelZh: '棕发' }, terms: ['棕色', '咖啡色', 'brown'] },
  { value: 'orange', outfitLabelZh: '橙色', terms: ['橙色', 'orange'] },
  { value: 'beige', outfitLabelZh: '米色', terms: ['米色', 'beige'] },
  { value: 'gold', outfitLabelZh: '金色', hair: { value: 'blonde', labelZh: '金发' }, terms: ['金色', 'gold'] },
  { value: 'silver', outfitLabelZh: '银色', hair: { value: 'white', labelZh: '白发/银发' }, terms: ['银色', 'silver'] },
];

/** 服装名词（服装色必须与其中之一**相邻**同现才计入，避免把发色误读成服装色） */
const OUTFIT_GARMENT_TERMS: readonly string[] = [
  '外套', '上衣', '衬衫', '衬衣', '长裙', '短裙', '连衣裙', '裙子', '西装', '制服', '和服',
  '校服', '夹克', '风衣', '毛衣', '卫衣', '背心', '牛仔裤', '裤子', '长裤', '短裤', '斗篷',
  '披风', '铠甲', '盔甲', '军装', '礼服', '工作服', '战袍', '大衣', '马甲', '围裙', '衣服', '服装',
  'coat', 'jacket', 'shirt', 'blouse', 'dress', 'skirt', 'uniform', 'suit', 'sweater',
  'hoodie', 'vest', 'pants', 'trousers', 'shorts', 'cloak', 'cape', 'armor', 'robe', 'gown',
  'kimono', 'jeans',
];

/** 毛发名词（发色必须与其中之一**相邻**同现才计入） */
const HAIR_NOUN_TERMS: readonly string[] = [
  '头发', '长发', '短发', '卷发', '直发', '刘海', '发丝', '马尾', '编发', '发梢',
  'hair', 'ponytail', 'bangs', 'braid',
];

export interface CrossCellAppearanceKeyword {
  category: CrossCellAppearanceCategory;
  /** 归一化取值（跨格比较用） */
  value: string;
  labelZh: string;
  /** 命中的原词（证据展示用） */
  matched: string;
}

/* ────────────────────────── 内部工具 ────────────────────────── */

const isLatin = (term: string): boolean => /^[A-Za-z][A-Za-z\s-]*$/.test(term);

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 找出该词在文本中的所有命中区间（拉丁词按词边界，忽略大小写） */
function findTermSpans(text: string, term: string): { start: number; end: number }[] {
  if (!term) return [];
  const spans: { start: number; end: number }[] = [];
  if (isLatin(term)) {
    const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi');
    let hit = re.exec(text);
    while (hit) {
      spans.push({ start: hit.index, end: hit.index + hit[0].length });
      if (hit.index === re.lastIndex) re.lastIndex += 1;
      hit = re.exec(text);
    }
  } else {
    let from = 0;
    for (;;) {
      const at = text.indexOf(term, from);
      if (at < 0) break;
      spans.push({ start: at, end: at + term.length });
      from = at + term.length;
    }
  }
  return spans;
}

/** 两个区间的字符距离（重叠 = 0） */
function spanGap(a: { start: number; end: number }, b: { start: number; end: number }): number {
  if (a.end <= b.start) return b.start - a.end;
  if (b.end <= a.start) return a.start - b.end;
  return 0;
}

/** 颜色词与某类名词「相邻同现」→ 返回命中的颜色词（未命中返回 null） */
function findAdjacentColorTerm(
  text: string,
  terms: readonly string[],
  nounSpans: readonly { start: number; end: number }[],
): string | null {
  if (nounSpans.length === 0) return null;
  for (const word of terms) {
    const hit = findTermSpans(text, word).some((span) =>
      nounSpans.some((noun) => spanGap(span, noun) <= CONSISTENCY_OUTFIT_ADJACENCY),
    );
    if (hit) return word;
  }
  return null;
}

function normalizeFace(raw: unknown): CrossCellFace | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const confidenceRaw = Number(record.confidence);
  return {
    expression: typeof record.expression === 'string' ? record.expression.trim().toLowerCase() : '',
    confidence: Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0,
    description: typeof record.description === 'string' ? record.description : '',
  };
}
/** 入参归一：非法项丢弃、越界值裁剪；**不抛异常**（顺序与下标位次保留） */
function sanitizeCells(cells: unknown): CrossCellInput[] {
  if (!Array.isArray(cells)) return [];
  const out: CrossCellInput[] = [];
  cells.forEach((raw, position) => {
    if (!raw || typeof raw !== 'object') return;
    const record = raw as Record<string, unknown>;
    const indexRaw = Number(record.index);
    const facesRaw = record.faces;
    const faces = Array.isArray(facesRaw)
      ? (facesRaw.map(normalizeFace).filter((face): face is CrossCellFace => face !== null))
      : null;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    // url 保留原始字符串（含空串）：空串代表「这一格没有图」，`pickBestCell` 的 requireUrl 判据要用到
    const url = typeof record.url === 'string' ? record.url : undefined;
    const reason = typeof record.unavailableReasonZh === 'string' ? record.unavailableReasonZh.trim() : '';
    out.push({
      index: Number.isFinite(indexRaw) ? Math.trunc(indexRaw) : position,
      label: label || undefined,
      url,
      faces,
      unavailableReasonZh: reason || undefined,
    });
  });
  return out;
}

/** 分析成功的格（`faces` 是数组：空数组也是「分析成功且无人脸」这一有效结论） */
function analyzedCells(cells: readonly CrossCellInput[]): (CrossCellInput & { faces: CrossCellFace[] })[] {
  return cells.filter(
    (cell): cell is CrossCellInput & { faces: CrossCellFace[] } => Array.isArray(cell.faces),
  );
}

function cellName(cell: CrossCellInput): string {
  return cell.label?.trim() || `第 ${cell.index + 1} 格`;
}

/** 主脸 = 该格置信度最高的脸（并列取数组靠前者）；无人脸为 null */
function primaryFace(cell: CrossCellInput): CrossCellFace | null {
  const faces = cell.faces;
  if (!Array.isArray(faces) || faces.length === 0) return null;
  let best = faces[0] as CrossCellFace;
  for (const face of faces) {
    if (face.confidence > best.confidence) best = face;
  }
  return best;
}

function avgConfidence(cell: CrossCellInput): number {
  const faces = cell.faces;
  if (!Array.isArray(faces) || faces.length === 0) return 0;
  const sum = faces.reduce((acc, face) => acc + face.confidence, 0);
  return Math.round((sum / faces.length) * 1000) / 1000;
}

/** 取值 → 出现该取值的格（保持格顺序） */
function groupByValue(entries: { cell: CrossCellInput; value: string }[]): Map<string, CrossCellInput[]> {
  const map = new Map<string, CrossCellInput[]>();
  for (const entry of entries) {
    const list = map.get(entry.value);
    if (list) list.push(entry.cell);
    else map.set(entry.value, [entry.cell]);
  }
  return map;
}

/** 取多数基线：返回出现格数最多的取值与其占比（分母 = 可判格数） */
function pickBaseline(
  grouped: Map<string, CrossCellInput[]>,
  population: number,
): { value: string; cells: CrossCellInput[]; ratio: number } | null {
  let best: { value: string; cells: CrossCellInput[]; ratio: number } | null = null;
  for (const [value, cells] of grouped) {
    const ratio = population > 0 ? cells.length / population : 0;
    if (!best || cells.length > best.cells.length) best = { value, cells, ratio };
  }
  return best;
}

const clampRatio = (value: unknown, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1) return fallback;
  return n;
};

const clampMinSample = (value: unknown, fallback: number): number => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 2 ? n : fallback;
};

/* ────────────────────────── 1. 人脸有无 / 数量 ────────────────────────── */

export interface CompareFacePresenceOptions {
  /** 「有人有、有人无」的 severity；缺省 `error`（最强的不一致信号），可降为 `warn` */
  presenceSeverity?: 'error' | 'warn';
}

/**
 * 格间人脸数量比对。
 *
 * 判据：
 * - 只在**分析成功**的格之间比；不可用的格不参与（也不按「无人脸」算）；
 * - 分析成功格 < `CONSISTENCY_MIN_COMPARABLE_CELLS` → 不判；
 * - 所有格人脸数一致 → 无问题；
 * - 存在「有人脸」与「无人脸」两种格 → `face-presence-mismatch`，severity 缺省 `error`
 *   （格间主体不是同一个人的强信号），可用 `presenceSeverity: 'warn'` 降级；
 * - 每格都有人脸但数量不同 → `face-count-mismatch`，severity `warn`
 *   （可能是背景路人 / 双人同框，不上升为 error）。
 */
export function compareFacePresence(
  cells: readonly CrossCellInput[] | null | undefined,
  options: CompareFacePresenceOptions = {},
): CrossCellIssue[] {
  try {
    const list = analyzedCells(sanitizeCells(cells));
    if (list.length < CONSISTENCY_MIN_COMPARABLE_CELLS) return [];

    const withFace = list.filter((cell) => cell.faces.length > 0);
    const withoutFace = list.filter((cell) => cell.faces.length === 0);
    const entries = list.map((cell) => ({
      cellIndex: cell.index,
      label: cell.label,
      value: `${cell.faces.length} 张人脸${cell.faces.length === 0 ? '（未检出）' : ''}`,
    }));
    const describe = (targets: readonly (CrossCellInput & { faces: CrossCellFace[] })[]): string =>
      targets.map((cell) => `${cellName(cell)} ${cell.faces.length} 张`).join('、');

    const issues: CrossCellIssue[] = [];

    if (withFace.length > 0 && withoutFace.length > 0) {
      const severity: CrossCellSeverity = options.presenceSeverity === 'warn' ? 'warn' : 'error';
      const main = withoutFace[0] as CrossCellInput & { faces: CrossCellFace[] };
      issues.push({
        cellIndex: main.index,
        relatedCellIndexes: withFace.map((cell) => cell.index),
        severity,
        code: 'face-presence-mismatch',
        messageZh:
          `${withoutFace.map(cellName).join('、')}未检出人脸，而 ${describe(withFace)} 检出了人脸：` +
          '格间主体不一致（可能是同一角色没画出来、被裁掉或换人），请人工核对。',
        evidence: {
          kind: 'face-presence-mismatch',
          summaryZh: `无人脸：${withoutFace.map((cell) => `${cellName(cell)} 0 张`).join('、')}；有人脸：${describe(withFace)}`,
          entries,
        },
      });
    }

    // 数量比对只在「都有人脸」的格之间做：无人脸格已被上一条（更重）覆盖，不重复计一遍
    if (withFace.length >= CONSISTENCY_MIN_COMPARABLE_CELLS) {
      const counts = withFace.map((cell) => cell.faces.length);
      if (new Set(counts).size > 1) {
        const majority = counts.find(
          (count) => counts.filter((c) => c === count).length > counts.length / 2,
        );
        const baselineCount = majority ?? Math.max(...counts);
        const baselineCells = withFace.filter((cell) => cell.faces.length === baselineCount);
        const outliers = withFace.filter((cell) => cell.faces.length !== baselineCount);
        if (outliers.length > 0) {
          const main = outliers[0] as CrossCellInput & { faces: CrossCellFace[] };
          const note = majority === undefined ? '（未形成多数，取最多数作基线）' : '';
          issues.push({
            cellIndex: main.index,
            relatedCellIndexes: baselineCells.map((cell) => cell.index),
            severity: 'warn',
            code: 'face-count-mismatch',
            messageZh:
              `格间人脸数量不一致：${describe(outliers)}，其余格 ${describe(baselineCells)}${note}。` +
              '可能是背景路人或双人同框，请人工核对。',
            evidence: {
              kind: 'face-count-mismatch',
              summaryZh: `基线 ${baselineCount} 张${note}：${describe(baselineCells)}；不同：${describe(outliers)}`,
              entries: withFace.map((cell) => ({
                cellIndex: cell.index,
                label: cell.label,
                value: `${cell.faces.length} 张人脸`,
              })),
            },
          });
        }
      }
    }

    return issues;
  } catch {
    return [];
  }
}

/* ────────────────────────── 2. 表情突变 ────────────────────────── */

export interface FindExpressionOutliersOptions {
  /** 最小可判格数（缺省 `CONSISTENCY_BASELINE_MIN_SAMPLE` = 3） */
  minSample?: number;
  /** 基线最低占比（缺省 `CONSISTENCY_BASELINE_MAJORITY_RATIO` = 0.6） */
  majorityRatio?: number;
  /** 突变格 severity（缺省 `warn`） */
  outlierSeverity?: 'warn' | 'info';
}

/**
 * 以「多数表情」为基线，标出突变格。
 *
 * 判据：
 * - 只取分析成功且**有人脸**的格；每格取**主脸**（置信度最高）的表情；
 * - 表情为空的格不参与（无法比较，不猜）；
 * - 可判格 < `minSample`（缺省 3）→ 不判；基线占比 < `majorityRatio`（缺省 0.6）→ 不判
 *   （没有多数就没有「突变」可言，避免 2 格 1:1 这类乱标）；
 * - 每个与基线不同的格一条 issue，severity 缺省 `warn`，证据里同时给出基线与该格取值。
 */
export function findExpressionOutliers(
  cells: readonly CrossCellInput[] | null | undefined,
  options: FindExpressionOutliersOptions = {},
): CrossCellIssue[] {
  try {
    const minSample = clampMinSample(options.minSample, CONSISTENCY_BASELINE_MIN_SAMPLE);
    const majorityRatio = clampRatio(options.majorityRatio, CONSISTENCY_BASELINE_MAJORITY_RATIO);
    const severity: CrossCellSeverity = options.outlierSeverity === 'info' ? 'info' : 'warn';

    const list = analyzedCells(sanitizeCells(cells)).filter((cell) => cell.faces.length > 0);
    const samples = list
      .map((cell) => ({ cell, expression: primaryFace(cell)?.expression ?? '' }))
      .filter((sample) => sample.expression !== '');
    if (samples.length < minSample) return [];

    const grouped = groupByValue(
      samples.map((sample) => ({ cell: sample.cell, value: sample.expression })),
    );
    const baseline = pickBaseline(grouped, samples.length);
    if (!baseline || baseline.ratio < majorityRatio) return [];

    const outliers = samples.filter((sample) => sample.expression !== baseline.value);
    if (outliers.length === 0) return [];

    return outliers.map((outlier) => ({
      cellIndex: outlier.cell.index,
      relatedCellIndexes: baseline.cells.map((cell) => cell.index),
      severity,
      code: 'expression-outlier' as const,
      messageZh:
        `表情突变：${cellName(outlier.cell)}主表情为「${outlier.expression}」，` +
        `而 ${baseline.cells.length}/${samples.length} 格为「${baseline.value}」：请核对该格是否需要重出。`,
      evidence: {
        kind: 'expression-outlier' as const,
        summaryZh:
          `基线「${baseline.value}」：${baseline.cells.map((cell) => cellName(cell)).join('、')}；` +
          `本格「${outlier.expression}」`,
        entries: samples.map((sample) => ({
          cellIndex: sample.cell.index,
          label: sample.cell.label,
          value: sample.expression,
        })),
      },
    }));
  } catch {
    return [];
  }
}

/* ────────────────────────── 3. 外观关键词抽取 ────────────────────────── */

/**
 * 从人脸描述里抽取**可比的外观关键词**（发色 / 发型长度 / 服装颜色 / 年龄段 / 配饰）。
 *
 * 规则（保守，宁缺勿滥）：
 * - 只用固定词表命中，**不做任何语义推断**（体型 / 肤色 / 气质一律不取）；
 * - 发色 / 服装颜色必须与相应名词（毛发 / 服装）**相邻同现**（间隔 ≤ `CONSISTENCY_OUTFIT_ADJACENCY` 字符，
 *   重叠算 0），避免把「黑发」误读成「黑色服装」、也避免把「黑色长裙」误读成发色；
 * - 同类别同取值去重（保留首个命中词作为证据）；
 * - 入参非字符串 / 空串 → 返回 `[]`；本函数**不抛异常**。
 */
export function extractAppearanceKeywords(description: unknown): CrossCellAppearanceKeyword[] {
  try {
    const text = typeof description === 'string' ? description.slice(0, 2000) : '';
    if (!text.trim()) return [];

    const out: CrossCellAppearanceKeyword[] = [];
    const seen = new Set<string>();

    // 1) 显式词表（可判定的类别，含「黑发 / black-haired」这类精确写法）
    for (const term of CROSS_CELL_APPEARANCE_TERMS) {
      for (const word of term.terms) {
        if (findTermSpans(text, word).length === 0) continue;
        const key = `${term.category}:${term.value}`;
        if (seen.has(key)) break;
        seen.add(key);
        out.push({ category: term.category, value: term.value, labelZh: term.labelZh, matched: word });
        break;
      }
    }

    // 2) 颜色词 + 名词相邻同现（覆盖「黑色长发 / black long hair / 白色外套」这类常见写法）
    const garmentSpans = OUTFIT_GARMENT_TERMS.flatMap((garment) => findTermSpans(text, garment));
    const hairSpans = HAIR_NOUN_TERMS.flatMap((noun) => findTermSpans(text, noun));
    for (const color of COLOR_TERMS) {
      const outfitHit = findAdjacentColorTerm(text, color.terms, garmentSpans);
      if (outfitHit && !seen.has(`outfitColor:${color.value}`)) {
        seen.add(`outfitColor:${color.value}`);
        out.push({
          category: 'outfitColor',
          value: color.value,
          labelZh: color.outfitLabelZh,
          matched: outfitHit,
        });
      }
      const hair = color.hair;
      if (!hair) continue;
      const hairHit = findAdjacentColorTerm(text, color.terms, hairSpans);
      if (hairHit && !seen.has(`hairColor:${hair.value}`)) {
        seen.add(`hairColor:${hair.value}`);
        out.push({
          category: 'hairColor',
          value: hair.value,
          labelZh: hair.labelZh,
          matched: hairHit,
        });
      }
    }

    const order: CrossCellAppearanceCategory[] = [
      'hairColor',
      'hairLength',
      'outfitColor',
      'ageBand',
      'accessory',
    ];
    return out.sort((a, b) => {
      const byCategory = order.indexOf(a.category) - order.indexOf(b.category);
      return byCategory !== 0 ? byCategory : a.value.localeCompare(b.value);
    });
  } catch {
    return [];
  }
}

/* ────────────────────────── 4. 外观冲突 ────────────────────────── */

export interface FindAppearanceConflictsOptions {
  /** 最小可判格数（缺省 `CONSISTENCY_BASELINE_MIN_SAMPLE` = 3） */
  minSample?: number;
  /** 基线最低占比（缺省 0.6） */
  majorityRatio?: number;
  /** 冲突格 severity（缺省 `warn`） */
  conflictSeverity?: 'warn' | 'info';
}

/**
 * 外观关键词类别基线比对。
 *
 * 判据（逐类别独立判定）：
 * - 每格取**主脸**描述做关键词抽取；
 * - **可判格 = 主脸描述非空的格**（描述为空 = 没有任何证据，排除；「描述里没写」算可判但缺该取值）；
 * - 某类别在 ≥ `minSample`（缺省 3）格里可判时才判；
 * - 取该类别下出现格数最多的取值为基线，基线占比 ≥ `majorityRatio`（缺省 0.6）才成立；
 * - 可判格中**不含**基线取值的格 → `appearance-conflict`（severity 缺省 `warn`），逐格一条；
 * - 证据里同时给出基线与该格取值（该格无取值时写「（该类别无关键词）」）。
 *
 * 置信边界：LLM 描述**漏写**与**真的没有**在本模块里无法区分，
 * 因此文案措辞为「描述中未出现」，severity 为 `warn` 而非 `error`。
 */
export function findAppearanceConflicts(
  cells: readonly CrossCellInput[] | null | undefined,
  options: FindAppearanceConflictsOptions = {},
): CrossCellIssue[] {
  try {
    const minSample = clampMinSample(options.minSample, CONSISTENCY_BASELINE_MIN_SAMPLE);
    const majorityRatio = clampRatio(options.majorityRatio, CONSISTENCY_BASELINE_MAJORITY_RATIO);
    const severity: CrossCellSeverity = options.conflictSeverity === 'info' ? 'info' : 'warn';

    const list = analyzedCells(sanitizeCells(cells)).filter((cell) => cell.faces.length > 0);
    const keywordsByCell = list.map((cell) => ({
      cell,
      description: (primaryFace(cell)?.description ?? '').trim(),
      keywords: extractAppearanceKeywords(primaryFace(cell)?.description ?? ''),
    }));

    const issues: CrossCellIssue[] = [];
    const categories = Object.keys(CROSS_CELL_APPEARANCE_CATEGORY_LABELS) as CrossCellAppearanceCategory[];

    for (const category of categories) {
      const judgeable = keywordsByCell
        .filter((entry) => entry.description !== '')
        .map((entry) => ({
          cell: entry.cell,
          values: entry.keywords.filter((k) => k.category === category).map((k) => k.value),
          labels: entry.keywords.filter((k) => k.category === category).map((k) => k.labelZh),
        }));
      if (judgeable.length < minSample) continue;

      const grouped = groupByValue(
        judgeable.flatMap((entry) => entry.values.map((value) => ({ cell: entry.cell, value }))),
      );
      const baseline = pickBaseline(grouped, judgeable.length);
      if (!baseline || baseline.ratio < majorityRatio) continue;

      const baselineLabels = Array.from(
        new Set(
          judgeable
            .filter((entry) => entry.values.includes(baseline.value))
            .flatMap((entry) => entry.labels),
        ),
      );
      const baselineName = baselineLabels[0] ?? baseline.value;
      const conflictCells = judgeable.filter((entry) => !entry.values.includes(baseline.value));

      for (const entry of conflictCells) {
        const ownLabels = entry.labels.join('、') || '未提到该类别';
        issues.push({
          cellIndex: entry.cell.index,
          relatedCellIndexes: baseline.cells.map((cell) => cell.index),
          severity,
          code: 'appearance-conflict',
          messageZh:
            `${CROSS_CELL_APPEARANCE_CATEGORY_LABELS[category]}不一致：${cellName(entry.cell)}描述中未出现` +
            `「${baselineName}」（该格：${ownLabels}），而 ${baseline.cells.length}/${judgeable.length} 格一致。` +
            '描述漏写也会命中本条，请人工核对。',
          evidence: {
            kind: 'appearance-conflict',
            summaryZh:
              `基线「${baselineName}」：${baseline.cells.map((cell) => cellName(cell)).join('、')}；` +
              `${cellName(entry.cell)}：${ownLabels}`,
            entries: judgeable.map((cellEntry) => ({
              cellIndex: cellEntry.cell.index,
              label: cellEntry.cell.label,
              value: cellEntry.labels.join('、') || '（该类别无关键词）',
            })),
          },
        });
      }
    }

    return issues;
  } catch {
    return [];
  }
}

/* ────────────────────────── 5. 低置信人脸 ────────────────────────── */

export interface FindLowConfidenceOptions {
  /** 阈值（缺省 `CONSISTENCY_LOW_CONFIDENCE` = 0.4） */
  threshold?: number;
}

/**
 * 置信度提示。
 *
 * 判据：某格**所有人脸置信度的最大值** < 阈值（缺省 0.4）→ `low-confidence-face`（severity `info`）。
 * 用最大值而不是均值：只要有一张脸是可信的，该格「有人脸」的结论就站得住。
 */
export function findLowConfidenceFaces(
  cells: readonly CrossCellInput[] | null | undefined,
  options: FindLowConfidenceOptions = {},
): CrossCellIssue[] {
  try {
    const raw = Number(options.threshold);
    const threshold = Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : CONSISTENCY_LOW_CONFIDENCE;
    const list = analyzedCells(sanitizeCells(cells)).filter((cell) => cell.faces.length > 0);
    const issues: CrossCellIssue[] = [];
    for (const cell of list) {
      const best = primaryFace(cell)?.confidence ?? 0;
      if (best >= threshold) continue;
      issues.push({
        cellIndex: cell.index,
        severity: 'info',
        code: 'low-confidence-face',
        messageZh:
          `${cellName(cell)}人脸置信度最高仅 ${best.toFixed(2)}（低于 ${threshold}）：` +
          '该格「有人脸」的结论可靠性低，请人工确认后再据此判断一致性。',
        evidence: {
          kind: 'low-confidence-face',
          summaryZh: `${cellName(cell)} 最高置信度 ${best.toFixed(2)} < ${threshold}`,
          entries: cell.faces.map((face, at) => ({
            cellIndex: cell.index,
            label: cell.label,
            value: `第 ${at + 1} 张 · ${face.expression || '（无表情字段）'} · ${face.confidence.toFixed(2)}`,
          })),
        },
      });
    }
    return issues;
  } catch {
    return [];
  }
}

/* ────────────────────────── 6. 报告汇总 ────────────────────────── */

export interface BuildConsistencyReportOptions
  extends CompareFacePresenceOptions,
    FindExpressionOutliersOptions,
    FindAppearanceConflictsOptions,
    FindLowConfidenceOptions {
  /** 未纳入校验的格数（未出图等）；仅用于 summary 如实说明，不参与判定 */
  skippedCount?: number;
  /** 场景说明（角色名 / 版面等），仅进 summary 文案 */
  contextZh?: string;
}

function countBySeverity(issues: readonly CrossCellIssue[]): Record<CrossCellSeverity, number> {
  return {
    error: issues.filter((issue) => issue.severity === 'error').length,
    warn: issues.filter((issue) => issue.severity === 'warn').length,
    info: issues.filter((issue) => issue.severity === 'info').length,
  };
}

/**
 * 汇总一份跨格一致性报告。
 *
 * 汇总口径：
 * - `checkedCount` = 拿到可用人脸分析结果的格数（含「分析成功且无人脸」）；
 * - 可比较格 < 2 → **不产出结论**，返回 `unavailable`（原因写清），`issues` 为空；
 * - 分析失败的格不静默丢弃：逐格产出一条 `cell-unanalyzed`（severity `warn`）说明该格未被覆盖；
 * - 问题按 severity（error → warn → info）再按格序号排序；
 * - 本函数只汇总，**不做任何数据改写**；`unavailable` 非空时调用方必须如实展示，不得当成「无问题」。
 */
export function buildConsistencyReport(
  cells: readonly CrossCellInput[] | null | undefined,
  options: BuildConsistencyReportOptions = {},
): CrossCellReport {
  const sanitized = sanitizeCells(cells);
  const analyzed = analyzedCells(sanitized);
  const skipped = Math.max(0, Math.trunc(Number(options.skippedCount) || 0));
  const context = options.contextZh?.trim();
  const contextNote = context ? `（${context}）` : '';

  try {
    if (analyzed.length === 0) {
      const reason = skipped > 0
        ? `没有可用的人脸分析结果（本次 ${skipped} 格未纳入校验）：无法给出跨格一致性结论。`
        : '没有可用的人脸分析结果：无法给出跨格一致性结论。';
      return {
        issues: [],
        summaryZh: `未做任何格间比较${contextNote}：${reason}`,
        checkedCount: 0,
        unavailable: reason,
      };
    }

    if (analyzed.length < CONSISTENCY_MIN_COMPARABLE_CELLS) {
      const reason =
        `只有 ${analyzed.length} 格有可用的人脸分析结果，少于 ${CONSISTENCY_MIN_COMPARABLE_CELLS} 格，` +
        '无法做格间比较：本次不出结论，请先补齐出图 / 排查人脸分析服务后重试。';
      return {
        issues: [],
        summaryZh: `未做格间比较${contextNote}：${reason}`,
        checkedCount: analyzed.length,
        unavailable: reason,
      };
    }

    const unanalyzed = sanitized.filter((cell) => !Array.isArray(cell.faces));
    const unanalyzedIssues: CrossCellIssue[] = unanalyzed.map((cell) => ({
      cellIndex: cell.index,
      severity: 'warn',
      code: 'cell-unanalyzed',
      messageZh:
        `${cellName(cell)}没有可用的人脸分析结果：${cell.unavailableReasonZh ?? '原因未提供'}` +
        '——本格未参与比对，报告不覆盖它。',
      evidence: {
        kind: 'cell-unanalyzed',
        summaryZh: `${cellName(cell)}：${cell.unavailableReasonZh ?? '原因未提供'}`,
        entries: [
          {
            cellIndex: cell.index,
            label: cell.label,
            value: cell.unavailableReasonZh ?? '原因未提供',
          },
        ],
      },
    }));

    const issues = [
      ...compareFacePresence(sanitized, options),
      ...findExpressionOutliers(sanitized, options),
      ...findAppearanceConflicts(sanitized, options),
      ...findLowConfidenceFaces(sanitized, options),
      ...unanalyzedIssues,
    ].sort((a, b) => {
      const bySeverity = crossCellSeverityRank(a.severity) - crossCellSeverityRank(b.severity);
      return bySeverity !== 0 ? bySeverity : a.cellIndex - b.cellIndex;
    });

    const counts = countBySeverity(issues);
    const notes: string[] = [];
    if (skipped > 0) notes.push(`另有 ${skipped} 格未纳入校验（未出图或未分析）`);
    if (unanalyzed.length > 0) notes.push(`${unanalyzed.length} 格人脸分析不可用`);

    const summaryZh =
      `跨格一致性${contextNote}：已比对人脸分析 ${analyzed.length} 格 —— ` +
      `错误 ${counts.error} · 警告 ${counts.warn} · 提示 ${counts.info}` +
      (notes.length > 0 ? `；${notes.join('；')}` : '') +
      '。人脸分析为服务端视觉模型输出，本报告判定均为启发式，仅作提示，不自动改写任何提示词 / 数据。';

    return { issues, summaryZh, checkedCount: analyzed.length };
  } catch (error) {
    const reason = `一致性报告构造异常：${error instanceof Error ? error.message : String(error)}`;
    return {
      issues: [],
      summaryZh: `未做任何格间比较${contextNote}：${reason}`,
      checkedCount: analyzed.length,
      unavailable: reason,
    };
  }
}

/* ────────────────────────── 7. 挑最优格 ────────────────────────── */

export interface PickBestCellOptions {
  /**
   * 优先格序号（如设定表的三视图正面格）。作用位置：**warn / info 数相同之后、置信度之前**，
   * 即「先看问题多少，再优先指定格，再比置信度」，不会用优先格盖掉更严重的问题。
   */
  preferIndexes?: readonly number[];
  /**
   * 是否要求格有图（`url` 是字符串时按去空判断；未提供 `url` 字段视为不适用本条）。
   * 缺省 `true`：推荐格是给下游当首帧用的，没图的格不能推荐。
   */
  requireUrl?: boolean;
  /** 场景说明，仅进文案 */
  contextZh?: string;
}

/**
 * 结合问题项给出「推荐格」。
 *
 * 判据（顺序固定、可核对）：
 * 1. 候选 = 有可用人脸分析结果的格（`faces` 是数组）；`requireUrl !== false` 时排除「有 url 字段但为空」的格；
 * 2. 候选为空 → **无法推荐**（`ok: false`，不猜）；
 * 3. 被 `error` 级问题指向的候选格**排除**（格间主体不一致，不宜作基准格），排除理由如实列出；
 * 4. 排除后无候选 → **无法推荐**（所有格都有错误级问题，先修再选）；
 * 5. 其余按 [warn 数 ↑, info 数 ↑, 优先格优先, 人脸平均置信度 ↓, 格序号 ↑] 排序取第一；
 * 6. 只剩 1 个候选时给出推荐，但在理由里明确「仅此格有可用分析，未做格间比较」。
 */
export function pickBestCell(
  cells: readonly CrossCellInput[] | null | undefined,
  report: CrossCellReport | null | undefined,
  options: PickBestCellOptions = {},
): CrossCellPickResult {
  const empty: CrossCellPickResult = {
    ok: false,
    reasonZh: '没有一致性报告：请先做一次一致性校验，再挑最优格。',
    excludedZh: [],
    candidates: [],
  };
  try {
    if (!report || typeof report !== 'object' || !Array.isArray(report.issues)) return empty;

    const context = options.contextZh?.trim();
    const contextNote = context ? `（${context}）` : '';
    const prefer = new Set((options.preferIndexes ?? []).map((value) => Math.trunc(Number(value))));
    const requireUrl = options.requireUrl !== false;

    const all = sanitizeCells(cells);
    const eligible = all.filter((cell) => {
      if (!Array.isArray(cell.faces)) return false;
      if (requireUrl && typeof cell.url === 'string' && cell.url.trim() === '') return false;
      return true;
    });

    if (eligible.length === 0) {
      return {
        ok: false,
        reasonZh: report.unavailable
          ? `无法推荐：没有可用的人脸分析结果${contextNote}。`
          : `无法推荐：${all.length > 0 ? '没有一格有可用的人脸分析结果（已出图但分析失败 / 未做分析）' : '没有可推荐的格'}${contextNote}。`,
        excludedZh: [],
        candidates: [],
      };
    }

    const errorCells = new Set(
      report.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.cellIndex),
    );
    const kept = eligible.filter((cell) => !errorCells.has(cell.index));
    const excludedZh = eligible
      .filter((cell) => errorCells.has(cell.index))
      .map((cell) => `${cellName(cell)}：有错误级问题（格间主体不一致），不作推荐`);

    if (kept.length === 0) {
      return {
        ok: false,
        reasonZh:
          `无法推荐：所有 ${eligible.length} 格都有错误级问题${contextNote}，` +
          '请先修复格间主体不一致（重跑对应格）后再挑最优格。',
        excludedZh,
        candidates: [],
      };
    }

    const scored: (CrossCellPickCandidate & { cell: CrossCellInput })[] = kept.map((cell) => {
      const own = report.issues.filter((issue) => issue.cellIndex === cell.index);
      return {
        cellIndex: cell.index,
        label: cell.label,
        errorCount: own.filter((issue) => issue.severity === 'error').length,
        warnCount: own.filter((issue) => issue.severity === 'warn').length,
        infoCount: own.filter((issue) => issue.severity === 'info').length,
        avgConfidence: avgConfidence(cell),
        preferred: prefer.has(cell.index),
        cell,
      };
    });

    scored.sort((a, b) => {
      if (a.warnCount !== b.warnCount) return a.warnCount - b.warnCount;
      if (a.infoCount !== b.infoCount) return a.infoCount - b.infoCount;
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
      if (a.avgConfidence !== b.avgConfidence) return b.avgConfidence - a.avgConfidence;
      return a.cellIndex - b.cellIndex;
    });

    const best = scored[0] as CrossCellPickCandidate & { cell: CrossCellInput };
    const candidates: CrossCellPickCandidate[] = scored.map((entry) => ({
      cellIndex: entry.cellIndex,
      label: entry.label,
      errorCount: entry.errorCount,
      warnCount: entry.warnCount,
      infoCount: entry.infoCount,
      avgConfidence: entry.avgConfidence,
      preferred: entry.preferred,
    }));
    const notes: string[] = [
      `错误 ${best.errorCount} 项 / 警告 ${best.warnCount} 项 / 提示 ${best.infoCount} 项`,
      `人脸平均置信度 ${best.avgConfidence.toFixed(2)}`,
    ];
    if (best.preferred) notes.push('命中优先格');
    if (kept.length === 1) notes.push('仅此格有可用分析，未做格间比较');
    if (excludedZh.length > 0) notes.push(`已排除 ${excludedZh.length} 格错误级问题格`);

    return {
      ok: true,
      index: best.cellIndex,
      label: best.label,
      reasonZh: `推荐${cellName(best.cell)}${contextNote}：${notes.join('，')}。（判据：先排除错误级问题格，再按警告数、提示数、优先格、置信度排序）`,
      excludedZh,
      candidates,
    };
  } catch (error) {
    return {
      ok: false,
      reasonZh: `无法推荐：推荐计算异常（${error instanceof Error ? error.message : String(error)}）。`,
      excludedZh: [],
      candidates: [],
    };
  }
}
