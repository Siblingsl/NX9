import { Plus, Trash2 } from 'lucide-react';
import type { PromptBatchItem, PromptComposeAction, PromptDispatchMode } from '@nx9/shared';
import { AssetMentionInput } from '../../asset-mention/AssetMentionInput';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export type PromptMentionTarget = 'global' | { itemId: string };

export interface PromptBatchPanelProps {
  items: PromptBatchItem[];
  promptMode: PromptDispatchMode;
  globalPrompt: string;
  composeAction: PromptComposeAction;
  hasUpstream: boolean;
  hasAssets: boolean;
  imageCount: number;
  jobsCount: number;
  filledCount: number;
  mentionTarget?: PromptMentionTarget;
  onMentionTargetChange?: (target: PromptMentionTarget) => void;
  onPersist: (
    nextItems: PromptBatchItem[],
    patch?: Partial<{
      promptMode: PromptDispatchMode;
      globalPrompt: string;
      composeAction: PromptComposeAction;
    }>,
  ) => void;
  onUpdateItem: (id: string, patch: Partial<PromptBatchItem>) => void;
  onAddItem: () => void;
  onRemoveItem: (id: string) => void;
  onManualSync: () => void;
  hideToolbar?: boolean;
}

function isTargetActive(target: PromptMentionTarget | undefined, check: PromptMentionTarget): boolean {
  if (!target) return false;
  if (target === 'global' && check === 'global') return true;
  if (typeof target === 'object' && typeof check === 'object' && target.itemId === check.itemId) return true;
  return false;
}

const activeInputClass =
  'ring-1 ring-brand/35 border-brand/40 bg-brand/[0.03]';
const idleInputClass = '';

export function PromptBatchPanel({
  items,
  promptMode,
  globalPrompt,
  composeAction: _composeAction,
  hasUpstream,
  hasAssets,
  imageCount,
  mentionTarget,
  onMentionTargetChange,
  onPersist,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  hideToolbar: _hideToolbar,
}: PromptBatchPanelProps) {
  const showRowPrompt = !hasAssets || promptMode === 'batch';
  const showMainPrompt = hasAssets && (promptMode === 'single' || promptMode === 'broadcast');
  const showPrefix = hasAssets && promptMode === 'batch';
  const showThumbStrip = hasAssets && (promptMode === 'single' || promptMode === 'broadcast');

  return (
    <div className="space-y-2 nodrag nopan min-w-0">

      {showPrefix && (
        <AssetMentionInput
          value={globalPrompt}
          onChange={(next) => onPersist(items, { globalPrompt: next })}
          onFocus={() => onMentionTargetChange?.('global')}
          placeholder="全局前缀（可选，加到每条前面）"
          className={`w-full text-[11px] rounded-lg border border-line/70 bg-surface/30 px-2.5 py-1.5 placeholder:text-ink/30 focus:outline-none focus:border-brand/40 nodrag nopan ${
            isTargetActive(mentionTarget, 'global') ? activeInputClass : idleInputClass
          }`}
        />
      )}

      {showMainPrompt && (
        <AssetMentionInput
          value={globalPrompt}
          onChange={(next) => onPersist(items, { globalPrompt: next })}
          onFocus={() => onMentionTargetChange?.('global')}
          placeholder={
            promptMode === 'single' ? '合成指令，例：融合参考图为一张海报' : '广播提示词，将应用到每张素材'
          }
          className={`w-full text-xs rounded-lg border border-brand/25 bg-white px-2.5 py-2 placeholder:text-ink/35 focus:outline-none focus:border-brand/45 nodrag nopan ${
            isTargetActive(mentionTarget, 'global') ? activeInputClass : idleInputClass
          }`}
        />
      )}

      {showThumbStrip && (
        <div className="flex gap-1 overflow-x-auto pb-0.5 nx9-scroll nowheel">
          {items
            .filter((i) => i.imageUrl)
            .map((item, i) => (
              <div key={item.id} className="relative shrink-0 group/th">
                <img
                  src={item.imageUrl}
                  alt=""
                  className="w-10 h-10 rounded-md object-cover border border-line/60"
                />
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-ink/60 text-white text-[8px] flex items-center justify-center">
                  {i + 1}
                </span>
              </div>
            ))}
        </div>
      )}

      {showRowPrompt && (
        <div className="rounded-xl border border-line/60 overflow-hidden max-h-[200px] overflow-y-auto nx9-scroll nowheel overscroll-contain divide-y divide-line/40">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-2 px-2 py-1.5 bg-white/50 hover:bg-surface/40 group"
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="w-8 h-8 rounded object-cover border border-line/50 shrink-0"
                />
              ) : (
                <span className="w-8 h-8 rounded bg-surface flex items-center justify-center text-[9px] text-ink/30 shrink-0">
                  {index + 1}
                </span>
              )}
              <AssetMentionInput
                value={item.text}
                onChange={(next) => onUpdateItem(item.id, { text: next })}
                onFocus={() => onMentionTargetChange?.({ itemId: item.id })}
                placeholder={item.imageUrl ? '配对提示词…' : '提示词…'}
                className={`flex-1 min-w-0 text-xs bg-transparent border-0 outline-none placeholder:text-ink/30 nodrag nopan rounded px-1 -mx-1 ${
                  isTargetActive(mentionTarget, { itemId: item.id }) ? 'ring-1 ring-brand/35 bg-brand/[0.03]' : ''
                }`}
              />
              {items.length > 1 && (
                <button
                  type="button"
                  onMouseDown={stop}
                  onClick={() => onRemoveItem(item.id)}
                  className="p-0.5 text-ink/20 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 nodrag nopan"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {hasAssets && promptMode === 'single' && (
        <div className="space-y-1 max-h-[120px] overflow-y-auto nx9-scroll nowheel">
          {items
            .filter((i) => i.imageUrl)
            .map((item, i) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="text-[9px] text-ink/35 w-8 shrink-0">#{i + 1}</span>
                <input
                  type="text"
                  value={item.note ?? ''}
                  onChange={(e) => onUpdateItem(item.id, { note: e.target.value })}
                  onMouseDown={stop}
                  placeholder="素材备注（可选）"
                  className="flex-1 text-[10px] rounded-md border border-line/60 px-2 py-1 nodrag nopan"
                />
              </div>
            ))}
        </div>
      )}

      {showRowPrompt && (
        <button
          type="button"
          onMouseDown={stop}
          onClick={onAddItem}
          className="flex items-center gap-1 text-[10px] text-brand/80 hover:text-brand px-1 py-0.5 nodrag nopan"
        >
          <Plus size={12} />
          添加一条
        </button>
      )}
    </div>
  );
}
