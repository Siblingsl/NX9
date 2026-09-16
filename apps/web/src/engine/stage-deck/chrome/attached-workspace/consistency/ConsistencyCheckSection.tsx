import { useCallback, useMemo, useState } from 'react';
import { Info, ScanFace, Target, TriangleAlert } from 'lucide-react';
import {
  buildConsistencyReport,
  pickBestCell,
  type CrossCellInput,
  type CrossCellIssue,
  type CrossCellPickResult,
  type CrossCellReport,
} from '@nx9/shared';
import {
  analyzeCellFaces,
  type AnalyzeCellFacesResult,
} from '../../../../consistency-check';
import { useActivityLog } from '../../../../../stores/activity-log';
import { toastError } from '../../../../../stores/toast';

/** 参与校验的一格（未出图的格 url 为空串，会被跳过并计入 skippedCount） */
export interface ConsistencyTarget {
  /** 格序号（0 起，与工作区逐格渲染一致，用于跳转） */
  index: number;
  /** 格标签（角色 / 机位 / 角度），仅用于文案 */
  label?: string;
  url?: string;
}

export interface ConsistencyCheckSectionProps {
  /** 全量目标格（含未出图的格） */
  targets: readonly ConsistencyTarget[];
  /** 并发上限（两个工作区都复用「逐格并发」设置） */
  limit?: number;
  /** 优先格序号（如设定表「三视图 · 正面」），仅作为排序判据之一 */
  preferIndexes?: readonly number[];
  /** 报告文案里的场景说明（如「画面推演（3×3）」） */
  contextZh?: string;
  /** 面板标题后缀（工作区名） */
  scopeLabelZh?: string;
  /** 「跳到该格」/ 推荐格 → 通知工作区滚动并高亮 */
  onJump?: (cellIndex: number) => void;
  className?: string;
}

const SEVERITY_LABEL: Record<CrossCellIssue['severity'], string> = {
  error: '错误',
  warn: '警告',
  info: '提示',
};

const SEVERITY_CLASS: Record<CrossCellIssue['severity'], string> = {
  error: 'border-red-300/60 bg-red-500/5 text-red-500',
  warn: 'border-amber-500/30 bg-amber-500/5 text-amber-700',
  info: 'border-line/50 bg-surface/60 text-ink/55',
};

interface ConsistencyRun {
  result: AnalyzeCellFacesResult;
  cells: CrossCellInput[];
  report: CrossCellReport;
  /** 本次校验的格图签名：与当前逐格图不一致时提示重新校验 */
  signature: string;
  at: string;
}

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function cellName(cell: CrossCellInput): string {
  return cell.label?.trim() || `第 ${cell.index + 1} 格`;
}

function signatureOf(targets: readonly ConsistencyTarget[]): string {
  return targets.map((target) => (target.url ?? '').trim()).join('|');
}

/**
 * 跨格 / 跨镜一致性校验面板（多格推演 / 角色设定表共用）。
 *
 * 行为：
 * - 「一致性校验」→ 调 `analyzeCellFaces`（限流 + 同 URL 缓存）→ `buildConsistencyReport` 出报告；
 * - 报告**只读**：按格列出问题、severity、证据，可跳到对应格；不自动改写任何提示词 / 节点数据；
 * - 「挑最优格」→ `pickBestCell`，判据与排除理由一并展示；无可用分析时明确「无法推荐」；
 * - 服务端不可用 / 网络失败：逐格如实显示原因（该格标「未分析」），**不显示假结论**；
 *   逐格原因与可用分析格数无关：报告只在「可用分析 ≥ 2 格」时逐格产出 `cell-unanalyzed`，
 *   少于 2 格时由本面板的兜底清单照常列出（结论可以缺席，原因不许丢）；
 * - 报告仅**会话内**保留（组件状态），不写节点 data：重挂工作区后需重新校验。
 */
export function ConsistencyCheckSection({
  targets,
  limit,
  preferIndexes,
  contextZh,
  scopeLabelZh,
  onJump,
  className,
}: ConsistencyCheckSectionProps) {
  const appendLog = useActivityLog((s) => s.append);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<ConsistencyRun | null>(null);
  const [pick, setPick] = useState<CrossCellPickResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);

  const withImage = useMemo(
    () => targets.filter((target) => (target.url ?? '').trim() !== ''),
    [targets],
  );
  const stale = Boolean(run && run.signature !== signatureOf(targets));

  const handleCheck = useCallback(async () => {
    if (withImage.length === 0) {
      toastError('还没有任何格出图：请先批量出图，再做一致性校验');
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: withImage.length });
    try {
      const result = await analyzeCellFaces(
        targets.map((target) => (target.url ?? '').trim()),
        {
          limit,
          labels: targets.map((target) => target.label),
          onProgress: (done, total) => setProgress({ done, total }),
        },
      );
      const report = buildConsistencyReport(result.cells, {
        skippedCount: result.skippedCount,
        contextZh,
      });
      setRun({
        result,
        cells: result.cells,
        report,
        signature: signatureOf(targets),
        at: new Date().toISOString(),
      });
      setPick(null);
      setOpenEvidence(null);
      appendLog(
        report.unavailable
          ? `一致性校验${scopeLabelZh ? ` · ${scopeLabelZh}` : ''} · 未出结论：${report.unavailable}`
          : `一致性校验${scopeLabelZh ? ` · ${scopeLabelZh}` : ''} · ${report.summaryZh}`,
      );
    } catch (e) {
      // analyzeCellFaces 自身不抛异常；此处仅兜底，如实报错而不是静默
      const message = e instanceof Error ? e.message : String(e);
      toastError(`一致性校验失败：${message}`);
      appendLog(`一致性校验 · 失败：${message}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [appendLog, contextZh, limit, scopeLabelZh, targets, withImage.length]);

  const handlePick = useCallback(() => {
    if (!run) return;
    const best = pickBestCell(run.cells, run.report, {
      preferIndexes,
      requireUrl: true,
      contextZh,
    });
    setPick(best);
    appendLog(`一致性校验 · ${best.ok ? best.reasonZh : `无法推荐：${best.reasonZh}`}`);
    if (best.ok && typeof best.index === 'number') onJump?.(best.index);
  }, [appendLog, contextZh, onJump, preferIndexes, run]);

  const analyzeNote = run
    ? `可用分析 ${run.result.analyzedCount}/${run.result.entries.length} 格` +
      (run.result.skippedCount > 0 ? ` · 未出图 ${run.result.skippedCount} 格` : '') +
      (run.result.failedCount > 0 ? ` · 分析失败 ${run.result.failedCount} 格` : '')
    : '';

  /**
   * 逐格分析失败 / 未分析的**原始原因**（有序、与格号对齐）。
   *
   * 报告只在「可用分析 ≥ `CONSISTENCY_MIN_COMPARABLE_CELLS` 格」时才逐格产出 `cell-unanalyzed` 条目；
   * 可用格不足时报告只给「不出结论」，逐格原因会随 `issues: []` 一起丢掉 —— 这里兜底补齐：
   * 已由报告条目覆盖的格不重复列（避免同一原因说两遍），其余失败 / 取消的格一律如实列出。
   * 只列原因，不据此编造任何格间比较。
   */
  const cellFailureLines = useMemo(() => {
    if (!run) return [];
    const covered = new Set(
      run.report.issues
        .filter((issue) => issue.code === 'cell-unanalyzed')
        .map((issue) => issue.cellIndex),
    );
    return run.result.entries
      .map((entry, index) => ({ entry, index }))
      .filter(
        ({ entry, index }) =>
          !entry.ok &&
          (entry.status === 'failed' || entry.status === 'cancelled') &&
          !covered.has(index),
      )
      .map(({ entry, index }) => {
        const cell = run.cells.find((item) => item.index === index);
        return `${cell ? cellName(cell) : `第 ${index + 1} 格`}：${entry.reasonZh ?? '原因未提供'}`;
      });
  }, [run]);

  return (
    <div
      className={`rounded-lg border border-line/40 bg-surface/60 p-2 space-y-1.5 ${className ?? ''}`}
      onMouseDown={stop}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-medium text-ink/70">一致性校验</span>
        {scopeLabelZh && <span className="text-[9px] text-ink/40">{scopeLabelZh}</span>}
        {run && <span className="text-[9px] text-ink/45">{analyzeNote}</span>}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onMouseDown={stop}
            disabled={busy || withImage.length === 0}
            onClick={() => void handleCheck()}
            className="inline-flex items-center gap-1 rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-[9px] text-brand disabled:opacity-40"
            title={
              withImage.length === 0
                ? '还没有任何格出图'
                : '对已出图的格调人脸分析并按格比对：人脸有无 / 数量、表情突变、外观关键词（发色 / 服装色 / 年龄段 / 配饰）'
            }
          >
            <ScanFace size={10} className={busy ? 'animate-pulse' : undefined} />
            {busy
              ? `校验中 ${progress?.done ?? 0}/${progress?.total ?? withImage.length}`
              : run
                ? '重新校验'
                : '一致性校验'}
          </button>
          <button
            type="button"
            onMouseDown={stop}
            disabled={!run || busy}
            onClick={handlePick}
            className="inline-flex items-center gap-1 rounded-md border border-line/50 px-2 py-0.5 text-[9px] text-ink/70 hover:text-brand hover:border-brand/40 disabled:opacity-40"
            title={run ? '按判据挑出最适合作下游首帧的格（会给出理由与排除项）' : '先做一次一致性校验'}
          >
            <Target size={10} />
            挑最优格
          </button>
        </div>
      </div>

      {!run && !busy && (
        <p className="text-[9px] text-ink/40 leading-snug">
          对已出图的格做图像级体检：格间人脸有无 / 数量、表情突变、外观关键词（发色 / 服装色 /
          年龄段 / 配饰）是否跟随多数基线。报告只读呈现，不改写任何提示词与节点数据；文本级连贯性
          检查（服装 / 光影 / 轴线）仍由「连贯性检查」节点负责。
        </p>
      )}

      {run && (
        <div className="space-y-1.5">
          <p className="text-[9px] text-ink/50 leading-snug">{run.report.summaryZh}</p>

          {stale && (
            <p className="text-[9px] text-amber-700 leading-snug">
              逐格图或格数在上次校验后有变化：当前报告可能已过期，建议「重新校验」。
            </p>
          )}

          {run.report.unavailable && (
            <p className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[9px] text-amber-800 leading-snug">
              本次未出结论：{run.report.unavailable}
            </p>
          )}

          {/* 逐格失败原因：与可用分析格数无关，任何情况下都如实列出（不并入结论、不参与判定） */}
          {cellFailureLines.length > 0 && (
            <div className="rounded border border-line/30 bg-surface/60 px-2 py-1 space-y-0.5">
              <p className="text-[9px] text-ink/45">
                逐格失败原因（{cellFailureLines.length} 格未参与格间比较，原因原样列出）：
              </p>
              <ul className="space-y-0.5">
                {cellFailureLines.map((line) => (
                  <li key={line} className="text-[9px] text-ink/55 leading-snug">
                    · {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {run.report.issues.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded border border-line/30 divide-y divide-line/20">
              {run.report.issues.map((issue, at) => {
                const key = `${issue.code}-${issue.cellIndex}-${at}`;
                const cell = run.cells.find((item) => item.index === issue.cellIndex);
                const expanded = openEvidence === key;
                return (
                  <div key={key} className="px-1.5 py-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[9px] px-1 rounded border ${SEVERITY_CLASS[issue.severity]}`}
                      >
                        {SEVERITY_LABEL[issue.severity]}
                      </span>
                      <span className="text-[9px] text-ink/55">
                        {cell ? cellName(cell) : `第 ${issue.cellIndex + 1} 格`}
                      </span>
                      {issue.relatedCellIndexes && issue.relatedCellIndexes.length > 0 && (
                        <span className="text-[9px] text-ink/35">
                          对照 {issue.relatedCellIndexes.map((index) => `#${index + 1}`).join(' ')}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onMouseDown={stop}
                          onClick={() => setOpenEvidence(expanded ? null : key)}
                          className="inline-flex items-center gap-1 rounded border border-line/40 px-1 py-0.5 text-[9px] text-ink/55 hover:text-ink"
                          title="展开该条的证据（哪两格、什么值）"
                        >
                          <Info size={9} />
                          证据
                        </button>
                        {onJump && (
                          <button
                            type="button"
                            onMouseDown={stop}
                            onClick={() => onJump(issue.cellIndex)}
                            className="inline-flex items-center gap-1 rounded border border-line/40 px-1 py-0.5 text-[9px] text-ink/60 hover:text-brand hover:border-brand/40"
                            title="滚动到该格并高亮"
                          >
                            跳到该格
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[9px] text-ink/60 leading-snug">{issue.messageZh}</p>
                    <p className="text-[9px] text-ink/40 leading-snug">{issue.evidence.summaryZh}</p>
                    {expanded && (
                      <ul className="rounded border border-line/30 bg-surface/80 px-1.5 py-1 space-y-0.5">
                        {issue.evidence.entries.map((entry, entryAt) => (
                          <li key={`${entry.cellIndex}-${entryAt}`} className="text-[9px] text-ink/50">
                            #{entry.cellIndex + 1}
                            {entry.label ? ` ${entry.label}` : ''}：{entry.value}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {run.report.issues.length === 0 && !run.report.unavailable && (
            <p className="text-[9px] text-emerald-600">本次比对未发现格间不一致（判定为启发式，仅供参考）。</p>
          )}

          {pick && (
            <div
              className={`rounded border px-2 py-1 space-y-0.5 ${
                pick.ok ? 'border-brand/40 bg-brand/5' : 'border-amber-500/30 bg-amber-500/5'
              }`}
            >
              <div className="flex items-center gap-1 text-[9px]">
                {pick.ok ? (
                  <Target size={10} className="text-brand" />
                ) : (
                  <TriangleAlert size={10} className="text-amber-700" />
                )}
                <span className={pick.ok ? 'text-brand' : 'text-amber-800'}>
                  {pick.ok ? '推荐格' : '无法推荐'}
                </span>
                {pick.ok && onJump && typeof pick.index === 'number' && (
                  <button
                    type="button"
                    onMouseDown={stop}
                    onClick={() => onJump(pick.index as number)}
                    className="ml-auto rounded border border-line/40 px-1 py-0.5 text-[9px] text-ink/60 hover:text-brand hover:border-brand/40"
                  >
                    跳到该格
                  </button>
                )}
              </div>
              <p className="text-[9px] text-ink/60 leading-snug">{pick.reasonZh}</p>
              {pick.excludedZh.length > 0 && (
                <ul className="space-y-0.5">
                  {pick.excludedZh.map((line) => (
                    <li key={line} className="text-[9px] text-ink/45 leading-snug">
                      · {line}
                    </li>
                  ))}
                </ul>
              )}
              {pick.candidates.length > 0 && (
                <details className="text-[9px] text-ink/40">
                  <summary className="cursor-pointer">候选排序（判据明细）</summary>
                  <ul className="mt-1 space-y-0.5">
                    {pick.candidates.map((candidate) => (
                      <li key={candidate.cellIndex} className="text-[9px] text-ink/50">
                        #{candidate.cellIndex + 1}
                        {candidate.label ? ` ${candidate.label}` : ''} · 警告 {candidate.warnCount} ·
                        提示 {candidate.infoCount} · 平均置信度 {candidate.avgConfidence.toFixed(2)}
                        {candidate.preferred ? ' · 优先格' : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <p className="text-[9px] text-ink/30 leading-snug">
            报告为会话内状态（不写节点 data，重挂工作区后需重新校验）；人脸分析来自服务端视觉接口，
            结果与判定均为启发式，仅作提示，不自动改写任何提示词 / 数据。
          </p>
        </div>
      )}
    </div>
  );
}
