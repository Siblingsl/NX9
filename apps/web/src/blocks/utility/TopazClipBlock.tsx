import { memo, useCallback, useEffect, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function TopazClipBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { clips?: string[] } | undefined;
  const sourceUrl = upstream?.clips?.[0] || (props.data?.videoUrl as string);
  const upscaleModel = (props.data?.upscaleModel as string) ?? 'iris-3';
  const upscaleFactor = (props.data?.upscaleFactor as number) ?? 2;
  const topazPath = (props.data?.topazVideoPath as string) ?? '';
  const enableFi = Boolean(props.data?.enableInterpolation);
  const outputUrl = props.data?.outputUrl as string | undefined;
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    void api.topazStatus(undefined, topazPath || undefined).then((s) => {
      setInstalled(s.video.installed);
    });
  }, [topazPath]);

  const run = useCallback(async () => {
    if (!sourceUrl) {
      appendLog('Topaz 视频：缺少上游视频');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.topazVideo({
        sourceUrl,
        upscaleModel,
        upscaleFactor,
        enableInterpolation: enableFi,
        topazVideoPath: topazPath || undefined,
      });
      updateNodeData(props.id, {
        status: 'success',
        videoUrl: res.url,
        outputUrl: res.url,
      });
      appendLog('Topaz 视频处理完成');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`Topaz 视频失败: ${String(e)}`);
    }
  }, [sourceUrl, upscaleModel, upscaleFactor, enableFi, topazPath, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        {installed === false && (
          <p className="text-warn bg-warn/10 rounded-lg p-2 text-[10px]">
            需安装 Topaz Video AI，并使用其自带 ffmpeg.exe（环境变量 TVAI_MODEL_*）。
          </p>
        )}
        <input
          value={topazPath}
          onChange={(e) => updateNodeData(props.id, { topazVideoPath: e.target.value })}
          placeholder="Topaz Video AI 安装目录或 ffmpeg.exe"
          className="w-full rounded-lg border border-line px-2 py-1 font-mono text-[10px]"
        />
        <label className="text-ink/60 block">
          放大模型
          <select
            value={upscaleModel}
            onChange={(e) => updateNodeData(props.id, { upscaleModel: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-line px-2 py-1 bg-white"
          >
            <option value="iris-3">iris-3</option>
            <option value="nyx-3">nyx-3</option>
            <option value="prob-4">prob-4</option>
            <option value="aaa-9">aaa-9</option>
            <option value="thm-2">thm-2</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-ink/60">
          <input
            type="checkbox"
            checked={enableFi}
            onChange={(e) => updateNodeData(props.id, { enableInterpolation: e.target.checked })}
          />
          补帧 (tvai_fi)
        </label>
        {sourceUrl && !outputUrl && (
          <video src={sourceUrl} controls className="w-full rounded-lg max-h-24" playsInline />
        )}
        {outputUrl && (
          <video src={outputUrl} controls className="w-full rounded-lg max-h-28 border border-brand/30" playsInline />
        )}
        <button type="button" onClick={() => void run()} className="w-full rounded-xl bg-warn text-white py-2">
          Topaz 视频高清化
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(TopazClipBlock);
