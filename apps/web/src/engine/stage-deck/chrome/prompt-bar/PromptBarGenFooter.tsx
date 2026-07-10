import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  PICTURE_GEN_MODELS,
  isPromptBarGenKind,
} from '@nx9/shared';
import GenSettingsPills from '../../../../blocks/shared/GenSettingsPills';

interface PromptBarGenFooterProps {
  blockId: string;
  kind: string;
}

/** 嵌入 Prompt 框底部的高级生成参数（紧凑横排） */
export function PromptBarGenFooter({ blockId, kind }: PromptBarGenFooterProps) {
  const { getNode, updateNodeData } = useReactFlow();
  const node = getNode(blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;

  const patch = useCallback(
    (next: Record<string, unknown>) => updateNodeData(blockId, next),
    [blockId, updateNodeData],
  );

  if (!isPromptBarGenKind(kind)) return null;

  if (kind === 'picture-gen') {
    const modelId = (data.model as string) ?? 'dall-e-3';
    const quality = (data.quality as string) ?? 'auto';
    const aspectRatio = (data.aspectRatio as string) ?? '1:1';
    const imageCount = (data.imageCount as number) ?? 1;

    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 w-full pt-1 border-t border-line/40 mt-1">
        <select
          value={modelId}
          onChange={(e) => patch({ model: e.target.value })}
          className="max-w-[120px] rounded-lg border border-line bg-white px-1.5 py-0.5 text-[10px] truncate"
        >
          {PICTURE_GEN_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <GenSettingsPills
          compact
          label="质量"
          options={IMAGE_QUALITY_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
          value={quality}
          onChange={(v: string) => patch({ quality: v })}
        />
        <GenSettingsPills
          compact
          label="比例"
          options={IMAGE_ASPECT_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
          value={aspectRatio}
          onChange={(v: string) => patch({ aspectRatio: v })}
        />
        <GenSettingsPills
          compact
          label="张数"
          options={[1, 2, 3, 4].map((n) => ({ id: String(n), label: String(n) }))}
          value={String(imageCount)}
          onChange={(v: string) => patch({ imageCount: Number(v) })}
        />
        <input
          type="text"
          value={data.seed != null ? String(data.seed) : ''}
          onChange={(e) => patch({ seed: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="Seed"
          className="w-16 rounded-lg border border-line px-1.5 py-0.5 text-[10px]"
        />
      </div>
    );
  }

  if (kind === 'clip-gen') {
    const model = (data.model as string) ?? 'veo-2';
    const durationSec = (data.durationSec as number) ?? 5;
    return (
      <div className="flex flex-wrap items-center gap-2 w-full pt-1 border-t border-line/40 mt-1">
        <input
          value={model}
          onChange={(e) => patch({ model: e.target.value })}
          placeholder="模型"
          className="flex-1 min-w-[80px] rounded-lg border border-line px-1.5 py-0.5 text-[10px]"
        />
        <label className="flex items-center gap-1 text-[10px] text-ink/50">
          时长
          <input
            type="number"
            value={durationSec}
            onChange={(e) => patch({ durationSec: Number(e.target.value) || 5 })}
            className="w-12 rounded-lg border border-line px-1 py-0.5 text-[10px]"
          />
          s
        </label>
      </div>
    );
  }

  if (kind === 'sound-gen') {
    const model = (data.model as string) ?? 'eleven_multilingual_v2';
    return (
      <div className="flex flex-wrap items-center gap-2 w-full pt-1 border-t border-line/40 mt-1">
        <input
          value={model}
          onChange={(e) => patch({ model: e.target.value })}
          placeholder="模型 / Provider"
          className="flex-1 min-w-[100px] rounded-lg border border-line px-1.5 py-0.5 text-[10px]"
        />
        <label className="flex items-center gap-1 text-[10px] text-ink/50">
          语速
          <input
            type="number"
            step={0.1}
            value={(data.speed as number) ?? 1}
            onChange={(e) => patch({ speed: Number(e.target.value) || 1 })}
            className="w-12 rounded-lg border border-line px-1 py-0.5 text-[10px]"
          />
        </label>
      </div>
    );
  }

  return null;
}
