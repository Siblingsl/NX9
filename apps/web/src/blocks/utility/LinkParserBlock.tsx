import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { newBacklotWorkspaceItem } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';

const PLATFORM_ADAPTERS = [
  { match: /douyin\.com|iesdouyin/i, label: '抖音', icon: '🎵' },
  { match: /bilibili\.com|b23\.tv/i, label: 'B站', icon: '📺' },
  { match: /xiaohongshu\.com|xhslink/i, label: '小红书', icon: '📕' },
  { match: /weibo\.com/i, label: '微博', icon: '📱' },
  { match: /youtube\.com|youtu\.be/i, label: 'YouTube', icon: '▶️' },
  { match: /t\.co|twitter\.com|x\.com/i, label: 'X/Twitter', icon: '🐦' },
  { match: /instagram\.com/i, label: 'Instagram', icon: '📷' },
  { match: /tiktok\.com/i, label: 'TikTok', icon: '🎵' },
];

function detectPlatform(url: string): { label: string; icon: string } | null {
  for (const p of PLATFORM_ADAPTERS) {
    if (p.match.test(url)) return { label: p.label, icon: p.icon };
  }
  return null;
}

function LinkParserBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upsertBacklot = useWorkspaceDocument((s) => s.upsertBacklotWorkspace);
  const url = (props.data?.url as string) ?? '';
  const hint = (props.data?.hint as string) ?? '';
  const status = props.data?.status as string | undefined;
  const capturedAssetUrl = props.data?.capturedAssetUrl as string | undefined;
  const result = props.data?.parseResult as
    | { title?: string; summary?: string; prompt?: string; mediaKind?: string }
    | undefined;
  const platform = useMemo(() => {
    if (result?.title) return detectPlatform(url);
    return url ? detectPlatform(url) : null;
  }, [url, result]);

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

  const capture = useCallback(async () => {
    if (!url.trim()) return;
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.captureUrl(url.trim());
      updateNodeData(props.id, {
        status: 'success',
        capturedAssetUrl: res.url,
        assetUrl: res.url,
        mediaKind: /\.(png|jpe?g|gif|webp)$/i.test(url) ? 'picture' : 'clip',
      });
      appendLog(`素材已采集 · ${res.filename}`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`采集失败: ${String(e)}`);
    }
  }, [url, props.id, updateNodeData, appendLog]);

  const importPromptPackage = useCallback(async () => {
    if (!url.trim()) return;
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.importPromptPackage(url.trim());
      let imported = 0;
      for (const item of res.items) {
        const kind = item.kind as import('@nx9/shared').BacklotWorkspaceKind;
        const ws = newBacklotWorkspaceItem(kind);
        ws.label = item.label;
        ws.promptEn = item.prompt;
        upsertBacklot(ws);
        imported++;
      }
      updateNodeData(props.id, {
        status: 'success',
        importedCount: imported,
      });
      appendLog(`已导入 ${imported} 个 Backlot 模板（来源: GitHub）`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`导入失败: ${String(e)}`);
    }
  }, [url, props.id, updateNodeData, appendLog, upsertBacklot]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <div className="flex gap-1">
          <input
            type="url"
            value={url}
            onChange={(e) => updateNodeData(props.id, { url: e.target.value })}
            placeholder="粘贴自媒体 / 网页链接…"
            className="flex-1 rounded-xl border border-line px-3 py-2"
          />
          {platform && (
            <span className="shrink-0 flex items-center gap-1 rounded-xl bg-surface border border-line px-2 text-[10px] text-ink/60" title={platform.label}>
              {platform.icon} {platform.label}
            </span>
          )}
        </div>
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
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => void run()}
            disabled={status === 'running'}
            className="rounded-xl bg-brand text-white py-2 text-[11px] disabled:opacity-50"
          >
            {status === 'running' ? '处理中…' : '解析链接'}
          </button>
          <button
            type="button"
            onClick={() => void capture()}
            disabled={status === 'running' || !url.trim()}
            className="rounded-xl border border-brand/30 bg-brand/5 text-brand py-2 text-[11px] disabled:opacity-40"
          >
            采集素材
          </button>
          <button
            type="button"
            onClick={() => void importPromptPackage()}
            disabled={status === 'running' || !url.trim()}
            className="rounded-xl border border-line py-2 text-[11px] disabled:opacity-40"
          >
            导入 Backlot
          </button>
        </div>
        {capturedAssetUrl && (
          <p className="text-[10px] text-brand/70 truncate">已采集: {capturedAssetUrl}</p>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(LinkParserBlock);
