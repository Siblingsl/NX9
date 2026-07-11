import type { NodeRunStatus } from '@nx9/shared';
import type { PromptHistoryEntry } from '../../../stores/prompt-history';
import { ComposerWorkspaceHeader } from './ComposerWorkspaceHeader';
import { ComposerWorkspaceToolbar } from './ComposerWorkspaceToolbar';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

/** 默认 Prompt 输入区高度（对齐设计稿红框区域） */
export const COMPOSER_PROMPT_BODY_CLASS =
  'shrink-0 h-[108px] px-3 pt-2 pb-1 overflow-hidden';

export const COMPOSER_PROMPT_TEXTAREA_CLASS =
  'w-full h-full border-0 text-[13px] leading-relaxed resize-none focus:outline-none bg-transparent text-ink/85 placeholder:text-ink/28 nodrag nopan';

export interface ComposerWorkspaceShellProps {
  kind: string;
  status?: NodeRunStatus;
  onCollapse?: () => void;
  headerTrailing?: React.ReactNode;
  topSlot?: React.ReactNode;
  toolbarLeft?: React.ReactNode;
  toolbarAdvanced?: React.ReactNode;
  children: React.ReactNode;
  history?: PromptHistoryEntry[];
  onApplyHistory?: (text: string) => void;
  onAiAction?: (id: string) => void;
  onRun?: () => void;
  running?: boolean;
  runLabel?: string;
  runDisabled?: boolean;
  showRun?: boolean;
  showAi?: boolean;
  showAdvanced?: boolean;
  showHistory?: boolean;
  showToolbar?: boolean;
  heightClass?: string;
  bodyClassName?: string;
  promptContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export function ComposerWorkspaceShell({
  kind,
  status,
  onCollapse,
  headerTrailing,
  topSlot,
  toolbarLeft,
  toolbarAdvanced,
  children,
  history,
  onApplyHistory,
  onAiAction,
  onRun,
  running,
  runLabel,
  runDisabled,
  showRun = true,
  showAi = true,
  showAdvanced = true,
  showHistory = true,
  showToolbar = true,
  heightClass = 'h-auto',
  bodyClassName = COMPOSER_PROMPT_BODY_CLASS,
  promptContainerRef,
}: ComposerWorkspaceShellProps) {
  return (
    <div
      className={`flex flex-col w-full ${heightClass} px-3 py-2 nodrag`}
      onMouseDown={stop}
      onPointerDown={stop}
      onWheel={(e) => e.stopPropagation()}
    >
      <ComposerWorkspaceHeader
        kind={kind}
        status={status}
        onCollapse={onCollapse}
        trailing={headerTrailing}
      />

      <div
        className="shrink-0 mt-1.5 rounded-xl border border-line/35 bg-white shadow-[0_1px_8px_rgba(15,15,15,0.03)] flex flex-col overflow-hidden"
        onMouseDown={stop}
      >
        {topSlot}

        <div ref={promptContainerRef} className={bodyClassName}>
          {children}
        </div>

        {showToolbar && (
          <ComposerWorkspaceToolbar
            left={toolbarLeft}
            advanced={toolbarAdvanced}
            history={history}
            onApplyHistory={onApplyHistory}
            onAiAction={onAiAction}
            onRun={onRun}
            running={running}
            runLabel={runLabel}
            runDisabled={runDisabled}
            showRun={showRun}
            showAi={showAi}
            showAdvanced={showAdvanced && Boolean(toolbarAdvanced)}
            showHistory={showHistory}
          />
        )}
      </div>
    </div>
  );
}
