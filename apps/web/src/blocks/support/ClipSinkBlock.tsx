import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

function ClipSinkBlock(props: NodeProps) {
  const upstream = props.data?.upstream as { clips?: string[] } | undefined;
  const videoUrl =
    (props.data?.videoUrl as string) ||
    upstream?.clips?.[0] ||
    (props.data?.previewUrl as string);
  const title = (props.data?.title as string) || '视频输出';

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <p className="font-medium text-ink/80 truncate">{title}</p>
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            className="w-full rounded-xl border border-line bg-black max-h-48"
            playsInline
          />
        ) : (
          <div className="rounded-xl border border-dashed border-line py-10 text-center text-ink/40">
            连接上游视频模块
          </div>
        )}
        {videoUrl && (
          <a
            href={videoUrl}
            download
            className="inline-flex text-brand hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            下载视频
          </a>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(ClipSinkBlock);
