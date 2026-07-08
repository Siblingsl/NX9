import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { splitText, type TextSplitMode } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';

function TextChunkerBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const mode = ((props.data?.mode as string) || 'paragraph') as TextSplitMode;
  const regex = (props.data?.regex as string) ?? '';
  const content = (props.data?.content as string) ?? '';
  const chunks = (props.data?.chunks as string[]) ?? [];

  const runSplit = useCallback(() => {
    const next = splitText(content, mode, regex || undefined);
    updateNodeData(props.id, { chunks: next, chunkCount: next.length, status: 'success' });
  }, [content, mode, regex, props.id, updateNodeData]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <label className="text-ink/60">
          切分模式
          <select
            value={mode}
            onChange={(e) => updateNodeData(props.id, { mode: e.target.value })}
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
          >
            <option value="paragraph">段落</option>
            <option value="line">行</option>
            <option value="sentence">句子</option>
            <option value="regex">正则</option>
          </select>
        </label>
        {mode === 'regex' && (
          <input
            value={regex}
            onChange={(e) => updateNodeData(props.id, { regex: e.target.value })}
            placeholder="正则分隔符"
            className="w-full rounded-lg border border-line px-2 py-1 font-mono"
          />
        )}
        <textarea
          value={content}
          onChange={(e) => updateNodeData(props.id, { content: e.target.value })}
          placeholder="待切分文本，或连接上游提示词"
          className="w-full min-h-[72px] rounded-xl border border-line px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={runSplit}
          className="w-full rounded-xl bg-accent text-white py-2 text-sm"
        >
          切分 ({chunks.length || '—'})
        </button>
        {chunks.length > 0 && (
          <ul className="max-h-28 overflow-y-auto nx9-scroll space-y-1">
            {chunks.map((c, i) => (
              <li key={i} className="rounded-lg bg-surface px-2 py-1 line-clamp-2">
                <span className="text-brand font-mono mr-1">#{i + 1}</span>
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(TextChunkerBlock);
