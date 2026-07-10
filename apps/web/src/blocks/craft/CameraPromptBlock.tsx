import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { CAMERA_PROMPT_PRESETS } from '@nx9/shared';
import { UpstreamPromptBanner } from '../shared/upstream-hints';
import { AssetLinkField, assetRefFromData, patchWithAssetRef } from '../shared/AssetLinkField';
import { BlockShell } from '../shared/BlockShell';
import { DoubleClickText } from '../shared/DoubleClickText';

function CameraPromptBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const selectedIds = (props.data?.selectedPresetIds as string[]) ?? [];
  const extra = (props.data?.extra as string) ?? '';
  const content = (props.data?.content as string) ?? '';
  const upstream = props.data?.upstream as { prompts?: string[]; pictures?: string[] } | undefined;
  const upstreamPrompt = upstream?.prompts?.join(', ');
  const assetRef = assetRefFromData(props.data as Record<string, unknown>);

  const composed = useMemo(() => {
    const parts = CAMERA_PROMPT_PRESETS.filter((p) => selectedIds.includes(p.id)).map((p) => p.text);
    if (extra.trim()) parts.push(extra.trim());
    if (upstreamPrompt?.trim()) parts.unshift(upstreamPrompt.trim());
    return parts.join(', ');
  }, [selectedIds, extra, upstreamPrompt]);

  const display = content || composed;

  const toggle = useCallback(
    (id: string) => {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id];
      const parts = CAMERA_PROMPT_PRESETS.filter((p) => next.includes(p.id)).map((p) => p.text);
      if (extra.trim()) parts.push(extra.trim());
      updateNodeData(props.id, {
        selectedPresetIds: next,
        content: parts.join(', '),
      });
    },
    [selectedIds, extra, props.id, updateNodeData],
  );

  const groups = useMemo(() => {
    const map = new Map<string, typeof CAMERA_PROMPT_PRESETS>();
    for (const p of CAMERA_PROMPT_PRESETS) {
      const list = map.get(p.group) ?? [];
      list.push(p);
      map.set(p.group, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-h-64 overflow-y-auto nx9-scroll">
        <AssetLinkField
          kind="shot"
          assetRef={assetRef}
          onChange={(ref) => updateNodeData(props.id, patchWithAssetRef(ref))}
          onInsertMention={(token) =>
            updateNodeData(props.id, { extra: `${extra}${extra ? ' ' : ''}${token}` })
          }
        />
        <UpstreamPromptBanner hasUpstream={Boolean(upstreamPrompt)} preview={upstreamPrompt} />
        {upstreamPrompt && (
          <p className="text-[10px] text-brand/80 line-clamp-2 bg-brand/5 rounded-lg px-2 py-1">
            Stage Deck 机位: {upstreamPrompt}
          </p>
        )}
        {groups.map(([group, items]) => (
          <div key={group}>
            <p className="text-[10px] uppercase tracking-wide text-ink/40 mb-1">{group}</p>
            <div className="flex flex-wrap gap-1">
              {items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`px-2 py-0.5 rounded-full border text-[11px] ${
                    selectedIds.includes(p.id)
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line hover:border-accent/30'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <textarea
          value={extra}
          onChange={(e) => {
            const val = e.target.value;
            const parts = CAMERA_PROMPT_PRESETS.filter((p) => selectedIds.includes(p.id)).map(
              (p) => p.text,
            );
            if (val.trim()) parts.push(val.trim());
            updateNodeData(props.id, { extra: val, content: parts.join(', ') });
          }}
          placeholder="补充运镜说明…"
          className="w-full min-h-[48px] rounded-xl border border-line px-2 py-1.5 resize-y"
        />
        {display && (
          <DoubleClickText
            value={display}
            onSave={(text) => updateNodeData(props.id, { content: text })}
            onRestore={() => updateNodeData(props.id, { content: composed })}
          />
        )}
      </div>
    </BlockShell>
  );
}

export default memo(CameraPromptBlock);
