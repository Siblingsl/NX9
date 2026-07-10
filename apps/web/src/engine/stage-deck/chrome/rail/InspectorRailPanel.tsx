import { lookupBlock, resolveEmits, resolveAccepts, SOCKET_LABELS } from '@nx9/shared';
import { useFlowRuntime, useStoryboardUi } from '../../../../stores/flow-runtime';
import { useAliasStore } from '../../stores/alias-store';
import { useContextRailUi } from '../../stores/context-rail-ui';
import { RailEmpty } from './primitives/RailEmpty';
import { RailSection } from './primitives/RailSection';
import { RailField } from './primitives/RailField';
import { Clapperboard, Play, Crosshair, Trash2 } from 'lucide-react';
import { useWorkspaceDocument } from '../../../../stores/workspace-document';
import { useActivityLog } from '../../../../stores/activity-log';
import { useMemo, useCallback } from 'react';

interface InspectorRailPanelProps {
  selectedBlockId: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-ink/10 text-ink/60',
  running: 'bg-brand/10 text-brand',
  success: 'bg-ok/15 text-ok',
  error: 'bg-red/10 text-red',
  blocked: 'bg-warn/15 text-warn',
};

export function InspectorRailPanel({ selectedBlockId }: InspectorRailPanelProps) {
  const alias = useAliasStore((s) =>
    selectedBlockId ? s.aliases[selectedBlockId] ?? '' : '',
  );
  const setAlias = useAliasStore((s) => s.setAlias);
  const runtime = useFlowRuntime((s) => s.runtime);
  const node = selectedBlockId ? runtime?.getNodes().find((n) => n.id === selectedBlockId) : undefined;
  const meta = lookupBlock(node?.type ?? '');
  const requestTab = useContextRailUi((s) => s.requestTab);
  const setOpen = useStoryboardUi((s) => s.setOpen);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const appendLog = useActivityLog((s) => s.append);

  const handleRunModule = useCallback(async () => {
    if (!node || !runtime) return;
    try {
      const { runCascadeFromBlock } = await import('../../execution/cascade-runner');
      const nodes = runtime.getNodes();
      const edges = runtime.getEdges();
      if (!nodes || !edges) {
        appendLog('运行模块：画布数据不可用');
        return;
      }
      appendLog(`运行模块: ${meta?.label || node.type}`);
      await runCascadeFromBlock({
        blockId: node.id,
        nodes,
        edges,
        setEdges: (updater) => {
          if (typeof updater === 'function') {
            const current = runtime.getEdges();
            runtime.setEdges(updater(current));
          }
        },
        updateNodeData: (id, data) => runtime.updateNodeData(id, data),
      });
    } catch (e) {
      appendLog(`运行模块失败: ${String(e)}`);
    }
  }, [node, runtime, meta, appendLog]);

  const linkedShot = useMemo(() => {
    if (!node) return undefined;
    const shotId = node.data?.linkedShotId as string | undefined;
    if (!shotId) return undefined;
    return shots.find((s) => s.id === shotId);
  }, [node, shots]);

  const genSummary = useMemo(() => {
    if (!node?.data) return null;
    const kind = node.type ?? '';
    const d = node.data as Record<string, unknown>;
    if (kind.includes('picture') || kind.includes('image')) {
      const model = (d.model as string) ?? 'DALL·E 3';
      const aspect = (d.aspectRatio as string) ?? '1:1';
      const resolution = (d.resolution as string) ?? '1024²';
      const count = (d.imageCount as number) ?? 1;
      return `${model} · ${aspect} · ${resolution} · ${count}张`;
    }
    if (kind.includes('clip') || kind.includes('video')) {
      const model = (d.model as string) ?? 'Runway';
      const duration = (d.durationSec as number) ?? 5;
      return `${model} · ${duration}s`;
    }
    if (kind.includes('sound') || kind.includes('audio')) {
      const model = (d.model as string) ?? 'ElevenLabs';
      return `${model} · TTS`;
    }
    return null;
  }, [node]);

  if (!selectedBlockId || !node) {
    return (
      <RailEmpty
        title="未选中模块"
        description="在画布上点击模块，或从左侧 Dock 拖入"
        actionLabel="打开 CommandPalette (⌘K)"
        onAction={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
      />
    );
  }

  const status = (node.data?.status as string) ?? 'idle';
  const statusClass = STATUS_COLORS[status] ?? STATUS_COLORS.idle;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        {meta?.glyph && (
          <span className="text-lg">{meta.glyph}</span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink truncate">{meta?.label ?? node.type}</p>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusClass}`}>
          {status}
        </span>
      </div>

      {/* 别名 */}
      <RailField label="别名">
        <RailField.Input
          value={alias}
          onChange={(v) => selectedBlockId && setAlias(selectedBlockId, v)}
          placeholder={meta?.label ?? '场景 A'}
        />
      </RailField>

      {/* 关联镜头 */}
      {linkedShot && (
        <RailSection title="关联镜头">
          <div className="rounded-lg border border-brand/30 bg-brand/5 p-2 space-y-1">
            <p className="text-xs font-medium text-brand">
              镜头 #{linkedShot.index}
            </p>
            <p className="text-[11px] text-ink/60 line-clamp-2">
              {linkedShot.descriptionZh || linkedShot.promptEn || '—'}
            </p>
            <button
              type="button"
              onClick={() => {
                requestTab('storyboard');
                setOpen(true);
              }}
              className="text-[10px] text-brand hover:underline flex items-center gap-1"
            >
              <Clapperboard size={12} />
              在故事板打开
            </button>
          </div>
        </RailSection>
      )}

      {/* 生成摘要 */}
      {genSummary && (
        <RailSection title="生成摘要">
          <p className="text-xs text-ink/70 leading-relaxed">{genSummary}</p>
        </RailSection>
      )}

      {/* 快捷操作 */}
      <RailSection title="操作">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void handleRunModule()}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand text-white h-9 text-sm hover:bg-brand/90"
          >
            <Play size={14} />
            运行此模块
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => runtime?.focusBlock(node.id)}
              className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-line h-9 text-xs hover:border-brand/40"
            >
              <Crosshair size={12} />
              在画布中定位
            </button>
            <button
              type="button"
              onClick={() => runtime?.deleteNodes([node.id])}
              className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-line h-9 text-xs hover:border-red/40 text-red/60 hover:text-red"
            >
              <Trash2 size={12} />
              删除
            </button>
          </div>
        </div>
      </RailSection>

      {/* 高级 */}
      <details className="group">
        <summary className="text-xs text-ink/40 cursor-pointer hover:text-ink/60">
          高级信息
        </summary>
        <div className="mt-2 space-y-1 text-[10px] text-ink/40 font-mono">
          <p>blockId: {node.id}</p>
          <p>type: {node.type}</p>
          {(() => {
            const emits = resolveEmits(node.type ?? '', node.data as Record<string, unknown> | undefined);
            const accepts = resolveAccepts(node.type ?? '');
            return (
              <>
                {emits.length > 0 && <p>输出: {emits.map((s) => SOCKET_LABELS[s] ?? s).join(', ')}</p>}
                {accepts.length > 0 && <p>输入: {accepts.map((s) => SOCKET_LABELS[s] ?? s).join(', ')}</p>}
              </>
            );
          })()}
        </div>
      </details>
    </div>
  );
}
