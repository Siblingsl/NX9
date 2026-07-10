export function UpstreamPromptBanner({
  hasUpstream,
  preview,
}: {
  hasUpstream: boolean;
  preview?: string;
}) {
  if (!hasUpstream) return null;
  return (
    <p className="text-[10px] text-brand/75 bg-brand/5 rounded-lg px-2 py-1 leading-relaxed">
      已连接上游提示词，运行时将优先使用合并后的文案。
      {preview ? (
        <span className="block text-ink/45 line-clamp-2 mt-0.5" title={preview}>
          预览: {preview}
        </span>
      ) : null}
    </p>
  );
}

export function GenUpstreamHint({ hasUpstream }: { hasUpstream: boolean }) {
  if (!hasUpstream) return null;
  return (
    <p className="text-[10px] text-ink/45 leading-relaxed">
      已连接提示词上游，请在提示词节点关联素材库素材；本模块运行时将使用上游文本。
    </p>
  );
}
