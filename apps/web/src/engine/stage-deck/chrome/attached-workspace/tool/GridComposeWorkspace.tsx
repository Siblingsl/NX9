import { useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Upload, X } from 'lucide-react';
import { lookupBlock } from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import { useActivityLog } from '../../../../../stores/activity-log';
import { api } from '../../../../../api/client';

export interface GridComposeWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function GridComposeWorkspace({ blockId, kind, onCollapse }: GridComposeWorkspaceProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const data = useAttachedNodeData(blockId);

  const rows = (data.rows as number) ?? 3;
  const cols = (data.cols as number) ?? 3;
  const status = data.status as string | undefined;
  const upstream = data.upstream as { pictures?: string[] } | undefined;
  const composedUrl = data.composedUrl as string | undefined;
  const imageUrls = upstream?.pictures ?? (data.imageUrls as string[]) ?? [];
  const uploadedUrls = (data.uploadedUrls as string[]) ?? [];
  const allUrls = [...uploadedUrls, ...imageUrls];
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      try {
        const res = await api.uploadAsset(file);
        const next = [...uploadedUrls, res.url];
        updateNodeData(blockId, { uploadedUrls: next, imageUrls: next });
        appendLog(`已上传: ${file.name}`);
      } catch (e) {
        appendLog(`上传失败: ${String(e)}`);
      }
    },
    [uploadedUrls, blockId, updateNodeData, appendLog],
  );

  const removeUrl = useCallback(
    (idx: number) => {
      const next = uploadedUrls.filter((_, i) => i !== idx);
      updateNodeData(blockId, { uploadedUrls: next, imageUrls: next.length > 0 ? next : undefined });
    },
    [uploadedUrls, blockId, updateNodeData],
  );

  const run = useCallback(async () => {
    if (allUrls.length === 0) {
      appendLog('宫格拼接：请上传图片或连接上游');
      return;
    }
    updateNodeData(blockId, { status: 'running' });
    try {
      const res = await api.gridCompose({ imageUrls: allUrls, rows, cols });
      updateNodeData(blockId, {
        status: 'success',
        composedUrl: res.url,
        previewUrl: res.url,
      });
      appendLog('宫格拼接完成');
    } catch (e) {
      updateNodeData(blockId, { status: 'error', error: String(e) });
      appendLog(`宫格拼接失败: ${String(e)}`);
    }
  }, [allUrls, rows, cols, blockId, updateNodeData, appendLog]);

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={onCollapse}
      onRun={() => void run()}
      running={status === 'running'}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      heightClass="h-auto max-h-[420px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2 overflow-y-auto nowheel overscroll-contain text-xs"
    >
      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files) for (const f of Array.from(files)) void uploadFile(f);
            e.target.value = '';
          }}
        />
        <div className="flex gap-2">
          <label className="text-[10px] text-ink/50 flex-1">
            行
            <input
              type="number"
              min={1}
              max={6}
              value={rows}
              onChange={(e) => updateNodeData(blockId, { rows: Number(e.target.value) })}
              className="w-full rounded border border-line px-1 py-0.5 text-xs mt-0.5 bg-surface"
            />
          </label>
          <label className="text-[10px] text-ink/50 flex-1">
            列
            <input
              type="number"
              min={1}
              max={6}
              value={cols}
              onChange={(e) => updateNodeData(blockId, { cols: Number(e.target.value) })}
              className="w-full rounded border border-line px-1 py-0.5 text-xs mt-0.5 bg-surface"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1">
          {allUrls.map((url, i) => (
            <div key={url} className="relative w-12 h-12 rounded border border-line overflow-hidden group">
              <img src={url} alt="" className="w-full h-full object-cover" />
              {i < uploadedUrls.length && (
                <button
                  type="button"
                  onClick={() => removeUrl(i)}
                  className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-12 h-12 rounded border border-dashed border-line flex items-center justify-center text-ink/30 hover:text-brand hover:border-brand/40"
          >
            <Upload size={14} />
          </button>
        </div>
        <p className="text-[10px] text-ink/50">{allUrls.length} 张图片 · {rows}×{cols} 宫格</p>
        {composedUrl && (
          <img src={composedUrl} alt="" className="w-full rounded-lg border border-line max-h-32 object-cover" />
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running' || allUrls.length === 0}
          className="w-full rounded-xl bg-warn text-white text-sm py-2 disabled:opacity-50"
        >
          {status === 'running' ? '拼接中…' : '拼接宫格'}
        </button>
      </div>
    </ComposerWorkspaceShell>
  );
}
