import { memo, useCallback, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { api } from '../../api/client';

function DialogueSheetBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const lines = (props.data?.lines as { speaker: string; text: string; emotion?: string }[]) ?? [];
  const status = props.data?.status as string | undefined;
  const [sourceText, setSourceText] = useState((props.data?.sourceText as string) ?? '');
  const [parsing, setParsing] = useState(false);

  const parse = useCallback(async () => {
    if (!sourceText.trim()) return;
    setParsing(true);
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.dialogueParse(sourceText.trim());
      updateNodeData(props.id, {
        status: 'success',
        lines: res.lines,
        sourceText,
        content: res.lines.map((l) => `${l.speaker}：${l.text}`).join('\n'),
        meta: { lineCount: res.lines.length },
      });
      appendLog(`对白提取完成 · ${res.lines.length} 行`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`对白提取失败: ${String(e)}`);
    } finally {
      setParsing(false);
    }
  }, [sourceText, props.id, updateNodeData, appendLog]);

  const updateLine = useCallback(
    (idx: number, field: 'speaker' | 'text' | 'emotion', value: string) => {
      const next = lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l));
      updateNodeData(props.id, { lines: next, content: next.map((l) => `${l.speaker}：${l.text}`).join('\n') });
    },
    [lines, props.id, updateNodeData],
  );

  const removeLine = useCallback(
    (idx: number) => {
      const next = lines.filter((_, i) => i !== idx);
      updateNodeData(props.id, { lines: next });
    },
    [lines, props.id, updateNodeData],
  );

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-w-[320px]">
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          placeholder="粘贴剧本/对白文本…"
          rows={4}
          className="w-full rounded-lg border border-line px-2 py-1 resize-y"
        />
        <button
          type="button"
          onClick={() => void parse()}
          disabled={parsing || !sourceText.trim()}
          className="w-full rounded-xl bg-brand text-white py-1.5 disabled:opacity-50"
        >
          {parsing ? '解析中…' : '解析对白'}
        </button>
        {lines.length > 0 && (
          <div className="max-h-48 overflow-y-auto nx9-scroll space-y-1 border border-line rounded-lg p-1">
            {lines.map((line, i) => (
              <div key={i} className="flex gap-1 items-start p-1 rounded hover:bg-surface">
                <span className="w-5 text-[10px] text-ink/40 shrink-0 pt-1">{i + 1}</span>
                <div className="flex-1 space-y-0.5">
                  <input
                    value={line.speaker}
                    onChange={(e) => updateLine(i, 'speaker', e.target.value)}
                    className="w-full rounded border border-line px-1 py-0.5 font-medium text-[10px]"
                    placeholder="说话人"
                  />
                  <input
                    value={line.text}
                    onChange={(e) => updateLine(i, 'text', e.target.value)}
                    className="w-full rounded border border-line px-1 py-0.5 text-[10px]"
                    placeholder="对白"
                  />
                  {line.emotion !== undefined && (
                    <input
                      value={line.emotion}
                      onChange={(e) => updateLine(i, 'emotion', e.target.value)}
                      className="w-full rounded border border-line px-1 py-0.5 text-[9px] text-ink/50"
                      placeholder="情感（可选）"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="text-[10px] text-red-400 shrink-0 pt-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(DialogueSheetBlock);
