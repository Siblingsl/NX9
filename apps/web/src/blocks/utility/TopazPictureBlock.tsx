import { memo, useCallback, useEffect, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function TopazPictureBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const sourceUrl = upstream?.pictures?.[0] || (props.data?.sourceUrl as string);
  const scale = (props.data?.scale as number) ?? 2;
  const model = (props.data?.model as string) ?? 'std';
  const exePath = (props.data?.executablePath as string) ?? '';
  const outputUrl = (props.data?.previewUrl as string) || (props.data?.outputUrl as string);
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    void api.topazStatus(exePath || undefined).then((s) => {
      setInstalled(s.gigapixel.installed);
    });
  }, [exePath]);

  const run = useCallback(async () => {
    if (!sourceUrl) {
      appendLog('Topaz 图像：缺少上游图片');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.topazGigapixel({
        sourceUrl,
        scale,
        model,
        executablePath: exePath || undefined,
      });
      updateNodeData(props.id, {
        status: 'success',
        previewUrl: res.url,
        outputUrl: res.url,
      });
      appendLog(`Topaz 放大完成 · ${scale}x`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`Topaz 图像失败: ${String(e)}`);
    }
  }, [sourceUrl, scale, model, exePath, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        {installed === false && (
          <p className="text-warn bg-warn/10 rounded-lg p-2 text-[10px]">
            未检测到本机 Gigapixel，请安装 Topaz Gigapixel AI 并填写 exe 路径。
          </p>
        )}
        <input
          value={exePath}
          onChange={(e) => updateNodeData(props.id, { executablePath: e.target.value })}
          placeholder="gigapixel.exe 路径（可选）"
          className="w-full rounded-lg border border-line px-2 py-1 font-mono text-[10px]"
        />
        <div className="flex gap-2">
          <label className="flex-1 text-ink/60">
            倍数
            <input
              type="number"
              min={1}
              max={8}
              value={scale}
              onChange={(e) => updateNodeData(props.id, { scale: Number(e.target.value) })}
              className="w-full rounded border border-line px-1 py-0.5 mt-0.5"
            />
          </label>
          <label className="flex-1 text-ink/60">
            模型
            <select
              value={model}
              onChange={(e) => updateNodeData(props.id, { model: e.target.value })}
              className="w-full rounded border border-line px-1 py-0.5 mt-0.5 bg-white"
            >
              <option value="std">Standard</option>
              <option value="fidelity">High Fidelity</option>
              <option value="lowres">Low Resolution</option>
              <option value="recovery">Recover</option>
            </select>
          </label>
        </div>
        {sourceUrl && (
          <img src={sourceUrl} alt="" className="w-full rounded-lg border border-line max-h-24 object-cover" />
        )}
        {outputUrl && outputUrl !== sourceUrl && (
          <img src={outputUrl} alt="" className="w-full rounded-lg border border-brand/30 max-h-24 object-cover" />
        )}
        <button type="button" onClick={() => void run()} className="w-full rounded-xl bg-warn text-white py-2">
          Topaz 放大
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(TopazPictureBlock);
