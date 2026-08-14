import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Handle, Position, useReactFlow, useStore, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { lookupBlock, SOCKET_COLORS } from '@nx9/shared';
import { Layers2 } from 'lucide-react';
import '../../../styles/node-stage-card.css';

export const SCENE_GROUP_PAD = 48;
export const SCENE_GROUP_HEADER = 40;
/** 内边距版本：旧组缺少此标记时会自动重算包围盒 */
export const SCENE_GROUP_PAD_VERSION = 2;
/** 折叠卡尺寸版本：旧折叠态会自动升到新卡片尺寸 */
export const SCENE_GROUP_COLLAPSED_VERSION = 2;
/** 折叠卡：足够展示标题 + 成员芯片 + 页脚 */
export const SCENE_GROUP_COLLAPSED = { width: 300, height: 152 } as const;

export type SceneGroupMemberPreview = {
  kind: string;
  label: string;
};

const PREVIEW_LIMIT = 3;

/** 场景组整体数据口：左入 / 右出，挂在虚线框边缘（非子节点口） */
const GROUP_IN_KINDS = ['prompt', 'picture', 'clip', 'sound', 'mesh', 'wildcard'] as const;
const GROUP_OUT_KINDS = ['picture', 'prompt', 'clip', 'sound', 'mesh', 'wildcard'] as const;

export function buildSceneGroupMemberPreview(
  members: Array<{ type?: string; data?: Record<string, unknown> | unknown }>,
): SceneGroupMemberPreview[] {
  return members.slice(0, PREVIEW_LIMIT).map((m) => {
    const kind = typeof m.type === 'string' && m.type ? m.type : 'unknown';
    const data = m.data && typeof m.data === 'object' ? (m.data as Record<string, unknown>) : {};
    const custom = typeof data.label === 'string' ? data.label.trim() : '';
    const label = custom || lookupBlock(kind)?.label || kind;
    return { kind, label };
  });
}

export const SceneGroupNode = memo(function SceneGroupNode({ id, data, selected }: NodeProps) {
  const label = ((data?.label as string) || '场景组').trim() || '场景组';
  const width = (data?.width as number) ?? 400;
  const height = (data?.height as number) ?? 280;
  const collapsed = Boolean(data?.collapsed);
  const storedCount = typeof data?.memberCount === 'number' ? data.memberCount : undefined;
  const storedPreview = Array.isArray(data?.memberPreview)
    ? (data.memberPreview as SceneGroupMemberPreview[])
    : [];
  const liveMembers = useStore(
    useCallback(
      (s) => s.nodes.filter((n) => n.parentId === id),
      [id],
    ),
  );
  const livePreview = useMemo(
    () => buildSceneGroupMemberPreview(liveMembers),
    [liveMembers],
  );
  const memberPreview = storedPreview.length > 0 ? storedPreview : livePreview;
  const memberCount = storedCount ?? liveMembers.length;
  const updateNodeInternals = useUpdateNodeInternals();
  const { updateNodeData } = useReactFlow();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  // 尺寸变化后刷新 Handle 锚点，否则连线会对不准组边框
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, width, height, collapsed, updateNodeInternals]);

  useEffect(() => {
    if (!editing) setDraft(label);
  }, [label, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = useCallback(() => {
    const next = draft.trim() || '场景组';
    setEditing(false);
    if (next !== label) {
      updateNodeData(id, { label: next });
    }
  }, [draft, id, label, updateNodeData]);

  const cancel = useCallback(() => {
    setDraft(label);
    setEditing(false);
  }, [label]);

  const onTitleDoubleClick = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraft(label);
    setEditing(true);
  }, [label]);

  const onInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    },
    [cancel, commit],
  );

  const inKind = GROUP_IN_KINDS[0];
  const outKind = GROUP_OUT_KINDS[0];
  const overflow = Math.max(0, memberCount - memberPreview.length);

  return (
    <div
      className={`nx9-scene-group ${selected ? 'is-selected' : ''} ${collapsed ? 'is-collapsed' : ''}`}
      style={{ width, height, minWidth: width, minHeight: height }}
    >
      {/* 组级入口（左侧整体） */}
      <Handle
        type="target"
        position={Position.Left}
        id={inKind}
        className="nx9-socket nx9-scene-group__socket nx9-scene-group__socket--in"
        style={{ background: SOCKET_COLORS[inKind] }}
        title={`场景组入口 · ${inKind}`}
      />
      {GROUP_IN_KINDS.slice(1).map((kind) => (
        <Handle
          key={`in-${kind}`}
          type="target"
          position={Position.Left}
          id={kind}
          className="nx9-socket nx9-socket--anchor"
          style={{ background: 'transparent', opacity: 0, pointerEvents: 'none', border: 'none' }}
          aria-hidden
        />
      ))}

      {/* 组级出口（右侧整体） */}
      <Handle
        type="source"
        position={Position.Right}
        id={outKind}
        className="nx9-socket nx9-scene-group__socket nx9-scene-group__socket--out"
        style={{ background: SOCKET_COLORS[outKind] }}
        title={`场景组出口 · ${outKind}`}
      />
      {GROUP_OUT_KINDS.slice(1).map((kind) => (
        <Handle
          key={`out-${kind}`}
          type="source"
          position={Position.Right}
          id={kind}
          className="nx9-socket nx9-socket--anchor"
          style={{ background: 'transparent', opacity: 0, pointerEvents: 'none', border: 'none' }}
          aria-hidden
        />
      ))}

      {collapsed ? (
        <div className="nx9-scene-group__card">
          <span className="nx9-scene-group__stack" aria-hidden />
          <span className="nx9-scene-group__stack nx9-scene-group__stack--2" aria-hidden />
          <div className="nx9-scene-group__card-surface">
            <div className="nx9-scene-group__card-head">
              <span className="nx9-scene-group__badge" aria-hidden>
                <Layers2 size={13} strokeWidth={2.2} />
              </span>
              {editing ? (
                <input
                  ref={inputRef}
                  className="nx9-scene-group__rename nodrag nopan nowheel"
                  value={draft}
                  maxLength={48}
                  aria-label="场景组名称"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={onInputKeyDown}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="nx9-scene-group__title"
                  title="双击重命名"
                  onDoubleClick={onTitleDoubleClick}
                >
                  {label}
                </span>
              )}
              <span className="nx9-scene-group__pill">已折叠</span>
            </div>

            <div className="nx9-scene-group__chips">
              {memberPreview.length > 0 ? (
                <>
                  {memberPreview.map((m, i) => (
                    <span key={`${m.kind}-${i}`} className="nx9-scene-group__chip" title={m.label}>
                      {m.label}
                    </span>
                  ))}
                  {overflow > 0 ? (
                    <span className="nx9-scene-group__chip nx9-scene-group__chip--more">
                      +{overflow}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="nx9-scene-group__chips-empty">组内暂无模块</span>
              )}
            </div>

            <div className="nx9-scene-group__card-foot">
              <span>{memberCount > 0 ? `${memberCount} 个模块` : '场景组'}</span>
              <span className="nx9-scene-group__hint">浮条可展开</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="nx9-scene-group__header">
          {editing ? (
            <input
              ref={inputRef}
              className="nx9-scene-group__rename nodrag nopan nowheel"
              value={draft}
              maxLength={48}
              aria-label="场景组名称"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={onInputKeyDown}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="nx9-scene-group__title"
              title="双击重命名"
              onDoubleClick={onTitleDoubleClick}
            >
              {label}
            </span>
          )}
          {memberCount > 0 ? (
            <span className="nx9-scene-group__meta">{memberCount} 个模块</span>
          ) : null}
        </div>
      )}
    </div>
  );
});

function nodeSize(n: {
  width?: number | null;
  height?: number | null;
  measured?: { width?: number; height?: number };
}): { w: number; h: number } {
  const w = n.width ?? n.measured?.width ?? 220;
  const h = n.height ?? n.measured?.height ?? 160;
  return { w, h };
}

export function computeGroupBounds(
  nodes: Array<{
    position: { x: number; y: number };
    width?: number | null;
    height?: number | null;
    measured?: { width?: number; height?: number };
  }>,
): { x: number; y: number; width: number; height: number } {
  const pad = SCENE_GROUP_PAD;
  const header = SCENE_GROUP_HEADER;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const { w, h } = nodeSize(n);
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }
  return {
    x: minX - pad,
    y: minY - pad - header,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2 + header,
  };
}
