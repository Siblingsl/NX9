import { useCallback, useRef, useState } from 'react';
import { Download, LayoutTemplate, Upload } from 'lucide-react';
import { WORKFLOW_TEMPLATES } from '@nx9/shared';
import { useFlowCommands } from '../../../../stores/flow-commands';
import { useFlowRuntime } from '../../../../stores/flow-runtime';
import { useViewMode } from '../../stores/view-mode';
import { useTakeStore } from '../../stores/take-store';
import { useAliasStore } from '../../stores/alias-store';
import { useActivityLog } from '../../../../stores/activity-log';
import { useWorkspaceCatalog } from '../../../../stores/workspace-catalog';
import {
  downloadBlob,
  exportWorkflowZip,
} from '../../utils/workflow-zip';

export function WorkflowRailPanel() {
  const requestLoad = useFlowCommands((s) => s.requestLoadTemplate);
  const runtime = useFlowRuntime((s) => s.runtime);
  const activeId = useWorkspaceCatalog((s) => s.activeId);
  const appendLog = useActivityLog((s) => s.append);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(
    async (selectionOnly: boolean) => {
      if (!runtime || !activeId) return;
      setExporting(true);
      try {
        const nodes = runtime.getNodes();
        if (selectionOnly && !nodes.some((n) => n.selected)) {
          appendLog('请先选中要导出的模块');
          return;
        }
        const blob = await exportWorkflowZip({
          workspaceId: activeId,
          nodes,
          edges: runtime.getEdges(),
          viewport: runtime.getViewport(),
          nextBlockIndex: nodes.reduce(
            (m, n) => Math.max(m, (n.data?.blockIndex as number) ?? 0),
            0,
          ) + 1,
          selectionOnly,
          v3Extras: {
            version: 3,
            aliases: useAliasStore.getState().exportAliases(),
            viewMode: useViewMode.getState().mode,
            takes: useTakeStore.getState().exportTakes(),
          },
        });
        downloadBlob(blob, `nx9-workflow-${Date.now()}.zip`);
        appendLog(selectionOnly ? '已导出选中工作流 ZIP' : '已导出画布 ZIP');
      } catch (e) {
        appendLog(`ZIP 导出失败: ${String(e)}`);
      } finally {
        setExporting(false);
      }
    },
    [runtime, activeId, appendLog],
  );

  const handleImport = useCallback(
    async (mode: 'merge' | 'replace') => {
      const file = fileRef.current?.files?.[0];
      if (!file || !runtime?.importWorkflowZip) return;
      if (mode === 'replace' && !window.confirm('将用 ZIP 内容替换当前画布，是否继续？')) {
        return;
      }
      setImporting(true);
      try {
        await runtime.importWorkflowZip(file, mode);
      } catch (e) {
        appendLog(`ZIP 导入失败: ${String(e)}`);
      } finally {
        setImporting(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [runtime, appendLog],
  );

  return (
    <div className="space-y-4 text-xs">
      <section className="space-y-2">
        <p className="text-ink/50 font-medium flex items-center gap-1">
          <Download size={14} />
          工作流 ZIP
        </p>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void handleExport(true)}
          className="w-full rounded-xl border border-line py-2 hover:border-brand/40 disabled:opacity-50"
        >
          导出选中模块
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void handleExport(false)}
          className="w-full rounded-xl bg-brand text-white py-2 hover:bg-brand/90 disabled:opacity-50"
        >
          导出整个画布
        </button>
      </section>

      <section className="space-y-2">
        <p className="text-ink/50 font-medium flex items-center gap-1">
          <Upload size={14} />
          导入 ZIP
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          className="w-full text-[10px] file:mr-2 file:rounded-lg file:border file:border-line file:px-2 file:py-1 file:text-xs"
        />
        <button
          type="button"
          disabled={importing}
          onClick={() => void handleImport('merge')}
          className="w-full rounded-xl border border-line py-2 hover:border-brand/40 disabled:opacity-50"
        >
          追加到画布（可撤销）
        </button>
        <button
          type="button"
          disabled={importing}
          onClick={() => void handleImport('replace')}
          className="w-full rounded-xl border border-warn/40 text-warn py-2 hover:bg-warn/5 disabled:opacity-50"
        >
          替换画布（可撤销）
        </button>
      </section>

      <section>
        <p className="text-ink/50 font-medium flex items-center gap-1 mb-2">
          <LayoutTemplate size={14} />
          内置模板
        </p>
        <ul className="space-y-2 max-h-48 overflow-y-auto nx9-scroll">
          {WORKFLOW_TEMPLATES.slice(0, 8).map((tpl) => (
            <li key={tpl.id} className="rounded-lg border border-line p-2">
              <p className="font-medium text-ink">{tpl.label}</p>
              <div className="flex gap-1 mt-1.5">
                <button
                  type="button"
                  onClick={() => requestLoad(tpl.id, 'merge')}
                  className="flex-1 rounded-lg bg-brand/10 text-brand py-1"
                >
                  追加
                </button>
                <button
                  type="button"
                  onClick={() => requestLoad(tpl.id, 'replace')}
                  className="flex-1 rounded-lg border border-line py-1"
                >
                  替换
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
