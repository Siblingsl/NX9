/**
 * 编剧台顶栏右侧：入口切换 / 工具条 / 确认·送分镜 / 更多菜单。
 */
import type { ReactNode } from 'react';
import {
  Check,
  FileText,
  FileUp,
  FolderOpen,
  RotateCcw,
  Send,
  Sparkles,
  Stethoscope,
  Wand2,
} from 'lucide-react';
import type { ScreenplayPackage, ScriptDeskAgentSession, ScriptDeskSkillId } from '@nx9/shared';
import { screenplayFullText } from '@nx9/shared';
import { isDevPromptEnabled } from '../../../stores/dev-prompt-overrides';
import { ScriptDeskDevPackOverlay } from './script-desk-dev-pack-overlay';
import type { EntryMode, RightTab, SavePkgFn } from './desk-helpers';

export interface DeskHeaderProps {
  entryMode: EntryMode;
  activeSkills: ScriptDeskSkillId[];
  pkg: ScreenplayPackage;
  session: ScriptDeskAgentSession;
  busy: boolean;
  continueBusy: boolean;
  rewritingEpIndex: number | null;
  rightDrawerOpen: boolean;
  rightTab: RightTab;
  diagCount: number;
  draftsOpen: boolean;
  draftCount: number;
  showMoreMenu: boolean;
  legacyBreakdown: unknown;
  savePkg: SavePkgFn;
  onToggleGenerate: () => void;
  onSetIngest: () => void;
  onToggleDrawer: () => void;
  onOpenDiagnostics: () => void;
  onExtractBible: () => void;
  onOpenDrafts: () => void;
  onResetDesk: () => void;
  onHandoff: () => void;
  onConfirm: () => void;
  onToggleMore: () => void;
  onExportMd: () => void;
  onExportJson: () => void;
  onExportZip: () => void;
}

export function DeskHeader({
  entryMode,
  activeSkills,
  pkg,
  session,
  busy,
  continueBusy,
  rewritingEpIndex,
  rightDrawerOpen,
  rightTab,
  diagCount,
  draftsOpen,
  draftCount,
  showMoreMenu,
  legacyBreakdown,
  savePkg,
  onToggleGenerate,
  onSetIngest,
  onToggleDrawer,
  onOpenDiagnostics,
  onExtractBible,
  onOpenDrafts,
  onResetDesk,
  onHandoff,
  onConfirm,
  onToggleMore,
  onExportMd,
  onExportJson,
  onExportZip,
}: DeskHeaderProps): ReactNode {
  const locked = busy || continueBusy || rewritingEpIndex != null;
  return (
    <div className="sd2-header-right">
      <div className="sd2-mode-seg" role="group" aria-label="创作入口">
        <button
          type="button"
          className={`sd2-mode-seg__btn ${entryMode === 'agent' && activeSkills.includes('generate') ? 'is-on' : ''}`}
          onClick={onToggleGenerate}
        >
          <Wand2 size={13} strokeWidth={2} />
          生成剧本
        </button>
        <button
          type="button"
          className={`sd2-mode-seg__btn ${entryMode === 'ingest' ? 'is-on' : ''}`}
          disabled={locked}
          onClick={onSetIngest}
        >
          <FileUp size={13} strokeWidth={2} />
          上传成稿
        </button>
      </div>

      <div className="sd2-tool-strip" role="group" aria-label="工具">
        <button
          type="button"
          className={`sd2-tool ${rightDrawerOpen && rightTab !== 'diagnostics' ? 'is-on' : ''}`}
          onClick={onToggleDrawer}
          title="稿纸"
          aria-label="稿纸"
          aria-pressed={rightDrawerOpen}
        >
          <FileText size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={`sd2-tool ${rightDrawerOpen && rightTab === 'diagnostics' ? 'is-on' : ''} ${diagCount > 0 ? 'has-badge' : ''}`}
          onClick={onOpenDiagnostics}
          title={diagCount > 0 ? `诊断 · ${diagCount} 条` : '诊断'}
          aria-label={diagCount > 0 ? `诊断，${diagCount} 条` : '诊断'}
        >
          <Stethoscope size={15} strokeWidth={1.75} />
          {diagCount > 0 ? (
            <span className="sd2-tool__badge sd2-tool__badge--warn">{diagCount}</span>
          ) : null}
        </button>
        <button
          type="button"
          className="sd2-tool"
          disabled={locked}
          onClick={onExtractBible}
          title="抽取设定"
          aria-label="抽取设定"
        >
          <Sparkles size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={`sd2-tool ${draftsOpen ? 'is-on' : ''}`}
          disabled={locked}
          onClick={onOpenDrafts}
          title="草稿箱"
          aria-label={`草稿箱${draftCount > 0 ? `，${draftCount} 份` : ''}`}
        >
          <FolderOpen size={15} strokeWidth={1.75} />
          {draftCount > 0 ? (
            <span className="sd2-tool__badge">{draftCount}</span>
          ) : null}
        </button>
        <button
          type="button"
          className="sd2-tool sd2-tool--danger"
          disabled={locked}
          onClick={onResetDesk}
          title="重置编剧台"
          aria-label="重置编剧台"
        >
          <RotateCcw size={15} strokeWidth={1.75} />
        </button>
      </div>

      {pkg.status === 'confirmed' ? (
        <button type="button" className="sd2-btn sd2-btn--primary" disabled={busy} onClick={onHandoff}>
          <Send size={14} /> 送到分镜台
        </button>
      ) : (
        <button
          type="button"
          className="sd2-btn sd2-btn--primary"
          disabled={busy || !screenplayFullText(pkg).trim()}
          onClick={onConfirm}
        >
          <Check size={14} /> 确认成稿
        </button>
      )}

      <div className="sd2-more-wrap">
        <button type="button" className="sd2-tool" onClick={onToggleMore} aria-label="更多" title="更多">⋯</button>
        {showMoreMenu && (
          <div className="sd2-more-menu">
            <button type="button" onClick={onExportMd}>导出 MD</button>
            <button type="button" onClick={onExportJson}>导出 JSON</button>
            <button type="button" onClick={onExportZip}>导出 ZIP</button>
            {!!legacyBreakdown && (
              <div className="sd2-more-menu__warn">检测到旧版分镜表</div>
            )}
            {isDevPromptEnabled() && (
              <div className="sd2-more-menu__dev">
                <ScriptDeskDevPackOverlay pkg={pkg} session={session} savePkg={savePkg} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
