import { useCallback, useMemo } from 'react';
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  PICTURE_GEN_MODELS,
} from '@nx9/shared';
import GenSettingsPills from '../../../../blocks/shared/GenSettingsPills';
import { useFlowRuntime } from '../../../../stores/flow-runtime';
import { RailField } from './primitives/RailField';
import { RailSection } from './primitives/RailSection';

interface InspectorGenFieldsProps {
  blockId: string;
  kind: string;
}

export function InspectorGenFields({ blockId, kind }: InspectorGenFieldsProps) {
  const runtime = useFlowRuntime((s) => s.runtime);
  const node = useMemo(
    () => runtime?.getNodes().find((n) => n.id === blockId),
    [runtime, blockId],
  );
  const data = (node?.data ?? {}) as Record<string, unknown>;

  const patch = useCallback(
    (next: Record<string, unknown>) => runtime?.updateNodeData(blockId, next),
    [blockId, runtime],
  );

  if (!runtime) return null;

  if (kind === 'picture-gen') {
    const modelId = (data.model as string) ?? 'dall-e-3';
    const quality = (data.quality as string) ?? 'auto';
    const aspectRatio = (data.aspectRatio as string) ?? '1:1';
    const imageCount = (data.imageCount as number) ?? 1;
    const seed = data.seed as number | undefined;

    return (
      <RailSection title="生成参数">
        <RailField label="模型">
          <select
            value={modelId}
            onChange={(e) => patch({ model: e.target.value })}
            className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
          >
            {PICTURE_GEN_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </RailField>
        <GenSettingsPills
          label="质量"
          options={IMAGE_QUALITY_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
          value={quality}
          onChange={(v: string) => patch({ quality: v })}
        />
        <GenSettingsPills
          label="比例"
          options={IMAGE_ASPECT_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
          value={aspectRatio}
          onChange={(v: string) => patch({ aspectRatio: v })}
        />
        <GenSettingsPills
          label="张数"
          options={[1, 2, 3, 4].map((n) => ({ id: String(n), label: String(n) }))}
          value={String(imageCount)}
          onChange={(v: string) => patch({ imageCount: Number(v) })}
        />
        <RailField label="Seed">
          <RailField.Input
            value={seed != null ? String(seed) : ''}
            onChange={(v) => patch({ seed: v ? Number(v) : undefined })}
            placeholder="随机"
          />
        </RailField>
        <RailField label="Negative Prompt">
          <textarea
            value={(data.negativePrompt as string) ?? ''}
            onChange={(e) => patch({ negativePrompt: e.target.value })}
            className="w-full rounded-lg border border-line px-2 py-1.5 text-xs min-h-[60px] resize-y"
            placeholder="排除元素…"
          />
        </RailField>
      </RailSection>
    );
  }

  if (kind === 'clip-gen') {
    const model = (data.model as string) ?? 'veo-2';
    const durationSec = (data.durationSec as number) ?? 5;
    return (
      <RailSection title="视频参数">
        <RailField label="模型">
          <RailField.Input value={model} onChange={(v) => patch({ model: v })} />
        </RailField>
        <RailField label="时长 (秒)">
          <RailField.Input
            value={String(durationSec)}
            onChange={(v) => patch({ durationSec: Number(v) || 5 })}
          />
        </RailField>
        <RailField label="Seed">
          <RailField.Input
            value={data.seed != null ? String(data.seed) : ''}
            onChange={(v) => patch({ seed: v ? Number(v) : undefined })}
            placeholder="随机"
          />
        </RailField>
      </RailSection>
    );
  }

  if (kind === 'sound-gen') {
    const model = (data.model as string) ?? 'eleven_multilingual_v2';
    return (
      <RailSection title="配音参数">
        <RailField label="模型 / Provider">
          <RailField.Input value={model} onChange={(v) => patch({ model: v })} />
        </RailField>
        <RailField label="语速">
          <RailField.Input
            value={String((data.speed as number) ?? 1)}
            onChange={(v) => patch({ speed: Number(v) || 1 })}
          />
        </RailField>
      </RailSection>
    );
  }

  return null;
}
