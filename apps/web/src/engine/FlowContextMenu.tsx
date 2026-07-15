import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import type { Node } from '@xyflow/react';
import { lookupBlock } from '@nx9/shared';
import * as LucideIcons from 'lucide-react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  Check,
  ChevronRight,
  Clapperboard,
  Copy,
  CopyPlus,
  Grid3x3,
  LayoutGrid,
  Magnet,
  Maximize2,
  Pause,
  Play,
  Trash2,
  ClipboardPaste,
  Zap,
  RefreshCw,
} from 'lucide-react';
import type { NodeAlignAction } from './node-align';
import { FLOW_EDGE_TYPES, type FlowEdgeTypeId } from './flow-edge-types';

const QUICK_BLOCK_KINDS = [
  'prompt',
  'picture-gen',
  'clip-gen',
  'chat-model',
  'sound-gen',
  'asset-import',
  'director-desk',
] as const;

const STORYBOARD_BLOCK_KINDS = new Set([
  'director-desk',
  'motion-story',
  'story-grid',
  'grid-split',
  'grid-compose',
]);

function BlockGlyph({ name, accent }: { name: string; accent: string }) {
  const Icon = (LucideIcons as unknown as Record<string, ComponentType<{ size?: number }>>)[name];
  if (!Icon) return <span className="nx9-menu-icon" style={{ background: accent }} />;
  return (
    <span className="nx9-menu-icon" style={{ color: accent }}>
      <Icon size={13} />
    </span>
  );
}

function MenuBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    />
  );
}

interface PaneContextMenuProps {
  x: number;
  y: number;
  selectedCount: number;
  clipboardCount: number;
  onClose: () => void;
  onAddBlock: (kind: string) => void;
  onPaste: () => void;
  onArrangeGrid: () => void;
}

export function PaneContextMenu({
  x,
  y,
  selectedCount,
  clipboardCount,
  onClose,
  onAddBlock,
  onPaste,
  onArrangeGrid,
}: PaneContextMenuProps) {
  const menuWidth = 208;
  const left = Math.min(x, window.innerWidth - menuWidth - 12);
  const top = Math.min(y, window.innerHeight - 420);

  return (
    <>
      <MenuBackdrop onClose={onClose} />
      <div
        className="nx9-context-menu fixed z-50"
        style={{ left, top, width: menuWidth }}
      >
        <div className="nx9-context-menu__header">快速添加模块</div>
        {QUICK_BLOCK_KINDS.map((kind) => {
          const def = lookupBlock(kind);
          if (!def) return null;
          return (
            <button
              key={kind}
              type="button"
              className="nx9-context-menu__item"
              onClick={() => {
                onAddBlock(kind);
                onClose();
              }}
            >
              <BlockGlyph name={def.glyph} accent={def.accent} />
              <span className="flex-1 truncate text-left">{def.label}</span>
            </button>
          );
        })}
        <div className="nx9-context-menu__divider" />
        <button
          type="button"
          className="nx9-context-menu__item"
          disabled={clipboardCount === 0}
          onClick={() => {
            onPaste();
            onClose();
          }}
        >
          <ClipboardPaste size={13} />
          <span>粘贴 {clipboardCount > 0 ? `(${clipboardCount})` : ''}</span>
        </button>
        <button
          type="button"
          className="nx9-context-menu__item"
          disabled={selectedCount < 2}
          title={selectedCount < 2 ? '至少选择 2 个模块' : '将选中模块整理为网格'}
          onClick={() => {
            onArrangeGrid();
            onClose();
          }}
        >
          <Grid3x3 size={13} />
          <span>整理选中</span>
        </button>
      </div>
    </>
  );
}

interface EdgeContextMenuProps {
  x: number;
  y: number;
  edgeId: string;
  edgeType: FlowEdgeTypeId;
  onClose: () => void;
  onChangeType: (type: FlowEdgeTypeId) => void;
  onDelete: () => void;
}

export function EdgeContextMenu({
  x,
  y,
  edgeId,
  edgeType,
  onClose,
  onChangeType,
  onDelete,
}: EdgeContextMenuProps) {
  const menuWidth = 208;
  const left = Math.min(x, window.innerWidth - menuWidth - 12);
  const top = Math.min(y, window.innerHeight - 320);

  return (
    <>
      <MenuBackdrop onClose={onClose} />
      <div
        className="nx9-context-menu fixed z-50"
        style={{ left, top, width: menuWidth }}
      >
        <div className="nx9-context-menu__header">
          <span>连接线</span>
          <span className="text-[10px] font-normal opacity-60">#{edgeId.slice(-6)}</span>
        </div>

        <div className="px-3 py-1.5 text-[10px] font-bold text-ink/55">线条类型</div>
        {FLOW_EDGE_TYPES.map((item) => {
          const active = edgeType === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`nx9-context-menu__item ${active ? 'bg-brand/5 text-brand' : ''}`}
              onClick={() => {
                if (!active) onChangeType(item.id);
                onClose();
              }}
            >
              <span className="inline-flex w-5 justify-center">
                {active ? <Check size={13} /> : null}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}

        <div className="nx9-context-menu__divider" />
        <button
          type="button"
          className="nx9-context-menu__item nx9-context-menu__item--danger"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          <Trash2 size={13} />
          <span>删除连接线</span>
        </button>
      </div>
    </>
  );
}

interface SelectionContextMenuProps {
  x: number;
  y: number;
  ids: string[];
  nodes: Node[];
  executableCount: number;
  isRunning: boolean;
  canResume?: boolean;
  storyboardActionCount: number;
  cascadeEnabled?: boolean;
  expandLabel?: string;
  rerunDownstreamEnabled?: boolean;
  onClose: () => void;
  onRun: () => void;
  onStop: () => void;
  onRerun: () => void;
  onCascade?: () => void;
  onRerunDownstream?: () => void;
  onToggleExpand?: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAlign: (action: NodeAlignAction) => void;
  onFocusStoryboard: () => void;
}

export function SelectionContextMenu({
  x,
  y,
  ids,
  nodes,
  executableCount,
  isRunning,
  canResume,
  storyboardActionCount,
  cascadeEnabled,
  expandLabel,
  rerunDownstreamEnabled,
  onClose,
  onRun,
  onStop,
  onRerun,
  onCascade,
  onRerunDownstream,
  onToggleExpand,
  onCopy,
  onDuplicate,
  onDelete,
  onAlign,
  onFocusStoryboard,
}: SelectionContextMenuProps) {
  const [alignOpen, setAlignOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setAlignOpen(false), 120);
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const menuWidth = 208;
  const alignWidth = 238;
  const menuLeft = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 20));
  const menuTop = Math.max(8, Math.min(y, window.innerHeight - 340));
  const alignOpensLeft = menuLeft + menuWidth + alignWidth > window.innerWidth - 8;
  const alignLeft = alignOpensLeft
    ? Math.max(8, menuLeft - alignWidth + 2)
    : Math.max(8, Math.min(window.innerWidth - alignWidth - 8, menuLeft + menuWidth - 2));
  const alignTop = Math.max(8, Math.min(menuTop + 36, window.innerHeight - 230));

  const alignBtn = (
    action: NodeAlignAction,
    label: string,
    Icon: ComponentType<{ size?: number }>,
    min = 2,
  ) => {
    const disabled = ids.length < min;
    return (
      <button
        key={action}
        type="button"
        className="nx9-context-menu__item nx9-context-menu__item--compact justify-center"
        disabled={disabled}
        title={disabled ? `至少选择 ${min} 个模块` : label}
        onClick={() => {
          onAlign(action);
          onClose();
        }}
      >
        <Icon size={12} />
        <span>{label}</span>
      </button>
    );
  };

  const selNodes = nodes.filter((n) => ids.includes(n.id));
  const hasStoryboardOutput = selNodes.some(
    (n) => n.type && STORYBOARD_BLOCK_KINDS.has(n.type),
  );

  return (
    <>
      <MenuBackdrop onClose={onClose} />
      <div
        className="nx9-context-menu fixed z-50"
        style={{ left: menuLeft, top: menuTop, width: menuWidth }}
      >
        <div className="nx9-context-menu__header">
          <span>已选 {ids.length} 个模块</span>
          <span className="text-[10px] font-normal opacity-60">可执行 {executableCount}</span>
        </div>

        <div
          onMouseEnter={() => {
            clearCloseTimer();
            setAlignOpen(true);
          }}
          onMouseLeave={scheduleClose}
        >
          <button
            type="button"
            className="nx9-context-menu__item"
            aria-haspopup="menu"
            aria-expanded={alignOpen}
            onFocus={() => setAlignOpen(true)}
          >
            <LayoutGrid size={13} />
            <span className="flex-1 text-left">对齐 / 整理</span>
            <ChevronRight size={13} className={alignOpensLeft ? 'rotate-180' : ''} />
          </button>
        </div>

        <button
          type="button"
          className="nx9-context-menu__item"
          disabled={executableCount === 0 || isRunning}
          onClick={() => { onRun(); onClose(); }}
        >
          <Play size={13} fill="currentColor" />
          <span>{canResume ? '继续运行' : `运行选中 (${executableCount})`}</span>
        </button>

        <button
          type="button"
          className="nx9-context-menu__item"
          disabled={!isRunning}
          title={isRunning ? '在当前安全点停止，并保留已完成进度' : '当前选中模块没有运行中的任务'}
          onClick={() => { onStop(); onClose(); }}
        >
          <Pause size={13} />
          <span>停止运行（保留进度）</span>
        </button>

        {!isRunning && (
          <button
            type="button"
            className="nx9-context-menu__item"
            disabled={executableCount === 0}
            title="清除上次运行检查点并从头开始"
            onClick={() => { onRerun(); onClose(); }}
          >
            <RefreshCw size={13} />
            <span>重新运行（从头开始）</span>
          </button>
        )}

        {cascadeEnabled && onCascade && !isRunning && (
          <button
            type="button"
            className="nx9-context-menu__item"
            onClick={() => { onCascade(); onClose(); }}
          >
            <Zap size={13} />
            <span>级联运行 (Cascade)</span>
          </button>
        )}

        {rerunDownstreamEnabled && onRerunDownstream && !isRunning && (
          <button
            type="button"
            className="nx9-context-menu__item"
            onClick={() => { onRerunDownstream(); onClose(); }}
          >
            <RefreshCw size={13} />
            <span>重跑下游链</span>
          </button>
        )}

        {expandLabel && onToggleExpand && (
          <button
            type="button"
            className="nx9-context-menu__item"
            onClick={() => { onToggleExpand(); onClose(); }}
          >
            <Maximize2 size={13} />
            <span>{expandLabel}</span>
          </button>
        )}

        {hasStoryboardOutput && (
          <button
            type="button"
            className="nx9-context-menu__item"
            disabled={storyboardActionCount === 0}
            title="打开故事板并定位关联镜头"
            onClick={() => { onFocusStoryboard(); onClose(); }}
          >
            <Clapperboard size={13} />
            <span>发送到故事板</span>
          </button>
        )}

        <button type="button" className="nx9-context-menu__item" onClick={() => { onCopy(); onClose(); }}>
          <Copy size={13} />
          <span>复制</span>
        </button>
        <button type="button" className="nx9-context-menu__item" onClick={() => { onDuplicate(); onClose(); }}>
          <CopyPlus size={13} />
          <span>快速复制</span>
        </button>
        <button
          type="button"
          className="nx9-context-menu__item nx9-context-menu__item--danger"
          onClick={() => { onDelete(); onClose(); }}
        >
          <Trash2 size={13} />
          <span>删除</span>
        </button>
      </div>

      {alignOpen && (
        <div
          className="fixed z-[60]"
          style={{ left: alignLeft, top: alignTop, width: alignWidth }}
          role="menu"
          aria-label="对齐和整理方式"
          onMouseEnter={() => {
            clearCloseTimer();
            setAlignOpen(true);
          }}
          onMouseLeave={scheduleClose}
        >
          <div className="nx9-context-menu p-2">
            <div className="mb-1 flex items-center gap-1 px-1 text-[10px] font-bold text-ink/60">
              <LayoutGrid size={11} />
              <span>对齐方式</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {alignBtn('align-left', '左', AlignStartVertical)}
              {alignBtn('align-center-x', '水平中', AlignCenterVertical)}
              {alignBtn('align-right', '右', AlignEndVertical)}
              {alignBtn('align-top', '上', AlignStartHorizontal)}
              {alignBtn('align-center-y', '垂直中', AlignCenterHorizontal)}
              {alignBtn('align-bottom', '下', AlignEndHorizontal)}
            </div>
            <div className="my-2 h-px bg-line" />
            <div className="mb-1 flex items-center gap-1 px-1 text-[10px] font-bold text-ink/60">
              <Grid3x3 size={11} />
              <span>整理方式</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {alignBtn('distribute-x', '水平等距', AlignHorizontalSpaceBetween, 3)}
              {alignBtn('distribute-y', '垂直等距', AlignVerticalSpaceBetween, 3)}
              {alignBtn('snap-grid', '吸附网格', Magnet, 1)}
              {alignBtn('arrange-grid', '整理网格', Grid3x3, 2)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
