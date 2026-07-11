import { RefreshCw } from 'lucide-react';
import type { PromptBatchItem, PromptComposeAction, PromptDispatchMode } from '@nx9/shared';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const MODES: { id: PromptDispatchMode; label: string }[] = [
  { id: 'batch', label: '一对一' },
  { id: 'single', label: '合成' },
  { id: 'broadcast', label: '广播' },
];

const COMPOSE: { id: PromptComposeAction; label: string }[] = [
  { id: 'generate', label: '参考' },
  { id: 'merge', label: '拼接' },
  { id: 'merge-then-generate', label: '拼后生' },
];

export function ModePills({
  value,
  onChange,
}: {
  value: PromptDispatchMode;
  onChange: (m: PromptDispatchMode) => void;
}) {
  return (
    <div className="flex rounded-lg bg-surface/80 p-0.5 border border-line/60 shrink-0">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onMouseDown={stop}
          onClick={() => onChange(m.id)}
          className={`px-2 py-0.5 rounded-md text-[10px] transition-colors nodrag nopan ${
            value === m.id ? 'bg-white text-brand shadow-sm font-medium' : 'text-ink/45 hover:text-ink'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function ComposePills({
  value,
  onChange,
}: {
  value: PromptComposeAction;
  onChange: (v: PromptComposeAction) => void;
}) {
  return (
    <div className="flex gap-0.5 flex-wrap">
      {COMPOSE.map((c) => (
        <button
          key={c.id}
          type="button"
          onMouseDown={stop}
          onClick={() => onChange(c.id)}
          className={`px-1.5 py-0.5 rounded-full text-[9px] border nodrag nopan ${
            value === c.id
              ? 'border-brand/40 bg-brand/10 text-brand'
              : 'border-line text-ink/45 hover:border-brand/30'
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export interface PromptToolbarLeftProps {
  hasAssets: boolean;
  hasUpstream: boolean;
  promptMode: PromptDispatchMode;
  composeAction: PromptComposeAction;
  imageCount: number;
  items: PromptBatchItem[];
  onPersist: (
    nextItems: PromptBatchItem[],
    patch?: Partial<{
      promptMode: PromptDispatchMode;
      globalPrompt: string;
      composeAction: PromptComposeAction;
    }>,
  ) => void;
  onManualSync: () => void;
}

export function PromptToolbarLeft({
  hasAssets,
  hasUpstream,
  promptMode,
  composeAction,
  imageCount,
  items,
  onPersist,
  onManualSync,
}: PromptToolbarLeftProps) {
  if (!hasAssets && !hasUpstream) return null;

  return (
    <div className="flex items-center gap-1.5" onMouseDown={stop}>
      {hasAssets && (
        <ModePills
          value={promptMode}
          onChange={(mode) => onPersist(items, { promptMode: mode })}
        />
      )}
      {hasAssets && promptMode === 'single' && imageCount >= 2 && (
        <>
          <span className="w-px h-3.5 bg-line/50" />
          <ComposePills
            value={composeAction}
            onChange={(v) => onPersist(items, { composeAction: v })}
          />
        </>
      )}
      {hasUpstream && (
        <button
          type="button"
          onMouseDown={stop}
          onClick={onManualSync}
          className="p-1 rounded-md text-ink/40 hover:text-brand hover:bg-brand/5 nodrag nopan"
          title="同步上游素材"
        >
          <RefreshCw size={13} />
        </button>
      )}
    </div>
  );
}
