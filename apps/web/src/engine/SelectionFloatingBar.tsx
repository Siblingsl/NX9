import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { getNodesBounds, useReactFlow, useStore, type Node } from '@xyflow/react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  CopyPlus,
  Grid3x3,
  Group,
  LayoutGrid,
  Magnet,
  Pause,
  Play,
  Trash2,
  Ungroup,
} from 'lucide-react';
import type { NodeAlignAction } from './node-align';

export interface SelectionFloatingBarProps {
  nodes: Node[];
  executableCount: number;
  isRunning: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  groupCollapsed: boolean | null;
  onRun: () => void;
  onStop: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onToggleCollapse: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAlign: (action: NodeAlignAction) => void;
}

export function SelectionFloatingBar({
  nodes,
  executableCount,
  isRunning,
  canGroup,
  canUngroup,
  groupCollapsed,
  onRun,
  onStop,
  onGroup,
  onUngroup,
  onToggleCollapse,
  onCopy,
  onDuplicate,
  onDelete,
  onAlign,
}: SelectionFloatingBarProps) {
  const { flowToScreenPosition } = useReactFlow();
  const transform = useStore((s) => s.transform);
  const [alignOpen, setAlignOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const selectedModules = useMemo(
    () => nodes.filter((n) => n.selected && n.type !== 'scene-group' && !n.hidden),
    [nodes],
  );
  const selectedGroups = useMemo(
    () => nodes.filter((n) => n.selected && n.type === 'scene-group'),
    [nodes],
  );
  const boundNodes = useMemo(() => {
    if (selectedGroups.length > 0) return selectedGroups;
    return selectedModules;
  }, [selectedGroups, selectedModules]);

  const showBar = selectedModules.length >= 2 || selectedGroups.length >= 1;
  const showModuleActions = selectedModules.length >= 1;
  const showAlign = selectedModules.length >= 2;

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setAlignOpen(false), 140);
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    if (!showAlign) setAlignOpen(false);
  }, [showAlign]);

  const screenPos = useMemo(() => {
    if (!showBar || boundNodes.length === 0) return null;
    void transform;
    try {
      const bounds = getNodesBounds(boundNodes);
      const topLeft = flowToScreenPosition({ x: bounds.x, y: bounds.y });
      const topRight = flowToScreenPosition({ x: bounds.x + bounds.width, y: bounds.y });
      return {
        left: (topLeft.x + topRight.x) / 2,
        top: Math.min(topLeft.y, topRight.y) - 12,
      };
    } catch {
      return null;
    }
  }, [showBar, boundNodes, flowToScreenPosition, transform]);

  if (!showBar || !screenPos) return null;

  const countLabel =
    selectedGroups.length > 0 && selectedModules.length === 0
      ? selectedGroups.length
      : selectedModules.length + selectedGroups.length;

  const alignBtn = (
    action: NodeAlignAction,
    label: string,
    Icon: ComponentType<{ size?: number }>,
    min = 2,
  ) => {
    const disabled = selectedModules.length < min;
    return (
      <button
        key={action}
        type="button"
        className="nx9-selection-bar__menu-item"
        disabled={disabled}
        title={disabled ? `至少选择 ${min} 个模块` : label}
        onClick={() => {
          onAlign(action);
          setAlignOpen(false);
        }}
      >
        <Icon size={12} />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div
      className="nx9-selection-bar"
      style={{
        left: screenPos.left,
        top: Math.max(44, screenPos.top),
        transform: 'translate(-50%, -100%)',
      }}
      role="toolbar"
      aria-label={`已选 ${countLabel} 项`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="nx9-selection-bar__count">{countLabel}</span>

      {showModuleActions ? (
        isRunning ? (
          <button
            type="button"
            className="nx9-selection-bar__btn"
            title="停止运行（保留进度）"
            onClick={onStop}
          >
            <Pause size={14} />
            <span>停止</span>
          </button>
        ) : (
          <button
            type="button"
            className="nx9-selection-bar__btn nx9-selection-bar__btn--primary"
            disabled={executableCount === 0}
            title={executableCount === 0 ? '选中模块中无可运行项' : `运行选中（${executableCount}）`}
            onClick={onRun}
          >
            <Play size={14} fill="currentColor" />
            <span>运行选中</span>
          </button>
        )
      ) : null}

      {canGroup ? (
        <button
          type="button"
          className="nx9-selection-bar__btn"
          title="打成场景组（Ctrl+G）"
          onClick={onGroup}
        >
          <Group size={14} />
          <span>打组</span>
        </button>
      ) : null}

      {canUngroup ? (
        <button
          type="button"
          className="nx9-selection-bar__btn"
          title="解散场景组"
          onClick={onUngroup}
        >
          <Ungroup size={14} />
          <span>解组</span>
        </button>
      ) : null}

      {groupCollapsed !== null ? (
        <button
          type="button"
          className="nx9-selection-bar__btn"
          title={groupCollapsed ? '展开场景组' : '折叠场景组'}
          onClick={onToggleCollapse}
        >
          {groupCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
          <span>{groupCollapsed ? '展开' : '折叠'}</span>
        </button>
      ) : null}

      <span className="nx9-selection-bar__sep" aria-hidden />

      <button type="button" className="nx9-selection-bar__icon" title="复制（Ctrl+C）" onClick={onCopy}>
        <Copy size={14} />
      </button>
      <button
        type="button"
        className="nx9-selection-bar__icon"
        title="快速复制（Ctrl+D）"
        onClick={onDuplicate}
      >
        <CopyPlus size={14} />
      </button>

      {showAlign ? (
        <div
          className="nx9-selection-bar__align"
          onMouseEnter={() => {
            clearCloseTimer();
            setAlignOpen(true);
          }}
          onMouseLeave={scheduleClose}
        >
          <button
            type="button"
            className="nx9-selection-bar__btn"
            aria-haspopup="menu"
            aria-expanded={alignOpen}
            title="对齐 / 整理"
            onClick={() => setAlignOpen((v) => !v)}
          >
            <LayoutGrid size={14} />
            <span>对齐</span>
            <ChevronDown size={12} />
          </button>
          {alignOpen ? (
            <div className="nx9-selection-bar__menu" role="menu" aria-label="对齐和整理方式">
              <div className="nx9-selection-bar__menu-label">对齐方式</div>
              <div className="nx9-selection-bar__menu-grid cols-3">
                {alignBtn('align-left', '左', AlignStartVertical)}
                {alignBtn('align-center-x', '水平中', AlignCenterVertical)}
                {alignBtn('align-right', '右', AlignEndVertical)}
                {alignBtn('align-top', '上', AlignStartHorizontal)}
                {alignBtn('align-center-y', '垂直中', AlignCenterHorizontal)}
                {alignBtn('align-bottom', '下', AlignEndHorizontal)}
              </div>
              <div className="nx9-selection-bar__menu-sep" />
              <div className="nx9-selection-bar__menu-label">整理方式</div>
              <div className="nx9-selection-bar__menu-grid cols-2">
                {alignBtn('distribute-x', '水平等距', AlignHorizontalSpaceBetween, 3)}
                {alignBtn('distribute-y', '垂直等距', AlignVerticalSpaceBetween, 3)}
                {alignBtn('snap-grid', '吸附网格', Magnet, 1)}
                {alignBtn('arrange-grid', '整理网格', Grid3x3, 2)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <span className="nx9-selection-bar__sep" aria-hidden />

      <button
        type="button"
        className="nx9-selection-bar__icon nx9-selection-bar__icon--danger"
        title="删除选中（Delete）"
        onClick={onDelete}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
