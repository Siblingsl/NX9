import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { compileScenePrompt } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import ImageUploadSlot from '../shared/ImageUploadSlot';

function SceneCardBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();

  const sceneName = (props.data?.sceneName as string) ?? '';
  const description = (props.data?.description as string) ?? '';
  const era = (props.data?.era as string) ?? '';
  const lighting = (props.data?.lighting as string) ?? '';
  const propsRaw = (props.data?.props as string[] | string) ?? [];
  const propsArr = Array.isArray(propsRaw) ? propsRaw : (propsRaw as string).split(/[,，、]\s*/).filter(Boolean);
  const referenceUrls = (props.data?.referenceUrls as string[]) ?? [];

  const compiled = useMemo(
    () =>
      compileScenePrompt({
        sceneName,
        description,
        era,
        lighting,
        props: propsArr,
        referenceUrls,
      }),
    [sceneName, description, era, lighting, propsArr, referenceUrls],
  );

  const commit = useCallback(
    (patch: Record<string, unknown>) => {
      const next = { ...props.data, ...patch } as Record<string, unknown>;
      const merged = compileScenePrompt({
        sceneName: (next.sceneName as string) ?? '',
        description: (next.description as string) ?? '',
        era: (next.era as string) ?? '',
        lighting: (next.lighting as string) ?? '',
        props: Array.isArray(next.props) ? (next.props as string[]) : [],
        referenceUrls: (next.referenceUrls as string[]) ?? [],
      });
      updateNodeData(props.id, { ...patch, output: merged, content: merged });
    },
    [props.data, props.id, updateNodeData],
  );

  const addRef = useCallback(
    (url: string) => {
      commit({ referenceUrls: [...new Set([url, ...referenceUrls])] });
    },
    [commit, referenceUrls],
  );

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-w-[300px]">
        <input
          value={sceneName}
          onChange={(e) => commit({ sceneName: e.target.value })}
          placeholder="场景名（如：深夜咖啡厅）"
          className="w-full rounded-xl border border-line px-2 py-1.5 font-medium"
        />
        <textarea
          value={description}
          onChange={(e) => commit({ description: e.target.value })}
          placeholder="场景描述…"
          rows={2}
          className="w-full rounded-lg border border-line px-2 py-1 resize-y"
        />
        <div className="grid grid-cols-2 gap-1">
          <input
            value={era}
            onChange={(e) => commit({ era: e.target.value })}
            placeholder="时代/风格"
            className="rounded-lg border border-line px-2 py-1"
          />
          <input
            value={lighting}
            onChange={(e) => commit({ lighting: e.target.value })}
            placeholder="光线"
            className="rounded-lg border border-line px-2 py-1"
          />
        </div>
        <input
          value={Array.isArray(propsRaw) ? propsRaw.join('、') : propsRaw}
          onChange={(e) => commit({ props: e.target.value.split(/[,，、]\s*/).filter(Boolean) })}
          placeholder="道具（逗号分隔）"
          className="w-full rounded-lg border border-line px-2 py-1"
        />
        <ImageUploadSlot url="" label="上传参考图" compact onUploaded={addRef} />
        {referenceUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-1">
            {referenceUrls.slice(0, 6).map((url) => (
              <img key={url} src={url} alt="" className="aspect-square object-cover rounded border border-line" />
            ))}
          </div>
        )}
        <details className="rounded-lg border border-line">
          <summary className="px-2 py-1 text-[10px] text-ink/50 cursor-pointer">查看场景 prompt</summary>
          <pre className="px-2 pb-2 text-[10px] text-ink/70 whitespace-pre-wrap">{compiled}</pre>
        </details>
      </div>
    </BlockShell>
  );
}

export default memo(SceneCardBlock);
