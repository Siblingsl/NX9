import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getDockBlocks,
  getSpawnableBlocks,
  WORKFLOW_TEMPLATES,
  PLAYBOOK_DEFINITIONS,
} from '@nx9/shared';
import { Search } from 'lucide-react';
import { useFlowCommands } from '../../../stores/flow-commands';
import { useFlowRuntime, useStoryboardUi } from '../../../stores/flow-runtime';
import { useViewMode } from '../stores/view-mode';
import { useContextRailUi } from '../stores/context-rail-ui';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { isSurfaceEnabled } from '../../../config/product-surface';
import type { NodeAlignAction } from '../../node-align';

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
  'tpl-pipeline-13-3d',
  'tpl-pipeline-13-live',
  'tpl-nx9-character-pipeline',
  'tpl-shot-script-desk',
  'tpl-text-to-picture',
  'tpl-image-to-clip',
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

export function CommandPalette({ open, onClose, onAlign }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const requestSpawn = useFlowCommands((s) => s.requestSpawn);
  const requestLoadTemplate = useFlowCommands((s) => s.requestLoadTemplate);
  const runtime = useFlowRuntime((s) => s.runtime);
  const setMode = useViewMode((s) => s.setMode);
  const setStoryboardOpen = useStoryboardUi((s) => s.setOpen);
  const setStoryboardView = useStoryboardUi((s) => s.setView);
  const requestRailTab = useContextRailUi((s) => s.requestTab);

  const commands = useMemo<CommandItem[]>(() => {
    const dockKinds = new Set(getDockBlocks().map((b) => b.kind));

    const playbookCommands: CommandItem[] = PLAYBOOK_DEFINITIONS.filter((pb) => pb.steps.length > 0).map((pb) => ({
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

    const recipeCommands: CommandItem[] = WORKFLOW_TEMPLATES.map((tpl) => ({
      id: `recipe-${tpl.id}`,
      label: `配方 · ${tpl.label}`,
      keywords: [tpl.id, tpl.description, tpl.category, 'recipe', '配方', '模板'],
      section: 'recipe' as const,
      badge: tpl.id === 'tpl-nx9-character-pipeline' ? '推荐' : undefined,
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
        id: 'open-storyboard',
        label: '打开 · 故事板',
        keywords: ['storyboard', '分镜', '镜头'],
        section: 'action',
        run: () => {
          setStoryboardOpen(true);
          requestRailTab('storyboard');
        },
      },
      {
        id: 'open-storyboard-grid',
        label: '打开 · 故事板网格批审',
        keywords: ['storyboard', 'grid', '批审', 'review', '九宫格'],
        section: 'action',
        run: () => {
          setStoryboardOpen(true);
          setStoryboardView('grid');
          requestRailTab('storyboard');
        },
      },
      {
        id: 'open-sketch-pad',
        label: '添加 · 手绘分镜',
        keywords: ['sketch', '画板', '手绘', 'pencil', '线稿'],
        section: 'action',
        run: () => requestSpawn('sketch-pad'),
      },
      {
        id: 'open-workflow-rail',
        label: '打开 · 工作流 Rail',
        keywords: ['workflow', 'zip', '模板', '导入', '导出'],
        section: 'action',
        run: () => requestRailTab('library', { librarySub: 'workflow' }),
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
    ];

    return [...playbookCommands, ...recipeCommands, ...moduleCommands, ...alignCommands, ...actionCommands].filter(
      (item) => {
        if (item.section === 'playbook' && !isSurfaceEnabled('playbookWizard')) return false;
        if (item.section === 'recipe' && !isSurfaceEnabled('workflowTemplates')) return false;
        if (
          (item.id === 'open-storyboard' || item.id === 'open-storyboard-grid') &&
          !isSurfaceEnabled('storyboard')
        ) {
          return false;
        }
        if (item.id === 'open-workflow-rail' && !isSurfaceEnabled('libraryRail')) return false;
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
    setStoryboardOpen,
    setStoryboardView,
    requestRailTab,
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

  if (!open) return null;

  const grouped = groupFiltered(filtered);
  let runningIndex = 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-ink/20 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0" aria-label="关闭" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-line bg-white shadow-panel overflow-hidden">
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
