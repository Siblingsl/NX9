import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function LinkParserBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const url = (props.data?.url as string) ?? '';
  const hint = (props.data?.hint as string) ?? '';
  const status = props.data?.status as string | undefined;
  const result = props.data?.parseResult as
    | { title?: string; summary?: string; prompt?: string; mediaKind?: string }
    | undefined;

  const run = useCallback(async () => {
    if (!url.trim()) {
      appendLog('链接解析：请输入 URL');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.parseLink(url.trim(), hint || undefined);
      updateNodeData(props.id, {
        status: 'success',
        parseResult: res,
        content: res.prompt,
        output: res.prompt,
        title: res.title,
        summary: res.summary,
      });
      appendLog(`链接解析完成 · ${res.title}`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`链接解析失败: ${String(e)}`);
    }
  }, [url, hint, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <input
          type="url"
          value={url}
          onChange={(e) => updateNodeData(props.id, { url: e.target.value })}
          placeholder="粘贴自媒体 / 网页链接…"
          className="w-full rounded-xl border border-line px-3 py-2"
        />
        <input
          value={hint}
          onChange={(e) => updateNodeData(props.id, { hint: e.target.value })}
          placeholder="可选备注（风格、用途）"
          className="w-full rounded-xl border border-line px-3 py-2"
        />
        {result && (
          <div className="rounded-xl bg-surface border border-line p-2 space-y-1">
            <p className="font-medium text-ink truncate">{result.title}</p>
            {result.summary && <p className="text-ink/60 line-clamp-3">{result.summary}</p>}
            {result.prompt && (
              <p className="text-ink/80 font-mono text-[10px] line-clamp-4">{result.prompt}</p>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running'}
          className="w-full rounded-xl bg-brand text-white py-2 disabled:opacity-50"
        >
          {status === 'running' ? '解析中…' : '解析链接'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(LinkParserBlock);
