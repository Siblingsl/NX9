import { useCallback, useState } from 'react';
import { ChevronDown, Film, Layers, Sparkles } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import {
  CLIP_GEN_ASPECTS,
  CLIP_GEN_MODELS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_RESOLUTION_OPTIONS,
} from '@nx9/shared';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function ConfigSelect({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={`relative inline-flex nodrag nopan ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={stop}
        className="appearance-none rounded-full border border-line/50 bg-white pl-2.5 pr-6 py-1 text-[10px] text-ink/70 cursor-pointer hover:border-brand/30 hover:text-brand focus:outline-none focus:border-brand/40 transition-colors"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={10}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink/30 pointer-events-none"
      />
    </div>
  );
}

export interface GenConfigPillBarProps {
  blockId: string;
  kind: string;
  embedded?: boolean;
}

export function GenConfigPillBar({ blockId, kind, embedded = false }: GenConfigPillBarProps) {
  const { getNode, updateNodeData } = useReactFlow();
  const node = getNode(blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const [seedOpen, setSeedOpen] = useState(false);

  const patch = useCallback(
    (next: Record<string, unknown>) => updateNodeData(blockId, next),
    [blockId, updateNodeData],
  );

  if (kind !== 'clip-gen') return null;

  const model = (data.model as string) ?? 'veo';
  const aspect = (data.aspect as string) ?? '16:9';
  const durationSec = (data.durationSec as number) ?? 5;
  const resolution = (data.resolution as string) ?? '720';
  const imageCount = (data.imageCount as number) ?? 1;
  const frameMode = (data.frameMode as string) ?? '首尾帧';
  const modelLabel = CLIP_GEN_MODELS.find((m) => m.id === model)?.label ?? model;

  if (!embedded) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 nodrag nopan" onMouseDown={stop}>
        <ConfigSelect
          value={resolution}
          onChange={(v) => patch({ resolution: v })}
          options={VIDEO_RESOLUTION_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
        />
        <ConfigSelect
          value={aspect}
          onChange={(v) => patch({ aspect: v })}
          options={CLIP_GEN_ASPECTS.map((o) => ({ id: o.id, label: o.id }))}
        />
        <ConfigSelect
          value={String(durationSec)}
          onChange={(v) => patch({ durationSec: Number(v) })}
          options={VIDEO_DURATION_OPTIONS.map((n) => ({ id: String(n), label: `${n}s` }))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2 nodrag nopan" onMouseDown={stop}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand/[0.07] text-brand text-[10px] font-medium border border-brand/15">
          <Film size={11} strokeWidth={2} />
          {frameMode}
        </span>
        <ConfigSelect
          value={model}
          onChange={(v) => patch({ model: v })}
          options={CLIP_GEN_MODELS.map((m) => ({ id: m.id, label: m.label }))}
          className="shrink-0"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <ConfigSelect
          value={resolution}
          onChange={(v) => patch({ resolution: v })}
          options={VIDEO_RESOLUTION_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
        />
        <span className="text-ink/15 text-[10px] select-none">·</span>
        <ConfigSelect
          value={aspect}
          onChange={(v) => patch({ aspect: v })}
          options={CLIP_GEN_ASPECTS.map((o) => ({ id: o.id, label: o.id }))}
        />
        <span className="text-ink/15 text-[10px] select-none">·</span>
        <ConfigSelect
          value={String(durationSec)}
          onChange={(v) => patch({ durationSec: Number(v) })}
          options={VIDEO_DURATION_OPTIONS.map((n) => ({ id: String(n), label: `${n}s` }))}
        />
        <span className="text-ink/15 text-[10px] select-none">·</span>
        <div className="relative inline-flex items-center gap-0.5">
          <Layers size={10} className="text-ink/30 ml-0.5" />
          <ConfigSelect
            value={String(imageCount)}
            onChange={(v) => patch({ imageCount: Number(v) })}
            options={[1, 2, 3, 4].map((n) => ({ id: String(n), label: `×${n}` }))}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="relative">
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => setSeedOpen((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] border transition-colors ${
              seedOpen || data.seed != null
                ? 'bg-white border-line/60 text-ink/70'
                : 'bg-transparent border-line/40 text-ink/45 hover:border-line/60 hover:text-ink/60'
            }`}
          >
            <Sparkles size={10} className="text-ink/35" />
            {data.seed != null ? `Seed ${data.seed}` : '随机 Seed'}
            <ChevronDown size={10} className="text-ink/30" />
          </button>
          {seedOpen && (
            <div
              className="absolute left-0 bottom-full mb-1.5 z-20 w-40 rounded-xl border border-line/60 bg-white shadow-panel p-2"
              onMouseDown={stop}
            >
              <input
                type="text"
                value={data.seed != null ? String(data.seed) : ''}
                onChange={(e) =>
                  patch({ seed: e.target.value ? Number(e.target.value) : undefined })
                }
                placeholder="留空则随机"
                className="w-full rounded-lg border border-line/60 px-2 py-1.5 text-[10px] focus:outline-none focus:border-brand/40"
              />
            </div>
          )}
        </div>
        <span className="text-[9px] text-ink/30 truncate">{modelLabel}</span>
      </div>
    </div>
  );
}
