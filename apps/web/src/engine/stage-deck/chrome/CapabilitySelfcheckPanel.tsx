import { RefreshCw } from 'lucide-react';
import { ScreenModal } from '../../../components/ui/ScreenModal';
import type {
  CapabilitySelfcheckReport,
  CapabilitySelfcheckSeverity,
} from '../../../../../../packages/shared/src/utils/capability-selfcheck';

/** 严重度 → 徽标样式（与一致性校验面板同款配色口径）。 */
const SEVERITY_LABEL: Record<CapabilitySelfcheckSeverity, string> = {
  ok: '通过',
  warn: '警告',
  error: '错误',
};

const SEVERITY_CLASS: Record<CapabilitySelfcheckSeverity, string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700',
  warn: 'border-amber-500/30 bg-amber-500/5 text-amber-700',
  error: 'border-red-300/60 bg-red-500/5 text-red-500',
};

export interface CapabilitySelfcheckPanelProps {
  /** null = 未运行 / 已关闭 */
  report: CapabilitySelfcheckReport | null;
  onClose: () => void;
  /** 「重新运行」（可选；不传则不显示按钮） */
  onRerun?: () => void;
  busy?: boolean;
}

/**
 * 能力自检报告面板（命令面板「运行能力自检」的结果出口）。
 *
 * 只做展示：报告来自 `runCapabilitySelfcheck()`（纯读源码 + 纯函数判定），
 * 面板不写任何节点数据、不改提示词。
 */
export function CapabilitySelfcheckPanel({
  report,
  onClose,
  onRerun,
  busy = false,
}: CapabilitySelfcheckPanelProps) {
  const open = report !== null;
  return (
    <ScreenModal
      open={open}
      onClose={onClose}
      title="能力自检"
      subtitle={report?.summaryZh}
      width={720}
      headerRight={
        onRerun ? (
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded-md border border-line text-ink/70 hover:text-ink inline-flex items-center gap-1"
            onClick={onRerun}
            disabled={busy}
            title="重新读取源码并运行自检"
          >
            <RefreshCw size={12} className={busy ? 'animate-spin' : undefined} />
            {busy ? '运行中…' : '重新运行'}
          </button>
        ) : null
      }
    >
      {report && (
        <div className="space-y-2 px-3 py-2 text-[12px]" data-testid="capability-selfcheck-body">
          {report.complete ? null : (
            <p className="rounded-md border border-red-300/60 bg-red-500/5 text-red-500 px-2 py-1">
              本次自检未取得完整结论（数据源缺失或事实为空），下方每一项都按「未判定」处理。
            </p>
          )}
          <ul className="space-y-1.5" data-testid="capability-selfcheck-checks">
            {report.checks.map((check) => (
              <li
                key={check.id}
                className="rounded-lg border border-line/60 bg-surface/40 px-2.5 py-2"
                data-check-id={check.id}
                data-severity={check.severity}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`shrink-0 mt-0.5 text-[10px] px-1.5 py-0.5 rounded-md border ${SEVERITY_CLASS[check.severity]}`}
                  >
                    {SEVERITY_LABEL[check.severity]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink font-medium">{check.label}</p>
                    <p className="text-ink/70 leading-relaxed break-words">{check.detailZh}</p>
                    {check.evidence.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-ink/50">
                        {check.evidence.map((item, i) => (
                          <li key={`${check.id}-${i}`} className="break-words">
                            · {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink/45 leading-relaxed">
            自检只核对「源码级接线」（目录项 / 前端 loader / socket 定义 / 跟随工作区 / 模板引用的 kind）。
            它不判断功能是否真的跑通，也不代表端到端可用；测试文件清单是人工维护的声明。
            {report.collectedAt ? ` 取数时间：${report.collectedAt}` : ''}
          </p>
        </div>
      )}
    </ScreenModal>
  );
}
