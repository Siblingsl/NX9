import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  collectUpstreamForPromptMerge,
  mergePromptBatchItems,
  newPromptBatchItem,
  promptItemsToBatch,
  type PromptBatchItem,
  type PromptComposeAction,
  type PromptDispatchMode,
} from '@nx9/shared';
import type { BacklotTemplateKind } from '@nx9/shared';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { applyBacklotText } from '../shared/apply-backlot-text';
import {
  BacklotTemplatePicker,
  type BacklotTemplateApplyResult,
} from '../shared/backlot-template-picker';
import { BlockShell } from '../shared/BlockShell';

const PROMPT_BACKLOT_KINDS: BacklotTemplateKind[] = ['scene', 'emotion', 'hook'];

const MODE_META: Record<
  PromptDispatchMode,
  { label: string; hint: string; where: string }
> = {
  batch: {
    label: '批量一对一',
    hint: '每行提示词 → 一张图',
    where: '在每行填写；全局前缀会加到每行前面',
  },
  single: {
    label: '单任务合成',
    hint: '多素材 + 一条指令 → 一张图',
    where: '在「主提示词」填写合成指令',
  },
  broadcast: {
    label: '同 prompt 广播',
    hint: '一条提示词 × 每张素材 → 多张图',
    where: '在「主提示词」填写',
  },
};

function PromptBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const legacyContent = (props.data?.content as string) ?? '';
  const promptItems = (props.data?.promptItems as PromptBatchItem[] | undefined) ?? [];
  const promptMode = (props.data?.promptMode as PromptDispatchMode) ?? 'batch';
  const globalPrompt = (props.data?.globalPrompt as string) ?? '';
  const composeAction = (props.data?.composeAction as PromptComposeAction) ?? 'generate';
  const backlotTemplateId = props.data?.backlotTemplateId as string | undefined;
  const backlotTemplateLabel = props.data?.backlotTemplateLabel as string | undefined;
  const syncedRef = useRef('');

  const items = useMemo(() => {
    if (promptItems.length > 0) return promptItems;
    if (legacyContent.trim()) return [newPromptBatchItem(legacyContent)];
    return [newPromptBatchItem()];
  }, [promptItems, legacyContent]);

  const hasUpstream = useMemo(
    () => edges.some((e) => e.target === props.id),
    [edges, props.id],
  );
  const imageCount = items.filter((i) => i.imageUrl).length;
  const hasAssets = imageCount > 0;
  const effectiveMode: PromptDispatchMode = hasAssets ? promptMode : 'batch';
  const effectiveGlobal = hasAssets ? globalPrompt : '';

  const upstreamKey = useMemo(() => {
    const incoming = edges
      .filter((e) => e.target === props.id)
      .map((e) => e.source)
      .sort()
      .join(',');
    const snapshot = incoming
      .split(',')
      .filter(Boolean)
      .map((id) => {
        const n = nodes.find((x) => x.id === id);
        const d = n?.data ?? {};
        return `${id}:${d.assetUrl ?? ''}:${d.content ?? ''}:${JSON.stringify(d.promptItems ?? [])}`;
      })
      .join('|');
    return `${incoming}::${snapshot}`;
  }, [edges, nodes, props.id]);

  const syncFromUpstream = useCallback(
    (baseItems: PromptBatchItem[]) => {
      const flowBlocks = nodes.map((n) => ({
        id: n.id,
        type: n.type ?? 'prompt',
        data: (n.data ?? {}) as Record<string, unknown>,
      }));
      const flowLinks = edges.map((e) => ({ source: e.source, target: e.target }));
      const { pictures, texts } = collectUpstreamForPromptMerge(props.id, flowBlocks, flowLinks);
      return mergePromptBatchItems(baseItems, pictures, texts);
    },
    [edges, nodes, props.id],
  );

  const persistState = useCallback(
    (
      nextItems: PromptBatchItem[],
      patch?: Partial<{
        promptMode: PromptDispatchMode;
        globalPrompt: string;
        composeAction: PromptComposeAction;
      }>,
    ) => {
      const assets = nextItems.some((i) => i.imageUrl);
      const mode = assets ? (patch?.promptMode ?? promptMode) : 'batch';
      const global = assets ? (patch?.globalPrompt ?? globalPrompt) : '';
      const compose = patch?.composeAction ?? composeAction;
      const { jobs } = promptItemsToBatch(nextItems, mode, global, compose);
      updateNodeData(props.id, {
        promptItems: nextItems,
        promptMode: mode,
        globalPrompt: global,
        composeAction: compose,
        content: nextItems.map((i) => i.text).filter(Boolean).join('\n\n') || nextItems[0]?.text || '',
        batchCount: jobs.length,
      });
    },
    [props.id, promptMode, globalPrompt, composeAction, updateNodeData],
  );

  useEffect(() => {
    if (syncedRef.current === upstreamKey) return;
    if (!hasUpstream) return;
    const merged = syncFromUpstream(items);
    const changed =
      merged.length !== items.length ||
      merged.some(
        (row, i) => row.imageUrl !== items[i]?.imageUrl || row.text !== items[i]?.text,
      );
    if (!changed) {
      syncedRef.current = upstreamKey;
      return;
    }
    syncedRef.current = upstreamKey;
    persistState(merged);
  }, [upstreamKey, hasUpstream, items, persistState, syncFromUpstream]);

  const updateItem = useCallback(
    (id: string, patch: Partial<PromptBatchItem>) => {
      persistState(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    },
    [items, persistState],
  );

  const addItem = useCallback(() => {
    persistState([...items, newPromptBatchItem()]);
  }, [items, persistState]);

  const removeItem = useCallback(
    (id: string) => {
      const next = items.filter((item) => item.id !== id);
      persistState(next.length > 0 ? next : [newPromptBatchItem()]);
    },
    [items, persistState],
  );

  const handleManualSync = useCallback(() => {
    const merged = syncFromUpstream(items);
    syncedRef.current = upstreamKey;
    persistState(merged);
  }, [items, syncFromUpstream, upstreamKey, persistState]);

  const duplicateFirstPrompt = useCallback(() => {
    const first = globalPrompt.trim() || items.find((i) => i.text.trim())?.text || '';
    if (!first.trim()) return;
    persistState(items.map((item) => ({ ...item, text: item.text.trim() ? item.text : first })));
  }, [items, globalPrompt, persistState]);

  const handleBacklotApply = useCallback(
    (result: BacklotTemplateApplyResult) => {
      const meta = {
        backlotTemplateId: result.templateId,
        backlotTemplateLabel: result.templateLabel,
      };
      if (hasAssets) {
        const nextGlobal = applyBacklotText(effectiveGlobal, result.prompt, result.mode);
        persistState(items, { globalPrompt: nextGlobal });
        updateNodeData(props.id, meta);
        return;
      }
      const nextItems = items.map((item, index) =>
        index === 0
          ? { ...item, text: applyBacklotText(item.text, result.prompt, result.mode) }
          : item,
      );
      persistState(nextItems);
      updateNodeData(props.id, meta);
    },
    [hasAssets, effectiveGlobal, items, persistState, updateNodeData, props.id],
  );

  const { jobs } = promptItemsToBatch(items, effectiveMode, effectiveGlobal, composeAction);
  const modeMeta = MODE_META[effectiveMode];
  const filledCount = items.filter((i) => i.text.trim()).length;

  return (
    <BlockShell {...props} hideSockets={props.data?.hideSockets as boolean | undefined}>
      <div className="space-y-2 nodrag nopan">
        <BacklotTemplatePicker
          kinds={PROMPT_BACKLOT_KINDS}
          selectedTemplateId={backlotTemplateId}
          selectedTemplateLabel={backlotTemplateLabel}
          hint={
            hasAssets
              ? '模板写入全局前缀或主提示词，会随本节点流向下游生成模块。'
              : '模板写入首行提示词，会作为下游生成模块的上游文案。'
          }
          onApply={handleBacklotApply}
          onClear={() =>
            updateNodeData(props.id, {
              backlotTemplateId: undefined,
              backlotTemplateLabel: undefined,
            })
          }
        />
        {hasAssets ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <select
                value={promptMode}
                onChange={(e) =>
                  persistState(items, { promptMode: e.target.value as PromptDispatchMode })
                }
                className="flex-1 text-[10px] rounded-lg border border-line px-2 py-1 bg-white"
              >
                {Object.entries(MODE_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
              {hasUpstream && (
                <button
                  type="button"
                  onClick={handleManualSync}
                  className="text-[10px] text-brand flex items-center gap-0.5 hover:underline shrink-0"
                  title="从上游素材同步"
                >
                  <RefreshCw size={11} />
                  同步
                </button>
              )}
            </div>
            <p className="text-[10px] text-ink/45 leading-relaxed">
              {modeMeta.hint} · {modeMeta.where}
            </p>
            <p className="text-[10px] text-brand/70">
              将输出 {jobs.length} 项 · 已关联 {imageCount} 张素材
            </p>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-ink/50">
              {filledCount > 0
                ? `${filledCount} 条提示词 → ${filledCount} 张图`
                : '每条提示词生成一张图'}
            </p>
            {hasUpstream && (
              <button
                type="button"
                onClick={handleManualSync}
                className="text-[10px] text-brand flex items-center gap-0.5 hover:underline shrink-0"
              >
                <RefreshCw size={11} />
                同步
              </button>
            )}
          </div>
        )}

        {hasAssets && (promptMode === 'single' || promptMode === 'broadcast') && (
          <div className="space-y-1">
            <label className="text-[10px] text-ink/50 font-medium">主提示词</label>
            <textarea
              value={globalPrompt}
              onChange={(e) => persistState(items, { globalPrompt: e.target.value })}
              placeholder={
                promptMode === 'single'
                  ? '例：将两张参考图融合为一张海报…'
                  : '例：同一风格下的变体描述…'
              }
              className="w-full min-h-[56px] resize-y rounded-lg border border-brand/30 bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-brand/50"
            />
          </div>
        )}

        {hasAssets && promptMode === 'single' && imageCount >= 2 && (
          <label className="text-[10px] text-ink/50 block">
            多图处理
            <select
              value={composeAction}
              onChange={(e) =>
                persistState(items, { composeAction: e.target.value as PromptComposeAction })
              }
              className="mt-0.5 w-full rounded-lg border border-line px-2 py-1 bg-white"
            >
              <option value="generate">仅文生图（素材作参考）</option>
              <option value="merge">物理拼接为一张图</option>
              <option value="merge-then-generate">先拼接再生成</option>
            </select>
          </label>
        )}

        {hasAssets && promptMode === 'batch' && (
          <div className="space-y-1">
            <label className="text-[10px] text-ink/50 font-medium">全局前缀（可选）</label>
            <input
              value={globalPrompt}
              onChange={(e) => persistState(items, { globalPrompt: e.target.value })}
              placeholder="会加到每一行提示词前面"
              className="w-full text-xs rounded-lg border border-line px-2 py-1"
            />
          </div>
        )}

        <div className="space-y-2 max-h-[240px] overflow-y-auto nx9-scroll pr-0.5">
          {items.map((item, index) => (
            <div key={item.id} className="rounded-xl border border-line p-2 space-y-1.5 bg-surface/40">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] text-ink/40 font-medium">
                  {item.imageUrl ? `素材 #${index + 1}` : `提示词 #${index + 1}`}
                </span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="p-0.5 text-ink/30 hover:text-red-600"
                    title="删除此行"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="w-full rounded-lg border border-line max-h-20 object-cover"
                />
              )}
              {hasAssets && promptMode === 'single' && item.imageUrl ? (
                <input
                  value={item.note ?? ''}
                  onChange={(e) => updateItem(item.id, { note: e.target.value })}
                  placeholder="素材备注（可选）"
                  className="w-full text-[10px] rounded-lg border border-line px-2 py-1"
                />
              ) : (
                <textarea
                  value={item.text}
                  onChange={(e) => updateItem(item.id, { text: e.target.value })}
                  placeholder="输入提示词…"
                  className="w-full min-h-[48px] resize-y rounded-lg border border-line bg-white px-2 py-1.5 text-xs placeholder:text-ink/40 focus:outline-none focus:border-brand/50"
                />
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addItem}
          className="w-full flex items-center justify-center gap-1 rounded-lg border border-dashed border-line py-1.5 text-[11px] text-brand hover:border-brand/40 hover:bg-brand/5"
        >
          <Plus size={12} />
          添加提示词
        </button>
        {hasAssets && promptMode === 'broadcast' && items.length > 1 && (
          <button
            type="button"
            onClick={duplicateFirstPrompt}
            className="w-full text-[10px] text-ink/50 hover:text-brand"
          >
            用主提示词填充空白行
          </button>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(PromptBlock);
