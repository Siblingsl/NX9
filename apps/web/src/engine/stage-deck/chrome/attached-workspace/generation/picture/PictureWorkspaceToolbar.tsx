import { useRef, useState } from 'react';
import { MoreHorizontal, Play, Settings, Sparkles } from 'lucide-react';
import type { PromptHistoryEntry } from '../../../../stores/prompt-history';
import { VideoPopover, PopoverItem } from '../video/VideoPopover';
import { PictureGenModeChip } from './PictureGenModeChip';
import { PictureParamChips } from './PictureParamChips';
import {
  patchPictureGenMode,
  readPictureGenMode,
  type PictureGenMode,
} from './picture-gen-modes';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const AI_ACTIONS = [
  { id: 'optimize', label: '优化' },
  { id: 'complete', label: '补全' },
  { id: 'rewrite', label: '重写' },
  { id: 'translate', label: '翻译' },
  { id: 'shorten', label: '缩短' },
  { id: 'expand', label: '扩写' },
] as const;

export interface PictureWorkspaceToolbarProps {
  blockId: string;
  data: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
  history: PromptHistoryEntry[];
  onApplyHistory: (text: string) => void;
  onAiAction: (id: string) => void;
  onRun: () => void;
  running?: boolean;
}

export function PictureWorkspaceToolbar({
  blockId,
  data,
  onPatch,
  history,
  onApplyHistory,
  onAiAction,
  onRun,
  running,
}: PictureWorkspaceToolbarProps) {
  const advancedRef = useRef<HTMLButtonElement>(null);
  const aiRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const patch = (next: Record<string, unknown>) => {
    onPatch(next);
  };

  const pictureGenMode = readPictureGenMode(data);

  return (
    <div
      className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-t border-line/30 nodrag nopan"
      onMouseDown={stop}
    >
      <PictureGenModeChip
        mode={pictureGenMode}
        onChange={(mode: PictureGenMode) => patch(patchPictureGenMode(mode))}
      />

      <span className="w-px h-3.5 bg-line/50 mx-0.5" />

      <PictureParamChips blockId={blockId} onPatch={patch} />

      <div className="flex-1 min-w-[4px]" />

      <button
        ref={advancedRef}
        type="button"
        onMouseDown={stop}
        onClick={() => setAdvancedOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] text-ink/45 hover:text-ink hover:bg-surface/90"
        title="更多设置"
      >
        <Settings size={11} />
      </button>

      <VideoPopover
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        anchorRef={advancedRef}
        align="end"
        width={240}
      >
        <div className="px-3 py-2.5 space-y-2" onMouseDown={stop}>
          <label className="block space-y-1">
            <span className="text-[10px] text-ink/45">Seed</span>
            <input
              type="text"
              value={data.seed != null ? String(data.seed) : ''}
              onChange={(e) =>
                patch({ seed: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="留空随机"
              className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] text-ink/45">Negative Prompt</span>
            <textarea
              value={(data.negativePrompt as string) ?? ''}
              onChange={(e) => patch({ negativePrompt: e.target.value })}
              placeholder="排除元素…"
              rows={2}
              className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] resize-none focus:outline-none focus:border-brand/40"
            />
          </label>
        </div>
      </VideoPopover>

      <button
        ref={aiRef}
        type="button"
        onMouseDown={stop}
        onClick={() => setAiOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] text-ink/50 hover:text-brand hover:bg-brand/5"
      >
        <Sparkles size={11} />
        AI
      </button>

      <VideoPopover
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        anchorRef={aiRef}
        align="end"
        width={128}
      >
        {AI_ACTIONS.map((a) => (
          <PopoverItem
            key={a.id}
            onClick={() => {
              onAiAction(a.id);
              setAiOpen(false);
            }}
          >
            {a.label}
          </PopoverItem>
        ))}
      </VideoPopover>

      <button
        ref={moreRef}
        type="button"
        onMouseDown={stop}
        onClick={() => setMoreOpen((v) => !v)}
        className="inline-flex items-center p-1 rounded-md text-ink/40 hover:text-ink hover:bg-surface/90"
        title="更多"
      >
        <MoreHorizontal size={14} />
      </button>

      <VideoPopover
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        anchorRef={moreRef}
        align="end"
        width={220}
      >
        {history.length === 0 ? (
          <p className="px-3 py-2 text-[10px] text-ink/40">暂无 Prompt 历史</p>
        ) : (
          <div className="max-h-40 overflow-y-auto nx9-scroll py-1">
            {history.map((h) => (
              <button
                key={h.id}
                type="button"
                className="w-full text-left px-3 py-1.5 text-[10px] text-ink/65 hover:bg-surface truncate"
                title={h.text}
                onClick={() => {
                  onApplyHistory(h.text);
                  setMoreOpen(false);
                }}
              >
                {h.text}
              </button>
            ))}
          </div>
        )}
      </VideoPopover>

      <button
        type="button"
        onClick={onRun}
        disabled={running}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand text-white text-[11px] font-medium hover:bg-brand/90 disabled:opacity-50 ml-0.5"
      >
        <Play size={11} fill="currentColor" />
        运行
      </button>
    </div>
  );
}
