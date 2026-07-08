import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function lineDiff(a: string, b: string): string[] {
  const la = a.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const lb = b.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const onlyA = la.filter((x) => !lb.includes(x));
  const onlyB = lb.filter((x) => !la.includes(x));
  const lines: string[] = [];
  if (onlyA.length) lines.push(`− ${onlyA.join(' · ')}`);
  if (onlyB.length) lines.push(`+ ${onlyB.join(' · ')}`);
  if (!lines.length) lines.push('(无差异)');
  return lines;
}

function PromptDiffBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { prompts?: string[] } | undefined;
  const prompts = upstream?.prompts ?? [];
  const diffText = (props.data?.diffText as string) ?? '';
  const mergeSuggestion = (props.data?.mergeSuggestion as string) ?? '';

  const localDiff = useMemo(() => {
    if (prompts.length < 2) return [];
    return lineDiff(prompts[0], prompts[1]);
  }, [prompts]);

  const runMergeSuggest = useCallback(async () => {
    if (prompts.length < 2) {
      appendLog('Prompt 对比：至少需要 2 路上游 prompt');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.proxyLlm({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '合并两版 prompt，保留各自优点，输出一段简洁英文 prompt，不要解释。',
          },
          { role: 'user', content: `A:\n${prompts[0]}\n\nB:\n${prompts[1]}` },
        ],
      });
      const merged = (res as { content?: string }).content?.trim() ?? '';
      const diff = lineDiff(prompts[0], prompts[1]).join('\n');
      updateNodeData(props.id, {
        status: 'success',
        diffText: diff,
        mergeSuggestion: merged,
        content: merged,
        output: merged,
        meta: { sourceCount: prompts.length },
      });
      appendLog('Prompt 对比 · 已生成合并建议');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [prompts, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <p className="text-[10px] text-ink/50">{prompts.length} 路上游 prompt</p>
        {(diffText || localDiff.length > 0) && (
          <pre className="text-[10px] bg-surface rounded-lg p-2 whitespace-pre-wrap max-h-24 overflow-y-auto nx9-scroll">
            {diffText || localDiff.join('\n')}
          </pre>
        )}
        {mergeSuggestion && (
          <p className="text-[10px] text-brand/80 bg-brand/5 rounded-lg p-2">{mergeSuggestion}</p>
        )}
        <button type="button" onClick={() => void runMergeSuggest()} className="w-full rounded-xl bg-brand text-white py-2">
          Diff + 合并建议
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(PromptDiffBlock);
