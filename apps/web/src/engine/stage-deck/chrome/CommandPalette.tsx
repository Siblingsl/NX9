import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getDockBlocks,
  getSpawnableBlocks,
  listWorkflowTemplates,
  PLAYBOOK_DEFINITIONS,
} from '@nx9/shared';
import { Search } from 'lucide-react';
import { useFlowCommands } from '../../../stores/flow-commands';
import { useCredentialVault } from '../../../stores/credential-vault';
import { useAssetTrashModalUi } from '../../../stores/asset-trash-modal-ui';
import { useFlowRuntime } from '../../../stores/flow-runtime';
import { useViewMode } from '../stores/view-mode';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { isSurfaceEnabled } from '../../../config/product-surface';
import type { NodeAlignAction } from '../../node-align';
import {
  filterPlaybooksForFirstLane,
  filterTemplatesForFirstLane,
} from '../../first-lane';
import {
  formatCapabilitySelfcheckReport,
  runCapabilitySelfcheck,
  type CapabilitySelfcheckReport,
} from '../../capability-selfcheck';
import { toastError, toastSuccess } from '../../../stores/toast';
import { CapabilitySelfcheckPanel } from './CapabilitySelfcheckPanel';

type CommandSection = 'playbook' | 'recipe' | 'dock' | 'advanced' | 'action';

interface CommandItem {
  id: string;
  label: string;
  keywords: string[];
  section: CommandSection;
  badge?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onAlign?: (action: NodeAlignAction) => void;
}

const FEATURED_RECIPE_IDS = [
  'tpl-core-episode',
  'tpl-nx9-character-pipeline',
  'tpl-shot-script-desk',
  'tpl-text-to-picture',
  'tpl-image-to-clip',
  'tpl-ecom-image',
  'tpl-ecom-video',
  'tpl-storyboard-grid',
  'tpl-line-art-storyboard',
  'tpl-3d-preview',
  'tpl-toonflow-lite',
  'tpl-photo-speak',
  'tpl-sclass-seedance',
  'tpl-novel-import',
  'tpl-link-replicate',
] as const;

const SECTION_LABELS: Record<CommandSection, string> = {
  playbook: '生产剧本 Playbook',
  recipe: '进阶 Recipe',
  dock: '生产模块',
  advanced: '进阶模块',
  action: '命令',
};

const SECTION_ORDER: CommandSection[] = ['playbook', 'recipe', 'dock', 'advanced', 'action'];

function scoreMatch(query: string, item: CommandItem): number {
  const q = query.trim().toLowerCase();
  if (!q) {
    if (item.section === 'playbook') return 120;
    if (item.section === 'recipe' && FEATURED_RECIPE_IDS.some((id) => item.id === `recipe-${id}`)) {
      return 100;
    }
    if (item.section === 'recipe') return 80;
    if (item.section === 'dock') return 60;
    if (item.section === 'action') return 40;
    return 0;
  }

  const label = item.label.toLowerCase();
  const hay = [item.label, ...item.keywords].join(' ').toLowerCase();
  if (label === q || item.id.endsWith(q)) return 200;
  if (label.startsWith(q)) return 150;
  if (hay.includes(q)) return 100;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.every((t) => hay.includes(t))) return 80;
  return 0;
}

function groupFiltered(items: CommandItem[]): { section: CommandSection; items: CommandItem[] }[] {
  return SECTION_ORDER.map((section) => ({
    section,
    items: items.filter((i) => i.section === section),
  })).filter((g) => g.items.length > 0);
}

/**
 * R2：工作流归档导入的文件选择（命令面板无内联表单，用一次性 input 触发）。
 * 只接受归档扩展名；取消选择不抛错。
 */
function pickWorkflowArchive(onPick: (file: File) => void): void {
  if (typeof document === 'undefined') return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.nx9zip,.zip,application/zip';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) onPick(file);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

export function CommandPalette({ open, onClose, onAlign }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [selfcheckReport, setSelfcheckReport] = useState<CapabilitySelfcheckReport | null>(null);
  const [selfcheckBusy, setSelfcheckBusy] = useState(false);
  const requestSpawn = useFlowCommands((s) => s.requestSpawn);
  const requestLoadTemplate = useFlowCommands((s) => s.requestLoadTemplate);
  const runtime = useFlowRuntime((s) => s.runtime);
  const setMode = useViewMode((s) => s.setMode);
  const openSettingsTo = useCredentialVault((s) => s.openSettingsTo);
  const openAssetTrash = useAssetTrashModalUi((s) => s.setOpen);

  /** 能力自检：只读源码 + 纯函数判定，结果进面板 + toast 摘要；不在服务端 / 无 DOM 环境执行。 */
  const runSelfcheck = useCallback(async () => {
    if (typeof document === 'undefined') return;
    setSelfcheckBusy(true);
    try {
      const report = await runCapabilitySelfcheck();
      setSelfcheckReport(report);
      const summary = report.summaryZh;
      if (report.counts.error > 0) toastError(summary);
      else toastSuccess(summary);
      if (report.counts.error > 0 || report.counts.warn > 0) {
        console.info('[能力自检]\n' + formatCapabilitySelfcheckReport(report));
      }
    } catch (error) {
      // 自检自身失败也要如实说，不静默
      toastError(`能力自检运行失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSelfcheckBusy(false);
    }
  }, []);

  const commands = useMemo<CommandItem[]>(() => {
    const dockKinds = new Set(getDockBlocks().map((b) => b.kind));

    const playbookCommands: CommandItem[] = filterPlaybooksForFirstLane(
      PLAYBOOK_DEFINITIONS.filter((pb) => pb.steps.length > 0),
    ).map((pb) => ({
      id: `playbook-${pb.id}`,
      label: `剧本 · ${pb.label}`,
      keywords: [pb.id, pb.subtitle, pb.category, 'playbook', '生产剧本', pb.label],
      section: 'playbook' as const,
      badge: pb.featured ? '推荐' : undefined,
      run: () => {
        useWorkspaceDocument.getState().startPlaybook(pb.id);
        for (const bt of pb.bootstrapTemplates) {
          useFlowCommands.getState().requestLoadTemplate(bt.templateId, bt.mode);
        }
      },
    }));

    const recipeCommands: CommandItem[] = filterTemplatesForFirstLane(listWorkflowTemplates()).map((tpl) => ({
      id: `recipe-${tpl.id}`,
      label: `配方 · ${tpl.label}`,
      keywords: [tpl.id, tpl.description, tpl.category, 'recipe', '配方', '模板', tpl.status],
      section: 'recipe' as const,
      badge: tpl.status === 'beta' ? 'Beta' : tpl.id === 'tpl-nx9-character-pipeline' ? '推荐' : undefined,
      run: () => requestLoadTemplate(tpl.id, 'merge'),
    }));

    const moduleCommands: CommandItem[] = getSpawnableBlocks().map((b) => ({
      id: `spawn-${b.kind}`,
      label: `添加 · ${b.label}`,
      keywords: [b.kind, b.hint, b.category, 'spawn', '模块', '添加'],
      section: (dockKinds.has(b.kind) ? 'dock' : 'advanced') as CommandSection,
      badge: dockKinds.has(b.kind) ? undefined : '进阶',
      run: () => requestSpawn(b.kind),
    }));

    const alignCommands: CommandItem[] = onAlign
      ? [
          {
            id: 'align-left',
            label: '对齐 · 左对齐',
            keywords: ['align', '对齐', 'left'],
            section: 'action',
            run: () => onAlign('align-left'),
          },
          {
            id: 'align-center-h',
            label: '对齐 · 水平居中',
            keywords: ['align', '对齐', 'center'],
            section: 'action',
            run: () => onAlign('align-center-x'),
          },
          {
            id: 'align-grid',
            label: '排列 · 网格',
            keywords: ['grid', '排列', '网格'],
            section: 'action',
            run: () => onAlign('arrange-grid'),
          },
        ]
      : [];

    const actionCommands: CommandItem[] = [
      {
        id: 'mode-explore',
        label: '切换 · 探索模式',
        keywords: ['explore', '探索', 'mode'],
        section: 'action',
        run: () => setMode('explore'),
      },
      {
        id: 'mode-produce',
        label: '切换 · 生产模式',
        keywords: ['produce', '生产', 'mode'],
        section: 'action',
        run: () => setMode('produce'),
      },
      {
        id: 'mode-review',
        label: '切换 · 审片模式',
        keywords: ['review', '审片', 'take', 'mode'],
        section: 'action',
        run: () => setMode('review'),
      },
      {
        id: 'open-storyboard-desk',
        label: '添加 · 分镜台',
        keywords: ['storyboard', '分镜', '镜头', 'desk'],
        section: 'action',
        run: () => requestSpawn('storyboard-desk'),
      },
      {
        id: 'open-sketch-pad',
        label: '添加 · 手绘分镜',
        keywords: ['sketch', '画板', '手绘', 'pencil', '线稿'],
        section: 'action',
        run: () => requestSpawn('sketch-pad'),
      },
      {
        id: 'undo',
        label: '撤销',
        keywords: ['undo', '撤销', 'ctrl z'],
        section: 'action',
        run: () => runtime?.undo(),
      },
      {
        id: 'run-batch',
        label: '批量运行',
        keywords: ['run', 'batch', '运行'],
        section: 'action',
        run: () => void runtime?.runBatch(),
      },
      {
        id: 'open-usage',
        label: '用量查看',
        keywords: ['usage', '用量', 'token', '配额'],
        section: 'action',
        run: () => openSettingsTo('usage'),
      },
      {
        id: 'open-asset-trash',
        label: '资产回收站',
        keywords: ['trash', '回收站', '恢复', '软删除', '删除'],
        section: 'action',
        run: () => openAssetTrash(true),
      },
      {
        id: 'export-workflow-zip',
        label: '导出 · 工作流归档',
        keywords: ['export', '导出', '归档', 'zip', 'nx9zip', '备份', '工作流'],
        section: 'action',
        // R2：接 `workflow-zip.exportWorkflowZip` + `downloadBlob`（此前有实现、零入口）
        run: () => void runtime?.exportWorkflowZip(false),
      },
      {
        id: 'export-workflow-zip-selection',
        label: '导出 · 工作流归档（仅选区）',
        keywords: ['export', '导出', '选区', '归档', 'zip', 'nx9zip', '备份'],
        section: 'action',
        run: () => void runtime?.exportWorkflowZip(true),
      },
      {
        id: 'import-workflow-zip',
        label: '导入 · 工作流归档',
        keywords: ['import', '导入', '归档', 'zip', 'nx9zip', '恢复', '工作流'],
        section: 'action',
        // R2：`importWorkflowZip` 此前只注册进 runtime，没有任何 UI 触发
        run: () => pickWorkflowArchive((file) => runtime?.importWorkflowZip(file, 'merge')),
      },
      {
        id: 'run-capability-selfcheck',
        label: '运行能力自检',
        keywords: [
          'selfcheck',
          'self-check',
          'capability',
          '自检',
          '能力',
          '接线',
          '诊断',
          'loading',
          'wiring',
          '体检',
        ],
        section: 'action',
        // 只读源码 + 纯函数判定：核对目录项 / 前端 loader / socket / 跟随工作区 / 模板引用的 kind
        run: () => {
          void runSelfcheck();
        },
      },
    ];

    return [...playbookCommands, ...recipeCommands, ...moduleCommands, ...alignCommands, ...actionCommands].filter(
      (item) => {
        if (item.section === 'playbook' && !isSurfaceEnabled('playbookWizard')) return false;
        if (item.section === 'recipe' && !isSurfaceEnabled('workflowTemplates')) return false;
        if (item.id === 'run-batch' && !isSurfaceEnabled('batchRun')) return false;
        return true;
      },
    );
  }, [
    requestSpawn,
    requestLoadTemplate,
    runtime,
    setMode,
    onAlign,
    openSettingsTo,
    openAssetTrash,
    runSelfcheck,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim();
    const scored = commands
      .map((item) => ({ item, score: scoreMatch(q, item) }))
      .filter(({ score, item }) => score > 0 || (!q && item.section !== 'advanced'))
      .sort((a, b) => b.score - a.score);

    const cap = q ? 24 : 20;
    return scored.slice(0, cap).map(({ item }) => item);
  }, [commands, query]);

  const flatIndex = filtered[index];

  useEffect(() => {
    if (!open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && flatIndex) {
        e.preventDefault();
        flatIndex.run();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, flatIndex, onClose]);

  // 自检报告面板独立于命令面板的开关状态：命令面板执行后会立即 onClose，
  // 报告必须留在屏幕上（否则结果一闪即逝）。
  if (!open && !selfcheckReport) return null;

  const grouped = groupFiltered(filtered);
  let runningIndex = 0;

  const palette = createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-ink/20 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0" aria-label="关闭" onClick={onClose} />
      <div className="nx9-command-palette relative w-full max-w-xl rounded-2xl border border-line bg-surface shadow-panel overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
          <Search size={16} className="text-ink/40" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索配方、模块或命令…"
            className="flex-1 text-sm outline-none"
          />
          <kbd className="text-[10px] text-ink/40 border border-line rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto nx9-scroll py-1">
          {grouped.map(({ section, items }) => (
            <div key={section}>
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                {SECTION_LABELS[section]}
              </p>
              <ul>
                {items.map((item) => {
                  const i = runningIndex++;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
                          i === index ? 'bg-brand/10 text-brand' : 'hover:bg-surface'
                        }`}
                        onMouseEnter={() => setIndex(i)}
                        onClick={() => {
                          item.run();
                          onClose();
                        }}
                      >
                        <span className="flex-1 min-w-0 truncate">{item.label}</span>
                        {item.badge && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md bg-surface text-ink/50 border border-line">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-sm text-ink/40 text-center">无匹配命令</p>
          )}
        </div>
        <div className="px-4 py-2 border-t border-line text-[10px] text-ink/40 flex gap-3">
          <span>↑↓ 选择</span>
          <span>Enter 执行</span>
          <span>进阶模块仅搜索时显示</span>
        </div>
      </div>
    </div>,
    document.body,
  );

  // 自检报告面板独立于命令面板的开关状态：命令执行后面板会 onClose，
  // 报告必须留在屏幕上（否则结果一闪即逝）。
  return (
    <>
      {selfcheckReport && (
        <CapabilitySelfcheckPanel
          report={selfcheckReport}
          busy={selfcheckBusy}
          onClose={() => setSelfcheckReport(null)}
          onRerun={() => void runSelfcheck()}
        />
      )}
      {open ? palette : null}
    </>
  );
}

export function useCommandPaletteHotkey(onOpen: () => void, enabled?: boolean) {
  useEffect(() => {
    if (enabled === false) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen, enabled]);
}
