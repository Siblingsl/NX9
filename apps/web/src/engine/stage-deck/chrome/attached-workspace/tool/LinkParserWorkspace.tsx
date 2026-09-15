import { useCallback, useMemo, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { lookupBlock, newBacklotWorkspaceItem, detectLinkParserPlatform, mapLinkParseErrorCode, formatLinkParserSupportedLabel } from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import { useActivityLog } from '../../../../../stores/activity-log';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { api } from '../../../../../api/client';
import { toastError } from '../../../../../stores/toast';

function detectPlatform(url: string): { label: string; icon: string } | null {
  const p = detectLinkParserPlatform(url);
  if (!p) return null;
  const icons: Record<string, string> = {
    douyin: '🎵',
    bilibili: '📺',
    xiaohongshu: '📕',
    weibo: '📱',
    youtube: '▶️',
    'x-twitter': '🐦',
    instagram: '📷',
    tiktok: '🎵',
  };
  return { label: p.label, icon: icons[p.id] ?? '🔗' };
}

export interface LinkParserWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function LinkParserWorkspace({ blockId, kind, onCollapse }: LinkParserWorkspaceProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upsertBacklot = useWorkspaceDocument((s) => s.upsertBacklotWorkspace);
  const data = useAttachedNodeData(blockId);
  const meta = lookupBlock(kind);

  const url = (data.url as string) ?? '';
  const hint = (data.hint as string) ?? '';
  const status = data.status as string | undefined;
  const capturedAssetUrl = data.capturedAssetUrl as string | undefined;
  const result = data.parseResult as
    | { title?: string; summary?: string; prompt?: string; mediaKind?: string }
    | undefined;
  const platform = useMemo(() => {
    if (result?.title) return detectPlatform(url);
    return url ? detectPlatform(url) : null;
  }, [url, result]);

  const [parseErrorCode, setParseErrorCode] = useState<string | null>(null);

  const mapErrorCode = (code: string): string => mapLinkParseErrorCode(code);

  const run = useCallback(async () => {
    if (!url.trim()) {
      const msg = '链接解析：请输入 URL，禁止空成功';
      updateNodeData(blockId, { status: 'error', error: msg });
      appendLog(msg);
      toastError(msg);
      return;
    }
    setParseErrorCode(null);
    updateNodeData(blockId, { status: 'running' });
    try {
      const res = await api.parseLink(url.trim(), hint || undefined);
      if (!res.ok || !String(res.prompt ?? '').trim()) {
        throw new Error('链接解析失败或结果为空，禁止空成功');
      }
      updateNodeData(blockId, {
        status: 'success',
        parseResult: res,
        content: res.prompt,
        output: res.prompt,
        title: res.title,
        summary: res.summary,
      });
      appendLog(`链接解析完成 · ${res.title}`);
    } catch (e) {
      const msg = String(e);
      const codeMatch = msg.match(/\(([A-Z_]+)\)/);
      const code = codeMatch?.[1];
      setParseErrorCode(code ?? 'PARSE');
      const userMsg = code ? mapErrorCode(code) : msg;
      updateNodeData(blockId, { status: 'error', error: userMsg, errorCode: code ?? 'PARSE' });
      appendLog(`链接解析失败: ${userMsg}`);
      toastError(userMsg);
    }
  }, [url, hint, blockId, updateNodeData, appendLog]);

  const capture = useCallback(async () => {
    if (!url.trim()) return;
    updateNodeData(blockId, { status: 'running' });
    try {
      const res = await api.captureUrl(url.trim());
      if (!res.ok || !res.url) throw new Error('素材采集失败，禁止空成功');
      updateNodeData(blockId, {
        status: 'success',
        capturedAssetUrl: res.url,
        assetUrl: res.url,
        mediaKind: /\.(png|jpe?g|gif|webp)$/i.test(url) ? 'picture' : 'clip',
      });
      appendLog(`素材已采集 · ${res.filename}`);
    } catch (e) {
      const msg = String(e);
      updateNodeData(blockId, { status: 'error', error: msg });
      appendLog(`采集失败: ${msg}`);
      toastError(msg);
    }
  }, [url, blockId, updateNodeData, appendLog]);

  const importPromptPackage = useCallback(async () => {
    if (!url.trim()) return;
    updateNodeData(blockId, { status: 'running' });
    try {
      const res = await api.importPromptPackage(url.trim());
      if (!res.ok || !res.items?.length) {
        throw new Error('素材库导入为空，禁止空成功');
      }
      let imported = 0;
      for (const item of res.items) {
        const wk = item.kind as import('@nx9/shared').BacklotWorkspaceKind;
        const ws = newBacklotWorkspaceItem(wk);
        ws.label = item.label;
        ws.promptEn = item.prompt;
        upsertBacklot(ws);
        imported++;
      }
      updateNodeData(blockId, {
        status: 'success',
        importedCount: imported,
      });
      appendLog(`已导入 ${imported} 个素材模板（来源: GitHub）`);
    } catch (e) {
      const msg = `导入失败: ${String(e)}`;
      updateNodeData(blockId, { status: 'error', error: String(e) });
      appendLog(msg);
      toastError(msg);
    }
  }, [url, blockId, updateNodeData, appendLog, upsertBacklot]);

  const handleRun = useCallback(() => { void run(); }, [run]);

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={onCollapse}
      onRun={handleRun}
      running={status === 'running'}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      heightClass="h-auto max-h-[360px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2 overflow-y-auto nowheel overscroll-contain text-xs"
    >
      <div className="space-y-2">
        <div className="flex gap-1">
          <input
            type="url"
            value={url}
            onChange={(e) => updateNodeData(blockId, { url: e.target.value })}
            placeholder={`粘贴链接（支持 ${formatLinkParserSupportedLabel()}）…`}
            className="flex-1 rounded-xl border border-line px-3 py-2 bg-surface text-xs"
          />
          {platform && (
            <span className="shrink-0 flex items-center gap-1 rounded-xl bg-surface border border-line px-2 text-[10px] text-ink/60" title={platform.label}>
              {platform.icon} {platform.label}
            </span>
          )}
        </div>
        <input
          value={hint}
          onChange={(e) => updateNodeData(blockId, { hint: e.target.value })}
          placeholder="可选备注（风格、用途）"
          className="w-full rounded-xl border border-line px-3 py-2 bg-surface text-xs"
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
            导入素材库
          </button>
        </div>
        {capturedAssetUrl && (
          <p className="text-[10px] text-brand/70 truncate">已采集: {capturedAssetUrl}</p>
        )}
        {parseErrorCode && (
          <div className="rounded-xl border border-warn/30 bg-warn/5 p-2 space-y-1">
            <p className="text-[10px] text-warn">{mapErrorCode(parseErrorCode)}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void run()} className="text-[9px] text-brand underline">
                重试
              </button>
              <button
                type="button"
                onClick={() => updateNodeData(blockId, { status: 'idle', url: url })}
                className="text-[9px] text-ink/40 underline"
              >
                改为手动录入
              </button>
            </div>
          </div>
        )}
        <details className="text-[8px] text-ink/30">
          <summary className="cursor-pointer hover:text-ink/50">支持平台（点击展开）</summary>
          <p className="mt-1">抖音 / B站 / 小红书 / 微博 / YouTube / X(Twitter) / Instagram / TikTok</p>
        </details>
      </div>
    </ComposerWorkspaceShell>
  );
}
