import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BacklotCustomTemplate, BacklotTemplate, BacklotTemplateKind } from '@nx9/shared';
import {
  BACKLOT_TEMPLATE_TABS,
  backlotTemplatePrompt,
  listBacklotTemplates,
} from '@nx9/shared';
import { Check, Library, Plus, Search, X } from 'lucide-react';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { applyBacklotText, type BacklotApplyMode } from './apply-backlot-text';

export interface BacklotTemplateApplyResult {
  templateId: string;
  templateLabel: string;
  prompt: string;
  mode: BacklotApplyMode;
}

interface PickerItem {
  id: string;
  label: string;
  prompt: string;
  kind: BacklotTemplateKind;
  description?: string;
  source: 'template' | 'workspace';
}

function templateGroupName(
  t: BacklotTemplate | BacklotCustomTemplate,
  kind: BacklotTemplateKind,
): string {
  if (kind === 'hook' && 'hookPhase' in t && t.hookPhase) {
    return t.hookPhase === 'opening' ? '开场' : '结尾';
  }
  const g = t.group?.trim();
  if (!g || g === '我的工作区') return '未分组';
  return g;
}

interface BacklotTemplatePickerProps {
  kinds: BacklotTemplateKind[];
  selectedTemplateId?: string;
  selectedTemplateLabel?: string;
  onApply: (result: BacklotTemplateApplyResult) => void;
  onClear?: () => void;
  hint?: string;
}

export function BacklotTemplatePicker({
  kinds,
  selectedTemplateId,
  selectedTemplateLabel,
  onApply,
  onClear,
  hint,
}: BacklotTemplatePickerProps) {
  const customItems = useWorkspaceDocument((s) => s.backlotCustom.items);
  const workspaceItems = useWorkspaceDocument((s) => s.backlotWorkspace.items);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeKind, setActiveKind] = useState<BacklotTemplateKind>(kinds[0] ?? 'scene');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const kindTabs = useMemo(
    () => BACKLOT_TEMPLATE_TABS.filter((t) => kinds.includes(t.key)),
    [kinds],
  );

  const items = useMemo(() => {
    const list: PickerItem[] = [];
    for (const kind of kinds) {
      for (const tpl of listBacklotTemplates(kind, customItems)) {
        list.push({
          id: tpl.id,
          label: tpl.label,
          prompt: backlotTemplatePrompt(tpl),
          kind: tpl.kind,
          description: tpl.description ?? tpl.promptZh,
          source: 'template',
        });
      }
      for (const ws of workspaceItems.filter((w) => w.kind === kind)) {
        list.push({
          id: `ws-${ws.id}`,
          label: ws.label,
          prompt: ws.promptEn?.trim() || ws.promptZh?.trim() || '',
          kind: ws.kind,
          source: 'workspace',
        });
      }
    }
    return list;
  }, [kinds, customItems, workspaceItems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => item.kind === activeKind)
      .filter((item) => {
        if (!q) return true;
        return (
          item.label.toLowerCase().includes(q) ||
          item.prompt.toLowerCase().includes(q) ||
          (item.description?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 48);
  }, [items, activeKind, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, PickerItem[]>();
    for (const item of filtered) {
      const tpl = listBacklotTemplates(item.kind, customItems).find((t) => t.id === item.id);
      const group =
        item.source === 'workspace'
          ? '工作区草稿'
          : tpl
            ? templateGroupName(tpl, item.kind)
            : '未分组';
      const bucket = map.get(group) ?? [];
      bucket.push(item);
      map.set(group, bucket);
    }
    return [...map.entries()];
  }, [filtered, customItems]);

  const openPicker = useCallback(() => {
    const el = triggerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setAnchor({ x: rect.left, y: rect.bottom + 4 });
    }
    setActiveKind(kinds[0] ?? 'scene');
    setPickedId(null);
    setSearch('');
    setOpen(true);
  }, [kinds]);

  const closePicker = useCallback(() => {
    setOpen(false);
    setPickedId(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePicker();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closePicker]);

  const commit = useCallback(
    (mode: BacklotApplyMode) => {
      const item = items.find((i) => i.id === pickedId);
      if (!item?.prompt.trim()) return;
      onApply({
        templateId: item.id,
        templateLabel: item.label,
        prompt: item.prompt.trim(),
        mode,
      });
      closePicker();
    },
    [items, pickedId, onApply, closePicker],
  );

  const menuWidth = 280;
  const left = Math.min(anchor.x, window.innerWidth - menuWidth - 12);
  const top = Math.min(anchor.y, window.innerHeight - 420);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          ref={triggerRef}
          type="button"
          onClick={openPicker}
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-[10px] text-brand hover:border-brand/40 hover:bg-brand/5"
        >
          <Library size={11} />
          从 Backlot 选择
        </button>
        {selectedTemplateLabel && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] text-brand max-w-[140px]">
            <span className="truncate">{selectedTemplateLabel}</span>
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className="shrink-0 hover:text-red-600"
                title="清除模板标记"
              >
                <X size={10} />
              </button>
            )}
          </span>
        )}
      </div>
      {hint && <p className="text-[10px] text-ink/45 leading-relaxed">{hint}</p>}

      {open && (
        <>
          <div
            className="fixed inset-0 z-[80]"
            onClick={closePicker}
            onContextMenu={(e) => {
              e.preventDefault();
              closePicker();
            }}
          />
          <div
            className="nx9-context-menu fixed z-[90] flex flex-col max-h-[min(400px,70vh)]"
            style={{ left, top, width: menuWidth }}
          >
            <div className="nx9-context-menu__header py-1.5">
              <span>Backlot 模板</span>
            </div>

            {kindTabs.length > 1 && (
              <div className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto">
                {kindTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveKind(tab.key)}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] border ${
                      activeKind === tab.key
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-line text-ink/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            <div className="px-2 py-1.5">
              <div className="flex items-center gap-1 rounded-lg border border-line bg-surface/60 px-2 py-1">
                <Search size={11} className="text-ink/40 shrink-0" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索模板…"
                  className="flex-1 bg-transparent text-[11px] outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto nx9-scroll px-1 pb-1 min-h-0">
              {grouped.length === 0 ? (
                <p className="px-3 py-4 text-center text-[10px] text-ink/40">无匹配模板</p>
              ) : (
                grouped.map(([group, rows]) => (
                  <div key={group} className="mb-1">
                    <p className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink/40">
                      {group}
                    </p>
                    {rows.map((item) => {
                      const active = pickedId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setPickedId(item.id)}
                          className={`nx9-context-menu__item flex-col items-start gap-0.5 py-1.5 ${
                            active ? 'bg-brand/5' : ''
                          }`}
                        >
                          <span className="flex w-full items-center gap-1">
                            {active ? <Check size={11} className="text-brand shrink-0" /> : <span className="w-[11px]" />}
                            <span className="flex-1 truncate text-left font-medium">{item.label}</span>
                            {item.source === 'workspace' && (
                              <span className="text-[9px] text-accent/70">草稿</span>
                            )}
                          </span>
                          {item.prompt && (
                            <span className="pl-4 text-[9px] text-ink/45 line-clamp-2 text-left w-full">
                              {item.prompt}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="nx9-context-menu__divider" />
            <div className="flex gap-1 p-2">
              <button
                type="button"
                disabled={!pickedId}
                onClick={() => commit('append')}
                className="flex-1 nx9-context-menu__item justify-center nx9-context-menu__item--compact disabled:opacity-40"
              >
                <Plus size={11} />
                追加
              </button>
              <button
                type="button"
                disabled={!pickedId}
                onClick={() => commit('replace')}
                className="flex-1 nx9-context-menu__item justify-center nx9-context-menu__item--compact disabled:opacity-40"
              >
                <Check size={11} />
                替换
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function UpstreamPromptBanner({
  hasUpstream,
  preview,
}: {
  hasUpstream: boolean;
  preview?: string;
}) {
  if (!hasUpstream) return null;
  return (
    <p className="text-[10px] text-brand/75 bg-brand/5 rounded-lg px-2 py-1 leading-relaxed">
      已连接上游提示词，运行时将优先使用合并后的文案。
      {preview ? (
        <span className="block text-ink/45 line-clamp-2 mt-0.5" title={preview}>
          预览: {preview}
        </span>
      ) : null}
    </p>
  );
}

export function GenUpstreamHint({ hasUpstream }: { hasUpstream: boolean }) {
  if (!hasUpstream) return null;
  return (
    <p className="text-[10px] text-ink/45 leading-relaxed">
      已连接提示词上游，请在提示词节点使用 Backlot 模板；本模块运行时将使用上游文本。
    </p>
  );
}
