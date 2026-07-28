/**
 * UpstreamPolicySelect — 多上游策略选择器（F-027）。
 *
 * 当节点有多条同 kind 上游时，允许用户选择策略：
 * - merge: 全部合并（默认）
 * - primary: 只取第一条 / 指定来源
 *
 * 选择结果写入节点 data.upstreamPolicy + data.primarySourceId。
 */
import { memo, useCallback } from 'react';
import type { UpstreamPolicy } from '@nx9/shared';
import { useEdges, useNodes } from '@xyflow/react';

interface UpstreamPolicySelectProps {
  nodeId: string;
  upstreamPolicy?: UpstreamPolicy;
  primarySourceId?: string | null;
  onChange: (data: { upstreamPolicy: UpstreamPolicy; primarySourceId?: string | null }) => void;
}

/** 获取当前节点的上游节点列表（按 kind 分组） */
function useUpstreamSources(nodeId: string) {
  const nodes = useNodes();
  const edges = useEdges();
  const incoming = edges.filter((e) => e.target === nodeId);
  const sources = incoming.map((e) => {
    const n = nodes.find((nd) => nd.id === e.source);
    return n ? { id: n.id, type: n.type ?? '', label: (n.data as any)?.label ?? n.type ?? n.id } : null;
  }).filter(Boolean) as { id: string; type: string; label: string }[];

  // 按 type 分组
  const byType = new Map<string, { id: string; type: string; label: string }[]>();
  for (const s of sources) {
    const list = byType.get(s.type) ?? [];
    list.push(s);
    byType.set(s.type, list);
  }
  return { sources, byType, multiSourceTypes: [...byType.entries()].filter(([, list]) => list.length > 1).map(([t]) => t) };
}

export const UpstreamPolicySelect = memo(function UpstreamPolicySelect({
  nodeId,
  upstreamPolicy = 'merge',
  primarySourceId,
  onChange,
}: UpstreamPolicySelectProps) {
  const { multiSourceTypes, sources } = useUpstreamSources(nodeId);

  if (multiSourceTypes.length === 0) return null; // 无多上游，不显示

  const handlePolicyChange = useCallback((policy: UpstreamPolicy) => {
    if (policy === 'merge') {
      onChange({ upstreamPolicy: policy, primarySourceId: null });
    } else {
      // primary: 默认取第一个上游
      const first = sources[0];
      onChange({ upstreamPolicy: policy, primarySourceId: first?.id ?? null });
    }
  }, [onChange, sources]);

  const handlePrimaryChange = useCallback((sourceId: string) => {
    onChange({ upstreamPolicy: 'primary', primarySourceId: sourceId });
  }, [onChange]);

  if (multiSourceTypes.length === 0) return null;

  return (
    <div className="nx9-upstream-policy px-2 py-1.5 text-[10px] border-t border-line/30">
      <div className="flex items-center gap-1 mb-1">
        <span className="text-ink/50">上游策略：</span>
        <select
          className="text-[10px] bg-surface rounded border border-line px-1 py-0.5"
          value={upstreamPolicy}
          onChange={(e) => handlePolicyChange(e.target.value as UpstreamPolicy)}
        >
          <option value="merge">全部合并</option>
          <option value="primary">仅主要来源</option>
        </select>
      </div>
      {upstreamPolicy === 'primary' && sources.length > 1 && (
        <div className="flex items-center gap-1">
          <span className="text-ink/50">来源：</span>
          <select
            className="text-[10px] bg-surface rounded border border-line px-1 py-0.5 max-w-[120px]"
            value={primarySourceId ?? sources[0]?.id ?? ''}
            onChange={(e) => handlePrimaryChange(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
});
