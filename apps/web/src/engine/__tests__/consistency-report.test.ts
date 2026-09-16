/**
 * 跨格一致性报告回归（packages/shared/src/utils/consistency-report.ts）。
 *
 * 注意：本文件 import 走**相对路径直取 shared 源码**，不走 '@nx9/shared' barrel
 * （该 barrel 当前引用了 8 个不存在的 data/* 模块 —— 既有缺陷，见
 * docs/NX9-CONSISTENCY-CHECK.md 与 docs/NX9-CELL-GEN-CONCURRENCY.md）。
 *
 * 覆盖：人脸有无 / 数量判据与 severity 边界、表情突变基线、外观关键词抽取（含反例）、
 * 外观冲突、低置信、报告不可用路径（**不得产生假报告**）、逐格证据内容、挑最优格判据与
 * 「无法推荐」分支、纯函数（可序列化 / 不抛异常）。
 */
import { describe, expect, it } from 'vitest';
import {
  CONSISTENCY_LOW_CONFIDENCE,
  CROSS_CELL_APPEARANCE_TERMS,
  buildConsistencyReport,
  compareFacePresence,
  extractAppearanceKeywords,
  findAppearanceConflicts,
  findExpressionOutliers,
  findLowConfidenceFaces,
  pickBestCell,
  type CrossCellFace,
  type CrossCellInput,
} from '../../../../../packages/shared/src/utils/consistency-report';

/* ── 造数据的小工具 ── */

function face(expression: string, confidence = 0.9, description = ''): CrossCellFace {
  return { expression, confidence, description };
}

function cell(index: number, faces: CrossCellFace[] | null, extra: Partial<CrossCellInput> = {}): CrossCellInput {
  return { index, faces, ...extra };
}

/** n 格，表情统一为 expression、描述统一为 description */
function uniformCells(n: number, expression = 'neutral', description = '黑发少年，黑色外套'): CrossCellInput[] {
  return Array.from({ length: n }, (_, i) => cell(i, [face(expression, 0.9, description)]));
}

const codes = (issues: { code: string }[]): string[] => issues.map((issue) => issue.code);

/* ────────────────────────── 1. 人脸有无 / 数量 ────────────────────────── */

describe('compareFacePresence：人脸有无与数量', () => {
  it('有人有、有人无 → face-presence-mismatch（error），主责格是无人脸的那格', () => {
    const issues = compareFacePresence([
      cell(0, [face('neutral')], { label: '正面' }),
      cell(1, []),
      cell(2, [face('neutral')]),
    ]);

    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.code).toBe('face-presence-mismatch');
    expect(issue.severity).toBe('error');
    expect(issue.cellIndex).toBe(1);
    expect(issue.relatedCellIndexes).toEqual([0, 2]);
    // 证据：哪两格、什么值
    expect(issue.evidence.kind).toBe('face-presence-mismatch');
    expect(issue.evidence.entries).toEqual([
      { cellIndex: 0, label: '正面', value: '1 张人脸' },
      { cellIndex: 1, label: undefined, value: '0 张人脸（未检出）' },
      { cellIndex: 2, label: undefined, value: '1 张人脸' },
    ]);
    expect(issue.evidence.summaryZh).toContain('无人脸：第 2 格 0 张');
    expect(issue.evidence.summaryZh).toContain('有人脸：正面 1 张、第 3 格 1 张');
    expect(issue.messageZh).toContain('第 2 格未检出人脸');
  });

  it('presenceSeverity 可把「有人有、有人无」降级为 warn（远景推演场景）', () => {
    const issues = compareFacePresence([cell(0, [face('neutral')]), cell(1, [])], {
      presenceSeverity: 'warn',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('warn');
  });

  it('每格都有人脸但数量不同（1 vs 2）→ face-count-mismatch（warn），不上升为 error', () => {
    const issues = compareFacePresence([
      cell(0, [face('neutral')]),
      cell(1, [face('neutral')]),
      cell(2, [face('neutral'), face('neutral')]),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('face-count-mismatch');
    expect(issues[0]!.severity).toBe('warn');
    expect(issues[0]!.cellIndex).toBe(2);
    expect(issues[0]!.evidence.summaryZh).toContain('基线 1 张');
    expect(issues[0]!.messageZh).toContain('第 3 格 2 张，其余格 第 1 格 1 张、第 2 格 1 张');
  });

  it('有人有 / 有人无 与数量不同同时成立时，两条都报（先重后轻）', () => {
    const issues = compareFacePresence([
      cell(0, [face('neutral')]),
      cell(1, [face('neutral'), face('neutral')]),
      cell(2, []),
    ]);
    expect(codes(issues)).toEqual(['face-presence-mismatch', 'face-count-mismatch']);
  });

  it('人脸数量全一致 → 无问题', () => {
    expect(compareFacePresence(uniformCells(4))).toEqual([]);
    expect(compareFacePresence([cell(0, []), cell(1, [])])).toEqual([]);
  });

  it('faces 为 null（分析不可用）的格不参与比较，也不被当成「无人脸」', () => {
    const issues = compareFacePresence([
      cell(0, [face('neutral')]),
      cell(1, [face('neutral')]),
      cell(2, null, { unavailableReasonZh: '人脸分析服务不可用' }),
    ]);
    expect(issues).toEqual([]);
  });

  it('可比较格不足 2 格 → 不判（无「多数」可言）', () => {
    expect(compareFacePresence([cell(0, [face('neutral')])])).toEqual([]);
    expect(compareFacePresence([])).toEqual([]);
    expect(compareFacePresence(null)).toEqual([]);
  });
});

/* ────────────────────────── 2. 表情突变 ────────────────────────── */

describe('findExpressionOutliers：多数基线', () => {
  it('3 格 neutral + 1 格 angry → 只标突变格，证据给出基线与取值', () => {
    const issues = findExpressionOutliers([
      cell(0, [face('neutral')]),
      cell(1, [face('neutral')]),
      cell(2, [face('neutral')]),
      cell(3, [face('angry')], { label: '第 4 机位' }),
    ]);

    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.code).toBe('expression-outlier');
    expect(issue.severity).toBe('warn');
    expect(issue.cellIndex).toBe(3);
    expect(issue.relatedCellIndexes).toEqual([0, 1, 2]);
    expect(issue.evidence.summaryZh).toContain('基线「neutral」');
    expect(issue.evidence.summaryZh).toContain('本格「angry」');
    expect(issue.messageZh).toContain('3/4 格为「neutral」');
    expect(issue.evidence.entries).toHaveLength(4);
  });

  it('基线占比 2/3 = 0.67 ≥ 0.6 → 判；1/3 → 不判（没有多数就不叫突变）', () => {
    expect(
      findExpressionOutliers([
        cell(0, [face('neutral')]),
        cell(1, [face('neutral')]),
        cell(2, [face('sad')]),
      ]),
    ).toHaveLength(1);

    expect(
      findExpressionOutliers([
        cell(0, [face('neutral')]),
        cell(1, [face('sad')]),
        cell(2, [face('angry')]),
      ]),
    ).toEqual([]);
  });

  it('可判格 < minSample（缺省 3）→ 不判；调低 minSample 且基线占比达标才判', () => {
    const two = [cell(0, [face('neutral')]), cell(1, [face('angry')])];
    expect(findExpressionOutliers(two)).toEqual([]);
    const issues = findExpressionOutliers(two, { minSample: 2, majorityRatio: 0.5 });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('warn');
    expect(findExpressionOutliers(two, { minSample: 2, majorityRatio: 0.5, outlierSeverity: 'info' })[0]!
      .severity).toBe('info');
  });

  it('多脸格取「主脸」（置信度最高那张）的表情；表情为空的格不参与', () => {
    const issues = findExpressionOutliers([
      cell(0, [face('neutral', 0.4), face('angry', 0.95)]),
      cell(1, [face('neutral', 0.8)]),
      cell(2, [face('neutral', 0.7)]),
      cell(3, [face('neutral', 0.7)]),
    ]);
    // 格 0 的主表情是高置信的 angry → 它是突变格
    expect(issues).toHaveLength(1);
    expect(issues[0]!.cellIndex).toBe(0);
    expect(issues[0]!.messageZh).toContain('angry');

    // 表情字段为空的格不算可判格：3 格里只剩 2 格可判 → 低于 minSample 3 → 不判
    expect(
      findExpressionOutliers([
        cell(0, [face('neutral')]),
        cell(1, [face('neutral')]),
        cell(2, [face('')]),
      ]),
    ).toEqual([]);
  });

  it('faces 为 null 的格不参与样本', () => {
    expect(
      findExpressionOutliers([
        cell(0, [face('neutral')]),
        cell(1, [face('neutral')]),
        cell(2, null, { unavailableReasonZh: '人脸分析服务不可用' }),
      ]),
    ).toEqual([]);
  });
});

/* ────────────────────────── 3. 外观关键词 ────────────────────────── */

describe('extractAppearanceKeywords：只取可稳定判定的类别', () => {
  it('发色 / 发型长度 / 年龄段 / 配饰可判（类别顺序固定）', () => {
    const keywords = extractAppearanceKeywords('黑发少女，短发，戴着眼镜');
    expect(keywords.map((k) => `${k.category}:${k.value}`)).toEqual([
      'hairColor:black',
      'hairLength:short',
      'ageBand:teen',
      'accessory:glasses',
    ]);
    expect(keywords[0]!.labelZh).toBe('黑发');
    expect(keywords[0]!.matched).toBe('黑发');
  });

  it('颜色词 + 名词相邻同现：黑色长发 → 发色；黑色长外套 → 服装色；「黑发」不会被当成黑色服装', () => {
    expect(extractAppearanceKeywords('黑发').map((k) => `${k.category}:${k.value}`)).toEqual([
      'hairColor:black',
    ]);
    // 「黑色长外套」里没有毛发名词 → 只判服装色
    expect(extractAppearanceKeywords('黑色长外套').map((k) => `${k.category}:${k.value}`)).toEqual([
      'outfitColor:black',
    ]);
    // 「黑色长发」里没有服装名词 → 只判发色（相邻同现规则）
    expect(extractAppearanceKeywords('黑色长发').map((k) => `${k.category}:${k.value}`)).toEqual([
      'hairColor:black',
      'hairLength:long',
    ]);
    // 颜色词离服装名词太远（> 6 字符）→ 不计入服装色
    const far = extractAppearanceKeywords('black hair, standing beside a wooden coat rack');
    expect(far.some((k) => k.category === 'outfitColor')).toBe(false);
    expect(far.some((k) => k.category === 'hairColor' && k.value === 'black')).toBe(true);
  });

  it('英文描述同样可判（black long hair / white coat），银灰与白发归同一取值', () => {
    expect(extractAppearanceKeywords('black long hair and a white coat')).toEqual([
      expect.objectContaining({ category: 'hairColor', value: 'black' }),
      expect.objectContaining({ category: 'hairLength', value: 'long' }),
      expect.objectContaining({ category: 'outfitColor', value: 'white' }),
    ]);
    expect(extractAppearanceKeywords('grey long hair')[0]).toEqual(
      expect.objectContaining({ category: 'hairColor', value: 'white' }),
    );
    expect(extractAppearanceKeywords('silver ponytail')[0]).toEqual(
      expect.objectContaining({ category: 'hairColor', value: 'white' }),
    );
  });

  it('不做无依据的语义推断：体型 / 肤色 / 气质一律不取', () => {
    expect(extractAppearanceKeywords('身材高大，肤色偏暖，气质冷峻')).toEqual([]);
    expect(extractAppearanceKeywords('')).toEqual([]);
    expect(extractAppearanceKeywords(undefined)).toEqual([]);
    expect(extractAppearanceKeywords(42)).toEqual([]);
  });

  it('同类别同取值去重（保留首个命中词）', () => {
    const keywords = extractAppearanceKeywords('black hair，乌黑的长发');
    expect(keywords.filter((k) => k.category === 'hairColor')).toHaveLength(1);
    expect(keywords.filter((k) => k.category === 'hairColor')[0]!.value).toBe('black');
  });

  it('词表本身可审计：类别与取值齐备且无重复键', () => {
    const keys = CROSS_CELL_APPEARANCE_TERMS.map((term) => `${term.category}:${term.value}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(CROSS_CELL_APPEARANCE_TERMS.some((term) => term.category === 'outfitColor')).toBe(false);
  });
});

/* ────────────────────────── 4. 外观冲突 ────────────────────────── */

describe('findAppearanceConflicts：类别基线比对', () => {
  it('4 格里 3 格黑发、1 格白发 → 只有白发格被标冲突（warn）', () => {
    const issues = findAppearanceConflicts([
      cell(0, [face('neutral', 0.9, '黑发少年')]),
      cell(1, [face('neutral', 0.9, '黑发少年')]),
      cell(2, [face('neutral', 0.9, '黑发少年')]),
      cell(3, [face('neutral', 0.9, '白发少年')], { label: '侧视' }),
    ]);

    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.code).toBe('appearance-conflict');
    expect(issue.severity).toBe('warn');
    expect(issue.cellIndex).toBe(3);
    expect(issue.relatedCellIndexes).toEqual([0, 1, 2]);
    expect(issue.messageZh).toContain('发色不一致');
    expect(issue.messageZh).toContain('描述漏写也会命中本条');
    expect(issue.evidence.summaryZh).toContain('基线「黑发」');
    expect(issue.evidence.summaryZh).toContain('侧视：白发');
  });

  it('逐类别独立判定：白发老者同时命中「发色」与「年龄段」两条', () => {
    const issues = findAppearanceConflicts([
      cell(0, [face('neutral', 0.9, '黑发少年')]),
      cell(1, [face('neutral', 0.9, '黑发少年')]),
      cell(2, [face('neutral', 0.9, '黑发少年')]),
      cell(3, [face('neutral', 0.9, '白发老者')]),
    ]);
    expect(issues).toHaveLength(2);
    expect(issues[0]!.messageZh).toContain('发色不一致');
    expect(issues[1]!.messageZh).toContain('年龄段不一致');
    expect(issues.every((issue) => issue.cellIndex === 3)).toBe(true);
  });

  it('可判格 < 3 → 不判（样本不足不猜）', () => {
    const issues = findAppearanceConflicts([
      cell(0, [face('neutral', 0.9, '黑发')]),
      cell(1, [face('neutral', 0.9, '白发')]),
    ]);
    expect(issues).toEqual([]);
  });

  it('主脸描述为空的格没有证据 → 不参与可判格', () => {
    const issues = findAppearanceConflicts([
      cell(0, [face('neutral', 0.9, '黑发')]),
      cell(1, [face('neutral', 0.9, '黑发')]),
      cell(2, [face('neutral', 0.9, '黑发')]),
      cell(3, [face('neutral', 0.9, '')]),
    ]);
    expect(issues).toEqual([]);
  });

  it('有描述但没写该类别 → 仍报冲突（措辞明确「描述中未出现」，提示人工核对）', () => {
    const issues = findAppearanceConflicts([
      cell(0, [face('neutral', 0.9, '黑发')]),
      cell(1, [face('neutral', 0.9, '黑发')]),
      cell(2, [face('neutral', 0.9, '黑发')]),
      cell(3, [face('neutral', 0.9, '只看见侧脸')]),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.cellIndex).toBe(3);
    expect(issues[0]!.messageZh).toContain('描述中未出现「黑发」');
    expect(issues[0]!.messageZh).toContain('该格：未提到该类别');
    expect(issues[0]!.evidence.entries[3]!.value).toBe('（该类别无关键词）');
  });

  it('只取主脸描述：非主脸的描述不参与关键词抽取', () => {
    const issues = findAppearanceConflicts([
      cell(0, [face('neutral', 0.9, '黑发'), face('neutral', 0.4, '白发')]),
      cell(1, [face('neutral', 0.9, '黑发')]),
      cell(2, [face('neutral', 0.9, '黑发')]),
    ]);
    expect(issues).toEqual([]);
  });

  it('配饰缺失同样入列（基线「眼镜」，某格无配饰）', () => {
    const issues = findAppearanceConflicts([
      cell(0, [face('neutral', 0.9, '戴着眼镜的少女')]),
      cell(1, [face('neutral', 0.9, '戴着眼镜的少女')]),
      cell(2, [face('neutral', 0.9, '戴着眼镜的少女')]),
      cell(3, [face('neutral', 0.9, '少女特写')]),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.messageZh).toContain('配饰不一致');
    expect(issues[0]!.messageZh).toContain('未出现「眼镜」');
  });
});

/* ────────────────────────── 5. 低置信 ────────────────────────── */

describe('findLowConfidenceFaces：置信度提示', () => {
  it('最高置信度 < 0.4 → info；只要有一张可信的脸就不报', () => {
    const issues = findLowConfidenceFaces([
      cell(0, [face('neutral', 0.3)], { label: '正面' }),
      cell(1, [face('neutral', 0.9), face('neutral', 0.2)]),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('low-confidence-face');
    expect(issues[0]!.severity).toBe('info');
    expect(issues[0]!.cellIndex).toBe(0);
    expect(issues[0]!.messageZh).toContain('置信度最高仅 0.30');
    expect(issues[0]!.messageZh).toContain(`低于 ${CONSISTENCY_LOW_CONFIDENCE}`);
  });

  it('阈值可调：0.95 阈值下高置信格也会被提示', () => {
    const issues = findLowConfidenceFaces([cell(0, [face('neutral', 0.9)])], { threshold: 0.95 });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('info');
  });

  it('无人脸的格不报（无人脸不是低置信问题）', () => {
    expect(findLowConfidenceFaces([cell(0, [])])).toEqual([]);
    expect(findLowConfidenceFaces([cell(0, null)])).toEqual([]);
  });
});

/* ────────────────────────── 6. 报告汇总 ────────────────────────── */

describe('buildConsistencyReport：不可用路径不产生假报告', () => {
  it('没有任何可用分析（全部 faces=null）→ unavailable + 空 issues + checkedCount 0', () => {
    const report = buildConsistencyReport([
      cell(0, null, { unavailableReasonZh: '人脸分析服务不可用' }),
      cell(1, null, { unavailableReasonZh: '人脸分析服务不可用' }),
    ]);
    expect(report.issues).toEqual([]);
    expect(report.checkedCount).toBe(0);
    expect(report.unavailable).toContain('没有可用的人脸分析结果');
    expect(report.summaryZh).toContain('未做任何格间比较');
    // 关键：不得把「没分析到」说成「无问题」
    expect(report.summaryZh).not.toContain('错误 0');
  });

  it('只有 1 格有可用分析 → unavailable（少于 2 格无法比较）', () => {
    const report = buildConsistencyReport([cell(0, [face('neutral')]), cell(1, null)]);
    expect(report.checkedCount).toBe(1);
    expect(report.issues).toEqual([]);
    expect(report.unavailable).toContain('少于 2 格');
  });

  it('空输入 / 脏输入 → unavailable，且不抛异常', () => {
    for (const input of [undefined, null, [], [null, 1, 'x'] as unknown as CrossCellInput[]]) {
      const report = buildConsistencyReport(input as CrossCellInput[] | null | undefined);
      expect(report.issues).toEqual([]);
      expect(report.unavailable).toBeTruthy();
      expect(report.checkedCount).toBe(0);
    }
  });

  it('skippedCount（未出图的格）如实进 summary，但不影响判定', () => {
    const report = buildConsistencyReport(uniformCells(3), { skippedCount: 6, contextZh: '画面推演（3×3）' });
    expect(report.unavailable).toBeUndefined();
    expect(report.summaryZh).toContain('另有 6 格未纳入校验');
    expect(report.summaryZh).toContain('画面推演（3×3）');
  });

  it('分析失败的格不静默丢弃：逐格一条 cell-unanalyzed（warn）', () => {
    const report = buildConsistencyReport([
      cell(0, [face('neutral')]),
      cell(1, [face('neutral')]),
      cell(2, null, { unavailableReasonZh: '人脸分析服务不可用' }),
    ]);
    expect(report.unavailable).toBeUndefined();
    expect(report.checkedCount).toBe(2);
    const unanalyzed = report.issues.filter((issue) => issue.code === 'cell-unanalyzed');
    expect(unanalyzed).toHaveLength(1);
    expect(unanalyzed[0]!.severity).toBe('warn');
    expect(unanalyzed[0]!.cellIndex).toBe(2);
    expect(unanalyzed[0]!.messageZh).toContain('人脸分析服务不可用');
    expect(unanalyzed[0]!.messageZh).toContain('本格未参与比对');
    expect(report.summaryZh).toContain('1 格人脸分析不可用');
  });
});

describe('buildConsistencyReport：问题聚合与排序', () => {
  it('问题按 severity（error → warn → info）再按格序号排序，计数进 summary', () => {
    const report = buildConsistencyReport(
      [
        cell(0, [face('neutral', 0.3)], { label: '正面' }), // 低置信 info
        cell(1, [face('neutral')]),
        cell(2, [face('angry')]), // 表情突变 warn
        cell(3, []), // 无人脸 → error
      ],
      { contextZh: '多机位 9 宫格' },
    );

    expect(report.unavailable).toBeUndefined();
    expect(report.checkedCount).toBe(4);
    expect(codes(report.issues)).toEqual([
      'face-presence-mismatch',
      'expression-outlier',
      'low-confidence-face',
    ]);
    const severities = report.issues.map((issue) => issue.severity);
    expect(severities).toEqual(['error', 'warn', 'info']);
    expect(report.summaryZh).toContain('错误 1 · 警告 1 · 提示 1');
    expect(report.summaryZh).toContain('已比对人脸分析 4 格');
    expect(report.summaryZh).toContain('多机位 9 宫格');
    expect(report.summaryZh).toContain('不自动改写任何提示词 / 数据');
    // 同级按格序号升序
    expect(report.issues.map((issue) => issue.cellIndex)).toEqual([3, 2, 0]);
  });

  it('完全一致的一组格 → 无问题但仍有 summary（并声明判定为启发式）', () => {
    const report = buildConsistencyReport(uniformCells(5));
    expect(report.issues).toEqual([]);
    expect(report.unavailable).toBeUndefined();
    expect(report.checkedCount).toBe(5);
    expect(report.summaryZh).toContain('错误 0 · 警告 0 · 提示 0');
    expect(report.summaryZh).toContain('启发式');
  });

  it('报告可 JSON 序列化（纯数据、无函数 / 无循环引用）', () => {
    const report = buildConsistencyReport([
      cell(0, [face('neutral')], { label: '正面' }),
      cell(1, []),
    ]);
    const round = JSON.parse(JSON.stringify(report)) as typeof report;
    expect(round).toEqual(report);
  });
});

/* ────────────────────────── 7. 挑最优格 ────────────────────────── */

describe('pickBestCell：判据与「无法推荐」分支', () => {
  it('没有报告 / 没有可用分析 → 明确「无法推荐」，不猜', () => {
    const cells = [cell(0, [face('neutral')], { url: '/a.png' })];
    expect(pickBestCell(cells, null).ok).toBe(false);
    expect(pickBestCell(cells, null).reasonZh).toContain('没有一致性报告');

    const empty = buildConsistencyReport([cell(0, null), cell(1, null)]);
    const result = pickBestCell([cell(0, null, { url: '/a.png' }), cell(1, null)], empty);
    expect(result.ok).toBe(false);
    expect(result.index).toBeUndefined();
    expect(result.reasonZh).toContain('无法推荐');
    expect(result.candidates).toEqual([]);
  });

  it('有错误级问题的格被排除，推荐剩下警告最少的那格，并列出排除理由', () => {
    const cells = [
      cell(0, [face('angry', 0.5, '黑发')], { url: '/0.png', label: '正面' }),
      cell(1, [face('neutral', 0.99, '黑发')], { url: '/1.png' }),
      cell(2, [face('neutral', 0.2, '黑发')], { url: '/2.png' }),
    ];
    const report = buildConsistencyReport(cells);
    // 格 0 表情突变（warn）+ 低置信（info）；无 error → 不会被排除
    expect(report.issues.some((issue) => issue.severity === 'error')).toBe(false);
    const pick = pickBestCell(cells, report);
    expect(pick.ok).toBe(true);
    expect(pick.index).toBe(1); // 只有格 1 是 0 警告 / 0 提示
    expect(pick.candidates[0]!.cellIndex).toBe(1);
    expect(pick.reasonZh).toContain('推荐第 2 格');
    expect(pick.reasonZh).toContain('判据');
  });

  it('错误级问题格被排除；候选全被排除 → 拒绝推荐并如实说明（报告来自调用方时同样成立）', () => {
    const cells = [
      cell(0, [face('neutral')], { url: '/0.png', label: '正面' }),
      cell(1, [face('neutral')], { url: '/1.png' }),
    ];
    // 报告由调用方给出：两格都被 error 级问题指向（buildConsistencyReport 只会把主责格标 error，
    // 这里用合成的报告验证「全部候选被排除」这条守卫分支）
    const report = {
      issues: [
        {
          cellIndex: 0,
          severity: 'error' as const,
          code: 'face-presence-mismatch' as const,
          messageZh: '格 0 不一致',
          evidence: { kind: 'face-presence-mismatch' as const, summaryZh: '证据 0', entries: [] },
        },
        {
          cellIndex: 1,
          severity: 'error' as const,
          code: 'face-presence-mismatch' as const,
          messageZh: '格 1 不一致',
          evidence: { kind: 'face-presence-mismatch' as const, summaryZh: '证据 1', entries: [] },
        },
      ],
      summaryZh: '错误 2',
      checkedCount: 2,
    };

    const pick = pickBestCell(cells, report);
    expect(pick.ok).toBe(false);
    expect(pick.reasonZh).toContain('所有 2 格都有错误级问题');
    expect(pick.excludedZh).toHaveLength(2);
    expect(pick.excludedZh[0]).toContain('正面：有错误级问题');
    expect(pick.candidates).toEqual([]);
  });

  it('warn 少的格胜过置信度更高的格（判据顺序：先问题数，后置信度）', () => {
    const cells = [
      cell(0, [face('neutral', 0.99, '白发少年')], { url: '/0.png' }), // 发色冲突 warn
      cell(1, [face('neutral', 0.6, '黑发少年')], { url: '/1.png' }),
      cell(2, [face('neutral', 0.6, '黑发少年')], { url: '/2.png' }),
    ];
    const report = buildConsistencyReport(cells);
    expect(report.issues.filter((issue) => issue.severity === 'warn')).toHaveLength(1);
    expect(report.issues[0]!.cellIndex).toBe(0);

    const pick = pickBestCell(cells, report);
    expect(pick.candidates[0]!.warnCount).toBe(0);
    // 格 0 置信度最高（0.99）但有 warn → 不推荐；格 1 / 2 同分按格序号取 1
    expect(pick.index).toBe(1);
    expect(pick.reasonZh).toContain('警告 0 项');
  });

  it('preferIndexes 在 warn / info 相同后生效（设定表正面格优先）', () => {
    const cells = [
      cell(0, [face('neutral', 0.9, '黑发')], { url: '/0.png' }),
      cell(1, [face('neutral', 0.95, '黑发')], { url: '/1.png' }),
      cell(2, [face('neutral', 0.9, '黑发')], { url: '/2.png' }),
    ];
    const report = buildConsistencyReport(cells);
    const pick = pickBestCell(cells, report, { preferIndexes: [2] });
    expect(pick.index).toBe(2);
    expect(pick.candidates[0]!.preferred).toBe(true);
    expect(pick.reasonZh).toContain('命中优先格');
    // 不传优先格时，按置信度取格 1
    expect(pickBestCell(cells, report).index).toBe(1);
  });

  it('有 url 字段但为空的格不参与推荐（缺省 requireUrl）；requireUrl:false 时参与', () => {
    const cells = [
      cell(0, [face('neutral', 0.99, '黑发')], { url: '' }),
      cell(1, [face('neutral', 0.6, '黑发')], { url: '/1.png' }),
      cell(2, [face('neutral', 0.6, '黑发')], { url: '/2.png' }),
    ];
    const report = buildConsistencyReport(cells);
    expect(pickBestCell(cells, report).index).toBe(1);
    expect(pickBestCell(cells, report, { requireUrl: false }).index).toBe(0);
  });

  it('只剩唯一候选 → 给出推荐，但明确「未做格间比较」', () => {
    const cells = [
      cell(0, [face('neutral')], { url: '/0.png' }),
      cell(1, null, { url: '/1.png', unavailableReasonZh: '人脸分析服务不可用' }),
      cell(2, null, { url: '/2.png', unavailableReasonZh: '人脸分析服务不可用' }),
    ];
    const report = buildConsistencyReport(cells);
    const pick = pickBestCell(cells, report);
    expect(pick.ok).toBe(true);
    expect(pick.index).toBe(0);
    expect(pick.reasonZh).toContain('仅此格有可用分析，未做格间比较');
  });

  it('候选被排除后为空（全部有 error）与候选本来为空（全部分析失败）分流', () => {
    const allFailed = [
      cell(0, null, { url: '/0.png', unavailableReasonZh: '人脸分析服务不可用' }),
      cell(1, null, { url: '/1.png', unavailableReasonZh: '人脸分析服务不可用' }),
    ];
    const report = buildConsistencyReport(allFailed);
    const pick = pickBestCell(allFailed, report);
    expect(pick.ok).toBe(false);
    expect(pick.reasonZh).toContain('没有可用的人脸分析结果');
  });

  it('推荐结果可 JSON 序列化，不抛异常（含脏 report）', () => {
    const cells = [cell(0, [face('neutral')], { url: '/0.png' }), cell(1, [face('neutral')], { url: '/1.png' })];
    const report = buildConsistencyReport(cells);
    const pick = pickBestCell(cells, report);
    expect(JSON.parse(JSON.stringify(pick))).toEqual(pick);
    expect(pickBestCell(cells, { issues: undefined } as never).ok).toBe(false);
    expect(pickBestCell(undefined, report).ok).toBe(false);
  });
});
