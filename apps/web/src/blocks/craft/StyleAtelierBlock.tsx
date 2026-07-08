import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function StyleAtelierBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const sourceUrl = upstream?.pictures?.[0] || (props.data?.sourceUrl as string);
  const style = props.data?.styleResult as
    | { styleTokens?: string; sceneTokens?: string; combinedPrompt?: string }
    | undefined;
  const reverse = props.data?.reverseResult as { prompt?: string } | undefined;

  const extract = useCallback(async () => {
    if (!sourceUrl) {
      appendLog('风格工坊：请连接上游图片或上传素材');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const [styleRes, revRes] = await Promise.all([
        api.extractStyle(sourceUrl),
        api.reversePrompt(sourceUrl),
      ]);
      updateNodeData(props.id, {
        status: 'success',
        styleResult: styleRes,
        reverseResult: revRes,
        content: styleRes.combinedPrompt || revRes.prompt,
        styleTokens: styleRes.styleTokens,
        negativePrompt: styleRes.negativePrompt,
      });
      appendLog('风格提取完成');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [sourceUrl, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        {sourceUrl && (
          <img src={sourceUrl} alt="" className="w-full rounded-lg border border-line max-h-24 object-cover" />
        )}
        {style?.styleTokens && (
          <p className="text-ink/70 bg-surface rounded-lg p-2 line-clamp-3 font-mono text-[10px]">
            {style.styleTokens}
          </p>
        )}
        {reverse?.prompt && (
          <p className="text-ink/60 line-clamp-2">{reverse.prompt}</p>
        )}
        <button type="button" onClick={() => void extract()} className="w-full rounded-xl bg-brand text-white py-2">
          提取画风 + 反推 Prompt
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(StyleAtelierBlock);
