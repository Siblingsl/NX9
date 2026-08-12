/**
 * Q-01: 编剧台右抽屉「诊断」页（自 ScriptDeskBlock 纯搬运）。
 */
import type { ScreenplayPackage } from '@nx9/shared';

type Diagnostic = NonNullable<ScreenplayPackage['diagnostics']>[number];

export interface DiagnosticsPanelProps {
  pkg: ScreenplayPackage;
  busy: boolean;
  onManualCheck: () => void;
  onAutoFix: () => void;
  onDiagClick: (d: { entityId?: string; episodeId?: string }) => void;
}

export function DiagnosticsPanel({ pkg, busy, onManualCheck, onAutoFix, onDiagClick }: DiagnosticsPanelProps) {
  return (
    <>
      <div className="sd2-diag-actions">
        <button type="button" className="sd2-btn sd2-btn--ghost" disabled={busy} onClick={onManualCheck}>
          运行手动一致性检查
        </button>
        {(pkg.diagnostics ?? []).length > 0 && (
          <button type="button" className="sd2-btn sd2-btn--ghost" onClick={onAutoFix}>
            一键修复缺失字段
          </button>
        )}
      </div>
      {(pkg.diagnostics ?? []).length === 0 && <div className="sd2-empty">暂无诊断</div>}
      {(pkg.diagnostics ?? []).map((d: Diagnostic, i: number) => (
        <div
          key={`${d.code}-${i}`}
          className={`sd2-diag sd2-diag--${d.level}${(d.entityId || d.episodeId) ? ' sd2-diag--clickable' : ''}`}
          title={d.episodeId ? `点击定位到「第${pkg.screenplay.episodes.find((e) => e.id === d.episodeId)?.index ?? '?'}集」` : (d.entityId ? `点击定位到设定「${d.entityId}」` : undefined)}
          onClick={() => onDiagClick(d)}
          role={(d.entityId || d.episodeId) ? 'button' : undefined}
          tabIndex={(d.entityId || d.episodeId) ? 0 : undefined}
          onKeyDown={(d.entityId || d.episodeId) ? (e) => { if (e.key === 'Enter') onDiagClick(d); } : undefined}
        >
          <b>{d.level}</b> {d.message}
        </div>
      ))}
    </>
  );
}
